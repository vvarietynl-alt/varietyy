import { SEA_EVENTS, BOOSTS, type BoostId, BOSS_CONTINUE_RUBIES, BOSS_CONTINUE_SECONDS, DOUBLE_OFFER_SECONDS, isBossZone, OFFLINE_TRIPLE_RUBY_COST, PRESTIGE_MIN_LEVEL, ZONES_PER_LEVEL } from '../data/balance';
import { canClaimDaily, claimableMissions } from '../game/missions';
import type { Ads } from '../services/ads';
import { bossSpecies, themeFor } from '../data/fish';
import { fishermanCost, upgradeCost, zoneUnlockPrice } from '../game/economy';
import type { FishingWorld } from '../game/fishing';
import { formatDuration, formatNumber } from '../game/format';
import type { Game } from '../game/game';
import { coin, h, pressButton, ruby, setDisabled, setText } from './dom';
import type { PanelId, PanelManager } from './panels';

export interface HudHost {
  toggleIsland(): void;
  isIslandMode(): boolean;
  sfx(name: 'click' | 'buy' | 'error'): void;
  ads: Ads;
}

type DockId = 'island' | 'researchCenter' | 'fishingWorkshop' | 'boatWorkshop' | 'fishermenSchool' | 'atlas';

export class Hud {
  private goldEl = h('span');
  private rateEl = h('div', { class: 'rate' });
  private rubyEl = h('span');
  private pearlEl = h('span');
  private pearlPill: HTMLElement;
  private voyageBtn: HTMLElement | null = null;
  private levelEl = h('span', { class: 'pill' });
  private zoneLabel = h('b');
  private zoneSub = h('small');
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private zonebar: HTMLElement;
  private nextZone = h('div', { class: 'next-zone' });
  private nextZoneKey = '';
  private dockButtons = new Map<DockId, HTMLButtonElement>();
  private badges = new Map<DockId, HTMLElement>();
  private toasts = h('div', { class: 'toasts' });
  private hintEl: HTMLElement | null = null;
  private hintText = '';
  private modal: HTMLElement | null = null;
  private boostChips = h('div', { class: 'boost-chips' });
  private doubleOffer: HTMLElement | null = null;
  private eventChip = h('div', { class: 'event-chip', style: 'display:none' });
  private offerBtn!: HTMLButtonElement;
  private offerTimer = h('span');
  private adBoostBtn: HTMLButtonElement;
  private boostKey = '';
  private sideBadges: { missions: HTMLElement; daily: HTMLElement; boosts: HTMLElement; voyage: HTMLElement };
  private combo = h('div', { class: 'combo', style: 'display:none' });
  private comboFill = h('div', { class: 'cfill' });
  private comboLabel = h('div', { class: 'clabel' });

