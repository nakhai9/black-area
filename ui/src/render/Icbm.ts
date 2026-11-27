import { drawExplosion, EXPLOSION_SECONDS } from './ExplosionSheet';
import { dissipate, spread } from './Smoke';
import { drawNukeCloud, hasNukeCloud } from './NukeCloudSheet';
import { drawYarsMissile, YARS_HALF_LENGTH } from './YarsSheets';
import type { FactionId } from '../types';

/**
 * RS-24 Yars ICBM and its nuclear burst, drawn in code (iso px).
 * The missile leaves the silo in a big launch flash and dust, climbs on a very high ballistic arc with a thick white
 * smoke trail and dives on its target. The burst: a white flash, a fireball, a shock wave running out across the
 * ground to the blast edge, and a mushroom cloud that rises, spreads and slowly drifts away.
 */
export const ICBM_TRAIL_SECONDS = 4;
const TRAIL_PUFFS = 26;

/**
 * Flight path: one ballistic arc from the silo to the target, `loft` iso px high at its apex (a parabola on screen),
 * the missile always pointing along it. Built once per flight as a dense polyline, walked by distance.
 */
interface IcbmPath {
  pts: [number, number][];
  cum: number[];
  total: number;
}
const paths = new Map<string, IcbmPath>();

function buildPath(x0: number, y0: number, x1: number, y1: number, loft: number): IcbmPath {
  const key = `${x0.toFixed(1)},${y0.toFixed(1)},${x1.toFixed(1)},${y1.toFixed(1)},${loft.toFixed(1)}`;
  const hit = paths.get(key);
  if (hit) return hit;
  // One smooth ballistic arc (a parabola on screen): the nose follows the curve the whole way — climbing out of the
  // silo, pitching over at the apex and diving onto the target — never pointing up while flying sideways.
  const pts: [number, number][] = [];
  const n = Math.max(48, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - 4 * loft * k * (1 - k)]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const path = { pts, cum, total: cum[cum.length - 1] ?? 0 };
  if (paths.size > 32) paths.clear();
  paths.set(key, path);
  return path;
}

/** Point `t` (0..1 of the flight) on the path (see buildPath). */
function along(x0: number, y0: number, x1: number, y1: number, loft: number, t: number): [number, number] {
  const { pts, cum, total } = buildPath(x0, y0, x1, y1, loft);
  const want = Math.max(0, Math.min(1, t)) * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! < want) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi]! - cum[lo]! || 1;
  const k = (want - cum[lo]!) / seg;
  const a = pts[lo]!;
  const b = pts[hi]!;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** The ICBM `age` s after launch, flying (x0, y0) → (x1, y1) for `flight` s; its trail lingers ICBM_TRAIL_SECONDS. */
