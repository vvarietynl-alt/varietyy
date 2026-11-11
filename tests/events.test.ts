import { describe, expect, it } from 'vitest';
import { SEA_EVENT_FIRST, SEA_EVENTS } from '../src/data/balance';
import { ALL_SPECIES } from '../src/data/fish';
import { FishingWorld } from '../src/game/fishing';
import { Game } from '../src/game/game';
import { newGame } from '../src/game/state';

describe('sea events', () => {
  it('a fish frenzy starts after a while, doubles gold and ends', () => {
    const g = new Game(newGame(), () => 0.9);
    const w = new FishingWorld(g, () => 0.9);
    const seen: string[] = [];
    w.on((e) => { if (e.type === 'sea-event-start' || e.type === 'sea-event-end') seen.push(e.type); });
    for (let t = 0; t < SEA_EVENT_FIRST + 1; t += 0.5) w.update(0.5);
    expect(w.seaEvent?.kind).toBe('school'); // zone 1 always gets a school
    expect(g.eventGoldMult).toBe(2);
    const sp = g.pickSpecies('common');
    g.recordCatch(sp, 1);
    expect(g.state.gold).toBe(100);
    for (let t = 0; t < SEA_EVENTS.school.seconds + 1; t += 0.5) w.update(0.5);
    expect(w.seaEvent).toBeNull();
    expect(g.eventGoldMult).toBe(1);
    expect(seen).toEqual(['sea-event-start', 'sea-event-end']);
  });
});

describe('atlas sets', () => {
  it('pays rubies and a permanent bonus for a completed group', () => {
    const g = new Game(newGame());
    const rubies = g.state.rubies;
    expect(g.claimAtlasSet(1, 'common')).toBe(false);
    for (const sp of ALL_SPECIES.filter((s) => s.level === 1 && s.rarity === 'common')) g.state.atlas[sp.id] = 1;
    expect(g.claimableAtlasSets()).toBe(1);
    expect(g.claimAtlasSet(1, 'common')).toBe(true);
    expect(g.claimAtlasSet(1, 'common')).toBe(false);
    expect(g.state.rubies).toBe(rubies + 5);
    expect(g.atlasBonus).toBeCloseTo(1.02, 6);
    expect(g.incomeMult).toBeCloseTo(1.02, 6);
  });
});
