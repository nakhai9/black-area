/**
 * BM-21 Grad 122 mm rocket, drawn in code: it leaves the tube in a flash, climbs on a high ballistic arc with a grey
 * smoke trail and comes down on the target, where a blast goes off (an air burst on an aircraft).
 */
export const GRAD_TRAIL_SECONDS = 0.9;
export const GRAD_BLAST_SECONDS = 0.55;
const PUFFS = 12;

/** Point on the arc at progress t (0..1): straight line raised by a parabola `loft` px high. */
function along(x0: number, y0: number, x1: number, y1: number, loft: number, t: number): [number, number] {
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - 4 * t * (1 - t) * loft];
}

/** The rocket `age` s after launch on its `flight` s arc (x0, y0) → (x1, y1) in iso px; then its blast. */
export function drawGradRocket(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, age: number, flight: number, air: boolean): void {
  const loft = Math.min(46, 8 + Math.hypot(x1 - x0, y1 - y0) * 0.45);
  const t = Math.min(1, age / flight);
  const after = Math.max(0, age - flight);
  ctx.save();
  if (age < 0.1) {
    const g = ctx.createRadialGradient(x0, y0, 0, x0, y0, 3);
    g.addColorStop(0, 'rgba(255,248,220,0.95)');
    g.addColorStop(1, 'rgba(255,130,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x0, y0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Smoke trail along the arc flown so far, older puffs wider and fainter.
  const fade = Math.max(0, 1 - after / GRAD_TRAIL_SECONDS);
  for (let i = 0; i < PUFFS; i++) {
    const pt = (t * i) / PUFFS;
    const old = age - pt * flight;
    const a = 0.38 * fade * Math.max(0, 1 - old / (flight + GRAD_TRAIL_SECONDS));
    if (a <= 0.01) continue;
    const [px, py] = along(x0, y0, x1, y1, loft, pt);
    ctx.fillStyle = `rgba(190,188,182,${a})`;
    ctx.beginPath();
    ctx.arc(px, py - old * 1.2, 0.5 + old * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (t < 1) {
    const [mx, my] = along(x0, y0, x1, y1, loft, t);
    const [nx, ny] = along(x0, y0, x1, y1, loft, Math.min(1, t + 0.02));
    const d = Math.hypot(nx - mx, ny - my) || 1;
    const ux = (nx - mx) / d;
    const uy = (ny - my) / d;
    ctx.strokeStyle = '#4a5030';
    ctx.lineWidth = 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx - ux * 2.2, my - uy * 2.2);
    ctx.lineTo(mx, my);
    ctx.stroke();
    const g = ctx.createRadialGradient(mx - ux * 2.2, my - uy * 2.2, 0, mx - ux * 2.2, my - uy * 2.2, 1.6);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.4, 'rgba(255,180,60,0.9)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx - ux * 2.2, my - uy * 2.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (after < GRAD_BLAST_SECONDS) {
    // Blast: fireball and a smoke ring (smaller, higher burst in the air).
    const k = after / GRAD_BLAST_SECONDS;
    const r = (air ? 2.6 : 4) * (0.5 + k);
    const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, r);
    g.addColorStop(0, `rgba(255,240,200,${1 - k})`);
    g.addColorStop(0.45, `rgba(255,140,40,${0.85 * (1 - k)})`);
    g.addColorStop(1, 'rgba(90,70,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x1, y1, r, 0, Math.PI * 2);
    ctx.fill();
    if (!air) {
      ctx.fillStyle = `rgba(80,74,66,${0.45 * (1 - k)})`;
      ctx.beginPath();
      ctx.ellipse(x1, y1 + 0.5, r * 1.3, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
