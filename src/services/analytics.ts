/**
 * Playtest analytics: where do players get to, how long does it take, and
 * where do they stop?
 *
 * Every event goes to a provider. Today the local provider keeps counts and
 * "first time" milestones in the browser (shown under Settings → Playtest
 * stats, so a tester can send a screenshot). In the Play Store build a
 * provider for e.g. Firebase Analytics receives the same events.
 */
export interface AnalyticsProvider {
  log(event: string, params: Record<string, string | number>): void;
}

export interface Milestone {
  event: string;
  /** Minutes of play when it first happened. */
  minute: number;
  session: number;
}

interface Store {
  counts: Record<string, number>;
  milestones: Milestone[];
  sessions: number;
  sessionMinutes: number[];
}

const KEY = 'whale-hunter-analytics';

export class LocalAnalytics implements AnalyticsProvider {
  data: Store;

  constructor() {
    let data: Store | null = null;
    try {
      data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      data = null;
    }
    this.data = data ?? { counts: {}, milestones: [], sessions: 0, sessionMinutes: [] };
  }

  log(event: string, params: Record<string, string | number>): void {
    const key = params.label ? `${event}:${params.label}` : event;
    this.data.counts[key] = (this.data.counts[key] ?? 0) + 1;
    if (params.milestone && !this.data.milestones.some((m) => m.event === key)) {
      this.data.milestones.push({ event: key, minute: Number(params.minute ?? 0), session: this.data.sessions });
    }
    this.save();
  }

  startSession(): void {
    this.data.sessions++;
    this.data.sessionMinutes.push(0);
    this.save();
  }

  /** Called regularly with the minutes played in this session. */
  updateSession(minutes: number): void {
    this.data.sessionMinutes[this.data.sessionMinutes.length - 1] = Math.round(minutes * 10) / 10;
    this.save();
  }

  reset(): void {
    this.data = { counts: {}, milestones: [], sessions: 1, sessionMinutes: [0] };
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable */
    }
  }
}

export class Analytics {
  constructor(private provider: AnalyticsProvider, private playMinutes: () => number) {}

  /** Count an event. */
  track(event: string, label?: string | number): void {
    this.provider.log(event, { ...(label !== undefined ? { label: String(label) } : {}), minute: this.minute() });
  }

  /** Count an event and remember when it happened the first time (funnel step). */
  milestone(event: string, label?: string | number): void {
    this.provider.log(event, { ...(label !== undefined ? { label: String(label) } : {}), minute: this.minute(), milestone: 1 });
  }

  private minute(): number {
    return Math.round(this.playMinutes() * 10) / 10;
  }
}
