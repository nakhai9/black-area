/**
 * AI learning (MySQL, same database as the cloud saves): the AI learns from every match of every player.
 *
 *   GET  /api/ai/ping                                → { ok } (wakes the server while the player is in the menus)
 *   GET  /api/ai/knowledge?factions=a,b&player=<id>  → { version, doctrine, counter, playbook }
 *   GET  /api/ai/counter?player=<id>                 → { counter }  (continuing a saved match)
 *   POST /api/ai/checkpoint  { matchId, playerId, gameTime, doctrineVer, logs }
 *        on every save: only the part played since the match's last checkpoint is learned (this player's style)
 *   POST /api/ai/matches     { matchId, playerId, gameTime, doctrineVer, aiWon, stats, logs }
 *        the finished match: doctrine win/loss, the player's style and record, winning openings
 *
 * Learning
 *   - Doctrine (shared by everyone): a "main" version and a "trial" one (main moved one step on one parameter).
 *     TRIAL_SHARE of the matches play the trial; once it has MIN_GAMES matches and its win rate's lower bound
 *     (Wilson) beats the main's rate, it becomes the main. Every version is kept (roll back = point `main` at it).
 *   - Player profile: a moving average of the player's style (first attack, air share, economy first), and their
 *     wins / games; the counter handed to the AI is derived from it, a few steps at most, inside the bounds.
 *   - Playbook: openings (first structures) of the nations that won, counted; the most winning one is handed out.
 * Every value is clamped to the bounds in ui/src/ai/doctrine.json; the game clamps again on its side.
 * Detailed match logs are deleted after AI_LOG_DAYS days (0 = keep); what was learned from them stays.
 */
import fs from 'node:fs';
import { getPool, savesEnabled } from './saves.js';

const MAX_BODY = 512 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FACTION_RE = /^[a-z]{2,16}$/;
const TRIAL_SHARE = 0.1;
const MIN_GAMES = 30;
/** Weight of one finished match in the player's style average; a checkpoint weighs less (by the time it covers). */
const STYLE_RATE = 0.2;
const LOG_DAYS = process.env.AI_LOG_DAYS === undefined ? 60 : Number(process.env.AI_LOG_DAYS) || 0;
/** Requests per IP per minute (in memory: enough against a runaway client, not a fortress). */
const RATE_LIMIT = 60;
const AIR = /jet|bomber|heli|awacs|drone|b1|tu160|h6/i;

/** Bounds of the doctrine: the game's own file (the repository is deployed whole), or these defaults. */
const PARAMS = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../../ui/src/ai/doctrine.json', import.meta.url), 'utf8')).params;
  } catch {
    return {
      focusRadiusCells: { value: 10, min: 6, max: 16, step: 1 },
      infantryBias: { value: 0.6, min: 0.3, max: 1, step: 0.05 },
      retreatOdds: { value: 1.5, min: 1.1, max: 2.5, step: 0.1 },
      strikeGroup: { value: 3, min: 2, max: 8, step: 1 },
      supportRadiusCells: { value: 14, min: 8, max: 22, step: 1 },
      guardShare: { value: 0.33, min: 0.15, max: 0.6, step: 0.05 },
      airDefenceExtra: { value: 0, min: 0, max: 4, step: 1 },
    };
  }
})();
const KEYS = Object.keys(PARAMS);
const clamp = (k, v) => Math.min(PARAMS[k].max, Math.max(PARAMS[k].min, Math.round(v * 1000) / 1000));
const defaults = () => Object.fromEntries(KEYS.map((k) => [k, PARAMS[k].value]));

let ready = null;
function db() {
  const pool = getPool();
  ready ??= Promise.all([
    pool.query(`CREATE TABLE IF NOT EXISTS ai_doctrines (
       version INT NOT NULL PRIMARY KEY,
       params JSON NOT NULL,
       status VARCHAR(8) NOT NULL,           -- main | trial | old
       games INT NOT NULL DEFAULT 0,
       wins INT NOT NULL DEFAULT 0,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`),
    pool.query(`CREATE TABLE IF NOT EXISTS ai_profiles (
       player_id VARCHAR(64) NOT NULL PRIMARY KEY,
       style JSON NOT NULL,
       games INT NOT NULL DEFAULT 0,
       wins INT NOT NULL DEFAULT 0,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`),
    pool.query(`CREATE TABLE IF NOT EXISTS ai_checkpoints (
       match_id VARCHAR(64) NOT NULL PRIMARY KEY,
       player_id VARCHAR(64) NOT NULL,
       game_time INT NOT NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`),
    pool.query(`CREATE TABLE IF NOT EXISTS ai_match_logs (
       match_id VARCHAR(64) NOT NULL PRIMARY KEY,
       player_id VARCHAR(64) NOT NULL,
       doctrine_ver INT NOT NULL,
       ai_won TINYINT NOT NULL,
       game_time INT NOT NULL,
       game_version VARCHAR(16) NOT NULL,
       data LONGTEXT NOT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       INDEX (created_at)
     ) ENGINE=InnoDB`),
    pool.query(`CREATE TABLE IF NOT EXISTS ai_openings (
       opening VARCHAR(255) NOT NULL PRIMARY KEY,
       wins INT NOT NULL DEFAULT 0
     ) ENGINE=InnoDB`),
  ]).catch((e) => {
    ready = null;
    throw e;
  });
  return pool;
}

