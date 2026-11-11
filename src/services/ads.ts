import type { Game } from '../game/game';

/**
 * Rewarded ads. The game only ever asks "show a rewarded ad for this
 * placement" and gets back whether the reward should be granted.
 *
 * Today a test provider shows a fake 3-second ad. In the Android build a
 * provider backed by AdMob (e.g. @capacitor-community/admob) replaces it,
 * without changes elsewhere in the game.
 */
export type AdPlacement =
  | 'offline-double'
  | 'boss-continue'
  | 'double-treasure'
  | 'double-goldfish'
  | 'mission-double'
  | 'boost-double-haul'
  | 'free-rubies';

export interface AdProvider {
  /** Resolves true when the viewer watched to the end. */
  showRewarded(placement: AdPlacement): Promise<boolean>;
}

export class Ads {
  private busy = false;
  /** Optional listener for analytics. */
  onEvent?: (event: 'ad_started' | 'ad_watched' | 'ad_skipped', placement: AdPlacement) => void;

  constructor(private game: Game, private provider: AdProvider) {}

  /** An ad can be offered (daily limit not reached, or the Captain's Pass skips ads). */
  get available(): boolean {
    return this.game.state.premium.captainsPass || this.game.adsLeftToday > 0;
  }

  /** Label for buttons: "📺" or "✓ Pass" for pass holders. */
  get icon(): string {
    return this.game.state.premium.captainsPass ? '🎫' : '📺';
  }

  /** Show an ad (or skip it with the Captain's Pass) and run `reward` when earned. */
  async watch(placement: AdPlacement, reward: () => void): Promise<boolean> {
    if (this.busy || !this.available) return false;
    if (this.game.state.premium.captainsPass) {
      reward();
      return true;
    }
    this.busy = true;
    try {
      this.onEvent?.('ad_started', placement);
      const ok = await this.provider.showRewarded(placement);
      this.onEvent?.(ok ? 'ad_watched' : 'ad_skipped', placement);
      if (ok) {
        this.game.recordAdWatched();
        reward();
      }
      return ok;
    } finally {
      this.busy = false;
    }
  }
}
