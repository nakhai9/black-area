/**
 * Cloud saves in MySQL (Aiven): one row per save slot, overwritten on every save.
 *
 *   PUT    /api/saves/:id   body = the save JSON (JSON.stringify(game.exportSave()))  → { ok, bytes, updatedAt }
 *   GET    /api/saves/:id   → the save JSON as stored (404 if none)
 *   DELETE /api/saves/:id   → { ok }
 *
 * :id is the slot key chosen by the client (e.g. a player id), 1–64 chars of [A-Za-z0-9_-].
 * If SAVE_API_KEY is set, every request must send the header `x-api-key: <SAVE_API_KEY>`.
 * The table is created on first use. Config comes from the environment (server/.env).
 */
import fs from 'node:fs';
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

function getPool() {
  pool ??= mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslOptions(),
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 5,
    waitForConnections: true,
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
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
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
  const m = /^\/api\/saves\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return false;
  if (req.method === 'OPTIONS') return reply(res, 204, ''), true;
  if (!savesEnabled()) return reply(res, 503, { error: 'Cloud saves are not configured (DB_HOST missing)' }), true;
  if (process.env.SAVE_API_KEY && req.headers['x-api-key'] !== process.env.SAVE_API_KEY) {
    return reply(res, 401, { error: 'Unauthorized' }), true;
  }
  const id = decodeURIComponent(m[1]);
  if (!ID_RE.test(id)) return reply(res, 400, { error: 'Bad save id' }), true;

  try {
    const db = getPool();
    await ready;
    if (req.method === 'GET') {
      const [rows] = await db.query(`SELECT data FROM \`${TABLE}\` WHERE id = ?`, [id]);
      if (!rows.length) return reply(res, 404, { error: 'No save' }), true;
      return reply(res, 200, rows[0].data), true;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      let save;
      try {
        save = JSON.parse(body);
      } catch {
        return reply(res, 400, { error: 'Body is not JSON' }), true;
      }
      if (save?.format !== 'black-area-save') return reply(res, 400, { error: 'Not a Black Area save' }), true;
      await db.query(
        `INSERT INTO \`${TABLE}\` (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)`,
        [id, body],
      );
      return reply(res, 200, { ok: true, bytes: Buffer.byteLength(body), updatedAt: new Date().toISOString() }), true;
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
