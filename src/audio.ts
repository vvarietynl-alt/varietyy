/** Tiny synthesized sound effects (no audio files needed for the prototype). */
export type Sfx = 'tap' | 'catch' | 'rare' | 'goldfish' | 'buy' | 'click' | 'error' | 'boss' | 'win' | 'lose' | 'mini';

export class Audio {
  private ctx: AudioContext | null = null;
  enabled = true;

  /** Must be called from a user gesture before sounds can play. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  play(name: Sfx): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'tap': return this.tone(520 + Math.random() * 80, 0.04, 'triangle', 0.06);
      case 'click': return this.tone(700, 0.05, 'sine', 0.08);
      case 'catch': return this.seq([523, 659, 784], 0.07, 'triangle', 0.12);
      case 'rare': return this.seq([523, 659, 784, 1047, 1319], 0.07, 'triangle', 0.14);
      case 'goldfish': return this.seq([988, 1319, 1568, 1976], 0.05, 'sine', 0.12);
      case 'buy': return this.seq([880, 1175], 0.06, 'square', 0.05);
      case 'error': return this.tone(150, 0.15, 'sawtooth', 0.06);
      case 'mini': return this.seq([660, 990], 0.05, 'square', 0.07);
      case 'boss': return this.seq([196, 196, 262], 0.18, 'sawtooth', 0.08);
      case 'win': return this.seq([523, 659, 784, 1047, 784, 1047], 0.1, 'triangle', 0.14);
      case 'lose': return this.seq([392, 330, 262], 0.16, 'triangle', 0.1);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private seq(freqs: number[], step: number, type: OscillatorType, vol: number): void {
    freqs.forEach((f, i) => this.tone(f, step * 1.6, type, vol, i * step));
  }
}

export function vibrate(ms: number, enabled: boolean): void {
  if (enabled && 'vibrate' in navigator) navigator.vibrate(ms);
}