// ------------------------------------------------------------------ doctrine versions (bandit)

async function versions(pool) {
  const [rows] = await pool.query(`SELECT version, params, status, games, wins FROM ai_doctrines WHERE status IN ('main','trial')`);
  let main = rows.find((r) => r.status === 'main');
  if (!main) {
    await pool.query(`INSERT IGNORE INTO ai_doctrines (version, params, status) VALUES (1, ?, 'main')`, [JSON.stringify(defaults())]);
    main = { version: 1, params: defaults(), status: 'main', games: 0, wins: 0 };
  }
  let trial = rows.find((r) => r.status === 'trial');
  if (!trial) trial = await newTrial(pool, main);
  return { main: parse(main), trial: parse(trial) };
}

const parse = (r) => ({ ...r, params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params });

/** A trial: the main doctrine with one parameter moved one step (random parameter and direction). */
async function newTrial(pool, main) {
  const base = parse(main).params;
  const k = KEYS[Math.floor(Math.random() * KEYS.length)];
  const dir = Math.random() < 0.5 ? -1 : 1;
  const params = { ...defaults(), ...base, [k]: clamp(k, (base[k] ?? PARAMS[k].value) + dir * PARAMS[k].step) };
  const [[{ next }]] = await pool.query(`SELECT COALESCE(MAX(version), 0) + 1 AS next FROM ai_doctrines`);
  await pool.query(`INSERT INTO ai_doctrines (version, params, status) VALUES (?, ?, 'trial')`, [next, JSON.stringify(params)]);
  return { version: next, params, status: 'trial', games: 0, wins: 0 };
}

/** Lower bound of the Wilson score interval (95%) of a win rate. */
function wilsonLow(wins, games) {
  if (games === 0) return 0;
  const z = 1.96;
  const p = wins / games;
  return (p + (z * z) / (2 * games) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * games)) / games)) / (1 + (z * z) / games);
}

/** The trial has played enough: it replaces the main if it is clearly better, else it is retired. A new trial follows. */
async function judgeTrial(pool) {
  const { main, trial } = await versions(pool);
  if (trial.games < MIN_GAMES) return;
  const mainRate = main.games > 0 ? main.wins / main.games : 0.5;
  if (wilsonLow(trial.wins, trial.games) > mainRate) {
    await pool.query(`UPDATE ai_doctrines SET status = 'old' WHERE version = ?`, [main.version]);
    await pool.query(`UPDATE ai_doctrines SET status = 'main' WHERE version = ?`, [trial.version]);
  } else {
    await pool.query(`UPDATE ai_doctrines SET status = 'old' WHERE version = ?`, [trial.version]);
  }
}

// ------------------------------------------------------------------ player style

/** The human's style in a log (optionally only what happened after `from` seconds). */
function styleOf(logs, from = 0) {
  const me = Array.isArray(logs) ? logs.find((l) => l && l.isHuman) : null;
  if (!me) return null;
  const buys = (Array.isArray(me.buys) ? me.buys : []).filter((b) => b && typeof b.t === 'number' && b.t > from);
  const units = buys.filter((b) => b.kind === 'unit');
  const firstBuildings = (Array.isArray(me.buys) ? me.buys : []).filter((b) => b && b.kind === 'building').slice(0, 6).map((b) => String(b.id));
  const firstAttack = (Array.isArray(me.attacks) ? me.attacks : []).find((a) => a && typeof a.t === 'number');
  return {
    firstAttackAt: firstAttack ? Math.min(7200, Math.max(0, firstAttack.t)) : null,
    airShare: units.length > 0 ? units.filter((b) => AIR.test(String(b.id))).length / units.length : null,
    econFirst: firstBuildings.length > 0 ? (firstBuildings.indexOf('happyCity') >= 0 && (firstBuildings.indexOf('barracks') < 0 || firstBuildings.indexOf('happyCity') < firstBuildings.indexOf('barracks')) ? 1 : 0) : null,
  };
}

