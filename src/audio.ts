/**
 * Sound for Whale Hunter: background music "Island Adventure" (an mp3 that
 * loops seamlessly) and synthesized sound effects. If the music file cannot
 * be loaded, a synthesized Caribbean tune (steel drums, calypso bass, shaker)
 * plays instead.
 */
const MUSIC_URL = `${import.meta.env.BASE_URL}music/island-adventure.mp3`;
const MUSIC_VOLUME = 0.42;
export type Sfx =
  | 'tap' | 'catch' | 'rare' | 'goldfish' | 'buy' | 'click' | 'error'
  | 'boss' | 'win' | 'lose' | 'mini' | 'coin' | 'splash' | 'frenzy';

// --- Music: C major calypso, 112 BPM --------------------------------------------------
const BPM = 112;
const STEP = 60 / BPM / 2; // eighth notes
const NOTE: Record<string, number> = {};
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => {
  for (let o = 2; o <= 6; o++) NOTE[`${n}${o}`] = 440 * Math.pow(2, (i - 9 + (o - 4) * 12) / 12);
});
/** Chord per bar (root, third, fifth) over a 4-bar progression. */
const PROGRESSIONS = [
  [['C3', 'E3', 'G3'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'], ['C3', 'E3', 'G3']],
  [['C3', 'E3', 'G3'], ['A2', 'C3', 'E3'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4']],
];
/** Steel drum melodies: 4 bars × 8 eighths, '-' = rest. */
const MELODIES = [
  ['E5', '-', 'G5', 'E5', '-', 'C5', 'D5', '-', 'F5', '-', 'A5', 'F5', '-', 'C5', 'D5', '-', 'D5', 'G5', '-', 'B4', 'D5', '-', 'G5', 'F5', 'E5', '-', 'C5', '-', 'G4', '-', 'C5', '-'],
  ['G5', 'E5', 'G5', '-', 'A5', 'G5', 'E5', '-', 'F5', '-', 'F5', 'A5', '-', 'F5', 'C5', '-', 'D5', 'B4', 'D5', '-', 'G5', '-', 'F5', 'D5', 'C5', '-', 'E5', '-', 'C5', '-', '-', '-'],
  ['C5', '-', 'C5', 'D5', 'E5', '-', 'G5', '-', 'A5', '-', 'G5', 'F5', 'E5', '-', 'C5', '-', 'B4', '-', 'D5', 'G5', '-', 'F5', 'E5', 'D5', 'C5', 'E5', 'G5', 'E5', 'C5', '-', '-', '-'],
  ['-', '-', 'E5', 'G5', 'A5', 'G5', '-', 'E5', '-', '-', 'F5', 'A5', 'C6', 'A5', '-', 'F5', '-', '-', 'D5', 'G5', 'B5', 'G5', '-', 'D5', 'E5', '-', 'C5', '-', 'G4', 'A4', 'C5', '-'],
];
/** Calypso bass: root on 1, fifth on the "and" of 2, root on 3, octave pickup. Indexes into the chord + octave flag. */
const BASS = [[0, 0], null, null, [2, 0], [0, 0], null, [0, 1], [2, 0]] as const;

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  enabled = true;
  private musicOn = false;
  private musicWanted = true;
  private nextStep = 0;
  private step = 0;
  private melody = 0;
  private progression = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private trackSource: AudioBufferSourceNode | null = null;
  private trackLoad: Promise<AudioBuffer | null> | null = null;

  /** Must be called from a user gesture before sounds can play. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.musicWanted) this.startMusic();
  }

  // --- Music ---------------------------------------------------------------------------

  setMusic(on: boolean): void {
    this.musicWanted = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** Pause/resume when the app goes to the background. */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private loadTrack(): Promise<AudioBuffer | null> {
    if (!this.trackLoad) {
      const ctx = this.ctx!;
      this.trackLoad = fetch(MUSIC_URL)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
    }
    return this.trackLoad;
  }

  private startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    void this.loadTrack().then((buf) => {
      if (!this.musicOn || this.trackSource || this.timer) return;
      this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, ctx.currentTime);
      if (buf) {
        // the song, looping seamlessly
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(this.musicBus);
        src.start();
        this.trackSource = src;
        this.musicBus.gain.setTargetAtTime(MUSIC_VOLUME, ctx.currentTime, 0.6);
      } else {
        // fallback: synthesized tune with a look-ahead scheduler
        this.nextStep = ctx.currentTime + 0.1;
        this.musicBus.gain.setTargetAtTime(0.34, ctx.currentTime, 0.8);
        this.timer = setInterval(() => this.schedule(), 25);
      }
    });
  }

  private stopMusic(): void {
    if (!this.ctx || !this.musicOn) return;
    this.musicOn = false;
    const ctx = this.ctx;
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const src = this.trackSource;
    this.trackSource = null;
    if (src) setTimeout(() => src.stop(), 1200);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextStep < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextStep);
      this.nextStep += STEP;
      this.step++;
      if (this.step % 32 === 0) {
        // new 4-bar phrase: pick another melody (and sometimes another progression)
        this.melody = (this.melody + 1 + Math.floor(Math.random() * (MELODIES.length - 1))) % MELODIES.length;
        if (Math.random() < 0.35) this.progression = (this.progression + 1) % PROGRESSIONS.length;
      }
    }
  }

  private playStep(step: number, t: number): void {
    const i = step % 32;
    const bar = Math.floor(i / 8);
    const beat = i % 8;
    const chord = PROGRESSIONS[this.progression][bar];
    // swing: off-beat eighths a little late
    const swing = beat % 2 === 1 ? STEP * 0.12 : 0;
    const tt = t + swing;

    // bass
    const b = BASS[beat];
    if (b) this.pluckBass(NOTE[chord[b[0]]] * (b[1] ? 2 : 1) / 2, tt);
    // off-beat strum (the calypso "chk")
    if (beat % 2 === 1) for (const n of chord) this.strum(NOTE[n] * 2, tt);
    // shaker on every eighth, accented on the off-beat
    this.shaker(tt, beat % 2 === 1 ? 0.07 : 0.035);
    // kick-ish thump on 1 and 3
    if (beat === 0 || beat === 4) this.thump(tt);
    // steel drum melody (every other phrase a bit sparser so it breathes)
    const note = MELODIES[this.melody][i];
    if (note !== '-' && !(Math.floor(step / 32) % 4 === 3 && beat % 4 !== 0)) this.steelDrum(NOTE[note], tt, 0.16, this.musicBus);
  }

  // --- Instruments ----------------------------------------------------------------------

  /** Steel pan: bright partials, fast attack, singing decay, tiny pitch drop. */
  private steelDrum(freq: number, t: number, vol: number, out: AudioNode, decay = 0.7): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(out);
    const partials: [number, number][] = [[1, 1], [2.01, 0.45], [3.98, 0.18], [5.2, 0.06]];
    for (const [mul, amp] of partials) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * mul * 1.01, t);
      o.frequency.exponentialRampToValueAtTime(freq * mul, t + 0.05);
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  private pluckBass(freq: number, t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.35);
  }

  private strum(freq: number, t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.1);
  }

  private shaker(t: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random() * 0.5, 0.06);
  }

  private thump(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.16);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, vol: number, freq: number, when = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.4, dur + 0.05);
  }

  private pan(notes: string[], step: number, vol: number): void {
    const t = this.ctx!.currentTime;
    notes.forEach((n, i) => this.steelDrum(NOTE[n], t + i * step, vol, this.sfxBus, 0.9));
  }

  // --- Sound effects ----------------------------------------------------------------------

  play(name: Sfx): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const r = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'tap': // watery plip
        this.tone(950 * r, 0.07, 'sine', 0.09, 0, 320 * r);
        this.noiseBurst(0.04, 0.03, 2500);
        return;
      case 'splash':
        this.noiseBurst(0.35, 0.18, 1400);
        this.tone(500, 0.12, 'sine', 0.05, 0.02, 180);
        return;
      case 'click': // wood block
        this.tone(820, 0.05, 'sine', 0.12, 0, 600);
        return;
      case 'coin':
        this.tone(1320, 0.12, 'square', 0.035);
        this.tone(1760, 0.22, 'square', 0.035, 0.06);
        return;
      case 'catch':
        this.noiseBurst(0.25, 0.12, 1600);
        this.pan(['C5', 'E5', 'G5'], 0.07, 0.16);
        this.tone(1760, 0.18, 'square', 0.025, 0.22);
        return;
      case 'rare':
        this.noiseBurst(0.3, 0.14, 1600);
        this.pan(['C5', 'E5', 'G5', 'C6', 'E6'], 0.07, 0.17);
        this.tone(2093, 0.4, 'sine', 0.05, 0.36);
        return;
      case 'goldfish':
        this.pan(['G5', 'B5', 'D6', 'G6', 'B6'], 0.045, 0.14);
        this.tone(2637, 0.3, 'sine', 0.04, 0.25);
        return;
      case 'buy': // ka-ching
        this.noiseBurst(0.05, 0.12, 4000, 0, 'highpass');
        this.tone(1568, 0.1, 'square', 0.04, 0.04);
        this.tone(2093, 0.35, 'sine', 0.08, 0.09);
        return;
      case 'error':
        this.tone(220, 0.12, 'triangle', 0.14);
        this.tone(175, 0.18, 'triangle', 0.14, 0.1);
        return;
      case 'mini':
        this.steelDrum(NOTE.G5, this.ctx.currentTime, 0.2, this.sfxBus, 0.5);
        this.steelDrum(NOTE.C6, this.ctx.currentTime + 0.05, 0.16, this.sfxBus, 0.5);
        return;
      case 'boss': // conch-shell horn + drum
        this.tone(196, 0.5, 'sawtooth', 0.06, 0, 185);
        this.tone(262, 0.7, 'sawtooth', 0.06, 0.4, 247);
        this.noiseBurst(0.3, 0.2, 300, 0, 'lowpass');
        return;
      case 'win':
        this.pan(['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6'], 0.09, 0.18);
        return;
      case 'frenzy':
        this.pan(['C5', 'D5', 'E5', 'G5', 'A5', 'C6'], 0.05, 0.15);
        this.noiseBurst(0.4, 0.1, 3000);
        return;
      case 'lose': // wah-wah
        this.tone(392, 0.3, 'sawtooth', 0.05, 0, 370);
        this.tone(349, 0.3, 'sawtooth', 0.05, 0.3, 330);
        this.tone(311, 0.6, 'sawtooth', 0.05, 0.6, 262);
        return;
    }
  }
}

export function vibrate(ms: number, enabled: boolean): void {
  if (enabled && 'vibrate' in navigator) navigator.vibrate(ms);
}
