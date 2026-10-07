/**
 * Procedural military-march background music (Web Audio, no audio files), in the spirit of the
 * Red Alert 2 soundtrack: a stomping 118 BPM industrial march — kick on the downbeats, a tight
 * marching snare with ghost notes and rolls, a pulsing saw bass, brass-like power-chord stabs and
 * a fanfare lead in A minor. The tune itself is an original composition. It sits under the sound
 * effects so the battle stays readable. A look-ahead scheduler keeps the timing tight.
 */
const BPM = 118;
const STEP = 60 / BPM / 4; // 16th note (s)
const LOOKAHEAD = 0.25;
/** Gain at full slider (volume = 1). */
const MAX_GAIN = 1.6;
const MIDI = (n: number): number => 440 * 2 ** ((n - 69) / 12);

/** Root note (MIDI) per bar of the 4-bar progression: Am – F – G – E (the E major turns back to A minor). */
const ROOTS = [33, 29, 31, 28];
/** Whether the chord is minor (third = 3 semitones) or major (4). */
const MINOR = [true, false, false, false];
/**
 * Fanfare lead per bar: semitones above the bar root + 24 (null = rest, - = hold the last note).
 * Bars of the 4-bar phrase answer each other: a call, a rising answer, a held note, a falling resolve.
 */
const LEAD: readonly (readonly (number | null)[])[] = [
  [12, null, 12, 12, null, 15, null, 12, null, null, 10, null, 12, null, null, null],
  [12, null, 12, 12, null, 17, null, 12, null, null, 15, null, 17, null, 19, null],
  [19, null, null, null, 19, null, 17, null, 15, null, null, null, 14, null, 15, null],
  [16, null, null, 15, null, 14, null, 12, null, null, 11, null, 12, null, null, null],
];

export class MusicSystem {
  private readonly out: GainNode;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private muted = false;
  private volume = 0.7;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    // Gentle low-pass keeps the saws from sounding harsh over long play sessions.
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 5600;
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
    this.muted = muted;
    this.applyGain();
  }

  /** Music volume, 0..1. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyGain();
  }

  private applyGain(): void {
    this.out.gain.setTargetAtTime(this.muted ? 0 : this.volume * MAX_GAIN, this.ctx.currentTime, 0.05);
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
    const third = MINOR[chord] ? 3 : 4;
    const brass = bar >= 4; // 16-bar form: bars 0-3 drums + bass only, then the brass joins
    const build = bar >= 12; // last 4 bars: snare roll builds into the next loop
    const lastBar = bar === 15;

    // Stomp: kick on every beat's downbeat of 1 and 3, a pickup before 3, timpani on the phrase ends.
    if (s === 0 || s === 8) this.kick(t, 1);
    if (s === 6 || (build && s === 14)) this.kick(t, 0.6);
    if (s === 0 && chord === 3) this.timpani(t, MIDI(root));
    if (s === 0 && bar === 0) this.crash(t);

    // Marching snare: backbeat on 2 and 4 with soft ghost notes; a roll in the last bar of the loop.
    if (s === 4 || s === 12) this.snare(t, 1);
    else if (s === 7 || s === 15 || s === 10) this.snare(t, 0.3);
    if (lastBar && s >= 8) this.snare(t, 0.35 + (s - 8) * 0.07);

    // Light closed hi-hat keeps the pulse.
    if (s % 2 === 0) this.hat(t, s % 4 === 0 ? 0.35 : 0.2);

    // Pulsing 8th-note bass: root, with the fifth on the off-beats.
    if (s % 2 === 0) this.bass(t, MIDI(root + (s % 8 === 6 ? 7 : 0)));

    // Brass-style power-chord stabs on the syncopated hits (root, fifth, octave + the chord's third on accents).
    if (brass && (s === 0 || s === 6 || s === 8 || s === 11)) this.stab(t, root + 12, third, s === 0 ? 1 : 0.7);

    // Fanfare lead.
    const note = LEAD[chord]?.[s];
    if (brass && note != null) this.horn(t, MIDI(root + 24 + note), bar >= 8 ? 0.13 : 0.1);
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
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    o.connect(this.env(t, 1.0 * vel, 0.24)).connect(this.out);
    o.start(t);
    o.stop(t + 0.27);
  }

  /** Tight military snare: a short bandpassed noise crack over a snappy tone. */
  private snare(t: number, vel: number): void {
    this.noiseHit(t, 0.6 * vel, 0.13, 'bandpass', 2600);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.07);
    o.connect(this.env(t, 0.3 * vel, 0.09)).connect(this.out);
    o.start(t);
    o.stop(t + 0.12);
  }

  private timpani(t: number, freq: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.1, t + 0.35);
    o.connect(this.env(t, 0.9, 0.7)).connect(this.out);
    o.start(t);
    o.stop(t + 0.75);
  }

  private hat(t: number, vel: number): void {
    this.noiseHit(t, vel * 0.22, 0.04, 'highpass', 7500);
  }

  private crash(t: number): void {
    this.noiseHit(t, 0.28, 1.4, 'highpass', 4500);
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
    f.frequency.setValueAtTime(750, t);
    f.frequency.exponentialRampToValueAtTime(170, t + STEP * 1.8);
    o.connect(f).connect(this.env(t, 0.42, STEP * 1.9)).connect(this.out);
    o.start(t);
    o.stop(t + STEP * 2);
  }

  /** Brass-like chord hit: saws whose filter opens quickly (the "blat"), then decays. */
  private stab(t: number, rootMidi: number, third: number, vel: number): void {
    for (const semis of [0, 7, 12, third + 12]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = MIDI(rootMidi + semis);
      o.detune.value = (semis % 5) * 3 - 6;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
      f.frequency.exponentialRampToValueAtTime(900, t + STEP * 2);
      o.connect(f).connect(this.env(t, 0.085 * vel, STEP * 2.2)).connect(this.out);
      o.start(t);
      o.stop(t + STEP * 2.3);
    }
  }

  /** Fanfare lead: a single brass voice with a quick swell and a little vibrato. */
  private horn(t: number, freq: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = freq * 0.008;
    vib.connect(vibGain).connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0005, t + STEP * 3.2);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    vib.start(t);
    o.stop(t + STEP * 3.3);
    vib.stop(t + STEP * 3.3);
  }
}
