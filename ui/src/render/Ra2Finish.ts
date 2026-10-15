/** Fixed pixel hash → [0, 1): the same grain every time a sprite is rebuilt. */
const hash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Red Alert 2 "pre-rendered" finish over a freshly painted sprite: fine surface grain, a touch of desaturation and
 * contrast (RA2's muted, slightly dirty palette) and a dark 1px rim round the silhouette.
 */
export function applyRa2Finish(ctx: CanvasRenderingContext2D, w: number, h: number, rim = true): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = src[i + 3]!;
      if (a < 8) continue;
      let r = src[i]!;
      let g = src[i + 1]!;
      let b = src[i + 2]!;
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      // Desaturate 18 %, then contrast round mid-grey.
      r = lum + (r - lum) * 0.82;
      g = lum + (g - lum) * 0.82;
      b = lum + (b - lum) * 0.82;
      r = (r - 128) * 1.08 + 122;
      g = (g - 128) * 1.08 + 122;
      b = (b - 128) * 1.08 + 120;
      // Two-octave grain, kept faint: strong per-pixel noise made surfaces look rough once shrunk to screen size.
      const n = (hash(x, y) - 0.5) * 5 + (hash(x >> 1, y >> 1) - 0.5) * 5;
      d[i] = r + n;
      d[i + 1] = g + n;
      d[i + 2] = b + n;
      // Rim: an opaque pixel next to a transparent one darkens.
      const edge =
        rim &&
        ((x > 0 && src[i - 1]! < 40) || (x < w - 1 && src[i + 7]! < 40) || (y > 0 && src[i - w * 4 + 3]! < 40) || (y < h - 1 && src[i + w * 4 + 3]! < 40));
      if (edge) {
        d[i] = d[i]! * 0.45;
        d[i + 1] = d[i + 1]! * 0.45;
        d[i + 2] = d[i + 2]! * 0.45;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