/** Moving average: each known field of `next` moves the profile by `rate`. */
function blend(old, next, rate) {
  const out = { ...old };
  for (const [k, v] of Object.entries(next ?? {})) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = typeof out[k] === 'number' ? out[k] + (v - out[k]) * rate : v;
  }
  return out;
}

async function learnStyle(pool, playerId, style, rate, result) {
  if (!style) return;
  const [rows] = await pool.query(`SELECT style, games, wins FROM ai_profiles WHERE player_id = ?`, [playerId]);
  const old = rows[0] ? (typeof rows[0].style === 'string' ? JSON.parse(rows[0].style) : rows[0].style) : {};
  const next = blend(old, style, rate);
  const games = result ? 1 : 0;
  const wins = result === 'player_win' ? 1 : 0;
  await pool.query(
    `INSERT INTO ai_profiles (player_id, style, games, wins) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE style = VALUES(style), games = games + VALUES(games), wins = wins + VALUES(wins)`,
    [playerId, JSON.stringify(next), games, wins],
  );
}

/** The counter for one player: offsets in steps, from their style and record. */
async function counterFor(pool, playerId) {
  if (!ID_RE.test(playerId ?? '')) return {};
  const [rows] = await pool.query(`SELECT style, games, wins FROM ai_profiles WHERE player_id = ?`, [playerId]);
  if (!rows[0]) return {};
  const style = typeof rows[0].style === 'string' ? JSON.parse(rows[0].style) : rows[0].style;
  const { games, wins } = rows[0];
  const step = (k, n) => n * PARAMS[k].step;
  const c = {};
  // Attacks early → more of the army stays home at first.
  if (typeof style.firstAttackAt === 'number' && style.firstAttackAt < 300) c.guardShare = step('guardShare', 2);
  // Lots of aircraft → more air defence at home.
  if (typeof style.airShare === 'number' && style.airShare > 0.25) c.airDefenceExtra = step('airDefenceExtra', style.airShare > 0.45 ? 2 : 1);
  // Economy first → attack sooner with smaller groups (punish the greedy start).
  if (typeof style.econFirst === 'number' && style.econFirst > 0.6) c.strikeGroup = step('strikeGroup', -1);
  // Keep it fun: a player who wins nearly always meets a bolder AI, one who nearly always loses a gentler one.
  if (games >= 5) {
    const rate = wins / games;
    if (rate > 0.7) c.retreatOdds = step('retreatOdds', 2);
    else if (rate < 0.3) c.retreatOdds = step('retreatOdds', -2);
  }
  return c;
}

// ------------------------------------------------------------------ playbook

/** Openings (first 6 structures) of the nations that won this match, counted. */
async function learnOpenings(pool, logs, aiWon) {
  for (const l of Array.isArray(logs) ? logs : []) {
    if (!l || !Array.isArray(l.buys)) continue;
    const won = l.isHuman ? !aiWon : aiWon;
    if (!won) continue;
    const opening = l.buys.filter((b) => b && b.kind === 'building').slice(0, 6).map((b) => String(b.id).replace(/[^A-Za-z@]/g, '')).join(',');
    if (opening.length === 0 || opening.length > 255) continue;
    await pool.query(`INSERT INTO ai_openings (opening, wins) VALUES (?, 1) ON DUPLICATE KEY UPDATE wins = wins + 1`, [opening]);
  }
}

async function bestOpening(pool) {
  const [rows] = await pool.query(`SELECT opening FROM ai_openings WHERE wins >= 3 ORDER BY wins DESC LIMIT 1`);
  return rows[0] ? rows[0].opening.split(',') : undefined;
}

// ------------------------------------------------------------------ housekeeping

let lastCleanup = 0;
async function cleanup(pool) {
  if (LOG_DAYS <= 0 || Date.now() - lastCleanup < 24 * 3600 * 1000) return;
  lastCleanup = Date.now();
  await pool.query(`DELETE FROM ai_match_logs WHERE created_at < NOW() - INTERVAL ? DAY LIMIT 5000`, [LOG_DAYS]);
  await pool.query(`DELETE FROM ai_checkpoints WHERE updated_at < NOW() - INTERVAL ? DAY LIMIT 5000`, [LOG_DAYS]);
}

