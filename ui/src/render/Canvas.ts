/** Creates an offscreen canvas and its 2D context. */
export function createCanvas(
  width: number,
  height: number,
  options?: CanvasRenderingContext2DSettings,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return { canvas, ctx: get2d(canvas, options) };
}

export function get2d(canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new Error('Canvas 2D context is not available');
  return ctx;
}

/** Five-point (or n-point) star path, centred at (cx, cy). */
export function starPath(
  ctx: CanvasRenderingContext2D | Path2D,
  cx: number,
  cy: number,
  outer: number,
  inner = outer * 0.42,
  points = 5,
  rotation = -Math.PI / 2,
): void {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Arched doorway path in a y-up local space (see IsoPainter.faceTransform):
 * base centred at (x, 0), total height h including the semicircular top.
 */
export function archPath(ctx: CanvasRenderingContext2D, x: number, w: number, h: number): void {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x - r, 0);
  ctx.lineTo(x - r, h - r);
  ctx.arc(x, h - r, r, Math.PI, 0, true);
  ctx.lineTo(x + r, 0);
  ctx.closePath();
}
