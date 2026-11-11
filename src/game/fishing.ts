import {
  type CatchableRarity,
  COMBO_FOR_FRENZY,
  COMBO_WINDOW,
  CRIT_MULT,
  FRENZY_DAMAGE_MULT,
  FRENZY_GOLDFISH_MULT,
  FRENZY_SECONDS,
  GOLDFISH_LIFETIME,
  isBossZone,
  BOSS_CONTINUE_MAX_HP,
  BOSS_CONTINUE_SECONDS,
  GOLDEN_HOUR_GOLDFISH_PER_MINUTE,
  SCHOOL_FISH,
  SCHOOL_GOLD_MULT,
  SEA_EVENT_FIRST,
  SEA_EVENT_INTERVAL,
  SEA_EVENTS,
  type SeaEventKind,
  FIRST_TREASURE_SECONDS,
  FTUE_RARE_AT_CATCH,
  TREASURE_INTERVAL,
  TREASURE_LIFETIME,
} from '../data/balance';
import { bossSpecies, type FishSpecies } from '../data/fish';
import { BossFight } from './bossFight';
import { autoDps, boatSpeedMult, bossHp, fishHp, goldfishPerMinute, rollRarity, tapDamage } from './economy';
import type { ChestReward, Game } from './game';

/**
 * The sea around the island: the player's boat, fish schools, goldfish and
 * bosses. Pure logic in world units (x/z plane, island at the origin);
 * the renderer reads this state every frame and listens to its events.
 */

export const ISLAND_RADIUS = 14;
export const ZONE_WIDTH = 10;
export const HOOK_RANGE = 3.4;
export const BOAT_SPEED = 9;
export const FISH_PER_ZONE = 7;
const SELECT_RADIUS = 2.6;
const GOLDFISH_RADIUS = 3;
const BOSS_RANGE = 6;

export function zoneBand(zone: number): { inner: number; outer: number; center: number } {
  const inner = ISLAND_RADIUS + (zone - 1) * ZONE_WIDTH;
  return { inner, outer: inner + ZONE_WIDTH, center: inner + ZONE_WIDTH / 2 };
}

/** Fishing zone whose fish live in a zone (boss zones reuse the zone in front). */
export function fishZoneFor(zone: number): number {
  return isBossZone(zone) ? zone - 1 : zone;
}

export interface FishEntity {
  id: number;
  species: FishSpecies;
  rarity: CatchableRarity;
  x: number;
  z: number;
  heading: number;
  speed: number;
  orbitDir: 1 | -1;
  hp: number;
  maxHp: number;
  state: 'swim' | 'flee' | 'hooked';
  /** Seconds since spawn (fade-in). */
  age: number;
  phase: number;
}

export interface Goldfish {
  id: number;
  x: number;
  z: number;
  ttl: number;
}

export interface Treasure {
  id: number;
  kind: 'chest' | 'bottle';
  x: number;
  z: number;
  ttl: number;
  heading: number;
}

export interface BossEntity {
  species: FishSpecies;
  bossIndex: number;
  x: number;
  z: number;
  heading: number;
  angle: number;
}

export interface Boat {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
}

export type WorldEvent =
  | { type: 'hooked'; fish: FishEntity }
  | { type: 'hit'; x: number; z: number; damage: number; crit: boolean }
  | { type: 'caught'; fish: FishEntity }
  | { type: 'select'; fish: FishEntity }
  | { type: 'goldfish-spawn'; goldfish: Goldfish }
  | { type: 'goldfish-collected'; goldfish: Goldfish; gold: number }
  | { type: 'goldfish-expired'; goldfish: Goldfish }
  | { type: 'treasure-spawn'; treasure: Treasure }
  | { type: 'treasure-opened'; treasure: Treasure; reward: ChestReward }
  | { type: 'treasure-expired'; treasure: Treasure }
  | { type: 'sea-event-start'; kind: SeaEventKind }
  | { type: 'sea-event-end'; kind: SeaEventKind }
  | { type: 'frenzy-start' }
  | { type: 'frenzy-end' }
  | { type: 'boss-start'; boss: BossEntity; fight: BossFight }
  | { type: 'boss-mini-hit'; hit: boolean }
  | { type: 'boss-continue-offer'; boss: BossEntity; fight: BossFight }
  | { type: 'boss-won'; boss: BossEntity }
  | { type: 'boss-lost'; boss: BossEntity }
  | { type: 'zone-reset' };

