/**
 * Surface-to-air missile of the air-defence vehicle, drawn in code: it leaves its canister in a launch flash and a
 * ground dust cloud, climbs on a lofted arc to the aircraft and leaves a smoke trail that lingers and drifts after it.
 * Patriot and SAMP/T NG fire a slim, fast missile with a thin white trail; S-400 and HQ-9 a heavier one with a thick
 * grey trail and a big boost plume.
 */
export const SAM_TRAIL_SECONDS = 1.2;
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
  const after = Math.max(0, age - flight);
  const fade = Math.max(0, 1 - after / SAM_TRAIL_SECONDS);
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
    const r = r0 + old * (buk ? 1.6 : 1.1);
    const a = (buk ? 0.5 : 0.42) * fade * Math.max(0, 1 - old / (flight + SAM_TRAIL_SECONDS));
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
