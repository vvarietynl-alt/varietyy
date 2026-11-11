import { FISHERMAN_NAMES, isBossZone } from '../data/balance';
import { bestFishingZone, fishermanProduction, zoneAverageGold } from './economy';
import { angleDiff, ISLAND_RADIUS, zoneBand } from './fishing';
import type { Game } from './game';

/**
 * The visible fishing company: every fisherman tier you hire gets its own
 * boat(s) that sail out from the harbour, fish in the unlocked zones, and
 * come back to unload at the docks.
 *
 * This is presentation only: fleet income keeps being paid every second by
 * Game.tick(), so the balance is unaffected. The gold shown when a boat
 * unloads is that boat's share of the income during its trip.
 */

export type BoatClass = 'rowboat' | 'fishingBoat' | 'trawler' | 'galleon' | 'mystic';

export function boatClassFor(tier: number): BoatClass {
  if (tier <= 3) return 'rowboat';
  if (tier <= 9) return 'fishingBoat';
  if (tier <= 16) return 'trawler';
  if (tier <= 21) return 'galleon';
  return 'mystic';
}

export const BOAT_CLASS_NAMES: Record<BoatClass, string> = {
  rowboat: 'Rowboat',
  fishingBoat: 'Fishing boat',
  trawler: 'Trawler',
  galleon: 'Galleon',
  mystic: 'Mystic ship',
};

/** Boats shown for one fisherman tier: one, plus one per milestone owned. */
export function boatsForTier(owned: number): number {
  if (owned <= 0) return 0;
  return 1 + [10, 25, 50, 100, 200].filter((m) => owned >= m).length;
}

export const MAX_FLEET_BOATS = 30;
const SEA_LANE_RADIUS = ISLAND_RADIUS + 8;

/** Pier x-positions; a new pier opens as the company grows. */
export const PIER_X = [0, -5, 5, -10];
export function piersFor(tiersOwned: number): number {
  return tiersOwned >= 15 ? 4 : tiersOwned >= 8 ? 3 : tiersOwned >= 3 ? 2 : 1;
}

export type FleetBoatState = 'docked' | 'leaving' | 'transit' | 'fishing' | 'returning' | 'arriving' | 'unloading';

export interface FleetBoat {
  id: number;
  tier: number;
  /** index of this boat among the boats of its tier */
  index: number;
  x: number;
  z: number;
  heading: number;
  state: FleetBoatState;
  timer: number;
  nextCatch: number;
  homeX: number;
  homeZ: number;
  targetR: number;
  targetA: number;
  speed: number;
  tripStart: number;
  phase: number;
}

export type FleetEvent =
  | { type: 'fleet-catch'; boat: FleetBoat }
  | { type: 'fleet-unload'; boat: FleetBoat; gold: number }
  | { type: 'fleet-launch'; boat: FleetBoat; firstOfClass: boolean };

let nextId = 1;

export class Fleet {
  boats: FleetBoat[] = [];
  private time = 0;
  private listeners = new Set<(e: FleetEvent) => void>();
  private seenClasses = new Set<BoatClass>();
  private initialised = false;

  constructor(
    private game: Game,
    /** Where the player is; half of the boats fish nearby so the sea around you feels busy. */
    private focus: () => { x: number; z: number } = () => ({ x: 0, z: 30 }),
    private rnd: () => number = Math.random,
  ) {}

