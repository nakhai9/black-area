import DEFAULTS from './doctrine.json';

/**
 * AI doctrine (tunable tactics numbers). Defaults come from doctrine.json; the learned values come from the game server
 * (server/src/ai.js), which learns from every match of every player (see KnowledgeApi). The last doctrine the server
 * handed out is kept in the browser, so an offline start still uses what was learned.
 *
 * Whatever the source, every value is clamped to its [min, max] in doctrine.json: a bad or tampered answer can never
 * push the AI outside its bounds.
 */
export type DoctrineKey = keyof typeof DEFAULTS.params;
export type Doctrine = Record<DoctrineKey, number>;

/** The learned opening etc. the server hands out with the doctrine (all optional: missing = the built-in rules). */
export interface Playbook {
  opening?: string[];
}

/** What the AI knows at the start of a match (or when a save is continued). */
export interface Knowledge {
  /** Server's doctrine version (0 = defaults / offline). */
  version: number;
  doctrine: Doctrine;
  /** Per-player counter: offsets added on top of the doctrine (clamped). */
  counter: Partial<Doctrine>;
  playbook: Playbook;
}

const CACHE = 'black-area.ai-knowledge';
export const KEYS = Object.keys(DEFAULTS.params) as DoctrineKey[];

export const THROTTLE = DEFAULTS.throttle;
export const FAST_TIER_SECONDS = DEFAULTS.fastTierSeconds;

export function defaultDoctrine(): Doctrine {
  const out = {} as Doctrine;
  for (const k of KEYS) out[k] = DEFAULTS.params[k].value;
  return out;
}

export function clampParam(k: DoctrineKey, v: number): number {
  const p = DEFAULTS.params[k];
  return Math.min(p.max, Math.max(p.min, v));
}

/** Only known keys with finite numbers, clamped. */
function cleanDoctrine(raw: unknown, base: Doctrine): Doctrine {
  const out = { ...base };
  if (raw && typeof raw === 'object') {
    for (const k of KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampParam(k, v);
    }
  }
  return out;
}

function cleanCounter(raw: unknown): Partial<Doctrine> {
  const out: Partial<Doctrine> = {};
  if (raw && typeof raw === 'object') {
    for (const k of KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      // A counter moves a value by at most 3 of its steps either way.
      const lim = DEFAULTS.params[k].step * 3;
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-lim, Math.min(lim, v));
    }
  }
  return out;
}

function cleanPlaybook(raw: unknown): Playbook {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const opening = Array.isArray(o.opening) ? o.opening.filter((x): x is string => typeof x === 'string').slice(0, 12) : undefined;
  return opening ? { opening } : {};
}

/** Validates whatever came from the server / a save / the cache. */
export function cleanKnowledge(raw: unknown): Knowledge {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    version: typeof o.version === 'number' && Number.isFinite(o.version) ? o.version : 0,
    doctrine: cleanDoctrine(o.doctrine, defaultDoctrine()),
    counter: cleanCounter(o.counter),
    playbook: cleanPlaybook(o.playbook),
  };
}

/** Defaults (multiplayer, or nothing learned yet). */
export function defaultKnowledge(): Knowledge {
  return { version: 0, doctrine: defaultDoctrine(), counter: {}, playbook: {} };
}

/** The last knowledge the server handed out (offline start), or the defaults. */
export function cachedKnowledge(): Knowledge {
  try {
    const raw = localStorage.getItem(CACHE);
    return raw ? cleanKnowledge(JSON.parse(raw)) : defaultKnowledge();
  } catch {
    return defaultKnowledge();
  }
}

export function cacheKnowledge(k: Knowledge): void {
  try {
    localStorage.setItem(CACHE, JSON.stringify(k));
  } catch {
    /* storage blocked */
  }
}

/** Doctrine + counter, clamped: the numbers the AI really plays with. */
export function effectiveDoctrine(k: Knowledge): Doctrine {
  const out = { ...k.doctrine };
  for (const key of KEYS) {
    const c = k.counter[key];
    if (c !== undefined) out[key] = clampParam(key, out[key] + c);
  }
  return out;
}

/** What one AI nation did in the match (gathered by AITactics). */
export interface AIMatchStats {
  /** The AI nation survived to the end (or the human lost). */
  won: boolean;
  /** Combat units it lost. */
  lost: number;
  /** Enemy combat units killed near its squads (focus fire). */
  killed: number;
  /** Times its squads retreated from a losing fight. */
  retreats: number;
}
