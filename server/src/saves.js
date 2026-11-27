/**
 * Cloud saves in MySQL (Aiven): one row per save slot, overwritten on every save.
 *
 *   POST   /api/saves       body = the save JSON → { ok, id, bytes, updatedAt }: first save of a new player; the server
 *                            creates the player id (UUID) and the client keeps it for the next saves
 *   PUT    /api/saves/:id   body = the save JSON (JSON.stringify(game.exportSave()))  → { ok, id, bytes, updatedAt };
 *                            overwrites an existing player's save (404 for an id the server never issued)
 *   GET    /api/saves/:id   → the save JSON as stored (404 if none)
 *   DELETE /api/saves/:id   → { ok }
 *
 * :id is the player id issued by POST (a UUID).
 * If SAVE_API_KEY is set, every request must send the header `x-api-key: <SAVE_API_KEY>`.
 * The table is created on first use. Config comes from the environment (server/.env).
 */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SAVE_BYTES = Number(process.env.SAVE_MAX_BYTES) || 20 * 1024 * 1024;
const TABLE = process.env.SAVE_TABLE || 'saves';
if (!/^[A-Za-z0-9_]+$/.test(TABLE)) throw new Error('SAVE_TABLE may only contain letters, digits and _');

let pool = null;
let ready = null;

export const savesEnabled = () => Boolean(process.env.DB_HOST);

/** Aiven requires TLS: verify with its CA certificate (file path or the PEM text itself). */
function sslOptions() {
  if (process.env.DB_SSL === 'false') return undefined;
  const ca = process.env.DB_CA_CERT
    ? process.env.DB_CA_CERT.replace(/\\n/g, '\n')
    : process.env.DB_CA_CERT_PATH
      ? fs.readFileSync(process.env.DB_CA_CERT_PATH, 'utf8')
      : undefined;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

export function getPool() {
  pool ??= mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslOptions(),
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 5,
    waitForConnections: true,
    // affectedRows counts matched rows (an unchanged save still "exists" for PUT).
    flags: ['+FOUND_ROWS'],
  });
  ready ??= pool.query(
    `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
       id VARCHAR(64) NOT NULL PRIMARY KEY,
       data LONGTEXT NOT NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ).catch((e) => {
    ready = null; // retry on the next request
    throw e;
  });
  return pool;
}

const cors = {
  'access-control-allow-origin': process.env.CORS_ORIGIN || '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-api-key',
};

function reply(res, status, body, type = 'application/json') {
  res.writeHead(status, { ...cors, 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_SAVE_BYTES) {
        reject(Object.assign(new Error('Save too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Handles /api/saves/* requests; returns false for any other URL so the caller can serve it. */
export async function handleSaves(req, res) {
  const url = new URL(req.url, 'http://x');
  const m = /^\/api\/saves(?:\/([^/]+))?\/?$/.exec(url.pathname);
  if (!m) return false;
  if (req.method === 'OPTIONS') return reply(res, 204, ''), true;
  if (!savesEnabled()) return reply(res, 503, { error: 'Cloud saves are not configured (DB_HOST missing)' }), true;
  if (process.env.SAVE_API_KEY && req.headers['x-api-key'] !== process.env.SAVE_API_KEY) {
    return reply(res, 401, { error: 'Unauthorized' }), true;
  }
  const id = m[1] === undefined ? null : decodeURIComponent(m[1]);
  if (id === null ? req.method !== 'POST' : !ID_RE.test(id)) return reply(res, 400, { error: 'Bad save id' }), true;

  /** The request body, checked to be a Black Area save; null after replying with an error. */
  const readSave = async () => {
    const body = await readBody(req);
    let save;
    try {
      save = JSON.parse(body);
    } catch {
      reply(res, 400, { error: 'Body is not JSON' });
      return null;
    }
    if (save?.format !== 'black-area-save') {
      reply(res, 400, { error: 'Not a Black Area save' });
      return null;
    }
    return body;
  };
  const saved = (sid, body) => reply(res, 200, { ok: true, id: sid, bytes: Buffer.byteLength(body), updatedAt: new Date().toISOString() });

  try {
    const db = getPool();
    await ready;
    if (req.method === 'GET') {
      const [rows] = await db.query(`SELECT data FROM \`${TABLE}\` WHERE id = ?`, [id]);
      if (!rows.length) return reply(res, 404, { error: 'No save' }), true;
      return reply(res, 200, rows[0].data), true;
    }
    if (id === null) {
      // First save of a new player: the server issues the player id.
      const body = await readSave();
      if (body === null) return true;
      const sid = randomUUID();
      await db.query(`INSERT INTO \`${TABLE}\` (id, data) VALUES (?, ?)`, [sid, body]);
      return saved(sid, body), true;
    }
    if (req.method === 'PUT') {
      const body = await readSave();
      if (body === null) return true;
      // Only ids issued by POST: an unknown id is refused (the client then asks for a new one).
      const [r] = await db.query(`UPDATE \`${TABLE}\` SET data = ? WHERE id = ?`, [body, id]);
      if (!r.affectedRows) return reply(res, 404, { error: 'Unknown player id' }), true;
      return saved(id, body), true;
    }
    if (req.method === 'DELETE') {
      await db.query(`DELETE FROM \`${TABLE}\` WHERE id = ?`, [id]);
      return reply(res, 200, { ok: true }), true;
    }
    return reply(res, 405, { error: 'Method not allowed' }), true;
  } catch (e) {
    console.error('[saves]', e.message);
    return reply(res, e.status || 500, { error: e.status ? e.message : 'Database error' }), true;
  }
}
