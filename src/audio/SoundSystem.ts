import { MusicSystem } from './MusicSystem';
import type { FactionId, VehicleKind, WeaponKind, WorldPoint } from '../types';

/** What the player can currently see/hear: the camera centre and a distance (world px) beyond which sounds fade out. */
export interface Listener {
  centre: WorldPoint;
  range: number;
}

/**
 * Moving units the camera can hear: marching soldiers (0 = none, 1 = right in the middle of the screen) and, per
 * vehicle model (its on-screen name, e.g. "Abrams", "Su-57"), how loud its engine should be (same scale).
 */
export interface MotionLevels {
  foot: number;
  engines: ReadonlyMap<string, { kind: VehicleKind; level: number }>;
}

/**
 * Engine character of each vehicle, picked by its name (the real machine's engine), else by its kind:
 *  - dieselTank: V-12 diesel throb under clanking tracks (T-90, Leopard 2, Type 99, Karrar);
 *  - turbineTank: the M1 Abrams' AGT1500 gas turbine — a high jet-like whine over the tracks;
 *  - recovery: heavy, slower diesel of an armoured recovery vehicle, loud track clank (BREM-1, M88, Type 99II);
 *  - wheeled: truck engine, no tracks (KamAZ, Humvee, jeeps, scouts);
 *  - fighter: afterburning turbofans, a sharp roar with a high whine (F-22, Su-57, J-15, Rafale, Su-35);
 *  - bomber: many big jet engines beating against each other, deep and heavy (B-52, Tu-16);
 *  - airlifter: four big turbofans, a broad steady drone (C-17, Il-76, Y-20, A400M, tankers).
 */
type EngineProfile = 'dieselTank' | 'turbineTank' | 'recovery' | 'wheeled' | 'fighter' | 'bomber' | 'airlifter';
const ENGINE_BY_NAME: Readonly<Record<string, EngineProfile>> = {
  Abrams: 'turbineTank',
  'T-90': 'dieselTank',
  'Leopard 2': 'dieselTank',
  'Type 99': 'dieselTank',
  Karrar: 'dieselTank',
  'BREM-1': 'recovery',
  M88: 'recovery',
  'Type 99II': 'recovery',
  'F-22': 'fighter',
  'Su-57': 'fighter',
  'J-15': 'fighter',
  Rafale: 'fighter',
  'Su-35': 'fighter',
  'B-52': 'bomber',
  'Tu-16': 'bomber',
  KamAZ: 'wheeled',
  LVSR: 'wheeled',
  IVECO: 'wheeled',
};
const ENGINE_BY_KIND: Readonly<Record<VehicleKind, EngineProfile>> = {
  light: 'wheeled',
  tank: 'dieselTank',
  ifv: 'dieselTank',
  repair: 'recovery',
  jet: 'fighter',
  heli: 'bomber',
  bomber: 'bomber',
  transport: 'airlifter',
  tanker: 'airlifter',
  truck: 'wheeled',
};
/** Synthesis recipe per engine: rumble (low-passed noise, pulsed by an LFO), a whine band and a track-clank band. */
const ENGINE_RECIPES: Readonly<Record<EngineProfile, { rumble: number; pulse: number; depth: number; whine: number; whineGain: number; clank: number; clankGain: number; gain: number }>> = {
  dieselTank: { rumble: 150, pulse: 11, depth: 0.45, whine: 0, whineGain: 0, clank: 2200, clankGain: 0.2, gain: 1 },
  turbineTank: { rumble: 220, pulse: 0, depth: 0, whine: 2900, whineGain: 0.4, clank: 2200, clankGain: 0.16, gain: 0.95 },
  recovery: { rumble: 110, pulse: 7, depth: 0.55, whine: 0, whineGain: 0, clank: 1800, clankGain: 0.28, gain: 1 },
  wheeled: { rumble: 320, pulse: 18, depth: 0.3, whine: 0, whineGain: 0, clank: 0, clankGain: 0, gain: 0.7 },
  fighter: { rumble: 1100, pulse: 0, depth: 0, whine: 4200, whineGain: 0.28, clank: 0, clankGain: 0, gain: 0.8 },
  bomber: { rumble: 480, pulse: 3, depth: 0.22, whine: 1800, whineGain: 0.12, clank: 0, clankGain: 0, gain: 0.95 },
  airlifter: { rumble: 750, pulse: 1.5, depth: 0.1, whine: 3000, whineGain: 0.18, clank: 0, clankGain: 0, gain: 0.85 },
};
/** File name of a vehicle's own recording: "Leopard 2" → "leopard-2" (public/sounds/engine-leopard-2.mp3). */
const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Battle cry per nation, spoken in that nation's own language. */
const BATTLE_CRY: Readonly<Record<FactionId, { lang: string; lines: readonly string[] }>> = {
  usa: { lang: 'en-US', lines: ['Charge!', "Let's go!", 'Move out!'] },
  russia: { lang: 'ru-RU', lines: ['Ура!', 'В атаку!', 'Вперёд!'] },
  china: { lang: 'zh-CN', lines: ['冲啊！', '杀！', '前进！'] },
  europe: { lang: 'fr-FR', lines: ["À l'attaque !", 'En avant !', 'Allons-y !'] },
  islamic: { lang: 'ar-SA', lines: ['الله أكبر!', 'إلى الأمام!', 'هجوم!'] },
};
const CRY_COOLDOWN = 7;
/** Seconds between two "under attack" alarms / two mayday calls (several alerts at once sound only once). */
const ALARM_COOLDOWN = 4;
const MAYDAY_COOLDOWN = 3;
/** Small-arms fire is boosted so a firefight is clearly heard over the music and engines. */
const GUN_BOOST = 1.35;
const MIN_GAP: Readonly<Record<string, number>> = { rifle: 0.05, smg: 0.045, sniper: 0.1, mg: 0.05, cannon: 0.12, autocannon: 0.06, missile: 0.15, explosion: 0.1, board: 0.12 };

