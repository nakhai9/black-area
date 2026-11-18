import { dissipate, spread } from './Smoke';
/**
 * Surface-to-air missile of the air-defence vehicle, drawn in code: it leaves its canister in a launch flash and a
 * ground dust cloud, climbs on a lofted arc to the aircraft and leaves a smoke trail that lingers and drifts after it.
 * Patriot and SAMP/T NG fire a slim, fast missile with a thin white trail; S-400 and HQ-9 a heavier one with a thick
 * grey trail and a big boost plume.
 */
export const SAM_TRAIL_SECONDS = 2.5;
const TRAIL_PUFFS = 14;

/** Point on the lofted path at progress t (0..1): straight line raised by an arc `loft` px high. */
function along(x0: number, y0: number, x1: number, y1: number, loft: number, t: number): [number, number] {
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * loft];
}

/**
 * The missile `age` s after launch, flying (x0, y0) → (x1, y1) in iso px for `flight` s; its trail stays
 * SAM_TRAIL_SECONDS longer, fading.
 */
export function drawSamMissile(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, age: number, flight: number, buk: boolean): void {
  const loft = Math.min(28, Math.hypot(x1 - x0, y1 - y0) * (buk ? 0.32 : 0.22));
  const t = Math.min(1, age / flight);
  const f = t * t * (buk ? 0.7 : 0.55) + t * (buk ? 0.3 : 0.45); // speeds up as the motor burns
  ctx.save();
  // Launch: dust thrown up round the vehicle and the boost flash.
  if (age < 0.5) {
    const k = age / 0.5;
    ctx.fillStyle = `rgba(190,180,160,${0.45 * (1 - k)})`;
    ctx.beginPath();
    ctx.ellipse(x0, y0 + 1, (buk ? 5 : 3.5) * (0.6 + k), (buk ? 2.2 : 1.5) * (0.6 + k), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (age < 0.12) {
    const g = ctx.createRadialGradient(x0, y0, 0, x0, y0, buk ? 4 : 3);
    g.addColorStop(0, 'rgba(255,250,220,0.95)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x0, y0, buk ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Smoke trail: puffs along the path flown so far, older ones wider, drifting up and thinning out.
  const r0 = buk ? 0.9 : 0.5;
  for (let i = 0; i < TRAIL_PUFFS; i++) {
    const pt = (f * i) / TRAIL_PUFFS;
    const born = (pt / Math.max(f, 1e-3)) * Math.min(age, flight);
    const old = age - born;
    const [px, py] = along(x0, y0, x1, y1, loft, pt);
    const r = spread(r0, buk ? 2 : 1.4, old);
    const a = (buk ? 0.5 : 0.42) * dissipate(old / SAM_TRAIL_SECONDS);
    if (a <= 0.01) continue;
    ctx.fillStyle = buk ? `rgba(170,168,160,${a})` : `rgba(235,235,232,${a})`;
    ctx.beginPath();
    ctx.arc(px, py - old * 1.5, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (t < 1) {
    // The missile body along its heading, with the motor's flame behind it.
    const [mx, my] = along(x0, y0, x1, y1, loft, f);
    const [nx, ny] = along(x0, y0, x1, y1, loft, Math.min(1, f + 0.02));
    const d = Math.hypot(nx - mx, ny - my) || 1;
    const ux = (nx - mx) / d;
    const uy = (ny - my) / d;
    const len = buk ? 2.6 : 2;
    ctx.strokeStyle = buk ? '#d8d4c4' : '#f2f2ee';
    ctx.lineWidth = buk ? 0.75 : 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx - ux * len, my - uy * len);
    ctx.lineTo(mx, my);
    ctx.stroke();
    const fl = buk ? 2 : 1.5;
    const g = ctx.createRadialGradient(mx - ux * len, my - uy * len, 0, mx - ux * len, my - uy * len, fl);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.4, 'rgba(255,190,70,0.9)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx - ux * len, my - uy * len, fl, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** How long the Dvina's smoke trail stays in the sky after it is laid (s): the whole path stays readable. */
export const DVINA_TRAIL_SECONDS = 3;

/**
 * A homing missile (R-12 Dvina) drawn from its live state. Its flight path stays on screen as a trail of grey smoke
 * puffs (iso px, `born` = the effect's age when laid) that widen, drift up and fade over DVINA_TRAIL_SECONDS. While it flies, the missile itself:
 * a long pale body with a dark nose cone, cruciform fins at the tail and the motor's flame and glow behind.
 */
export function drawHomingMissile(ctx: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, flying: boolean, puffs: readonly { x: number; y: number; born: number }[], age: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Smoke puffs along the path flown, widening and drifting up as they age.
  for (const p of puffs) {
    const old = age - p.born;
    const a = 0.45 * dissipate(old / DVINA_TRAIL_SECONDS);
    if (a <= 0.01) continue;
    ctx.fillStyle = `rgba(178,176,168,${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y - old * 1.2, spread(1, 2, old), 0, Math.PI * 2);
    ctx.fill();
  }
  if (flying) {
    const len = 6; // body length (iso px)
    const px = -uy;
    const py = ux;
    const tx = x - ux * len;
    const ty = y - uy * len;
    // Motor glow and flame behind the tail.
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 3.2);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.35, 'rgba(255,200,80,0.95)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, ty, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,150,0.95)';
    ctx.beginPath();
    ctx.moveTo(tx + px * 0.6, ty + py * 0.6);
    ctx.lineTo(tx - ux * 3.5, ty - uy * 3.5);
    ctx.lineTo(tx - px * 0.6, ty - py * 0.6);
    ctx.closePath();
    ctx.fill();
    // Tail fins.
    ctx.fillStyle = '#5f6650';
    ctx.beginPath();
    ctx.moveTo(tx + ux * 1.6, ty + uy * 1.6);
    ctx.lineTo(tx + px * 1.5, ty + py * 1.5);
    ctx.lineTo(tx - px * 1.5, ty - py * 1.5);
    ctx.closePath();
    ctx.fill();
    // Body: pale with a darker belly line, then the dark nose cone.
    ctx.strokeStyle = '#e4e2d6';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x - ux * 1.4, y - uy * 1.4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90,92,80,0.6)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(tx + px * 0.45, ty + py * 0.45);
    ctx.lineTo(x - ux * 1.4 + px * 0.45, y - uy * 1.4 + py * 0.45);
    ctx.stroke();
    ctx.fillStyle = '#3c4034';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - ux * 1.6 + px * 0.65, y - uy * 1.6 + py * 0.65);
    ctx.lineTo(x - ux * 1.6 - px * 0.65, y - uy * 1.6 - py * 0.65);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
