import { MusicSystem } from './MusicSystem';
import type { FactionId, WeaponKind, WorldPoint } from '../types';

/** What the player can currently see/hear: the camera centre and a distance (world px) beyond which sounds fade out. */
export interface Listener {
  centre: WorldPoint;
  range: number;
}

/** Moving units the camera can hear, by how they move (0 = none, 1 = a crowd): footsteps, tracks, aircraft engines. */
export interface MotionLevels {
  foot: number;
  tracks: number;
  jet: number;
}

/** Battle cry per nation, spoken in that nation's own language. */
const BATTLE_CRY: Readonly<Record<FactionId, { lang: string; lines: readonly string[] }>> = {
  usa: { lang: 'en-US', lines: ['Charge!', "Let's go!", 'Move out!'] },
  russia: { lang: 'ru-RU', lines: ['Ура!', 'В атаку!', 'Вперёд!'] },
  china: { lang: 'zh-CN', lines: ['冲啊！', '杀！', '前进！'] },
  europe: { lang: 'fr-FR', lines: ["À l'attaque !", 'En avant !', 'Allons-y !'] },
  islamic: { lang: 'ar-SA', lines: ['الله أكبر!', 'إلى الأمام!', 'هجوم!'] },
};
const CRY_COOLDOWN = 7;
const MIN_GAP: Readonly<Record<string, number>> = { rifle: 0.05, smg: 0.045, sniper: 0.1, mg: 0.05, cannon: 0.12, autocannon: 0.06, missile: 0.15, explosion: 0.1, board: 0.12 };

/**
 * Optional recordings: drop real sounds into public/sounds/ under these names (mp3, ogg or wav) and they replace the
 * synthesised ones. Anything missing keeps the synthesised sound.
 */
const SAMPLE_KINDS: readonly string[] = ['rifle', 'smg', 'mg', 'autocannon', 'sniper', 'cannon', 'bomb', 'missile', 'explosion', 'board', 'foot', 'tracks', 'jet'];
const SAMPLE_EXTS = ['mp3', 'ogg', 'wav'] as const;
/** Seconds between the footstep sounds of a marching group. */
const STEP_GAP = 0.32;

const MUSIC_VOLUME_KEY = 'black-area.musicVolume';

