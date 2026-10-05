import { clamp } from '../core/MathUtils';

export type RGB = readonly [number, number, number];

const rgbCache = new Map<string, RGB>();

/** Parses `#rrggbb` or `rgb(r,g,b)` (cached), so shaded colours can be shaded again. */
export function hexToRgb(color: string): RGB {
  let c = rgbCache.get(color);
  if (!c) {
    if (color.startsWith('rgb')) {
      const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
      c = [r, g, b];
    } else {
      const n = parseInt(color.slice(1), 16);
      c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    rgbCache.set(color, c);
  }
  return c;
}

const ch = (v: number): number => clamp(Math.round(v), 0, 255);

export const rgbString = (c: RGB, factor = 1): string =>
  `rgb(${ch(c[0] * factor)},${ch(c[1] * factor)},${ch(c[2] * factor)})`;

/** Multiplies a hex colour's brightness (factor < 1 darkens, > 1 brightens). */
export const shade = (hex: string, factor: number): string => rgbString(hexToRgb(hex), factor);

export const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
