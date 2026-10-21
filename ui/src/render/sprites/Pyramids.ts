import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

type V3 = [number, number, number];

const LIMESTONE = '#cfae72';
const CASING = '#efe4c4';
/** Sun from the upper left: the face towards +v (left on screen) is lit, +u (right) in half shade. */
const LIT = 1.08;
const HALF = 0.82;
const BACK_LEFT = 0.95;
const BACK_RIGHT = 0.7;

/** Soft shadow cast on the ground to the lower right of a pyramid (the ground under it shows through: no plot). */
function shadow(p: IsoPainter, u: number, v: number, w: number, h: number): void {
  const reach = (h / 90) * w * 0.55;
  const apex: V3 = [u + w / 2 + reach, v + w / 2 - reach * 0.2, 0];
  p.polygon([[u + w, v, 0], [u + w, v + w, 0], apex], 'rgba(40, 28, 10, 0.28)', null);
  p.polygon([[u, v + w, 0], [u + w, v + w, 0], apex], 'rgba(40, 28, 10, 0.18)', null);
}

/** Sand drifted against the foot of a pyramid: a low, pale apron a little wider than its base. */
function drift(p: IsoPainter, u: number, v: number, w: number): void {
  const k = Math.max(0.12, w * 0.07);
  p.polygon([[u - k, v - k, 0], [u + w + k, v - k, 0], [u + w + k, v + w + k, 0], [u - k, v + w + k, 0]], 'rgba(216, 182, 115, 0.55)', null);
}

/**
 * A stepped pyramid seen as RA2 would paint it: four faces lit by the sun, horizontal block courses with a darker
 * shadow line under each step, a few missing blocks, a flat worn top (Khufu) or a white casing cap (Khafre).
 */
function pyramid(p: IsoPainter, u: number, v: number, w: number, h: number, opts: { cap?: number; flat?: number; courses?: number } = {}): void {
  const { cap = 0, flat = 0, courses = Math.max(6, Math.round(h / 7)) } = opts;
  const top = h * (1 - flat);
  const apex: V3 = [u + w / 2, v + w / 2, h];
  const at = (bu: number, bv: number, t: number): V3 => [bu + (apex[0] - bu) * t, bv + (apex[1] - bv) * t, h * t];
  const tTop = top / h;
  const corners: V3[] = [[u, v, 0], [u + w, v, 0], [u + w, v + w, 0], [u, v + w, 0]];
  const faces: [number, number, number][] = [
    [0, 1, BACK_LEFT],
    [3, 0, BACK_RIGHT],
    [1, 2, HALF],
    [3, 2, LIT],
  ];
  for (const [a, b, light] of faces) {
    const A = corners[a]!;
    const B = corners[b]!;
    p.polygon([A, B, at(B[0], B[1], tTop), at(A[0], A[1], tTop)], shade(LIMESTONE, light));
  }
  if (flat > 0) {
    // Flat worn summit.
    p.polygon(corners.map((c) => at(c[0], c[1], tTop)), shade(LIMESTONE, 1.12));
  }
  // Block courses on the two faces towards the viewer: a dark seam with a pale ledge just above it.
  const ctx = p.ctx;
  for (let i = 1; i < courses; i++) {
    const t = (i / courses) * tTop;
    for (const [a, b] of [[1, 2], [3, 2]] as const) {
      const A = at(corners[a]![0], corners[a]![1], t);
      const B = at(corners[b]![0], corners[b]![1], t);
      const [x0, y0] = p.project(...A);
      const [x1, y1] = p.project(...B);
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(70, 48, 20, 0.45)';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x0, y0 - 0.8);
      ctx.lineTo(x1, y1 - 0.8);
      ctx.stroke();
    }
  }
  // A few missing blocks (dark notches) along the edges, the same on every run (seeded by position).
  let seed = Math.floor(u * 97 + v * 31 + w * 7);
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let n = 0; n < Math.round(w * 3); n++) {
    const t = (0.1 + rnd() * 0.7) * tTop;
    const s = 0.08 + rnd() * 0.25;
    const [a, b] = rnd() < 0.5 ? [1, 2] : [3, 2];
    const A = at(corners[a]![0], corners[a]![1], t);
    const B = at(corners[b]![0], corners[b]![1], t);
    const P: V3 = [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2]];
    const Q: V3 = [A[0] + (B[0] - A[0]) * (s + 0.05), A[1] + (B[1] - A[1]) * (s + 0.05), A[2]];
    p.polygon([P, Q, [Q[0], Q[1], Q[2] + h / courses], [P[0], P[1], P[2] + h / courses]], 'rgba(60, 40, 15, 0.35)', null);
  }
  if (cap > 0) {
    // The smooth white casing that still covers Khafre's summit.
    const t0 = 1 - cap;
    for (const [a, b, light] of faces) {
      const A = corners[a]!;
      const B = corners[b]!;
      p.polygon([at(A[0], A[1], t0), at(B[0], B[1], t0), apex], shade(CASING, light));
    }
  }
}

