import { describe, expect, it } from 'vitest';
import { Analytics, type AnalyticsProvider } from '../src/services/analytics';

describe('analytics', () => {
  it('records milestones once with their play minute', () => {
    const logged: { event: string; params: Record<string, string | number> }[] = [];
    const provider: AnalyticsProvider = { log: (event, params) => logged.push({ event, params }) };
    let minutes = 1.25;
    const a = new Analytics(provider, () => minutes);
    a.milestone('first_catch');
    minutes = 4;
    a.track('boss_start', 'L1');
    expect(logged[0]).toEqual({ event: 'first_catch', params: { minute: 1.3, milestone: 1 } });
    expect(logged[1]).toEqual({ event: 'boss_start', params: { label: 'L1', minute: 4 } });
  });
});