  constructor(private ui: HTMLElement, private game: Game, private world: FishingWorld, private panels: PanelManager, private host: HudHost) {
    const s = () => game.state;
    const hud = h('div', { class: 'hud' },
      h('div', { class: 'hud-left' }, this.levelEl, this.boostChips),
      h('div', { class: 'gold-box' }, h('div', { class: 'amount' }, coin(), this.goldEl), this.rateEl),
      h('div', { class: 'hud-right' },
        (this.pearlPill = pressButton({ class: 'pill', style: 'display:none' }, () => this.openPanel('lighthouse'), '🐚', this.pearlEl)),
        pressButton({ class: 'pill' }, () => this.openPanel('shop'), ruby(), this.rubyEl),
        pressButton({ class: 'icon-btn', 'aria-label': 'Settings' }, () => this.openPanel('settings'), '⚙️'),
      ),
    );
    this.prevBtn = pressButton({ class: 'arrow', 'aria-label': 'Previous zone' }, () => { this.world.abandonFight(); game.setActiveZone(s().activeZone - 1); host.sfx('click'); }, '◀');
    this.nextBtn = pressButton({ class: 'arrow', 'aria-label': 'Next zone' }, () => { this.world.abandonFight(); game.setActiveZone(s().activeZone + 1); host.sfx('click'); }, '▶');
    this.zonebar = h('div', { class: 'zonebar' }, this.prevBtn, h('div', { class: 'label' }, this.zoneLabel, this.zoneSub), this.nextBtn);

    const dock = h('div', { class: 'dock' });
    const items: [DockId, string, string][] = [
      ['island', '🏝️', 'Island'],
      ['researchCenter', '🔬', 'Research'],
      ['fishingWorkshop', '🎣', 'Rods'],
      ['boatWorkshop', '⚓', 'Boat'],
      ['fishermenSchool', '🎓', 'School'],
      ['atlas', '📖', 'Atlas'],
    ];
    for (const [id, icon, label] of items) {
      const badge = h('i', { class: 'badge', style: 'display:none' }, '!');
      const btn = pressButton({}, () => {
        host.sfx('click');
        if (id === 'island') host.toggleIsland();
        else this.openPanel(id);
      }, icon, h('span', null, label), badge);
      this.dockButtons.set(id, btn);
      this.badges.set(id, badge);
      dock.append(btn);
    }
    const side = h('div', { class: 'side' });
    const sideBtn = (id: 'missions' | 'daily' | 'boosts' | 'lighthouse', icon: string, label: string) => {
      const badge = h('i', { class: 'badge', style: 'display:none' });
      const btn = pressButton({ class: 'side-btn', 'aria-label': label }, () => { host.sfx('click'); this.openPanel(id); }, icon, h('span', null, label), badge);
      side.append(btn);
      return { badge, btn };
    };
    this.sideBadges = { missions: sideBtn('missions', '📜', 'Missions').badge, daily: sideBtn('daily', '🎁', 'Daily').badge, boosts: sideBtn('boosts', '⚡', 'Boost').badge, voyage: h('i') };
    this.offerBtn = pressButton({ class: 'side-btn offer', 'aria-label': 'Special offer' }, () => { host.sfx('click'); this.panels.openShop('rubies'); }, '🎁', this.offerTimer);
    side.append(this.offerBtn);
    const v = sideBtn('lighthouse', '🗼', 'Voyage');
    this.sideBadges.voyage = v.badge;
    this.voyageBtn = v.btn;
    this.combo.append(h('div', { class: 'ctrack' }, this.comboFill), this.comboLabel);
    this.adBoostBtn = pressButton({ class: 'ad-boost' }, () => {
      void host.ads.watch('boost-double-haul', () => { game.activateBoost('doubleHaul', BOOSTS.doubleHaul.minutes); host.sfx('buy'); });
    }, '');
    ui.append(hud, this.zonebar, this.nextZone, this.eventChip, side, this.combo, this.toasts, this.adBoostBtn, dock);
  }

