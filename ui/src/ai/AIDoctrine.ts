import DEFAULTS from './doctrine.json';

/**
 * AI doctrine (tunable tactics numbers) + self-review after a match (idea from ys118/ra2web-jev-player: audit → review →
 * capped, whitelisted tuning, loaded by the next match).
 *
 * Defaults come from doctrine.json. Learned values are kept in the browser (localStorage) and only used in solo games:
 * in multiplayer every machine must run the same AI, so the defaults are used there.
 */
export type DoctrineKey = keyof typeof DEFAULTS.params;
export type Doctrine = Record<DoctrineKey, number>;

const STORE = 'black-area.ai-doctrine';
const HISTORY = 'black-area.ai-doctrine-history';
/** Keys the review may change (whitelist). */
const TUNABLE: readonly DoctrineKey[] = ['focusRadiusCells', 'infantryBias', 'retreatOdds', 'strikeGroup', 'supportRadiusCells'];

export const THROTTLE = DEFAULTS.throttle;
export const FAST_TIER_SECONDS = DEFAULTS.fastTierSeconds;

function defaults(): Doctrine {
  const out = {} as Doctrine;
  for (const k of Object.keys(DEFAULTS.params) as DoctrineKey[]) out[k] = DEFAULTS.params[k].value;
  return out;
}

function clampParam(k: DoctrineKey, v: number): number {
  const p = DEFAULTS.params[k];
  return Math.min(p.max, Math.max(p.min, v));
}

/** The doctrine for this match: learned values in solo games (if any), the defaults otherwise. */
export function loadDoctrine(solo: boolean): Doctrine {
  const d = defaults();
  if (!solo) return d;
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return d;
    const saved = JSON.parse(raw) as Partial<Doctrine>;
    for (const k of TUNABLE) if (typeof saved[k] === 'number' && Number.isFinite(saved[k])) d[k] = clampParam(k, saved[k]!);
  } catch {
    /* storage blocked: defaults */
  }
  return d;
}

/** What one AI nation did in the match (gathered by AISystem). */
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

/**
 * Self-review after a solo match: one step per parameter at most (its `step` in doctrine.json), always inside its
 * bounds, so one bad match never wrecks the doctrine. Returns the changes (for the log / history).
 */
export function reviewMatch(current: Doctrine, stats: readonly AIMatchStats[]): Partial<Record<DoctrineKey, [number, number]>> {
  if (stats.length === 0) return {};
  const lost = stats.reduce((s, x) => s + x.lost, 0);
  const killed = stats.reduce((s, x) => s + x.killed, 0);
  const retreats = stats.reduce((s, x) => s + x.retreats, 0);
  const wins = stats.filter((x) => x.won).length;
  const next = { ...current };
  const step = (k: DoctrineKey, dir: number): void => {
    next[k] = clampParam(k, Math.round((next[k] + dir * DEFAULTS.params[k].step) * 1000) / 1000);
  };
  const ratio = lost / Math.max(1, killed);
  if (wins === 0) {
    // Every AI nation lost.
    if (ratio > 1.5) {
      // Traded badly: mass more before attacking, pull out of bad fights sooner, fight closer together.
      step('strikeGroup', +1);
      step('retreatOdds', -1);
      step('supportRadiusCells', +1);
    } else {
      // Traded well but still lost: be bolder, and focus fire over a wider area.
      step('retreatOdds', +1);
      step('focusRadiusCells', +1);
    }
  } else if (ratio > 2) {
    // Won, but at a high price: tighter focus fire, prefer the soft targets (infantry) more.
    step('focusRadiusCells', -1);
    step('infantryBias', -1);
  }
  // Retreating a lot without kills: the retreat line is too cautious.
  if (retreats > 10 && killed < lost) step('retreatOdds', +1);
  const changes: Partial<Record<DoctrineKey, [number, number]>> = {};
  for (const k of TUNABLE) if (next[k] !== current[k]) changes[k] = [current[k], next[k]];
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
    const hist = JSON.parse(localStorage.getItem(HISTORY) ?? '[]') as unknown[];
    hist.push({ at: new Date().toISOString(), wins, lost, killed, retreats, changes });
    localStorage.setItem(HISTORY, JSON.stringify(hist.slice(-50)));
  } catch {
    /* storage blocked: nothing learned */
  }
  return changes;
}