  on(fn: (e: FleetEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: FleetEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  get tiersOwned(): number {
    return this.game.state.fishermen.filter((n) => n > 0).length;
  }

  /** How many boats each tier should have, capped in total (highest tiers keep theirs). */
  desiredCounts(): number[] {
    const f = this.game.state.fishermen;
    const counts: number[] = f.map((n) => (n > 0 ? 1 : 0));
    let total = counts.reduce((a, b) => a + b, 0);
    for (let t = f.length - 1; t >= 0 && total < MAX_FLEET_BOATS; t--) {
      const extra = Math.min(boatsForTier(f[t]) - counts[t], MAX_FLEET_BOATS - total);
      if (extra > 0) {
        counts[t] += extra;
        total += extra;
      }
    }
    return counts;
  }

  /** Reset everything (new game). */
  reset(): void {
    this.boats = [];
    this.seenClasses.clear();
    this.initialised = false;
  }

  update(dt: number): void {
    this.time += dt;
    this.syncBoats();
    for (const b of this.boats) this.updateBoat(b, dt);
  }

  private syncBoats(): void {
    const want = this.desiredCounts();
    const first = !this.initialised;
    this.initialised = true;
    // remove surplus (only after a reset)
    this.boats = this.boats.filter((b) => b.index < want[b.tier]);
    for (let tier = 0; tier < want.length; tier++) {
      const have = this.boats.filter((b) => b.tier === tier).length;
      for (let i = have; i < want[tier]; i++) {
        const boat = this.createBoat(tier, i, first);
        this.boats.push(boat);
        const cls = boatClassFor(tier);
        const firstOfClass = !this.seenClasses.has(cls);
        this.seenClasses.add(cls);
        if (!first) this.emit({ type: 'fleet-launch', boat, firstOfClass });
      }
    }
    if (first) for (const b of this.boats) this.seenClasses.add(boatClassFor(b.tier));
  }

  private createBoat(tier: number, index: number, scatter: boolean): FleetBoat {
    const piers = piersFor(this.tiersOwned);
    const pier = (tier + index) % piers;
    const side = (tier + index) % 2 === 0 ? 1 : -1;
    const homeX = PIER_X[pier] + side * 1.6;
    const homeZ = ISLAND_RADIUS + 3.5 + ((tier * 3 + index) % 3) * 0.9;
    const b: FleetBoat = {
      id: nextId++,
      tier,
      index,
      x: homeX,
      z: homeZ,
      heading: 0,
      state: 'docked',
      timer: 0.5 + this.rnd() * 3,
      nextCatch: 4,
      homeX,
      homeZ,
      targetR: 0,
      targetA: 0,
      speed: 6 + Math.min(tier, 20) * 0.12,
      tripStart: this.time,
      phase: this.rnd() * 10,
    };
    if (scatter) {
      // on load, start boats spread over the sea instead of all at the dock
      this.pickSpot(b);
      b.x = Math.sin(b.targetA) * b.targetR;
      b.z = Math.cos(b.targetA) * b.targetR;
      b.state = 'fishing';
      b.timer = 5 + this.rnd() * 20;
      b.tripStart = this.time - 20;
    }
    return b;
  }

  /** Choose where to fish: often the best zone, otherwise any unlocked fishing zone. */
  private pickSpot(b: FleetBoat): void {
    const s = this.game.state;
    const zones: number[] = [];
    for (let z = 1; z <= s.unlockedZone; z++) if (!isBossZone(z)) zones.push(z);
    const nearPlayer = this.rnd() < 0.5;
    const f = this.focus();
    let zone: number;
    if (nearPlayer) {
      // the unlocked fishing zone closest to the player
      const r = Math.hypot(f.x, f.z);
      zone = zones.reduce((best, z) => (Math.abs(zoneBand(z).center - r) < Math.abs(zoneBand(best).center - r) ? z : best), zones[0]);
    } else {
      zone = this.rnd() < 0.5 ? bestFishingZone(s.unlockedZone) : zones[Math.floor(this.rnd() * zones.length)];
    }
    const band = zoneBand(zone);
    b.targetR = band.inner + 2 + this.rnd() * (band.outer - band.inner - 4);
    b.targetA = nearPlayer ? Math.atan2(f.x, f.z) + (this.rnd() - 0.5) * 1.4 : (this.rnd() - 0.5) * Math.PI * 2;
  }

  private updateBoat(b: FleetBoat, dt: number): void {
    b.phase += dt;
    b.timer -= dt;
    switch (b.state) {
      case 'docked':
        if (b.timer <= 0) {
          b.state = 'leaving';
          b.tripStart = this.time;
          this.pickSpot(b);
        }
        break;
      case 'leaving':
        if (this.moveStraight(b, b.homeX, SEA_LANE_RADIUS + 1, dt)) b.state = 'transit';
        break;
      case 'transit':
        if (this.movePolar(b, b.targetR, b.targetA, dt)) {
          b.state = 'fishing';
          b.timer = 16 + this.rnd() * 16;
          b.nextCatch = 2 + this.rnd() * 4;
        }
        break;
      case 'fishing': {
        // drift slowly while the line is out
        b.heading += Math.sin(b.phase * 0.3) * dt * 0.2;
        b.nextCatch -= dt;
        if (b.nextCatch <= 0) {
          b.nextCatch = 3.5 + this.rnd() * 4;
          this.emit({ type: 'fleet-catch', boat: b });
        }
        if (b.timer <= 0) b.state = 'returning';
        break;
      }
      case 'returning': {
        const laneA = Math.atan2(b.homeX, SEA_LANE_RADIUS + 1);
        if (this.movePolar(b, SEA_LANE_RADIUS + 1, laneA, dt)) b.state = 'arriving';
        break;
      }
      case 'arriving':
        if (this.moveStraight(b, b.homeX, b.homeZ, dt * 0.6)) {
          b.state = 'unloading';
          b.timer = 2.5;
          b.heading = Math.PI;
          this.emit({ type: 'fleet-unload', boat: b, gold: this.tripGold(b) });
        }
        break;
      case 'unloading':
        if (b.timer <= 0) {
          b.state = 'docked';
          b.timer = 1 + this.rnd() * 3;
        }
        break;
    }
  }

  /** This boat's share of the fleet income over its last trip. */
  tripGold(b: FleetBoat): number {
    const s = this.game.state;
    const boatsOfTier = Math.max(1, this.boats.filter((o) => o.tier === b.tier).length);
    const fishPerSec = fishermanProduction(b.tier, s.fishermen[b.tier]) / boatsOfTier;
    const value = zoneAverageGold(s.level, bestFishingZone(s.unlockedZone)) * this.game.incomeMult;
    return fishPerSec * value * (this.time - b.tripStart);
  }

  label(b: FleetBoat): string {
    return `${FISHERMAN_NAMES[b.tier]} · ${BOAT_CLASS_NAMES[boatClassFor(b.tier)]}`;
  }

  /** Fleet boats share the player's engine upgrades (presentation only). */
  private speedOf(b: FleetBoat): number {
    return b.speed * (1 + this.game.state.upgrades.engine * 0.06);
  }

  private moveStraight(b: FleetBoat, tx: number, tz: number, dt: number): boolean {
    const dx = tx - b.x;
    const dz = tz - b.z;
    const d = Math.hypot(dx, dz);
    const step = this.speedOf(b) * dt;
    if (d <= step) {
      b.x = tx;
      b.z = tz;
      return true;
    }
    b.heading = Math.atan2(dx, dz);
    b.x += (dx / d) * step;
    b.z += (dz / d) * step;
    return false;
  }

  /** Move in polar coordinates so boats sail around the island, never across it. */
  private movePolar(b: FleetBoat, tr: number, ta: number, dt: number): boolean {
    const r = Math.hypot(b.x, b.z);
    const a = Math.atan2(b.x, b.z);
    const da = angleDiff(a, ta);
    const dr = tr - r;
    const dist = Math.hypot(r * da, dr);
    const step = this.speedOf(b) * dt;
    let nr: number;
    let na: number;
    let done = false;
    if (dist <= step) {
      nr = tr;
      na = ta;
      done = true;
    } else {
      const f = step / dist;
      nr = r + dr * f;
      na = a + da * f;
    }
    const nx = Math.sin(na) * nr;
    const nz = Math.cos(na) * nr;
    if (Math.hypot(nx - b.x, nz - b.z) > 1e-4) b.heading = Math.atan2(nx - b.x, nz - b.z);
    b.x = nx;
    b.z = nz;
    return done;
  }
}