const hits = new Map();
function limited(req) {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { at: now, n: 1 });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  return ++h.n > RATE_LIMIT;
}

// ------------------------------------------------------------------ HTTP

const cors = {
  'access-control-allow-origin': process.env.CORS_ORIGIN || '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
function reply(res, status, body) {
  res.writeHead(status, { ...cors, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Report too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Body is not JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** Handles /api/ai/*; returns false for any other URL. */
export async function handleAi(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/ai/')) return false;
  if (req.method === 'OPTIONS') return reply(res, 204, {}), true;
  const route = url.pathname.slice('/api/ai'.length).replace(/\/+$/, '');
  if (route === '/ping') return reply(res, 200, { ok: true }), true;
  if (!savesEnabled()) return reply(res, 503, { error: 'AI learning needs the database (DB_HOST missing)' }), true;
  if (limited(req)) return reply(res, 429, { error: 'Too many requests' }), true;
  try {
    const pool = db();
    await ready;
    void cleanup(pool).catch((e) => console.error('[ai] cleanup', e.message));

    if (req.method === 'GET' && route === '/knowledge') {
      const player = url.searchParams.get('player') ?? '';
      const { main, trial } = await versions(pool);
      const pick = Math.random() < TRIAL_SHARE ? trial : main;
      return reply(res, 200, { version: pick.version, doctrine: pick.params, counter: await counterFor(pool, player), playbook: { opening: await bestOpening(pool) } }), true;
    }
    if (req.method === 'GET' && route === '/counter') {
      return reply(res, 200, { counter: await counterFor(pool, url.searchParams.get('player') ?? '') }), true;
    }
    if (req.method === 'POST' && (route === '/checkpoint' || route === '/matches')) {
      const m = await readJson(req);
      if (!ID_RE.test(m?.matchId ?? '') || !ID_RE.test(m?.playerId ?? '') || typeof m.gameTime !== 'number' || !Array.isArray(m.logs)) {
        return reply(res, 400, { error: 'Bad report' }), true;
      }
      const gameTime = Math.max(0, Math.min(1e6, Math.round(m.gameTime)));
      // Only what was played since this match's last checkpoint is new (a reloaded older save adds nothing).
      const [prev] = await pool.query(`SELECT game_time FROM ai_checkpoints WHERE match_id = ?`, [m.matchId]);
      const from = prev[0]?.game_time ?? 0;
      if (route === '/checkpoint') {
        if (gameTime <= from) return reply(res, 200, { ok: true, learned: false }), true;
        await learnStyle(pool, m.playerId, styleOf(m.logs, from), STYLE_RATE * Math.min(1, (gameTime - from) / 1200), null);
        await pool.query(`INSERT INTO ai_checkpoints (match_id, player_id, game_time) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE game_time = VALUES(game_time)`, [m.matchId, m.playerId, gameTime]);
        return reply(res, 200, { ok: true, learned: true }), true;
      }
      // Finished match: once per match (a second report of the same match only replaces its log).
      const [done] = await pool.query(`SELECT 1 FROM ai_match_logs WHERE match_id = ?`, [m.matchId]);
      const aiWon = m.aiWon === true;
      const ver = Number.isInteger(m.doctrineVer) ? m.doctrineVer : 0;
      await pool.query(
        `REPLACE INTO ai_match_logs (match_id, player_id, doctrine_ver, ai_won, game_time, game_version, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [m.matchId, m.playerId, ver, aiWon ? 1 : 0, gameTime, String(m.gameVersion ?? '').slice(0, 16), JSON.stringify({ stats: m.stats, logs: m.logs })],
      );
      if (done.length === 0) {
        if (ver > 0) await pool.query(`UPDATE ai_doctrines SET games = games + 1, wins = wins + ? WHERE version = ?`, [aiWon ? 1 : 0, ver]);
        await learnStyle(pool, m.playerId, styleOf(m.logs, 0), STYLE_RATE, aiWon ? 'ai_win' : 'player_win');
        await learnOpenings(pool, m.logs, aiWon);
        await judgeTrial(pool);
        await pool.query(`INSERT INTO ai_checkpoints (match_id, player_id, game_time) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE game_time = GREATEST(game_time, VALUES(game_time))`, [m.matchId, m.playerId, gameTime]);
      }
      return reply(res, 200, { ok: true, learned: done.length === 0 }), true;
    }
    return reply(res, 404, { error: 'Unknown AI route' }), true;
  } catch (e) {
    console.error('[ai]', e.message);
    return reply(res, e.status || 500, { error: e.status ? e.message : 'Database error' }), true;
  }
}
