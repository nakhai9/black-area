import { MusicSystem } from './MusicSystem';
import type { FactionId, WeaponKind, WorldPoint } from '../types';

/** What the player can currently see/hear: the camera centre and a distance (world px) beyond which sounds fade out. */
export interface Listener {
  centre: WorldPoint;
  range: number;
}

/** Battle cry per nation, spoken in that nation's own language. */
const BATTLE_CRY: Readonly<Record<FactionId, { lang: string; lines: readonly string[] }>> = {
  usa: { lang: 'en-US', lines: ['Charge!', "Let's go!", 'Move out!'] },
  russia: { lang: 'ru-RU', lines: ['Ура!', 'В атаку!', 'Вперёд!'] },
  china: { lang: 'zh-CN', lines: ['冲啊！', '杀！', '前进！'] },
  europe: { lang: 'fr-FR', lines: ["À l'attaque !", 'En avant !', 'Allons-y !'] },
};
const CRY_COOLDOWN = 7;
const MIN_GAP: Readonly<Record<string, number>> = { rifle: 0.05, smg: 0.045, sniper: 0.1, mg: 0.05, cannon: 0.12, autocannon: 0.06, missile: 0.15, explosion: 0.1, board: 0.12 };

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
 * Procedural sound effects and background music (Web Audio — no audio files): gunfire per weapon
 * type, cannon booms, jet missiles and explosions, attenuated by distance
 * from the camera. Battle cries use the browser's speech synthesis in each
 * nation's language. Everything is rate-limited so large battles stay clear.
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

  constructor(private readonly listener: () => Listener) {
    if (typeof speechSynthesis !== 'undefined') {
      const load = (): void => {
        this.voices = speechSynthesis.getVoices();
      };
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
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

    const jitter = 0.9 + Math.random() * 0.2;
    switch (kind) {
      case 'rifle':
        this.burst(vol * 0.55, 0.13, 'highpass', 1100 * jitter, 0.9);
        this.thump(vol * 0.3, 140 * jitter, 0.07);
        break;
      case 'smg':
        this.burst(vol * 0.4, 0.06, 'highpass', 1500 * jitter, 0.8);
        break;
      case 'mg':
        this.burst(vol * 0.38, 0.07, 'bandpass', 1300 * jitter, 1.2);
        break;
      case 'autocannon':
        this.burst(vol * 0.5, 0.11, 'bandpass', 700 * jitter, 1.0);
        this.thump(vol * 0.4, 110, 0.09);
        break;
      case 'sniper':
        this.burst(vol * 0.7, 0.3, 'highpass', 900 * jitter, 0.7);
        this.thump(vol * 0.5, 90, 0.2);
        break;
      case 'cannon':
        this.burst(vol * 0.8, 0.55, 'lowpass', 600 * jitter, 0.7);
        this.thump(vol * 0.9, 55, 0.4);
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
        break;
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

  // ------------------------------------------------------------------ synthesis

  private burst(gain: number, secs: number, type: BiquadFilterType, freq: number, q: number): void {
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
    const t = ctx.currentTime;
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