let nextId = 1;

export class FishingWorld {
  fish: FishEntity[] = [];
  goldfish: Goldfish[] = [];
  treasures: Treasure[] = [];
  boss: BossEntity | null = null;
  /** Taps in quick succession; fills the frenzy meter. */
  combo = 0;
  /** Seconds of frenzy left (0 = none). */
  frenzy = 0;
  private time = 0;
  private lastTap = -10;
  private treasureTimer = FIRST_TREASURE_SECONDS;
  /** Running sea event, if any. */
  seaEvent: { kind: SeaEventKind; left: number } | null = null;
  private eventTimer = SEA_EVENT_FIRST;
  fight: BossFight | null = null;
  boat: Boat;
  targetId: number | null = null;
  nextTargetId: number | null = null;
  private zone = 0;
  private bossCooldown = 0;
  /** The boss fight is paused while the player decides on extra time. */
  continueOffer = false;
  private listeners = new Set<(e: WorldEvent) => void>();

  constructor(private game: Game, private rnd: () => number = Math.random) {
    const band = zoneBand(game.state.activeZone);
    this.boat = { x: 0, z: band.center, heading: 0, moving: false };
    this.syncZone();
  }

  on(fn: (e: WorldEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: WorldEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  get target(): FishEntity | undefined {
    return this.fish.find((f) => f.id === this.targetId);
  }

  get activeZone(): number {
    return this.game.state.activeZone;
  }

  /** Rebuild the fish school when the active zone or level changes. */
  syncZone(force = false): void {
    const zone = this.game.state.activeZone;
    if (!force && zone === this.zone) return;
    this.zone = zone;
    this.fish = [];
    this.goldfish = [];
    this.treasures = [];
    this.targetId = null;
    this.nextTargetId = null;
    this.fight = null;
    this.boss = null;
    this.bossCooldown = 0;
    this.continueOffer = false;
    if (this.seaEvent) {
      const kind = this.seaEvent.kind;
      this.seaEvent = null;
      this.game.eventGoldMult = 1;
      this.emit({ type: 'sea-event-end', kind });
    }
    const s = this.game.state;
    if (isBossZone(zone)) {
      const bossIndex = zone === 5 ? 0 : 1;
      if (!s.bossesDefeated[bossIndex]) this.spawnBoss(bossIndex);
    }
    if (!this.boss) for (let i = 0; i < FISH_PER_ZONE; i++) this.spawnFish(true);
    this.emit({ type: 'zone-reset' });
  }

  private spawnBoss(bossIndex: number): void {
    const band = zoneBand(this.zone);
    const angle = Math.atan2(this.boat.x, this.boat.z) + (this.rnd() - 0.5) * 1.2;
    this.boss = {
      species: bossSpecies(this.game.state.level, bossIndex),
      bossIndex,
      angle,
      x: Math.sin(angle) * band.center,
      z: Math.cos(angle) * band.center,
      heading: angle + Math.PI / 2,
    };
  }

  private spawnFish(initial = false): void {
    const band = zoneBand(this.zone);
    const fishZone = fishZoneFor(this.zone);
    const rarity = rollRarity(fishZone, this.rnd);
    const species = this.game.pickSpecies(rarity);
    // spawn around the boat's side of the island so the player sees them
    const boatAngle = Math.atan2(this.boat.x, this.boat.z);
    const spread = initial ? 1.6 : 1.2;
    const angle = boatAngle + (this.rnd() - 0.5) * spread * (ISLAND_RADIUS * 2.2 / band.center + 0.4);
    const r = band.inner + 1.5 + this.rnd() * (ZONE_WIDTH - 3);
    const maxHp = fishHp(this.game.state.level, fishZone, rarity);
    this.fish.push({
      id: nextId++,
      species,
      rarity,
      x: Math.sin(angle) * r,
      z: Math.cos(angle) * r,
      heading: this.rnd() * Math.PI * 2,
      speed: 0.8 + this.rnd() * 0.8 + (rarity === 'legendary' ? 0.6 : rarity === 'endangered' ? 0.3 : 0),
      orbitDir: this.rnd() < 0.5 ? 1 : -1,
      hp: maxHp,
      maxHp,
      state: 'swim',
      age: initial ? 5 : 0,
      phase: this.rnd() * 10,
    });
  }

  // --- Input -------------------------------------------------------------------

  /** Tap on the sea at world position (x, z). */
  tapAt(x: number, z: number): 'goldfish' | 'treasure' | 'boss' | 'mini' | 'select' | 'hit' | 'none' {
    this.game.state.stats.taps++;
    const tr = this.treasures.find((o) => Math.hypot(o.x - x, o.z - z) < GOLDFISH_RADIUS);
    if (tr) {
      this.treasures = this.treasures.filter((o) => o !== tr);
      const reward = this.game.openChest();
      this.emit({ type: 'treasure-opened', treasure: tr, reward });
      return 'treasure';
    }
    const gf = this.goldfish.find((g) => Math.hypot(g.x - x, g.z - z) < GOLDFISH_RADIUS);
    if (gf) {
      this.goldfish = this.goldfish.filter((g) => g !== gf);
      const gold = this.game.collectGoldfish();
      this.emit({ type: 'goldfish-collected', goldfish: gf, gold });
      return 'goldfish';
    }
    if (this.fight && !this.fight.over) return this.tapBoss();

    const picked = this.fish
      .filter((f) => f.id !== this.targetId)
      .map((f) => ({ f, d: Math.hypot(f.x - x, f.z - z) }))
      .filter((o) => o.d < SELECT_RADIUS)
      .sort((a, b) => a.d - b.d)[0];
    if (picked) {
      if (this.targetId === null || this.target?.state !== 'hooked') {
        this.setTarget(picked.f);
      } else {
        this.nextTargetId = picked.f.id;
      }
      this.emit({ type: 'select', fish: picked.f });
      return 'select';
    }
    return this.tap();
  }

  /** Tap anywhere: reel in the hooked fish (or hit the boss). */
  tap(): 'boss' | 'mini' | 'hit' | 'none' {
    if (this.fight && !this.fight.over) return this.tapBoss();
    const t = this.target;
    if (!t || t.state !== 'hooked') return 'none';
    this.bumpCombo();
    const crit = this.rnd() < this.game.critChance;
    const dmg = tapDamage(this.game.state.upgrades) * this.game.tapDamageMult * (this.frenzy > 0 ? FRENZY_DAMAGE_MULT : 1) * (crit ? CRIT_MULT : 1);
    t.hp -= dmg;
    this.emit({ type: 'hit', x: t.x, z: t.z, damage: dmg, crit });
    if (t.hp <= 0) this.catchFish(t);
    return 'hit';
  }

  private tapBoss(): 'boss' | 'mini' {
    const fight = this.fight!;
    if (fight.phase === 'minigame') {
      const hit = fight.miniTap();
      this.emit({ type: 'boss-mini-hit', hit });
      return 'mini';
    }
    const crit = this.rnd() < this.game.critChance;
    const dmg = tapDamage(this.game.state.upgrades) * this.game.tapDamageMult * (crit ? CRIT_MULT : 1);
    fight.tap(dmg);
    if (this.boss) this.emit({ type: 'hit', x: this.boss.x, z: this.boss.z, damage: dmg, crit });
    return 'boss';
  }

  private bumpCombo(): void {
    this.combo = this.time - this.lastTap < COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastTap = this.time;
    if (this.frenzy <= 0 && this.combo >= COMBO_FOR_FRENZY) {
      this.frenzy = FRENZY_SECONDS;
      this.combo = 0;
      this.emit({ type: 'frenzy-start' });
    }
  }

  /** 0..1 fill of the frenzy meter. */
  get comboFill(): number {
    return this.frenzy > 0 ? this.frenzy / FRENZY_SECONDS : Math.min(1, this.combo / COMBO_FOR_FRENZY);
  }

  private setTarget(f: FishEntity): void {
    // first minutes: the 3rd catch is always a rare fish
    const s = this.game.state;
    if (s.stats.fishCaught === FTUE_RARE_AT_CATCH - 1 && !(s.tutorialStep & 1) && f.rarity === 'common') {
      s.tutorialStep |= 1;
      f.rarity = 'rare';
      f.species = this.game.pickSpecies('rare');
      f.maxHp = f.hp = fishHp(s.level, fishZoneFor(this.zone), 'rare');
    }
    const old = this.target;
    if (old && old.state === 'flee') old.state = 'swim';
    this.targetId = f.id;
    this.nextTargetId = null;
  }

  private catchFish(f: FishEntity): void {
    this.fish = this.fish.filter((o) => o !== f);
    this.targetId = null;
    this.game.recordCatch(f.species, fishZoneFor(this.zone));
    this.emit({ type: 'caught', fish: f });
    const next = this.fish.find((o) => o.id === this.nextTargetId);
    if (next) this.setTarget(next);
    this.nextTargetId = null;
  }

  // --- Simulation -------------------------------------------------------------------

  update(dt: number): void {
    this.syncZone();
    const band = zoneBand(this.zone);
    const u = this.game.state.upgrades;
    this.time += dt;
    if (this.frenzy > 0) {
      this.frenzy -= dt;
      if (this.frenzy <= 0) {
        this.frenzy = 0;
        this.emit({ type: 'frenzy-end' });
      }
    }
    if (this.time - this.lastTap > COMBO_WINDOW * 1.5) this.combo = Math.max(0, this.combo - dt * 25);
    this.updateTreasure(dt);
    this.updateSeaEvent(dt);

    // keep the school full
    const school = this.seaEvent?.kind === 'school';
    if (!this.boss && this.fish.length < (school ? SCHOOL_FISH : FISH_PER_ZONE) && this.rnd() < dt * (school ? 4 : 0.8)) this.spawnFish();

    // fish movement
    for (const f of this.fish) {
      f.age += dt;
      f.phase += dt;
      if (f.state === 'hooked') {
        // struggle near the boat
        const a = f.phase * 2.2;
        const tx = this.boat.x + Math.sin(this.boat.heading + 1.4) * 2.6 + Math.sin(a) * 0.6;
        const tz = this.boat.z + Math.cos(this.boat.heading + 1.4) * 2.6 + Math.cos(a * 1.3) * 0.6;
        f.x += (tx - f.x) * Math.min(1, dt * 3);
        f.z += (tz - f.z) * Math.min(1, dt * 3);
        f.heading = Math.atan2(f.x - this.boat.x, f.z - this.boat.z) + Math.sin(a * 2) * 0.5;
        continue;
      }
      let desired: number;
      let speed = f.speed;
      if (f.state === 'flee') {
        desired = Math.atan2(f.x - this.boat.x, f.z - this.boat.z) + Math.sin(f.phase) * 0.6;
        speed = f.speed + 1.4;
      } else {
        // orbit the island with a gentle wander
        const ang = Math.atan2(f.x, f.z);
        desired = ang + (Math.PI / 2) * f.orbitDir + Math.sin(f.phase * 0.7) * 0.7;
      }
      // stay inside the zone band
      const r = Math.hypot(f.x, f.z);
      const ang = Math.atan2(f.x, f.z);
      if (r < band.inner + 1) desired = ang;
      else if (r > band.outer - 1) desired = ang + Math.PI;
      f.heading = turnTowards(f.heading, desired, dt * 2.2);
      f.x += Math.sin(f.heading) * speed * dt;
      f.z += Math.cos(f.heading) * speed * dt;
    }

    // goldfish
    const golden = this.seaEvent?.kind === 'goldenHour';
    const gpm = (golden ? GOLDEN_HOUR_GOLDFISH_PER_MINUTE : goldfishPerMinute(this.zone, u.radar)) * this.game.goldfishMult * (this.frenzy > 0 ? FRENZY_GOLDFISH_MULT : 1);
    if (gpm > 0 && !this.fight && this.goldfish.length < (golden ? 4 : 2) && this.rnd() < (gpm / 60) * dt) {
      const a = this.boat.heading + (this.rnd() - 0.5) * 2.4;
      const d = 6 + this.rnd() * 6;
      const g: Goldfish = { id: nextId++, x: this.boat.x + Math.sin(a) * d, z: this.boat.z + Math.cos(a) * d, ttl: GOLDFISH_LIFETIME };
      this.goldfish.push(g);
      this.emit({ type: 'goldfish-spawn', goldfish: g });
    }
    for (const g of this.goldfish) g.ttl -= dt;
    for (const g of this.goldfish.filter((o) => o.ttl <= 0)) this.emit({ type: 'goldfish-expired', goldfish: g });
    this.goldfish = this.goldfish.filter((g) => g.ttl > 0);

    if (this.boss) this.updateBoss(dt, band.center);
    else this.updateFishing(dt, band);
  }

  private updateSeaEvent(dt: number): void {
    if (this.seaEvent) {
      this.seaEvent.left -= dt;
      if (this.seaEvent.left <= 0) {
        const kind = this.seaEvent.kind;
        this.seaEvent = null;
        this.game.eventGoldMult = 1;
        this.emit({ type: 'sea-event-end', kind });
      }
      return;
    }
    this.eventTimer -= dt;
    if (this.eventTimer > 0 || this.boss || this.fight) return;
    this.eventTimer = SEA_EVENT_INTERVAL[0] + this.rnd() * (SEA_EVENT_INTERVAL[1] - SEA_EVENT_INTERVAL[0]);
    // golden koi only exist from zone 2; before that it is always a school
    const kind: SeaEventKind = this.zone >= 2 && this.rnd() < 0.4 ? 'goldenHour' : 'school';
    this.seaEvent = { kind, left: SEA_EVENTS[kind].seconds };
    this.game.eventGoldMult = kind === 'school' ? SCHOOL_GOLD_MULT : 1;
    this.emit({ type: 'sea-event-start', kind });
  }

  private updateTreasure(dt: number): void {
    this.treasureTimer -= dt;
    if (this.treasureTimer <= 0 && !this.fight && this.treasures.length === 0) {
      this.treasureTimer = TREASURE_INTERVAL[0] + this.rnd() * (TREASURE_INTERVAL[1] - TREASURE_INTERVAL[0]);
      // the camera looks north from the south, so place it within the visible area around the boat
      const side = this.rnd() < 0.5 ? -1 : 1;
      const t: Treasure = {
        id: nextId++,
        kind: this.rnd() < 0.5 ? 'chest' : 'bottle',
        x: this.boat.x + side * (3 + this.rnd() * 4),
        z: this.boat.z - 2 + this.rnd() * 8,
        ttl: TREASURE_LIFETIME,
        heading: this.rnd() * Math.PI * 2,
      };
      // keep it off the island
      const r = Math.hypot(t.x, t.z);
      if (r < ISLAND_RADIUS + 4) {
        t.x *= (ISLAND_RADIUS + 4) / r;
        t.z *= (ISLAND_RADIUS + 4) / r;
      }
      this.treasures.push(t);
      this.emit({ type: 'treasure-spawn', treasure: t });
    }
    for (const t of this.treasures) {
      t.ttl -= dt;
      t.x += Math.sin(t.heading) * 0.4 * dt;
      t.z += Math.cos(t.heading) * 0.4 * dt;
    }
    for (const t of this.treasures.filter((o) => o.ttl <= 0)) this.emit({ type: 'treasure-expired', treasure: t });
    this.treasures = this.treasures.filter((o) => o.ttl > 0);
  }

  private updateFishing(dt: number, band: { inner: number; outer: number; center: number }): void {
    const u = this.game.state.upgrades;
    let t = this.target;
    if (!t) {
      const queued = this.fish.find((f) => f.id === this.nextTargetId);
      t = queued ?? this.nearestFish();
      if (t) this.setTarget(t);
    }
    if (t) {
      const d = Math.hypot(t.x - this.boat.x, t.z - this.boat.z);
      if (t.state !== 'hooked') {
        if (d < HOOK_RANGE) {
          t.state = 'hooked';
          this.emit({ type: 'hooked', fish: t });
        } else {
          if (d < 9 && t.state === 'swim') t.state = 'flee';
          this.moveBoat(t.x, t.z, dt, HOOK_RANGE * 0.8);
        }
      }
      if (t.state === 'hooked') {
        this.boat.moving = false;
        const dps = autoDps(u);
        if (dps > 0) {
          t.hp -= dps * dt;
          if (t.hp <= 0) this.catchFish(t);
        }
      }
    } else {
      // no fish: sail to the middle of the zone band
      const ang = Math.atan2(this.boat.x, this.boat.z);
      this.moveBoat(Math.sin(ang) * band.center, Math.cos(ang) * band.center, dt, 1);
    }
  }

  private updateBoss(dt: number, center: number): void {
    const boss = this.boss!;
    const u = this.game.state.upgrades;
    const fight = this.fight;
    if (!fight || fight.over) {
      // boss slowly circles while waiting
      boss.angle += dt * 0.03;
      boss.x = Math.sin(boss.angle) * center;
      boss.z = Math.cos(boss.angle) * center;
      boss.heading = boss.angle + Math.PI / 2;
    }
    if (!fight) {
      this.bossCooldown -= dt;
      const d = Math.hypot(boss.x - this.boat.x, boss.z - this.boat.z);
      if (d > BOSS_RANGE) this.moveBoat(boss.x, boss.z, dt, BOSS_RANGE * 0.7);
      else if (this.bossCooldown <= 0) {
        this.boat.moving = false;
        this.fight = new BossFight(bossHp(this.game.state.level, boss.bossIndex), this.rnd, this.game.bossSeconds);
        this.emit({ type: 'boss-start', boss, fight: this.fight });
      }
      return;
    }
    if (this.continueOffer) return;
    fight.update(dt);
    fight.autoDamage(autoDps(u), dt);
    if (fight.phase === 'lost' && !fight.continued && fight.hpFraction <= BOSS_CONTINUE_MAX_HP) {
      this.continueOffer = true;
      this.emit({ type: 'boss-continue-offer', boss, fight });
      return;
    }
    if (fight.phase === 'won') {
      this.fight = null;
      this.boss = null;
      this.game.defeatBoss(boss.bossIndex);
      this.emit({ type: 'boss-won', boss });
      for (let i = 0; i < FISH_PER_ZONE; i++) this.spawnFish(true);
    } else if (fight.phase === 'lost') {
      this.fight = null;
      // the boss swims off to another place and recovers
      boss.angle += 0.9 + this.rnd() * 0.8;
      this.bossCooldown = 2;
      this.emit({ type: 'boss-lost', boss });
    }
  }

  /** Player took the offer: more time for this fight. */
  acceptContinue(): void {
    if (!this.continueOffer || !this.fight) return;
    this.continueOffer = false;
    this.fight.extend(BOSS_CONTINUE_SECONDS);
  }

  /** Player declined: the boss escapes as usual on the next update. */
  declineContinue(): void {
    if (this.fight) this.fight.continued = true;
    this.continueOffer = false;
  }

  /** Ends a running boss fight early (e.g. the player sails away). */
  abandonFight(): void {
    this.continueOffer = false;
    if (this.fight && this.boss) {
      this.fight = null;
      this.bossCooldown = 2;
      this.emit({ type: 'boss-lost', boss: this.boss });
    }
  }

  private nearestFish(): FishEntity | undefined {
    let best: FishEntity | undefined;
    let bestD = Infinity;
    for (const f of this.fish) {
      if (f.age < 0.8) continue;
      const d = Math.hypot(f.x - this.boat.x, f.z - this.boat.z);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private moveBoat(tx: number, tz: number, dt: number, stopAt: number): void {
    const dx = tx - this.boat.x;
    const dz = tz - this.boat.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt) {
      this.boat.moving = false;
      return;
    }
    this.boat.moving = true;
    const desired = Math.atan2(dx, dz);
    this.boat.heading = turnTowards(this.boat.heading, desired, dt * 3.5);
    // slow down while turning hard
    const align = Math.max(0.25, Math.cos(angleDiff(this.boat.heading, desired)));
    const step = Math.min(d - stopAt, BOAT_SPEED * boatSpeedMult(this.game.state.upgrades.engine) * align * dt);
    this.boat.x += Math.sin(this.boat.heading) * step;
    this.boat.z += Math.cos(this.boat.heading) * step;
    // never sail onto the island
    const r = Math.hypot(this.boat.x, this.boat.z);
    if (r < ISLAND_RADIUS + 2) {
      const k = (ISLAND_RADIUS + 2) / r;
      this.boat.x *= k;
      this.boat.z *= k;
    }
  }
}

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnTowards(current: number, desired: number, maxStep: number): number {
  const d = angleDiff(current, desired);
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}