  private updateSide(): void {
    const g = this.game;
    const show = (el: HTMLElement, text: string) => {
      const want = text ? '' : 'none';
      if (el.style.display !== want) el.style.display = want;
      setText(el, text);
    };
    const claim = claimableMissions(g);
    show(this.sideBadges.missions, claim > 0 ? String(claim) : '');
    show(this.sideBadges.daily, canClaimDaily(g) ? '!' : '');
    const st = g.state;
    const voyageOpen = st.level >= PRESTIGE_MIN_LEVEL || st.pearlsEarned > 0;
    if (this.voyageBtn) this.voyageBtn.style.display = voyageOpen ? '' : 'none';
    // badge when a voyage would at least double your pearls (or give the first ones)
    const gain = g.pearlsForVoyage;
    show(this.sideBadges.voyage, g.canStartVoyage() && gain >= Math.max(10, st.pearlsEarned) ? '!' : '');
    this.pearlPill.style.display = st.pearlsEarned > 0 ? '' : 'none';
    setText(this.pearlEl, formatNumber(st.pearls));
    const active = (Object.keys(BOOSTS) as BoostId[]).filter((id) => g.isBoostActive(id));
    // free 2× gold through an ad, when not active (hidden during boss fights and in the first minutes)
    const showAdBoost = this.host.ads.available && !g.isBoostActive('doubleHaul') && st.stats.fishCaught >= 15 && !(this.world.fight && !this.world.fight.over);
    const wantAd = showAdBoost ? '' : 'none';
    if (this.adBoostBtn.style.display !== wantAd) this.adBoostBtn.style.display = wantAd;
    setText(this.adBoostBtn, `${this.host.ads.icon} 2× gold ${BOOSTS.doubleHaul.minutes}m`);
    show(this.sideBadges.boosts, active.length ? String(active.length) : '');

    // active boost chips with timers
    const key = active.join();
    if (key !== this.boostKey) {
      this.boostKey = key;
      this.boostChips.replaceChildren(...active.map((id) => h('div', { class: 'pill boost', 'data-id': id })));
    }
    for (const el of Array.from(this.boostChips.children) as HTMLElement[]) {
      const id = el.dataset.id as BoostId;
      const icon = id === 'doubleHaul' ? '💰×2' : id === 'strongArms' ? '💪×2' : '✨×3';
      setText(el, `${icon} ${formatDuration(g.boostSecondsLeft(id))}`);
    }

    // one-time starter offer with countdown
    const offer = g.starterOfferActive;
    const wantOffer = offer ? '' : 'none';
    if (this.offerBtn.style.display !== wantOffer) this.offerBtn.style.display = wantOffer;
    if (offer) {
      const left = (st.offers.starterUntil - g.now()) / 1000;
      setText(this.offerTimer, left > 3600 ? `${Math.floor(left / 3600)}h` : `${Math.ceil(left / 60)}m`);
    }

    // sea event banner
    const ev = this.world.seaEvent;
    const wantEv = ev ? '' : 'none';
    if (this.eventChip.style.display !== wantEv) this.eventChip.style.display = wantEv;
    if (ev) {
      const def = SEA_EVENTS[ev.kind];
      setText(this.eventChip, `${def.icon} ${def.name} — ${def.description} · ${Math.ceil(ev.left)}s`);
      this.eventChip.classList.toggle('gold', ev.kind === 'goldenHour');
    }

    // combo / frenzy meter
    const fight = !!this.world.fight && !this.world.fight.over;
    const visible = !fight && (this.world.frenzy > 0 || this.world.combo >= 3);
    const want = visible ? '' : 'none';
    if (this.combo.style.display !== want) this.combo.style.display = want;
    if (visible) {
      this.comboFill.style.height = `${this.world.comboFill * 100}%`;
      const frenzy = this.world.frenzy > 0;
      this.combo.classList.toggle('on', frenzy);
      setText(this.comboLabel, frenzy ? 'FRENZY ×2' : `×${Math.floor(this.world.combo)}`);
    }
    document.getElementById('app')!.classList.toggle('frenzy', this.world.frenzy > 0);
  }

  openPanel(id: PanelId): void {
    if (this.panels.current === id) this.panels.close();
    else this.panels.open(id);
  }

  update(): void {
    const s = this.game.state;
    setText(this.goldEl, formatNumber(s.gold));
    const rate = this.game.incomePerSecond;
    setText(this.rateEl, `+${formatNumber(rate)} /s`);
    setText(this.rubyEl, String(s.rubies));
    setText(this.levelEl, `Lv ${s.level} · ${themeFor(s.level).name}`);

    const z = s.activeZone;
    setText(this.zoneLabel, `Zone ${z} / ${ZONES_PER_LEVEL}`);
    const bossIndex = z === 5 ? 0 : 1;
    setText(this.zoneSub, isBossZone(z) ? (s.bossesDefeated[bossIndex] ? 'Boss defeated ✅' : `🐋 ${bossSpecies(s.level, bossIndex).name}`) : z === s.unlockedZone ? 'Furthest zone' : 'Tap ▶ to sail further');
    setDisabled(this.prevBtn, z <= 1);
    setDisabled(this.nextBtn, z >= s.unlockedZone);
    const fighting = !!this.world.fight && !this.world.fight.over;
    this.zonebar.style.display = fighting ? 'none' : '';
    this.nextZone.style.display = fighting ? 'none' : '';
    this.updateNextZone();
    this.updateBadges();
    this.updateSide();
    this.updateHint();
    this.dockButtons.get('island')!.classList.toggle('active', this.host.isIslandMode());
    for (const [id, btn] of this.dockButtons) if (id !== 'island') btn.classList.toggle('active', this.panels.current === id);
  }