/**
 * Optional recordings: drop real sounds into public/sounds/ under these names (mp3, ogg or wav) and they replace the
 * synthesised ones. Anything missing keeps the synthesised sound.
 */
const SAMPLE_PATHS: Readonly<Record<string, string>> = {
  rifle: 'rifle',
  smg: 'smg',
  mg: 'mg',
  autocannon: 'autocannon',
  sniper: 'sniper',
  cannon: 'tank-cannon',
  missile: 'missile',
  bomb: 'bomb',
  explosion: 'explosion',
  board: 'board',
  foot: 'foot',
};
/**
 * Long recordings (a whole firefight, several cannon shots) are cut into clips: each play starts at one of the
 * recording's shots (found when it loads) and lasts this many seconds, fading out. Kinds not listed play whole.
 */
const SAMPLE_CLIP: Readonly<Record<string, number>> = { rifle: 0.7, smg: 0.6, mg: 0.8, autocannon: 0.8, sniper: 1.2, cannon: 2.2, missile: 1.5, bomb: 3.5, explosion: 3.5 };
/** No explosion recording: the bomb one is reused for vehicles and structures blowing up. */
const SAMPLE_FALLBACK: Readonly<Record<string, string>> = { explosion: 'bomb' };
/** Small arms fire in bursts: each shot is heard as this many rounds in quick succession ("rat-a-tat"). */
const BURST: Readonly<Record<string, { rounds: number; gap: number }>> = {
  rifle: { rounds: 3, gap: 0.085 },
  smg: { rounds: 4, gap: 0.065 },
  mg: { rounds: 5, gap: 0.07 },
  autocannon: { rounds: 3, gap: 0.12 },
};
/** While weapons / explosions are heard the music drops to this share, then comes back after SFX_DUCK_HOLD s. */
const SFX_DUCK = 0.35;
const SFX_DUCK_HOLD = 0.8;
/**
 * The recordings public/sounds/ actually ships (file names with extension). Only these are fetched, so a missing
 * recording costs no 404 request; add a file's name here when you drop one into public/sounds/.
 */
