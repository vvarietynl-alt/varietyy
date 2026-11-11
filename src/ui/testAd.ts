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
