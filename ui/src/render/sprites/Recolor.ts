import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';

/**
 * A taken structure carries no colour of the nation it was taken from: every pixel in that nation's colours — its
 * team colours and the hues of its architecture's accent colours (DESIGN_HUES) — takes the owner's hue, its own
 * lightness and saturation kept, so the building reads exactly as before, in the new owner's colours. Stone, sand,
 * concrete, steel, glass and shadow (other hues, or hardly any colour) are left as they are.
 */
export function recolorPixels(data: Uint8ClampedArray, owner: FactionId, design?: FactionId): void {
  const hex = (c: string): [number, number] => {
    const n = parseInt(c.slice(1), 16);
    return rgbToHs((n >> 16) & 255, (n >> 8) & 255, n & 255);
  };
  const [th] = hex(FACTIONS[owner].colors.primary);
  const src = design ? [FACTIONS[design].colors.primary, FACTIONS[design].colors.light, FACTIONS[design].colors.dark, ...(DESIGN_HUES[design] ?? [])].map((c) => hex(c)[0]) : [];
  const near = (h: number): boolean => src.length === 0 || src.some((a) => Math.min(Math.abs(h - a), 1 - Math.abs(h - a)) < 0.075);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.06) continue;
    const l = (max + min) / 2;
    const sat = d / (1 - Math.abs(2 * l - 1));
    if (sat < 0.22) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
    if (!near(h)) continue;
    const q = (1 - Math.abs(2 * l - 1)) * sat;
    const hp = th * 6;
    const x = q * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [q, x, 0] : hp < 2 ? [x, q, 0] : hp < 3 ? [0, q, x] : hp < 4 ? [0, x, q] : hp < 5 ? [x, 0, q] : [q, 0, x];
    const m = l - q / 2;
    data[i] = (r1 + m) * 255;
    data[i + 1] = (g1 + m) * 255;
    data[i + 2] = (b1 + m) * 255;
  }
}

/** Accent colours each nation's architecture is painted in besides its team colours (domes, walls, roofs). */
const DESIGN_HUES: Partial<Record<FactionId, readonly string[]>> = {
  islamic: ['#1f8a4c', '#2e9e5a'],
  russia: ['#b0302a', '#c8a040'],
  china: ['#c0302a', '#d8b040'],
};

function rgbToHs(r8: number, g8: number, b8: number): [number, number] {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0];
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return [h, s];
}