const SHIPPED_SOUNDS: ReadonlySet<string> = new Set(['rifle.mp3', 'tank-cannon.mp3', 'bomb.mp3', 'engine-tank.mp3']);
/** The shipped file for a sound name (no extension), or null when there is none. */
const shipped = (path: string): string | null => {
  for (const ext of ['mp3', 'ogg', 'wav']) if (SHIPPED_SOUNDS.has(`${path}.${ext}`)) return `${path}.${ext}`;
  return null;
};
/** Peak gain of the vehicle engine sounds; the music is also ducked (MUSIC_DUCK) while they play. */
const VEHICLE_BED_GAIN = 0.75;
/** Share the music is turned down by while vehicles are heard. */
const MUSIC_DUCK = 0.55;
/** Seconds between the footstep sounds of a marching group. */
const STEP_GAP = 0.32;

/**
 * Where the shots / blasts start in a recording (s): moments the 10 ms loudness jumps above half the peak after a
 * quieter stretch, at least 80 ms apart. Clips are only taken from the first part so they never run off the end.
 */
function findOnsets(buf: AudioBuffer): number[] {
  const data = buf.getChannelData(0);
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.01));
  const env: number[] = [];
  for (let i = 0; i < data.length; i += win) {
    let m = 0;
    for (let j = i; j < Math.min(data.length, i + win); j++) m = Math.max(m, Math.abs(data[j] ?? 0));
    env.push(m);
  }
  const peak = Math.max(...env, 1e-6);
  const out: number[] = [];
  let last = -1;
  for (let k = 1; k < env.length; k++) {
    const t = k * 0.01;
    if ((env[k] ?? 0) >= peak * 0.5 && (env[k - 1] ?? 0) < (env[k] ?? 0) * 0.8 && t - last >= 0.08 && t < buf.duration - 0.5) {
      out.push(Math.max(0, t - 0.01));
      last = t;
    }
  }
  return out.length ? out : [0];
}

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
 * real recordings dropped into public/sounds/ (see SAMPLE_PATHS and public/sounds/README.md) are used instead. Battle cries use the
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
  /** Decoded recordings from public/sounds/ (see SAMPLE_PATHS). */
  private readonly samples = new Map<string, AudioBuffer>();
  /** Start times (s) of the loud shots in each recording, so a clip always begins on a shot. */
  private readonly onsets = new WeakMap<AudioBuffer, number[]>();
  /** Looping engine sound per vehicle model (by name): its gain follows the motion levels. */
  private readonly beds = new Map<string, GainNode>();
  /** Recordings of single vehicle models (public/sounds/engine-<name>.*): loading, found, or not there. */
  private readonly vehicleSamples = new Map<string, AudioBuffer | 'loading' | 'none'>();
  private nextStep = 0;
  private lastAlarm = -99;
  /** Audio time until which a weapon / explosion keeps the music ducked. */
  private sfxUntil = 0;
  private lastMayday = -99;

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
    let vol = Math.max(0, 1 - dist / (l.range * 1.4));
    if (vol < 0.04 || this.active > 24) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(kind) ?? -1;
    if (now - last < (MIN_GAP[kind] ?? 0.05)) return;
    this.lastPlayed.set(kind, now);

    this.sfxUntil = now + SFX_DUCK_HOLD;
    this.music?.setDuck(SFX_DUCK);
    const burst = BURST[kind];
    // A recording of real gunfire already rattles on its own: one clip of it per shot.
    if (burst && !this.recording(kind)) {
      // Rat-a-tat: the rounds of a burst, each a little quieter and pitched differently.
      for (let i = 0; i < burst.rounds; i++) {
        const v = vol * (1 - i * 0.08);
        if (i === 0) this.shot(kind, v);
        else setTimeout(() => this.shot(kind, v), i * burst.gap * 1000);
      }
      return;
    }
    this.shot(kind, vol);
  }

  /** One round / blast of `kind` at volume `vol` (recording if there is one, else synthesised). */
  private shot(kind: Kind, vol: number): void {
    if (this.muted || !this.ctx) return;
    if (this.sample(kind, vol)) return;
    const jitter = 0.9 + Math.random() * 0.2;
    if (kind === 'rifle' || kind === 'smg' || kind === 'mg' || kind === 'autocannon' || kind === 'sniper') vol = Math.min(1.2, vol * GUN_BOOST);
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
    // Engines always sit above the music: a single vehicle is already clearly audible, a column louder still,
    // and the music is ducked while they are heard.
    // Near loud, far quiet: the level (1 = in the middle of the screen, 0 = at its edge) scales the engines directly.
    let loudest = 0;
    for (const [name, e] of levels.engines) {
      this.bed(name, e.kind, VEHICLE_BED_GAIN * Math.min(1, e.level) * on);
      loudest = Math.max(loudest, e.level);
    }
    // Models no longer moving on screen fade out.
    for (const name of this.beds.keys()) if (!levels.engines.has(name)) this.bed(name, 'tank', 0);
    const engines = Math.min(1, loudest * 1.5);
    // Weapons and explosions sit on top of the music too: it stays ducked for a moment after each.
    const sfx = ctx.currentTime < this.sfxUntil ? SFX_DUCK : 1;
    this.music?.setDuck(Math.min(sfx, 1 - MUSIC_DUCK * engines));
    const now = ctx.currentTime;
    if (on && levels.foot > 0 && now >= this.nextStep) {
      this.nextStep = now + STEP_GAP * (0.85 + Math.random() * 0.3);
      const vol = Math.min(1, levels.foot) * 0.45;
      if (!this.sample('foot', vol)) {
        // Boots on dirt: a soft low knock and a short gritty scuff.
        this.thump(vol * 0.8, 95 + Math.random() * 25, 0.06);
        this.burst(vol * 0.5, 0.05, 'bandpass', 1400 + Math.random() * 600, 1.2);
      }
    }
  }

  /** "Under attack" klaxon: three two-tone beeps, heard wherever the camera is (rate-limited). */
  alarm(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastAlarm < ALARM_COOLDOWN) return;
    this.lastAlarm = now;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.32;
      for (const [freq, at] of [
        [880, 0],
        [660, 0.14],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0005, t + at);
        g.gain.exponentialRampToValueAtTime(0.16, t + at + 0.01);
        g.gain.setValueAtTime(0.16, t + at + 0.11);
        g.gain.exponentialRampToValueAtTime(0.0005, t + at + 0.13);
        osc.connect(g).connect(this.master);
        osc.start(t + at);
        osc.stop(t + at + 0.14);
      }
    }
  }

  /** A pilot's distress call when one of the player's aircraft goes down: "Mayday, mayday, mayday!" */
  mayday(): void {
    if (this.muted || typeof speechSynthesis === 'undefined' || !this.ctx) return;
    const now = performance.now() / 1000;
    if (now - this.lastMayday < MAYDAY_COOLDOWN) return;
    this.lastMayday = now;
    if (speechSynthesis.speaking) speechSynthesis.cancel(); // more urgent than a battle cry
    // Three separate calls (MAYDAY — MAYDAY — MAYDAY), each its own utterance so the voice never runs them together.
    const voice = this.voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    for (let i = 0; i < 3; i++) {
      const u = new SpeechSynthesisUtterance('Mayday!');
      u.lang = 'en-US';
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.pitch = 0.85;
      u.volume = 1;
      speechSynthesis.speak(u);
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
    const rec = this.recording(kind);
    if (!ctx || !this.master || !rec) return false;
    const src = ctx.createBufferSource();
    src.buffer = rec.buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    const clip = SAMPLE_CLIP[kind];
    if (clip && rec.buf.duration > clip * 1.3) {
      const start = rec.onsets[Math.floor(Math.random() * rec.onsets.length)] ?? 0;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(vol, t + clip * 0.7);
      g.gain.linearRampToValueAtTime(0, t + clip);
      src.start(t, start);
      src.stop(t + clip + 0.02);
    } else src.start();
    this.active++;
    src.onended = () => {
      this.active--;
    };
    return true;
  }

  /** The recording for `kind` (or the one it borrows, see SAMPLE_FALLBACK) and the shots found in it. */
  private recording(kind: string): { buf: AudioBuffer; onsets: number[] } | undefined {
    const buf = this.samples.get(kind) ?? this.samples.get(SAMPLE_FALLBACK[kind] ?? '');
    if (!buf) return undefined;
    let onsets = this.onsets.get(buf);
    if (!onsets) {
      onsets = findOnsets(buf);
      this.onsets.set(buf, onsets);
    }
    return { buf, onsets };
  }

  /** Loads whatever recordings exist in public/sounds/ (missing ones are simply skipped). */
  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      Object.entries(SAMPLE_PATHS).map(async ([kind, path]) => {
        const file = shipped(path);
        if (!file) return;
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}sounds/${file}`);
          if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return;
          this.samples.set(kind, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* not audio: keep the synthesised sound */
        }
      }),
    );
  }

  // ------------------------------------------------------------------ synthesis

  /**
   * Loads (once, in the background) the engine recording of one vehicle model: its own file
   * (sounds/engine-<model>.*, e.g. engine-leopard-2.mp3) if the game ships one, else the shared one for its kind
   * (sounds/engine-<kind>.*, e.g. engine-tank.mp3).
   */
  private loadVehicleSample(name: string, kind: VehicleKind): void {
    const ctx = this.ctx;
    if (!ctx || this.vehicleSamples.has(name)) return;
    this.vehicleSamples.set(name, 'loading');
    void (async () => {
      for (const model of [slug(name), kind]) {
        const file = shipped(`engine-${model}`);
        if (!file) continue;
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}sounds/${file}`);
          if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) continue;
          this.vehicleSamples.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
          this.beds.get(name)?.disconnect(); // rebuilt with the recording next frame
          this.beds.delete(name);
          return;
        } catch {
          /* not audio: try the shared recording */
        }
      }
      this.vehicleSamples.set(name, 'none');
    })();
  }

  /**
   * The looping engine of one vehicle model, its volume easing towards `gain`: the model's own recording if the game
   * ships one, else synthesised from its engine profile (see ENGINE_BY_NAME).
   */
  private bed(name: string, kind: VehicleKind, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    let g = this.beds.get(name);
    if (!g) {
      if (gain <= 0) return;
      this.loadVehicleSample(name, kind);
      const profile = ENGINE_BY_NAME[name] ?? ENGINE_BY_KIND[kind];
      const r = ENGINE_RECIPES[profile];
      g = ctx.createGain();
      g.gain.value = 0;
      const out = ctx.createGain();
      out.gain.value = r.gain;
      g.connect(out).connect(this.master);
      const rec = this.vehicleSamples.get(name);
      const src = ctx.createBufferSource();
      src.buffer = rec instanceof AudioBuffer ? rec : this.noise;
      src.loop = true;
      if (rec instanceof AudioBuffer) src.connect(g);
      else {
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = r.rumble;
        const throb = ctx.createGain();
        throb.gain.value = r.depth > 0 ? 1 - r.depth : 1;
        if (r.pulse > 0) {
          const lfo = ctx.createOscillator();
          lfo.frequency.value = r.pulse;
          const depth = ctx.createGain();
          depth.gain.value = r.depth;
          lfo.connect(depth).connect(throb.gain);
          lfo.start();
        }
        src.connect(low).connect(throb).connect(g);
        for (const [freq, level, q] of [
          [r.whine, r.whineGain, 7],
          [r.clank, r.clankGain, 3],
        ] as const) {
          if (freq <= 0 || level <= 0) continue;
          const band = ctx.createBiquadFilter();
          band.type = 'bandpass';
          band.frequency.value = freq;
          band.Q.value = q;
          const bg = ctx.createGain();
          bg.gain.value = level;
          src.connect(band).connect(bg).connect(g);
        }
      }
      src.start();
      this.beds.set(name, g);
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
