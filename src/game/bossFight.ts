import {
  BOSS_FIGHT_SECONDS,
  BOSS_MINIGAME_GREEN_SIZE,
  BOSS_MINIGAME_HIT_PCT,
  BOSS_MINIGAME_SECONDS,
  BOSS_MINIGAME_SPEED_START,
  BOSS_MINIGAME_SPEED_STEP,
  BOSS_MINIGAME_THRESHOLDS,
} from '../data/balance';

export type BossPhase = 'tap' | 'minigame' | 'won' | 'lost';

/**
 * Boss fight (GDD "Boss fight"):
 *  - 60 seconds in total; when time runs out the boss escapes and recovers.
 *  - Phase 1: every tap removes stamina.
 *  - When stamina first drops to 80% and 40%, a 10 s mini-game starts:
 *    a slider moves up and down, tapping while it is in the green zone
 *    removes 2% of max stamina and speeds the slider up.
 */
export class BossFight {
  readonly maxHp: number;
  hp: number;
  timeLeft = BOSS_FIGHT_SECONDS;
  phase: BossPhase = 'tap';

  // Mini-game state
  miniTimeLeft = 0;
  /** Slider position 0..1 (bottom → top). */
  slider = 0;
  private sliderDir = 1;
  sliderSpeed = BOSS_MINIGAME_SPEED_START;
  /** Green zone [start, start + size]. */
  greenStart = 0.4;
  readonly greenSize = BOSS_MINIGAME_GREEN_SIZE;
  miniHits = 0;
  miniMisses = 0;
  private thresholdsDone = BOSS_MINIGAME_THRESHOLDS.map(() => false);

  constructor(maxHp: number, private rnd: () => number = Math.random, seconds = BOSS_FIGHT_SECONDS) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.timeLeft = seconds;
  }

  /** Extra time was already given once in this fight. */
  continued = false;

  /** Give extra time after the timer ran out (boss continue). */
  extend(seconds: number): void {
    this.timeLeft = seconds;
    this.phase = 'tap';
    this.continued = true;
  }

  get hpFraction(): number {
    return this.hp / this.maxHp;
  }

  get over(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  /** Tap during the tap phase. Returns damage dealt. */
  tap(damage: number): number {
    if (this.phase !== 'tap') return 0;
    return this.damage(damage);
  }

  /** Auto gear damage per second, only in the tap phase. */
  autoDamage(dps: number, dt: number): void {
    if (this.phase === 'tap' && dps > 0) this.damage(dps * dt);
  }

  /** Tap during the mini-game. Returns true for a hit in the green zone. */
  miniTap(): boolean {
    if (this.phase !== 'minigame') return false;
    const inGreen = this.slider >= this.greenStart && this.slider <= this.greenStart + this.greenSize;
    if (inGreen) {
      this.miniHits++;
      this.sliderSpeed += BOSS_MINIGAME_SPEED_STEP;
      this.damage(this.maxHp * BOSS_MINIGAME_HIT_PCT);
      this.placeGreen();
    } else {
      this.miniMisses++;
    }
    return inGreen;
  }

  update(dt: number): void {
    if (this.over) return;
    this.timeLeft -= dt;
    if (this.phase === 'minigame') {
      this.miniTimeLeft -= dt;
      this.slider += this.sliderDir * this.sliderSpeed * dt;
      if (this.slider >= 1) {
        this.slider = 2 - this.slider;
        this.sliderDir = -1;
      } else if (this.slider <= 0) {
        this.slider = -this.slider;
        this.sliderDir = 1;
      }
      if (this.miniTimeLeft <= 0 && !this.over) this.phase = 'tap';
    }
    if (this.timeLeft <= 0 && !this.over) {
      this.timeLeft = 0;
      this.phase = 'lost';
    }
  }

  private damage(amount: number): number {
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.phase = 'won';
      return before;
    }
    if (this.phase === 'tap') {
      const frac = this.hpFraction;
      for (let i = 0; i < BOSS_MINIGAME_THRESHOLDS.length; i++) {
        if (!this.thresholdsDone[i] && frac <= BOSS_MINIGAME_THRESHOLDS[i]) {
          this.thresholdsDone[i] = true;
          this.startMinigame();
          break;
        }
      }
    }
    return before - this.hp;
  }

  private startMinigame(): void {
    this.phase = 'minigame';
    this.miniTimeLeft = BOSS_MINIGAME_SECONDS;
    this.slider = 0;
    this.sliderDir = 1;
    this.sliderSpeed = BOSS_MINIGAME_SPEED_START;
    this.placeGreen();
  }

  private placeGreen(): void {
    this.greenStart = 0.15 + this.rnd() * (0.85 - this.greenSize - 0.15);
  }
}