export function drawIcbm(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, age: number, flight: number, faction: FactionId): void {
  const loft = Math.min(220, 40 + Math.hypot(x1 - x0, y1 - y0) * 0.45);
  const t = Math.min(1, age / flight);
  ctx.save();
  if (age < 1.2) {
    const k = age / 1.2;
    ctx.fillStyle = `rgba(200,190,170,${0.55 * (1 - k)})`;
    ctx.beginPath();
    ctx.ellipse(x0, y0 + 1, 10 * (0.5 + k), 4.5 * (0.5 + k), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (age < 0.3) {
    const g = ctx.createRadialGradient(x0, y0 - 2, 0, x0, y0 - 2, 9);
    g.addColorStop(0, 'rgba(255,250,225,1)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x0, y0 - 2, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < TRAIL_PUFFS; i++) {
    const pt = (t * i) / TRAIL_PUFFS;
    const born = pt * flight;
    const old = age - born;
    const [px, py] = along(x0, y0, x1, y1, loft, pt);
    const a = 0.5 * dissipate(old / ICBM_TRAIL_SECONDS);
    if (a <= 0.01) continue;
    ctx.fillStyle = `rgba(232,232,228,${a})`;
    ctx.beginPath();
    ctx.arc(px, py - old * 1.2, spread(1.4, 3.2, old), 0, Math.PI * 2);
    ctx.fill();
  }
  if (t < 1) {
    const [mx, my] = along(x0, y0, x1, y1, loft, t);
    // Heading from the path just ahead (just behind at the very end, so the falling warhead still points down).
    const [nx, ny] = t > 0.99 ? ((p) => [mx + (mx - p[0]), my + (my - p[1])] as [number, number])(along(x0, y0, x1, y1, loft, t - 0.01)) : along(x0, y0, x1, y1, loft, t + 0.01);
    const d = Math.hypot(nx - mx, ny - my) || 1;
    const ux = (nx - mx) / d;
    const uy = (ny - my) / d;
    // The Yars sprite (yars-missile sheet) with its motor flame; the drawn stick only while the sheet loads.
    const sprite = drawYarsMissile(ctx, mx, my, ux, uy, faction);
    const len = sprite ? YARS_HALF_LENGTH + 1 : 6;
    const fr = sprite ? 5 : 3.5;
    const g = ctx.createRadialGradient(mx - ux * len, my - uy * len, 0, mx - ux * len, my - uy * len, fr);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.4, 'rgba(255,190,70,0.9)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx - ux * len, my - uy * len, fr, 0, Math.PI * 2);
    ctx.fill();
    if (!sprite) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#4f5a44';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(mx - ux * len, my - uy * len);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.strokeStyle = '#d9d9d2';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(mx - ux * 1.6, my - uy * 1.6);
      ctx.lineTo(mx + ux * 0.6, my + uy * 0.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Share of the nuke effect's life the mushroom cloud sheet takes to play through. */
const CLOUD_SHARE = 0.85;

/** Secondary blasts from the explosion sheet ringing the nuclear fireball. */
const NUKE_RING = 10;

/**
 * The nuclear burst at iso (x, y), `age` s after impact, out of `ttl` s; the blast reaches the ellipse rx × ry
 * (iso px: the blast circle on the ground).
 */
export function drawNuke(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, age: number, ttl: number): void {
  const fade = clamp01((ttl - age) / (ttl * 0.4));
  ctx.save();
  // Shock wave running out over the ground with a dust ring behind it.
  if (age < 2.2) {
    const k = age / 2.2;
    const e = 1 - (1 - k) * (1 - k);
    ctx.strokeStyle = `rgba(255,245,225,${0.8 * (1 - k)})`;
    ctx.lineWidth = 2.5 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * e, ry * e, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(170,150,120,${0.5 * (1 - k)})`;
    ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * e * 0.92, ry * e * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Mushroom cloud: a stem rising from the fireball to a spreading cap, lit orange early, grey later, drifting away.
  const rise = 1 - Math.pow(1 - clamp01(age / 7), 2);
  const h = rx * 1.3 * rise;
  const drift = age * 0.6;
  const lit = clamp01(1 - age / 6);
  const grey = (a: number): string => `rgba(${Math.round(120 + 110 * lit)},${Math.round(112 + 60 * lit)},${Math.round(104 + 10 * lit)},${a})`;
  if (age > 0.3 && !hasNukeCloud()) {
    for (let i = 0; i < 10; i++) {
      const f = i / 9;
      const sx = x + drift * f;
      const sy = y - h * f;
      const r = (rx * 0.09 + rx * 0.05 * f) * (0.6 + 0.4 * rise);
      ctx.fillStyle = grey(0.75 * fade);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const cx = x + drift;
    const cy = y - h;
    const cw = rx * (0.22 + 0.38 * rise);
    const ch = cw * 0.55;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.fillStyle = grey(0.8 * fade);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * cw * 0.55, cy + Math.sin(a) * ch * 0.45, ch * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = grey(0.9 * fade);
    ctx.beginPath();
    ctx.ellipse(cx, cy - ch * 0.15, cw * 0.75, ch * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    if (lit > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
      g.addColorStop(0, `rgba(255,200,90,${0.7 * lit})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Fireball from the explosion sheet: a huge central blast, a second one as it rolls up, then a ring of blasts
  // running out with the shock wave over the blast ellipse. Falls back to a drawn fireball until the sheet loads.
  {
    // [delay s, dx (× rx), dy (× ry), size (× rx), variant]; the central three only without the cloud sheet.
    const blasts: [number, number, number, number, number][] = hasNukeCloud()
      ? []
      : [
          [0, 0, 0, 1.1, 0],
          [0.5, 0, -0.35, 0.9, 5],
          [1.0, 0, -0.7, 0.7, 9],
        ];
    for (let i = 0; i < NUKE_RING; i++) {
      const a = (i / NUKE_RING) * Math.PI * 2 + 0.3;
      const d = i % 2 ? 0.75 : 0.45;
      blasts.push([0.15 + d * 1.2 + (i % 3) * 0.1, Math.cos(a) * d, Math.sin(a) * d, 0.35 + (i % 3) * 0.06, i + 2]);
    }
    let drawn = true;
    for (const [delay, dx, dy, size, variant] of blasts) {
      const t = age - delay;
      if (t < 0 || t > EXPLOSION_SECONDS) continue;
      if (!drawExplosion(ctx, x + dx * rx, y + dy * ry, t, size * rx, variant)) drawn = false;
    }
    if (!drawn && age < 4) {
      const k = age / 4;
      const r = rx * (0.12 + 0.25 * Math.sqrt(k));
      const g = ctx.createRadialGradient(x, y - r * 0.5, 0, x, y - r * 0.5, r);
      g.addColorStop(0, `rgba(255,255,240,${1 - k})`);
      g.addColorStop(0.35, `rgba(255,200,80,${0.95 * (1 - k)})`);
      g.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Mushroom cloud from the nuke-cloud sheet: fire column, cap, dark smoke drifting away over CLOUD_SHARE of the effect.
  drawNukeCloud(ctx, x, y, age / (ttl * CLOUD_SHARE), rx * 1.25, fade);
  // The flash.
  if (age < 0.35) {
    const k = age / 0.35;
    const r = rx * 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${1 - k})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