  private updateNextZone(): void {
    const g = this.game;
    const s = g.state;
    const st = g.nextZoneStatus();
    let key: string = st.kind;
    let content: () => HTMLElement;
    if (st.kind === 'maxed') {
      if (g.levelComplete) {
        const can = g.canSailToNextLevel();
        key += can ? '-sail' : '-save';
        content = () => can
          ? pressButton({ class: 'btn gold pulse' }, () => this.openPanel('researchCenter'), `⛵ Sail to Level ${s.level + 1}`)
          : h('div', { class: 'chip' }, `⛵ Level ${s.level + 1}: `, coin(), formatNumber(g.nextLevelPrice));
      } else if (!g.levelComplete) {
        key += '-boss';
        content = () => h('div', { class: 'chip' }, `🐋 Defeat the boss in zone ${!s.bossesDefeated[0] ? 5 : 10}`);
      } else {
        content = () => h('div', { class: 'chip' }, '🏆 All seas conquered');
      }
    } else if (st.kind === 'need-catches') {
      key += `-${st.have}`;
      content = () => h('div', { class: 'chip' }, `🎣 Catch ${st.have}/${st.need} fish to open zone ${s.unlockedZone + 1}`);
    } else if (st.kind === 'need-boss') {
      key += `-${s.activeZone}`;
      content = () => s.activeZone === s.unlockedZone
        ? h('div', { class: 'chip' }, '🐋 Defeat the boss to sail further')
        : pressButton({ class: 'btn blue small' }, () => { this.game.setActiveZone(s.unlockedZone); this.host.sfx('click'); }, `🐋 Sail to the boss (zone ${s.unlockedZone})`);
    } else if (st.kind === 'need-gold') {
      key += `-${Math.floor((s.gold / st.price) * 20)}`;
      content = () => h('div', { class: 'chip' }, `🔒 Zone ${s.unlockedZone + 1}: `, coin(), `${formatNumber(s.gold)} / ${formatNumber(st.price)}`);
    } else {
      key += `-${s.unlockedZone}`;
      const next = s.unlockedZone + 1;
      content = () => pressButton({ class: 'btn gold pulse' }, () => this.host.sfx(this.game.unlockNextZone() ? 'buy' : 'error'),
        isBossZone(next) ? `🐋 Open boss zone ${next}` : h('span', null, `Unlock zone ${next} · `, coin(), ' ', formatNumber(zoneUnlockPrice(s.level, next))));
    }
    key = `${s.level}-${s.unlockedZone}-${key}`;
    if (key !== this.nextZoneKey) {
      this.nextZoneKey = key;
      this.nextZone.replaceChildren(content());
    }
  }

  private updateBadges(): void {
    const g = this.game;
    const s = g.state;
    const show = (id: DockId, on: boolean) => {
      const b = this.badges.get(id)!;
      const want = on ? '' : 'none';
      if (b.style.display !== want) b.style.display = want;
    };
    show('researchCenter', g.nextZoneStatus().kind === 'ready' || g.canSailToNextLevel());
    const tier = s.fishermen.findIndex((n) => n === 0);
    const cheapest = Math.min(...s.fishermen.map((n, t) => (g.isFishermanUnlocked(t) ? fishermanCost(t, n) : Infinity)));
    show('fishermenSchool', s.gold >= cheapest && (tier === -1 || tier <= 1 || s.gold >= fishermanCost(tier, 0)));
    show('fishingWorkshop', s.gold >= upgradeCost('skill', s.upgrades.skill) * 1.0 && s.upgrades.skill < 3);
    show('boatWorkshop', s.upgrades.autoGear === 0 && s.gold >= upgradeCost('autoGear', 0));
    show('atlas', g.claimableAtlasSets() > 0);
  }

  // --- Tutorial hints (GDD "Training") -----------------------------------------------