function loadMusicVolume(): number {
  try {
    const v = Number(localStorage.getItem(MUSIC_VOLUME_KEY));
    if (localStorage.getItem(MUSIC_VOLUME_KEY) !== null && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  } catch {
    /* storage unavailable */
  }
  return 0.7;
}

/** `board`: the hatch clunk of a unit climbing into / jumping out of a transport. */
type Kind = WeaponKind | 'explosion' | 'board';

/**
 * Sound effects and background music (Web Audio): gunfire per weapon type, cannon booms, jet missiles,
 * explosions and the sounds of moving units, attenuated by distance from the camera. Synthesised by default;
 * real recordings dropped into public/sounds/ (see SAMPLE_KINDS) are used instead. Battle cries use the
 * browser's speech synthesis in each nation's language. Everything is rate-limited so large battles stay clear.
 */
export class SoundSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private music: MusicSystem | null = null;
  private musicVolume = loadMusicVolume();
  private readonly lastPlayed = new Map<string, number>();
  private readonly lastCry = new Map<FactionId, number>();
  private active = 0;
  private voices: SpeechSynthesisVoice[] = [];
  /** Decoded recordings from public/sounds/ (see SAMPLE_KINDS). */
  private readonly samples = new Map<string, AudioBuffer>();
  /** Looping engine beds (tracks, jets): their gain follows the motion levels. */
  private readonly beds = new Map<'tracks' | 'jet', GainNode>();
  private nextStep = 0;

  /** `listener` defaults to "hear everything" (menus); the game sets the camera with setListener. */
  constructor(private listener: () => Listener = () => ({ centre: { x: 0, y: 0 }, range: Infinity })) {
    if (typeof speechSynthesis !== 'undefined') {
      const load = (): void => {
        this.voices = speechSynthesis.getVoices();
      };
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
  }

  setListener(listener: () => Listener): void {
    this.listener = listener;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Browsers only allow audio after a user gesture: call this from input events. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.music = new MusicSystem(this.ctx, this.master, this.noise);
      this.music.setVolume(this.musicVolume);
      this.music.setMuted(this.muted);
      this.music.start();
      void this.loadSamples();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get musicLevel(): number {
    return this.musicVolume;
  }

  /** Background music volume, 0..1 (remembered across sessions). */
  setMusicVolume(volume: number): void {
    this.musicVolume = Math.min(1, Math.max(0, volume));
    this.music?.setVolume(this.musicVolume);
    try {
      localStorage.setItem(MUSIC_VOLUME_KEY, String(this.musicVolume));
    } catch {
      /* storage unavailable */
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.music?.setMuted(this.muted);
    if (this.muted && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    return this.muted;
  }

  /** Plays a weapon / explosion sound at a world position. */
  play(kind: Kind, at: WorldPoint): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.muted || ctx.state !== 'running') return;
    const l = this.listener();
    const dist = Math.hypot(at.x - l.centre.x, at.y - l.centre.y);
    const vol = Math.max(0, 1 - dist / (l.range * 1.4));
    if (vol < 0.04 || this.active > 14) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(kind) ?? -1;
    if (now - last < (MIN_GAP[kind] ?? 0.05)) return;
    this.lastPlayed.set(kind, now);

    if (this.sample(kind, vol)) return;
    const jitter = 0.9 + Math.random() * 0.2;
    switch (kind) {
      // A gunshot: the supersonic crack, the body of the muzzle blast, then its echo rolling off the terrain.
      case 'rifle':
        this.burst(vol * 0.9, 0.018, 'highpass', 3200 * jitter, 0.7);
        this.burst(vol * 0.6, 0.09, 'bandpass', 650 * jitter, 0.9);
        this.thump(vol * 0.45, 120 * jitter, 0.08);
        this.burst(vol * 0.12, 0.45, 'lowpass', 900 * jitter, 0.5, 0.03);
        break;
      case 'smg':
        this.burst(vol * 0.6, 0.012, 'highpass', 3500 * jitter, 0.7);
        this.burst(vol * 0.45, 0.06, 'bandpass', 800 * jitter, 1.0);
        this.burst(vol * 0.07, 0.25, 'lowpass', 1100 * jitter, 0.5, 0.02);
        break;
      case 'mg':
        this.burst(vol * 0.7, 0.015, 'highpass', 3000 * jitter, 0.7);
        this.burst(vol * 0.55, 0.08, 'bandpass', 550 * jitter, 1.0);
        this.thump(vol * 0.35, 100 * jitter, 0.07);
        this.burst(vol * 0.1, 0.35, 'lowpass', 800 * jitter, 0.5, 0.03);
        break;
      case 'autocannon':
        this.burst(vol * 0.7, 0.02, 'highpass', 2400 * jitter, 0.7);
        this.burst(vol * 0.6, 0.12, 'bandpass', 420 * jitter, 0.9);
        this.thump(vol * 0.6, 80, 0.14);
        this.burst(vol * 0.15, 0.6, 'lowpass', 600 * jitter, 0.5, 0.04);
        break;
      case 'sniper':
        this.burst(vol * 1.0, 0.025, 'highpass', 2800 * jitter, 0.7);
        this.burst(vol * 0.7, 0.14, 'bandpass', 500 * jitter, 0.8);
        this.thump(vol * 0.6, 85, 0.18);
        this.burst(vol * 0.2, 1.1, 'lowpass', 700 * jitter, 0.5, 0.05);
        break;
      case 'cannon':
        this.burst(vol * 0.9, 0.04, 'highpass', 1800 * jitter, 0.6);
        this.burst(vol * 0.85, 0.5, 'lowpass', 520 * jitter, 0.7);
        this.thump(vol * 1.0, 48, 0.45);
        this.burst(vol * 0.25, 1.4, 'lowpass', 300 * jitter, 0.5, 0.08);
        break;
      case 'bomb':
        this.burst(vol * 0.95, 1.0, 'lowpass', 380 * jitter, 0.6);
        break;
      case 'missile':
        this.sweep(vol * 0.55, 0.7);
        break;
      case 'board':
        this.thump(vol * 0.35, 170 * jitter, 0.09);
        this.burst(vol * 0.12, 0.05, 'bandpass', 900 * jitter, 1.0);
        break;
      case 'explosion':
        this.burst(vol * 0.95, 1.0, 'lowpass', 380 * jitter, 0.6);
        this.thump(vol * 1.0, 45, 0.7);
        this.burst(vol * 0.3, 1.8, 'lowpass', 220 * jitter, 0.5, 0.1);
        break;
    }
  }

  /**
   * Sounds of units on the move near the camera (call every frame): marching footsteps, the engine and track
   * clatter of ground vehicles, the roar of aircraft. Silent when nothing moves.
   */
  motion(levels: MotionLevels): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || ctx.state !== 'running') return;
    const on = this.muted ? 0 : 1;
    this.bed('tracks', Math.min(1, levels.tracks) * 0.22 * on);
    this.bed('jet', Math.min(1, levels.jet) * 0.16 * on);
    const now = ctx.currentTime;
    if (on && levels.foot > 0 && now >= this.nextStep) {
      this.nextStep = now + STEP_GAP * (0.85 + Math.random() * 0.3);
      const vol = Math.min(1, 0.4 + levels.foot) * 0.22;
      if (!this.sample('foot', vol)) {
        // Boots on dirt: a soft low knock and a short gritty scuff.
        this.thump(vol * 0.8, 95 + Math.random() * 25, 0.06);
        this.burst(vol * 0.5, 0.05, 'bandpass', 1400 + Math.random() * 600, 1.2);
      }
    }
  }

  /** The nation shouts its battle cry in its own language (rate-limited per nation). */
  battleCry(faction: FactionId, at: WorldPoint): void {
    if (this.muted || typeof speechSynthesis === 'undefined' || !this.ctx) return;
    const now = performance.now() / 1000;
    if (now - (this.lastCry.get(faction) ?? -99) < CRY_COOLDOWN || speechSynthesis.speaking) return;
    const l = this.listener();
    if (Math.hypot(at.x - l.centre.x, at.y - l.centre.y) > l.range * 1.2) return;
    this.lastCry.set(faction, now);
    const cry = BATTLE_CRY[faction];
    const u = new SpeechSynthesisUtterance(cry.lines[Math.floor(Math.random() * cry.lines.length)] ?? cry.lines[0]);
    u.lang = cry.lang;
    const prefix = cry.lang.slice(0, 2).toLowerCase();
    const voice = this.voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (voice) u.voice = voice;
    u.rate = 1.1;
    u.pitch = faction === 'china' ? 1.05 : 0.9;
    u.volume = 0.85;
    speechSynthesis.speak(u);
  }

  // ------------------------------------------------------------------ recordings

  /** Plays the recording for `kind` if one was loaded; false when there is none. */
  private sample(kind: string, vol: number): boolean {
    const ctx = this.ctx;
    const buf = this.samples.get(kind);
    if (!ctx || !this.master || !buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
    this.active++;
    src.onended = () => {
      this.active--;
    };
    return true;
  }

  /** Loads whatever recordings exist in public/sounds/ (missing ones are simply skipped). */
  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      SAMPLE_KINDS.map(async (kind) => {
        for (const ext of SAMPLE_EXTS) {
          try {
            const res = await fetch(`${import.meta.env.BASE_URL}sounds/${kind}.${ext}`);
            if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) continue;
            this.samples.set(kind, await ctx.decodeAudioData(await res.arrayBuffer()));
            return;
          } catch {
            /* not there or not audio: try the next format */
          }
        }
      }),
    );
  }

  // ------------------------------------------------------------------ synthesis

  /** A looping engine sound whose volume eases towards `gain` (a recording if one was dropped in, else synthesised). */
  private bed(kind: 'tracks' | 'jet', gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    let g = this.beds.get(kind);
    if (!g) {
      if (gain <= 0) return;
      g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      const rec = this.samples.get(kind);
      const src = ctx.createBufferSource();
      src.buffer = rec ?? this.noise;
      src.loop = true;
      if (rec) src.connect(g);
      else if (kind === 'tracks') {
        // Diesel rumble (low and throbbing) under the squeal and clank of the tracks.
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 140;
        const throb = ctx.createGain();
        throb.gain.value = 0.6;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 11;
        const depth = ctx.createGain();
        depth.gain.value = 0.45;
        lfo.connect(depth).connect(throb.gain);
        lfo.start();
        src.connect(low).connect(throb).connect(g);
        const clank = ctx.createBiquadFilter();
        clank.type = 'bandpass';
        clank.frequency.value = 2200;
        clank.Q.value = 3;
        const clankGain = ctx.createGain();
        clankGain.gain.value = 0.18;
        src.connect(clank).connect(clankGain).connect(g);
      } else {
        // Turbine: a broad roar with a high whine on top.
        const roar = ctx.createBiquadFilter();
        roar.type = 'lowpass';
        roar.frequency.value = 900;
        src.connect(roar).connect(g);
        const whine = ctx.createBiquadFilter();
        whine.type = 'bandpass';
        whine.frequency.value = 3800;
        whine.Q.value = 6;
        const whineGain = ctx.createGain();
        whineGain.gain.value = 0.25;
        src.connect(whine).connect(whineGain).connect(g);
      }
      src.start();
      this.beds.set(kind, g);
    }
    g.gain.setTargetAtTime(gain, ctx.currentTime, 0.25);
  }

  /** Filtered noise hit; `delay` (s) starts it a moment later (echo tails). */
  private burst(gain: number, secs: number, type: BiquadFilterType, freq: number, q: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + secs);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + secs + 0.02);
    this.active++;
    src.onended = () => {
      this.active--;
    };
  }

  private thump(gain: number, freq: number, secs: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const g = ctx.createGain();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freq * 1.8, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + secs);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + secs);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + secs + 0.02);
  }

  /** Rocket / jet: filtered noise sweeping upwards. */
  private sweep(gain: number, secs: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const t = ctx.currentTime;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(3500, t + secs);
    filter.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0005, t + secs);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + secs + 0.02);
  }
}