/** The Great Sphinx, lying in front of the pyramids looking towards the viewer (+u), on a sunken sand pit. */
function sphinx(p: IsoPainter, u: number, v: number): void {
  const S = '#c9a565';
  p.polygon([[u - 0.15, v - 0.1, 0], [u + 1.5, v - 0.1, 0], [u + 1.5, v + 0.6, 0], [u - 0.15, v + 0.6, 0]], 'rgba(120, 90, 45, 0.22)', null);
  // Lion body, haunch higher at the back, paws stretched forward.
  p.box(u, v + 0.05, 0.95, 0.4, 0, 4, S);
  p.box(u - 0.05, v + 0.02, 0.35, 0.46, 0, 6, shade(S, 0.96));
  p.box(u + 0.95, v + 0.04, 0.45, 0.13, 0, 2, shade(S, 1.04));
  p.box(u + 0.95, v + 0.33, 0.45, 0.13, 0, 2, shade(S, 1.04));
  // Chest and head with the striped nemes headdress.
  p.box(u + 0.7, v + 0.08, 0.3, 0.34, 4, 4, S);
  p.box(u + 0.72, v + 0.06, 0.26, 0.38, 8, 4, shade(S, 0.92));
  p.box(u + 0.82, v + 0.12, 0.2, 0.26, 8.5, 3.5, shade(S, 1.08));
  for (let k = 0; k < 3; k++) p.faceRect('right', u + 0.72, v + 0.06, 0.26, 0.38, 8, 4, 0, 1, 0.15 + k * 0.28, 0.22 + k * 0.28, shade(S, 0.75));
}

/**
 * Pyramids of Giza (neutral monument), with no ground plot of its own (the desert shows between them): the Great
 * Pyramid of Khufu with its flat, worn summit, Khafre still capped with white casing, Menkaure and its three queens'
 * pyramids, and the Sphinx in front — each casting a soft shadow and sitting in a drift of sand.
 */
export const PyramidsArt: BuildingArt = {
  footprint: { w: 6, d: 6 },
  height: 110,

  drawStatic(p) {
    // Footprints never overlap: laid out on a diagonal like the real site (Khufu north-east, Menkaure south-west).
    // [u, v, side, height, kind]: 0 plain, 1 Khafre's casing cap, 2 Khufu's flat summit.
    const all: [number, number, number, number, number][] = [
      [3.5, 0.2, 2.4, 80, 2],
      [0.9, 1.5, 2.2, 74, 1],
      [0.35, 4.3, 1.2, 36, 0],
      [1.9, 4.15, 0.45, 12, 0],
      [1.9, 4.75, 0.45, 12, 0],
      [1.9, 5.35, 0.45, 12, 0],
    ];
    for (const [u, v, w, h] of all) {
      drift(p, u, v, w);
      shadow(p, u, v, w, h);
    }
    // Back to front (smaller u + v of the centre first).
    const order = [...all].sort((x, y) => x[0] + x[1] + x[2] - (y[0] + y[1] + y[2]));
    for (const [u, v, w, h, kind] of order) pyramid(p, u, v, w, h, kind === 1 ? { cap: 0.18 } : kind === 2 ? { flat: 0.05 } : w < 1 ? { courses: 4 } : {});
    sphinx(p, 4.1, 4.5);
  },
};