  private updateHint(): void {
    const g = this.game;
    const s = g.state;
    let text = '';
    let glow: DockId | null = null;
    const hooked = this.world.target?.state === 'hooked';
    if (this.panels.current || this.host.isIslandMode() || this.modal || document.querySelector('.start-screen')) text = '';
    else if (this.world.fight && !this.world.fight.over) text = '';
    else if (s.stats.fishCaught === 0) text = hooked ? 'Tap anywhere, fast! Reel in the fish 🎣' : 'Your boat sails to the nearest fish…';
    else if (s.stats.missionsDone === 0 && claimableMissions(g) > 0) {
      text = 'Mission complete! Tap 📜 Missions on the left to collect your rubies.';
    } else if (s.fishermen[0] <= 1 && s.stats.fishermenHired < 3 && s.gold >= fishermanCost(0, s.fishermen[0])) {
      text = s.fishermen[0] === 0
        ? 'Hire a fisherman at the School — they catch fish for you, even offline!'
        : 'Hire more fishermen at the School — every one sails out and earns gold for you!';
      glow = 'fishermenSchool';
    } else if (isBossZone(s.activeZone) && !s.bossesDefeated[s.activeZone === 5 ? 0 : 1] && s.stats.bossesDefeated === 0) {
      text = '🐋 A boss! Tap as fast as you can. Too strong? Upgrade your rod first.';
    } else if (s.upgrades.skill === 0 && s.gold >= upgradeCost('skill', 0)) {
      text = 'Upgrade your rod at the Fishing Workshop for stronger taps.';
      glow = 'fishingWorkshop';
    } else if (s.unlockedZone === 1 && g.nextZoneStatus().kind === 'ready') {
      text = 'Unlock zone 2 — fish further from the island are worth more!';
    } else if (s.stats.fishCaught >= 4 && s.stats.fishCaught < 9 && s.unlockedZone <= 2) {
      text = 'Tip: tap a fish to choose it as your next catch.';
    }
    for (const [id, btn] of this.dockButtons) btn.classList.toggle('hint-glow', id === glow);
    if (text === this.hintText) return;
    this.hintText = text;
    this.hintEl?.remove();
    this.hintEl = null;
    if (text) {
      this.hintEl = h('div', { class: 'hint' }, text);
      this.ui.append(this.hintEl);
    }
  }

  // --- Toasts & modals ------------------------------------------------------------

