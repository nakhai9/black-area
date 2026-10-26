/** Fixed pixel hash → [0, 1): the same grain every time a sprite is rebuilt. */
const hash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise in [0, 1) with features about `cell` px across (bilinear between hashed corners). */
const smooth = (x: number, y: number, cell: number, seed: number): number => {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0 + seed, y0);
  const b = hash(x0 + 1 + seed, y0);
  const c = hash(x0 + seed, y0 + 1);
  const e = hash(x0 + 1 + seed, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
};

/**
 * Red Alert 2 "pre-rendered" finish over a freshly painted sprite: fine surface grain, a touch of desaturation and
 * contrast (RA2's muted, slightly dirty palette) and a dark 1px rim round the silhouette — plus weathering, so the
 * blocks read as real, aged material rather than flat paint:
 *  - patchy weathering: broad, soft stains (damp and dust) that vary the tone of every large face;
 *  - rain streaks: thin dark runs down the walls, strongest under the roof line and fading downwards;
 *  - grime at the foot: the lowest few px of every column (where the walls meet the ground) darken and warm up;
 *  - sky light: the top edge of the silhouette (roof ridges, parapets) catches a pale highlight.
 */
export function applyRa2Finish(ctx: CanvasRenderingContext2D, w: number, h: number, rim = true): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  // Per column: the top and the foot of the opaque silhouette (rain runs from the one, grime gathers at the other).
  const top = new Int32Array(w).fill(-1);
  const foot = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (src[(y * w + x) * 4 + 3]! < 8) continue;
      if (top[x] === -1) top[x] = y;
      foot[x] = y;
    }
  }
  // Sizes in sprite px (sprites are rasterised at 2× art size): scale with the sprite so small pieces get small marks.
  const span = Math.max(24, Math.min(w, h));
  const stainCell = Math.max(10, span * 0.18);
  const grimeBand = Math.max(4, Math.min(14, span * 0.06));
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
      // Patchy weathering: soft darker / lighter stains, damp ones a little green-grey, dusty ones a little warm.
      const stain = smooth(x, y, stainCell, 17) * 0.65 + smooth(x, y, stainCell * 0.4, 91) * 0.35 - 0.5;
      const tone = 1 + stain * 0.16;
      r *= tone;
      g *= tone;
      b *= tone;
      if (stain < -0.12) {
        g += 2;
        b -= 1;
      } else if (stain > 0.14) {
        r += 3;
        g += 1;
        b -= 3;
      }
      // Rain streaks: some columns carry a thin dark run from the top of the silhouette, fading as it goes down.
      const t = top[x]!;
      const f = foot[x]!;
      if (t >= 0 && f > t) {
        const run = hash(x, 7) < 0.22 ? 0.5 + hash(x, 13) * 0.5 : 0;
        if (run > 0) {
          const along = (y - t) / (f - t);
          const fade = Math.max(0, 1 - along / (0.35 + hash(x, 29) * 0.55));
          const k = 1 - run * fade * 0.13;
          r *= k;
          g *= k;
          b *= k;
        }
        // Grime at the foot: darker and browner in the last few px above the ground line.
        const up = f - y;
        if (up < grimeBand) {
          const s = 1 - up / grimeBand;
          const k = 1 - s * 0.22;
          r = r * k + s * 6;
          g = g * k + s * 3;
          b *= k;
        }
      }
      // Two-octave grain, kept faint: strong per-pixel noise made surfaces look rough once shrunk to screen size.
      const n = (hash(x, y) - 0.5) * 5 + (hash(x >> 1, y >> 1) - 0.5) * 5;
      d[i] = r + n;
      d[i + 1] = g + n;
      d[i + 2] = b + n;
      // Sky light: a pixel whose upper neighbour is empty (roof ridges, parapets, chimney tops) catches a pale glint.
      const skyEdge = y > 0 && src[i - w * 4 + 3]! < 40;
      if (skyEdge) {
        d[i] = d[i]! * 0.85 + 255 * 0.15;
        d[i + 1] = d[i + 1]! * 0.85 + 252 * 0.15;
        d[i + 2] = d[i + 2]! * 0.85 + 240 * 0.15;
      }
      // Rim: an opaque pixel next to a transparent one (sideways or below) darkens.
      const edge =
        rim && !skyEdge &&
        ((x > 0 && src[i - 1]! < 40) || (x < w - 1 && src[i + 7]! < 40) || (y < h - 1 && src[i + w * 4 + 3]! < 40));
      if (edge) {
        d[i] = d[i]! * 0.45;
        d[i + 1] = d[i + 1]! * 0.45;
        d[i + 2] = d[i + 2]! * 0.45;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
