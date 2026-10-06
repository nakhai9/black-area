/**
 * Procedural background music (Web Audio, no audio files): a steady, moderate 120 BPM march —
 * soft kick and snare, light hi-hats, a pulsing saw bass, sparse power-chord stabs and a
 * pentatonic lead — over an Am – F – C – G progression. It sits quietly under the sound effects
 * so the battle stays readable. A look-ahead scheduler keeps the timing tight.
 */
const BPM = 120;
const STEP = 60 / BPM / 4; // 16th note (s)
const LOOKAHEAD = 0.25;
const VOLUME = 0.2;
const MIDI = (n: number): number => 440 * 2 ** ((n - 69) / 12);

/** Root note (MIDI) per bar of the 4-bar progression: A, F, C, G. */
const ROOTS = [33, 29, 36, 31];
/** Lead phrase per bar, as semitone offsets above the bar root + 24 (null = rest); minor-pentatonic flavour. */
const LEAD: readonly (readonly (number | null)[])[] = [
  [12, null, null, null, 15, null, null, 12, 10, null, null, null, 7, null, null, null],
  [12, null, null, 15, 17, null, null, null, 15, null, null, 12, null, null, 10, null],
  [19, null, null, null, 17, null, null, 15, 12, null, null, null, 15, null, 17, null],
  [12, null, null, 10, 12, null, null, null, 7, null, null, 10, 12, null, null, null],
];

export class MusicSystem {
  private readonly out: GainNode;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = VOLUME;
    // Gentle low-pass keeps the saws from sounding harsh over long play sessions.
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 5200;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    this.out.connect(soften).connect(comp).connect(destination);
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  setMuted(muted: boolean): void {
    this.out.gain.setTargetAtTime(muted ? 0 : VOLUME, this.ctx.currentTime, 0.05);
  }

  private schedule(): void {
    // Tab was in the background and time ran away: resync instead of bursting.
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.bar, this.nextTime);
      this.nextTime += STEP;
      if (++this.step === 16) {
        this.step = 0;
        this.bar = (this.bar + 1) % 16;
      }
    }
  }

  private playStep(s: number, bar: number, t: number): void {
    const chord = bar % 4;
    const root = ROOTS[chord] ?? 33;
    // The first 4 bars of every 16 are drums + bass only; the lead joins afterwards, so the loop keeps changing.
    const lead = bar >= 4;
    const busy = bar >= 8;

    if (s === 0 || s === 8 || (busy && s === 10)) this.kick(t, s === 10 ? 0.6 : 1);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.5 : 0.25);
    if (s === 0 && chord === 0) this.crash(t);

    // Pulsing 8th-note bass on the chord root, an octave up on the off-beat.
    if (s % 2 === 0) this.bass(t, MIDI(root + (s % 8 === 6 ? 12 : 0)));

    if (s === 0 || (busy && s === 10)) this.stab(t, root + 12);

    const note = LEAD[chord]?.[s];
    if (lead && note != null) this.lead(t, MIDI(root + 24 + note), busy ? 0.12 : 0.09);
  }

  // ------------------------------------------------------------------ voices

  private env(t: number, peak: number, secs: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + secs);
    return g;
  }

  private kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(this.env(t, 0.9 * vel, 0.22)).connect(this.out);
    o.start(t);
    o.stop(t + 0.25);
  }

  private snare(t: number): void {
    this.noiseHit(t, 0.5, 0.16, 'highpass', 1400);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    o.connect(this.env(t, 0.35, 0.12)).connect(this.out);
    o.start(t);
    o.stop(t + 0.15);
  }

  private hat(t: number, vel: number): void {
    this.noiseHit(t, vel * 0.25, 0.045, 'highpass', 7000);
  }

  private crash(t: number): void {
    this.noiseHit(t, 0.3, 1.2, 'highpass', 4500);
  }

  private noiseHit(t: number, gain: number, secs: number, type: BiquadFilterType, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(this.env(t, gain, secs)).connect(this.out);
    src.start(t, Math.random() * 0.8);
    src.stop(t + secs + 0.02);
  }

  private bass(t: number, freq: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(160, t + STEP * 1.8);
    o.connect(f).connect(this.env(t, 0.4, STEP * 1.9)).connect(this.out);
    o.start(t);
    o.stop(t + STEP * 2);
  }

  private stab(t: number, rootMidi: number): void {
    for (const semis of [0, 7, 12]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = MIDI(rootMidi + semis);
      o.detune.value = (semis - 6) * 3;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      o.connect(f).connect(this.env(t, 0.1, STEP * 2)).connect(this.out);
      o.start(t);
      o.stop(t + STEP * 2.1);
    }
  }

  private lead(t: number, freq: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(this.env(t, vel, STEP * 3)).connect(this.out);
    o.start(t);
    o.stop(t + STEP * 3.1);
  }
}
