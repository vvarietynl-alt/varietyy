import type { AdPlacement, AdProvider } from '../services/ads';
import { h } from './dom';

/** Stand-in for a real rewarded video while there is no ad network yet. */
export class TestAdProvider implements AdProvider {
  constructor(private root: HTMLElement) {}

  showRewarded(_placement: AdPlacement): Promise<boolean> {
    return new Promise((resolve) => {
      let left = 3;
      const count = h('b', null, String(left));
      const overlay = h('div', { class: 'test-ad', onpointerdown: (e: Event) => e.stopPropagation() },
        h('div', { class: 'test-ad-box' },
          h('small', null, 'ADVERTISEMENT · TEST MODE'),
          h('div', { class: 'test-ad-art' }, '🐋'),
          h('p', null, 'Here a real rewarded video will play in the Play Store version.'),
          h('div', { class: 'test-ad-count' }, 'Reward in ', count, 's'),
        ),
      );
      this.root.append(overlay);
      const timer = setInterval(() => {
        left--;
        count.textContent = String(left);
        if (left <= 0) {
          clearInterval(timer);
          overlay.remove();
          resolve(true);
        }
      }, 1000);
    });
  }
}

/** Stand-in for Google Play Billing: confirms a test purchase, charges nothing. */
export class TestBillingProvider {
  readonly testMode = true;
  constructor(private root: HTMLElement) {}

  purchase(_productId: string, label: string, price: string): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (ok: boolean) => { overlay.remove(); resolve(ok); };
      const overlay = h('div', { class: 'test-ad', onpointerdown: (e: Event) => e.stopPropagation() },
        h('div', { class: 'test-ad-box' },
          h('small', null, 'GOOGLE PLAY · TEST MODE'),
          h('div', { class: 'test-ad-art' }, '🛒'),
          h('b', null, label),
          h('p', null, `${price} — test purchase, no money is charged.`),
          h('div', { class: 'actions', style: 'display:flex;flex-direction:column;gap:8px' },
            h('button', { class: 'btn gold wide', onclick: () => done(true) }, 'Buy (test)'),
            h('button', { class: 'btn ghost wide', onclick: () => done(false) }, 'Cancel'),
          ),
        ),
      );
      this.root.append(overlay);
    });
  }
}
