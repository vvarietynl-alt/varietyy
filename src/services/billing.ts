import type { Game } from '../game/game';

/**
 * In-app purchases. The game asks "buy product X" and, when the store says
 * the payment went through, applies the reward with Game.grantPurchase().
 *
 * Today a test provider asks for confirmation and charges nothing. In the
 * Android build a Google Play Billing provider (e.g. via a Capacitor
 * purchases plugin) replaces it; product ids match the Play Console.
 */
export interface BillingProvider {
  readonly testMode: boolean;
  /** Resolves true when the purchase completed. */
  purchase(productId: string, label: string, price: string): Promise<boolean>;
}

export class Billing {
  private busy = false;

  constructor(private game: Game, private provider: BillingProvider) {}

  get testMode(): boolean {
    return this.provider.testMode;
  }

  async buy(productId: string, label: string, price: string): Promise<number | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const ok = await this.provider.purchase(productId, label, price);
      return ok ? this.game.grantPurchase(productId) : null;
    } finally {
      this.busy = false;
    }
  }
}