  toast(content: (string | Node)[], special = false): void {
    const el = h('div', { class: `toast${special ? ' special' : ''}` }, ...content);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => el.remove(), 2800);
  }

  showModal(build: (close: () => void) => HTMLElement[]): void {
    this.closeModal();
    const close = () => this.closeModal();
    this.modal = h('div', { class: 'modal-backdrop', onpointerdown: (e: Event) => e.stopPropagation() }, h('div', { class: 'modal' }, ...build(close)));
    this.ui.append(this.modal);
  }

  closeModal(): void {
    this.modal?.remove();
    this.modal = null;
  }

  get modalOpen(): boolean {
    return !!this.modal;
  }

  showOffline(gold: number, seconds: number, countedSeconds: number): void {
    const ads = this.host.ads;
    this.showModal((close) => {
      const done = () => { this.host.sfx('buy'); close(); };
      const adBtn = pressButton({ class: 'btn blue wide' }, () => {
        void ads.watch('offline-double', () => { this.game.claimOffline(gold, 'double'); done(); });
      }, `${ads.icon} Double it! ×2 — watch an ad`);
      setDisabled(adBtn, !ads.available);
      const tripleBtn = pressButton({ class: 'btn gold wide' }, () => {
        if (this.game.claimOffline(gold, 'triple')) done();
        else this.host.sfx('error');
      }, `Triple it! ×3 for ${OFFLINE_TRIPLE_RUBY_COST} `, ruby());
      setDisabled(tripleBtn, this.game.state.rubies < OFFLINE_TRIPLE_RUBY_COST);
      return [
        h('div', { class: 'emoji' }, '🚤'),
        h('h2', null, 'Welcome back!'),
        h('p', null, `Your fishermen kept fishing for ${formatDuration(countedSeconds)}${countedSeconds < seconds ? ` (max ${formatDuration(countedSeconds)})` : ''}.`),
        h('div', { class: 'big' }, coin(), formatNumber(gold)),
        h('div', { class: 'actions' },
          adBtn,
          tripleBtn,
          pressButton({ class: 'btn wide' }, () => { this.game.claimOffline(gold, 'normal'); done(); }, 'Collect'),
        ),
      ];
    });
  }

  /** The boss is almost down but time ran out: offer extra time. */
  showBossContinue(bossName: string, hpLeft: number, onAccept: () => void, onDecline: () => void): void {
    const ads = this.host.ads;
    this.showModal((close) => {
      const accept = () => { close(); onAccept(); };
      const adBtn = pressButton({ class: 'btn blue wide' }, () => { void ads.watch('boss-continue', accept); }, `${ads.icon} +${BOSS_CONTINUE_SECONDS} seconds — watch an ad`);
      setDisabled(adBtn, !ads.available);
      const rubyBtn = pressButton({ class: 'btn gold wide' }, () => {
        if (this.game.spendRubies(BOSS_CONTINUE_RUBIES)) accept();
        else this.host.sfx('error');
      }, `+${BOSS_CONTINUE_SECONDS} seconds for ${BOSS_CONTINUE_RUBIES} `, ruby());
      if (this.game.state.rubies < BOSS_CONTINUE_RUBIES) rubyBtn.style.display = 'none';
      return [
        h('div', { class: 'emoji' }, '⏱️'),
        h('h2', null, 'So close!'),
        h('p', null, `${bossName} has only ${Math.ceil(hpLeft * 100)}% stamina left. Keep fighting?`),
        h('div', { class: 'actions' },
          adBtn,
          rubyBtn,
          pressButton({ class: 'btn ghost wide' }, () => { close(); onDecline(); }, 'Let it escape'),
        ),
      ];
    });
  }

  /** Short "double it" offer after a reward (treasure, goldfish). */
  offerDouble(label: string, placement: 'double-treasure' | 'double-goldfish', reward: () => void): void {
    const ads = this.host.ads;
    if (!ads.available) return;
    this.doubleOffer?.remove();
    const el = pressButton({ class: 'double-offer' }, () => {
      el.remove();
      void ads.watch(placement, () => { reward(); this.host.sfx('buy'); });
    }, `${ads.icon} ${label}`);
    this.doubleOffer = el;
    this.ui.append(el);
    setTimeout(() => el.remove(), DOUBLE_OFFER_SECONDS * 1000);
  }

  showLevelComplete(level: number): void {
    this.showModal((close) => [
      h('div', { class: 'emoji' }, '🏆'),
      h('h2', null, `Level ${level} conquered!`),
      h('p', null, `Both bosses are defeated. Save up and sail to ${themeFor(level + 1).name} from the Research Center.${level >= PRESTIGE_MIN_LEVEL ? ' Or start a New Voyage at the Lighthouse for pearls!' : ''}`),
      h('div', { class: 'actions' }, pressButton({ class: 'btn gold wide' }, () => { close(); }, 'Great!')),
    ]);
  }

  /** One-time starter offer, shown after the first boss. */
  showStarterOffer(onSee: () => void): void {
    this.showModal((close) => [
      h('div', { class: 'emoji' }, '🎁'),
      h('h2', null, 'Captain\'s Starter Pack'),
      h('p', null, 'You beat your first boss! A one-time offer for 48 hours: 250 rubies, the Ocean Blue boat and 2 hours of Double Haul.'),
      h('div', { class: 'actions' },
        pressButton({ class: 'btn gold wide' }, () => { close(); onSee(); }, 'See the offer'),
        pressButton({ class: 'btn ghost wide' }, close, 'Maybe later'),
      ),
    ]);
  }

  confirmVoyage(pearls: number, bonusAfter: number, onConfirm: () => void): void {
    this.showModal((close) => [
      h('div', { class: 'emoji' }, '⛵'),
      h('h2', null, 'Start a New Voyage?'),
      h('p', null, `You go back to level 1 with no gold, fishermen or upgrades. You get ${formatNumber(pearls)} pearls: gold from all fish becomes ×${formatNumber(bonusAfter)} forever.`),
      h('div', { class: 'big' }, '🐚 +', formatNumber(pearls)),
      h('div', { class: 'actions' },
        pressButton({ class: 'btn gold wide' }, () => { close(); onConfirm(); }, 'Set sail!'),
        pressButton({ class: 'btn ghost wide' }, close, 'Not yet'),
      ),
    ]);
  }

  confirmReset(onConfirm: () => void): void {
    this.showModal((close) => [
      h('div', { class: 'emoji' }, '⚠️'),
      h('h2', null, 'Reset progress?'),
      h('p', null, 'All gold, fishermen and atlas entries will be lost.'),
      h('div', { class: 'actions' },
        pressButton({ class: 'btn red wide' }, () => { close(); onConfirm(); }, 'Yes, reset'),
        pressButton({ class: 'btn ghost wide' }, close, 'Cancel'),
      ),
    ]);
  }
}
