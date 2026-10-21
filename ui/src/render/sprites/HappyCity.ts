import { ISLAMIC_GREEN_DOME } from './IslamicPalette';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { drawMosque } from './GrandMosque';
import { facade, parapet, RA2, roofClutter } from './Ra2Kit';

/**
 * Happy City (8×8 tiles), one per nation, each laid out the way that part of the world builds its cities:
 *  - USA: a street grid, a glass-and-steel downtown round an Art Deco skyscraper, low suburban houses on lawns round it.
 *  - Russia: a wide avenue and a great paved square with a metro entrance, a Stalinist "Seven Sisters" tower,
 *    Khrushchyovka panel blocks and an Orthodox church with onion domes.
 *  - China: a symmetrical north–south axis through a paifang gate, siheyuan courtyard houses with curved roofs on both
 *    sides, and super-tall towers (Oriental Pearl, Shanghai Tower) behind, with trees along the axis.
 *  - Europe: boulevards meeting at a paved central square with a fountain and café umbrellas, a Gothic cathedral on
 *    it, and stone Haussmann blocks of even height with slate mansard roofs.
 *  - Islamic world: a medina of inward-looking courtyard houses (riads with a garden and fountain, latticed
 *    mashrabiya windows) round a domed mosque with minarets, and one Gulf super-tower rising behind.
 * Everything is drawn back to front; the nation's flag flies from the tallest building; a few windows light up.
 */

const N = 8;
/** Street level (px): everything stands on the base slab. */
const G = 2;
const ASPHALT = RA2.asphalt;
const LIT = 'rgba(255,238,160,0.95)';

/** One thing standing in the city, drawn back to front by `key` (u + v of its front corner). */
interface Piece {
  key: number;
  draw: (p: IsoPainter) => void;
}

/** A city plan: ground surfaces, the buildings, where the flag flies and which landmark face lights up. */
interface CityPlan {
  ground: (p: IsoPainter) => void;
  pieces: Piece[];
  /** Pole foot of the flag (u, v, z) and the pole's height. */
  flag: readonly [number, number, number, number];
  /** Landmark face whose windows light up at night (u, v, w, d, z, h). */
  lit: readonly [number, number, number, number, number, number];
}

// ---------------------------------------------------------------- shared pieces

/** Office / housing block with a window grid on both visible faces and a dark street-level band. */
function block(p: IsoPainter, u: number, v: number, w: number, d: number, h: number, color: string, floors: number, z = G, lit = 0.12): void {
  p.box(u, v, w, d, z, h, color);
  const seed = Math.round((u * 31 + v * 17 + z) * 10);
  const band = shade(color, 0.78);
  facade(p, 'left', u, v, w, d, z, h, { cols: Math.max(3, Math.round(w * 6)), floors, bandColor: band, frame: shade(color, 1.12), seed, lit });
  facade(p, 'right', u, v, w, d, z, h, { cols: Math.max(3, Math.round(d * 6)), floors, bandColor: band, frame: shade(color, 1.12), seed: seed + 1, lit: lit + 0.04 });
  if (z <= G) {
    p.faceRect('left', u, v, w, d, z, h, 0, 1, 0, Math.min(0.12, 6 / h), shade(color, 0.55));
    p.faceRect('right', u, v, w, d, z, h, 0, 1, 0, Math.min(0.12, 6 / h), shade(color, 0.6));
  }
}

/** Flat roof finish: tar deck, parapet and rooftop plant. */
function flatRoof(p: IsoPainter, u: number, v: number, w: number, d: number, top: number, color: string, seed: number): void {
  p.topRect(u + 0.04, v + 0.04, u + w - 0.04, v + d - 0.04, top, RA2.roof);
  parapet(p, u, v, w, d, top, shade(color, 0.92), 0.06, 2);
  roofClutter(p, u + 0.05, v + 0.05, w - 0.1, d - 0.1, top, seed);
}

/** Round-crowned street tree. */
function tree(p: IsoPainter, u: number, v: number, r = 0.18, color = '#4f8a3a'): void {
  p.cylinder(u, v, r * 0.18, G, 5, '#6b4a2e', 4);
  p.dome(u, v, r, G + 4, r * 40, color);
}

/** Flat top surface of the city floor (streets, squares, lawns), just above the base slab. */
function floor(p: IsoPainter, u0: number, v0: number, u1: number, v1: number, color: string): void {
  p.topRect(u0, v0, u1, v1, G + 0.05, color, null);
}

/** Red five-pointed star centred at screen point (x, y). */
function star(p: IsoPainter, x: number, y: number, r: number, color: string): void {
  p.ctx.fillStyle = color;
  p.ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const k = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    p.ctx.lineTo(x + k * Math.cos(a), y + k * Math.sin(a));
  }
  p.ctx.fill();
}

/** Adds a piece keyed by its front corner (u + w + v + d), so it is drawn after everything behind it. */
function put(pieces: Piece[], u: number, v: number, w: number, d: number, draw: (p: IsoPainter) => void): void {
  pieces.push({ key: u + w + v + d, draw });
}

/** Deterministic random numbers per nation. */
function seeded(faction: FactionId): () => number {
  let seed = faction.length * 97 + faction.charCodeAt(0);
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

// ---------------------------------------------------------------- USA: grid, downtown, suburbs

function usaPlan(team: string, rnd: () => number): CityPlan {
  const pieces: Piece[] = [];
  const LOT = 2;
  const STREET = 0.14;
  const inner = (i: number): [number, number] => [i * LOT + STREET, (i + 1) * LOT - STREET];
  const downtown = (i: number, j: number): boolean => i >= 1 && i <= 2 && j >= 1 && j <= 2;
  const GLASS = ['#4e6a86', '#5d7a8f', '#3f5670', '#6c7f8e', '#7a8794'];
  const HOUSES = ['#e6dccb', '#c9d6dc', '#e8d3b0', '#d8c2c2', '#cfd9c4'];
  const ROOFS = ['#6a4a3a', '#4f5864', '#7a3f32', '#5a5048'];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const [u0, u1] = inner(i);
      const [v0, v1] = inner(j);
      if (i === 1 && j === 1) {
        // Art Deco landmark (Empire State style): stepped setbacks, crown and a mast.
        put(pieces, u0, v0, u1 - u0, v1 - v0, (p) => {
          const c = '#cbc3aa';
          block(p, u0 + 0.1, v0 + 0.1, 1.5, 1.5, 84, c, 15);
          block(p, u0 + 0.3, v0 + 0.3, 1.1, 1.1, 56, shade(c, 1.04), 10, G + 84);
          block(p, u0 + 0.5, v0 + 0.5, 0.7, 0.7, 34, shade(c, 1.08), 6, G + 140);
          p.box(u0 + 0.6, v0 + 0.6, 0.5, 0.5, G + 174, 8, shade(c, 1.12));
          p.faceRect('left', u0 + 0.1, v0 + 0.1, 1.5, 1.5, G, 84, 0, 1, 0.95, 1, team);
          p.pyramid(u0 + 0.65, v0 + 0.65, 0.4, 0.4, G + 182, 10, '#d9d4c4');
        });
        continue;
      }
      if (downtown(i, j)) {
        // Glass and steel towers, two to a block.
        for (const half of [0, 1]) {
          const u = u0 + 0.05;
          const v = v0 + 0.05 + half * 0.88;
          const w = u1 - u0 - 0.1;
          const d = 0.78;
          // Kept well under the Art Deco tower, so it stays the skyline's landmark.
          const h = 44 + rnd() * 40;
          const color = GLASS[Math.floor(rnd() * GLASS.length)]!;
          put(pieces, u, v, w, d, (p) => {
            block(p, u, v, w, d, h, color, Math.round(h / 6), G, 0.2);
            flatRoof(p, u, v, w, d, G + h, color, Math.round(u * 13 + v * 7));
            p.faceRect('left', u, v, w, d, G, h, 0, 1, 0.975, 1, shade(team, 0.85));
          });
        }
        continue;
      }
      // Suburbs: four houses with pitched roofs, lawns and a tree.
      for (const [du, dv] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const u = u0 + du * 0.88 + 0.12;
        const v = v0 + dv * 0.88 + 0.14;
        const color = HOUSES[Math.floor(rnd() * HOUSES.length)]!;
        const roof = ROOFS[Math.floor(rnd() * ROOFS.length)]!;
        put(pieces, u, v, 0.55, 0.5, (p) => {
          p.box(u, v, 0.55, 0.5, G, 7, color);
          p.windows('left', u, v, 0.55, 0.5, G, 7, 2, 1, '#4c5d72', 0.3, 0.5);
          p.gableRoofV(u - 0.03, v - 0.03, 0.61, 0.56, G + 7, 6, color, roof);
        });
        put(pieces, u + 0.62, v + 0.55, 0.1, 0.1, (p) => tree(p, u + 0.66, v + 0.6, 0.12));
      }
    }
  }
  return {
    ground(p) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const [u0, u1] = inner(i);
          const [v0, v1] = inner(j);
          floor(p, u0, v0, u1, v1, downtown(i, j) ? '#8f8c84' : '#6f9a4e');
        }
      }
      // Lane markings down the middle of every street.
      for (let k = 1; k < 4; k++) {
        floor(p, k * LOT - 0.012, 0, k * LOT + 0.012, N, '#d8cf8a');
        floor(p, 0, k * LOT - 0.012, N, k * LOT + 0.012, '#d8cf8a');
      }
    },
    pieces,
    flag: [2.99, 2.99, G + 192, 14],
    lit: [2.24, 2.24, 1.5, 1.5, G, 84],
  };
}

// ---------------------------------------------------------------- Russia: avenue, square, Seven Sisters, panel blocks

function russiaPlan(): CityPlan {
  const pieces: Piece[] = [];
  const STALIN = '#e6dac0';
  // Khrushchyovka: long five-storey prefab slab, panel joints, flat roof.
  const slab = (u: number, v: number, w: number, d: number, color: string): void =>
    put(pieces, u, v, w, d, (p) => {
      const h = 26;
      block(p, u, v, w, d, h, color, 5, G, 0.1);
      for (let k = 1; k < 4; k++) p.faceRect('left', u, v, w, d, G, h, k / 4 - 0.004, k / 4 + 0.004, 0.12, 1, shade(color, 0.7));
      flatRoof(p, u, v, w, d, G + h, color, Math.round(u * 11 + v * 5));
    });
  // Back row: panel blocks either side of the Seven Sisters tower.
  slab(0.15, 0.2, 2.1, 1.5, '#b9b4a6');
  slab(0.15, 2.0, 2.1, 1.6, '#c8b9a0');
  slab(5.75, 0.2, 2.1, 1.5, '#a9aeb2');
  slab(5.75, 2.0, 2.1, 1.6, '#bdb39b');
  // Seven Sisters (Moscow State University style): wings, stepped tower, golden spire and red star.
  put(pieces, 2.55, 0.5, 2.9, 3.1, (p) => {
    block(p, 2.55, 0.9, 2.9, 2.4, 34, STALIN, 6);
    block(p, 3.15, 1.2, 1.7, 1.6, 46, '#ece1c9', 8, G + 34);
    block(p, 3.5, 1.5, 1.0, 1.0, 30, '#f1e7d0', 5, G + 80);
    p.box(3.45, 1.45, 1.1, 1.1, G + 110, 3, '#f6efdc');
    p.pyramid(3.6, 1.6, 0.8, 0.8, G + 113, 30, '#d9b45a');
    p.pole(4.0, 2.0, G + 143, 12, '#e8c45a');
    const [x, y] = p.project(4.0, 2.0, G + 160);
    star(p, x, y, 5, '#d42a1e');
  });
  // Front left: an Orthodox church (white walls, green roof, onion domes) and a pastel townhouse.
  put(pieces, 0.3, 5.0, 1.8, 1.5, (p) => {
    const u = 0.3, v = 5.0, w = 1.8, d = 1.5;
    p.box(u, v, w, d, G, 16, '#f3eee2');
    p.windows('left', u, v, w, d, G, 16, 4, 1, '#5a6f8a', 0.2, 0.55);
    p.windows('right', u, v, w, d, G, 16, 3, 1, '#5a6f8a', 0.2, 0.55);
    p.box(u, v, w, d, G + 16, 2, '#4f7a5a');
    const cu = u + w / 2;
    const cv = v + d / 2;
    for (const [du, dv, bulb, stripe] of [[-0.5, -0.45, '#3f6fb0', '#f3eee2'], [0.5, -0.45, '#2f7a4f', '#e2b23a'], [-0.5, 0.45, '#d23b2b', '#f2d36b'], [0.5, 0.45, '#3f6fb0', '#e2b23a']] as const) {
      const du2 = cu + du * w * 0.5;
      const dv2 = cv + dv * d * 0.55;
      p.cylinder(du2, dv2, 0.13, G + 18, 8, '#f1ead8', 6);
      p.onion(du2, dv2, 0.17, G + 26, 16, bulb, stripe);
      p.pole(du2, dv2, G + 42, 5, '#e8c45a');
    }
    p.cylinder(cu, cv, 0.22, G + 18, 16, '#f1ead8', 6);
    p.onion(cu, cv, 0.28, G + 34, 26, '#e2b23a');
    p.pole(cu, cv, G + 60, 7, '#e8c45a');
  });
  put(pieces, 0.3, 6.8, 1.8, 1.05, (p) => {
    block(p, 0.3, 6.8, 1.8, 1.05, 20, '#c9a99a', 4);
    p.box(0.27, 6.77, 1.86, 1.11, G + 20, 1.5, '#f6f1e4');
    p.hipRoof(0.3, 6.8, 1.8, 1.05, G + 21.5, 5, 0.04, '#4f7a5a');
  });
  // Front right: more panel blocks along the square.
  slab(5.9, 5.0, 1.95, 1.3, '#b4b8b0');
  slab(5.9, 6.55, 1.95, 1.3, '#c2b29a');
  // Metro entrance on the square: a small pavilion with the red "M".
  put(pieces, 3.6, 6.3, 0.8, 0.5, (p) => {
    p.box(3.6, 6.3, 0.8, 0.5, G, 7, '#e8e2d2');
    p.faceRect('left', 3.6, 6.3, 0.8, 0.5, G, 7, 0.3, 0.7, 0, 0.75, '#3a3a40');
    p.box(3.55, 6.25, 0.9, 0.6, G + 7, 1.5, '#d8d0bc');
    p.pole(4.0, 6.55, G + 8.5, 8, '#9a9a9a');
    const [x, y] = p.project(4.0, 6.55, G + 20);
    p.ctx.fillStyle = '#d42a1e';
    p.ctx.font = 'bold 9px sans-serif';
    p.ctx.textAlign = 'center';
    p.ctx.fillText('M', x, y);
  });
  for (const u of [2.6, 5.4]) for (const v of [5.2, 6.4, 7.6]) put(pieces, u, v, 0, 0, (p) => tree(p, u, v, 0.16, '#4b7d3a'));
  return {
    ground(p) {
      floor(p, 0, 4.1, N, 4.9, '#55585e'); // the avenue
      for (let k = 0; k < 8; k++) floor(p, k + 0.2, 4.48, k + 0.7, 4.52, '#e2e2da');
      floor(p, 2.4, 4.95, 5.6, 7.95, '#b8a68c'); // the great square
      floor(p, 3.9, 4.95, 4.1, 7.95, '#c8b89c');
    },
    pieces,
    flag: [4.0, 2.0, G + 143, 0],
    lit: [2.55, 0.9, 2.9, 2.4, G, 34],
  };
}

// ---------------------------------------------------------------- China: axis, courtyards, super-tall towers

function chinaPlan(team: string): CityPlan {
  const pieces: Piece[] = [];
  const GREY = '#8d9096';
  const TILE = '#6b7784';
  const RED = '#a8322a';
  // Siheyuan: four low wings round a courtyard, curved grey-tile roofs, red doors.
  const siheyuan = (u: number, v: number, w: number, d: number): void => {
    const t = 0.32;
    const wing = (wu: number, wv: number, ww: number, wd: number): void =>
      put(pieces, wu, wv, ww, wd, (p) => {
        p.box(wu, wv, ww, wd, G, 10, GREY);
        p.faceRect('left', wu, wv, ww, wd, G, 10, 0.42, 0.58, 0, 0.7, RED);
        p.faceRect('left', wu, wv, ww, wd, G, 10, 0, 1, 0.8, 0.88, RED);
        p.hipRoof(wu, wv, ww, wd, G + 10, 7, 0.08, TILE, 3);
      });
    put(pieces, u, v, w, d, (p) => {
      floor(p, u + t, v + t, u + w - t, v + d - t, '#c9bfa8');
      tree(p, u + w / 2, v + d / 2, 0.16, '#5a8a3c');
    });
    wing(u, v, w, t);
    wing(u, v + t, t, d - 2 * t);
    wing(u + w - t, v + t, t, d - 2 * t);
    wing(u, v + d - t, w, t);
  };
  // Courtyards on both sides of the axis, mirror-symmetric.
  for (const v of [3.6, 5.8]) {
    siheyuan(0.4, v, 2.9, 2.0);
    siheyuan(4.7, v, 2.9, 2.0);
  }
  // Oriental Pearl tower (back left).
  put(pieces, 0.4, 0.4, 2.7, 2.7, (p) => {
    p.box(0.4, 0.4, 2.7, 2.7, G, 6, '#d9d2c4');
    for (const [du, dv] of [[0.5, 2.2], [2.2, 0.5], [2.2, 2.2]] as const) p.cylinder(0.4 + du, 0.4 + dv, 0.12, G + 6, 34, '#d8d8d8');
    p.cylinder(1.75, 1.75, 0.14, G + 6, 150, '#e1e1e1');
    p.dome(1.75, 1.75, 0.62, G + 44, 26, team);
    p.dome(1.75, 1.75, 0.4, G + 112, 18, team);
    p.dome(1.75, 1.75, 0.18, G + 150, 9, team);
    p.pole(1.75, 1.75, G + 158, 24, '#e8e8e8');
  });
  // Shanghai Tower style (back right): a glass tower narrowing as it twists upward.
  put(pieces, 4.9, 0.5, 2.6, 2.6, (p) => {
    p.box(4.9, 0.5, 2.6, 2.6, G, 6, '#cfd6dc');
    let z = G + 6;
    for (let k = 0; k < 9; k++) {
      const r = 0.95 - k * 0.07;
      const h = 21;
      const c = shade('#7f9cb4', 0.9 + (k % 2) * 0.12);
      p.cylinder(6.2, 1.8, r, z, h, c, 12);
      p.cylinder(6.2, 1.8, r + 0.02, z + h - 1.2, 1.2, '#e6edf2', 12);
      z += h;
    }
    p.cylinder(6.2, 1.8, 0.28, z, 8, '#e6edf2', 10);
  });
  // Trees lining the axis, and the paifang gate at its front end.
  for (let v = 3.7; v < 7.4; v += 0.9) for (const u of [3.55, 4.45]) put(pieces, u, v, 0, 0, (p) => tree(p, u, v, 0.15, '#4f8a3a'));
  put(pieces, 3.3, 7.4, 1.4, 0.2, (p) => {
    for (const u of [3.35, 3.85, 4.4]) p.box(u, 7.45, 0.12, 0.12, G, 18, RED);
    p.box(3.3, 7.42, 1.4, 0.18, G + 18, 3, '#d4a23a');
    p.hipRoof(3.25, 7.38, 1.5, 0.26, G + 21, 5, 0.06, '#2f6b5a', 2);
  });
  return {
    ground(p) {
      floor(p, 3.3, 0, 4.7, N, '#cfc4ad'); // the north–south axis
      floor(p, 3.9, 0, 4.1, N, '#b8463a');
      floor(p, 0, 3.2, N, 3.45, '#55585e');
    },
    pieces,
    flag: [6.2, 1.8, G + 6 + 9 * 21 + 8, 16],
    lit: [4.9, 0.5, 2.6, 2.6, G, 6],
  };
}

// ---------------------------------------------------------------- Europe: boulevards, square, cathedral, Haussmann

function europePlan(team: string, rnd: () => number): CityPlan {
  const pieces: Piece[] = [];
  const STONE = ['#d8cdb3', '#cfc3a6', '#e0d6bf', '#c9bc9c'];
  const SLATE = '#56606c';
  // Haussmann block: cream stone, 6 floors of even height, balcony line, slate mansard with dormers.
  const haussmann = (u: number, v: number, w: number, d: number): void => {
    const color = STONE[Math.floor(rnd() * STONE.length)]!;
    const h = 28;
    put(pieces, u, v, w, d, (p) => {
      block(p, u, v, w, d, h, color, 6, G, 0.08);
      p.faceRect('left', u, v, w, d, G, h, 0, 1, 0.62, 0.65, '#3a3a3a');
      p.faceRect('right', u, v, w, d, G, h, 0, 1, 0.62, 0.65, '#3a3a3a');
      p.box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, G + h, 1.5, shade(color, 1.08));
      p.hipRoof(u + 0.02, v + 0.02, w - 0.04, d - 0.04, G + h + 1.5, 8, 0, SLATE);
      const n = Math.max(2, Math.round(w / 0.45));
      for (let k = 0; k < n; k++) p.box(u + 0.12 + (k * (w - 0.34)) / Math.max(1, n - 1), v + d - 0.2, 0.1, 0.08, G + h + 2, 4, shade(color, 1.05));
    });
  };
  // Four quarters round the square, split by the boulevards.
  for (const [u0, u1] of [[0.15, 3.4], [4.6, 7.85]] as const) {
    for (const [v0, v1] of [[0.15, 3.4], [4.6, 7.85]] as const) {
      if (v0 < 1 && u0 > 4) continue; // the cathedral stands here
      const mu = (u0 + u1) / 2;
      const mv = (v0 + v1) / 2;
      haussmann(u0, v0, mu - u0 - 0.06, mv - v0 - 0.06);
      haussmann(mu + 0.06, v0, u1 - mu - 0.06, mv - v0 - 0.06);
      haussmann(u0, mv + 0.06, mu - u0 - 0.06, v1 - mv - 0.06);
      haussmann(mu + 0.06, mv + 0.06, u1 - mu - 0.06, v1 - mv - 0.06);
    }
  }
  haussmann(6.75, 0.2, 1.1, 3.15);
  // Gothic cathedral (back right quarter, facing the square): nave, buttresses, twin west towers with spires.
  put(pieces, 4.7, 0.2, 3.0, 3.2, (p) => {
    const c = '#d4c8a8';
    p.box(4.9, 0.3, 1.5, 2.4, G, 34, c);
    p.windows('right', 4.9, 0.3, 1.5, 2.4, G, 34, 5, 1, '#5a6f8a', 0.25, 0.7);
    p.gableRoofV(4.9, 0.3, 1.5, 2.4, G + 34, 18, c, SLATE);
    for (let k = 0; k < 5; k++) p.box(6.42, 0.45 + k * 0.48, 0.12, 0.12, G, 26, shade(c, 0.9));
    for (const u of [4.85, 5.85]) {
      p.box(u, 2.6, 0.6, 0.6, G, 62, c);
      p.windows('left', u, 2.6, 0.6, 0.6, G, 62, 1, 4, '#4a5a6e', 0.3, 0.55);
      p.pyramid(u + 0.05, 2.65, 0.5, 0.5, G + 62, 34, SLATE);
    }
    p.faceTransform('left', 5.45, 3.2, G + 30, (ctx) => {
      ctx.fillStyle = '#7a4a8c';
      ctx.beginPath();
      ctx.arc(0.2 * 16, 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a2a';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
  });
  // The square: a fountain in the middle and café umbrellas round it.
  put(pieces, 3.6, 3.6, 0.8, 0.8, (p) => {
    p.cylinder(4, 4, 0.42, G, 2.5, '#cfc6b0', 14);
    p.cylinder(4, 4, 0.36, G + 2.5, 0.3, '#6fa3c8', 14);
    p.cylinder(4, 4, 0.08, G + 2.5, 8, '#cfc6b0', 8);
    p.dome(4, 4, 0.12, G + 10, 3, '#9cc6e0');
  });
  for (const [u, v, c] of [[3.0, 4.7, '#c8302a'], [4.8, 3.0, team], [4.95, 4.8, '#2f6fae'], [3.1, 3.15, '#e8b13c']] as const) {
    put(pieces, u, v, 0.1, 0.1, (p) => {
      p.pole(u, v, G, 5, '#ddd');
      p.dome(u, v, 0.2, G + 5, 3, c);
    });
  }
  return {
    ground(p) {
      floor(p, 3.45, 0, 4.55, N, '#6a6d72');
      floor(p, 0, 3.45, N, 4.55, '#6a6d72');
      floor(p, 2.8, 2.8, 5.2, 5.2, '#b3a58f'); // cobbled square
    },
    pieces,
    flag: [6.15, 2.9, G + 96, 14],
    lit: [4.9, 0.3, 1.5, 2.4, G, 34],
  };
}

// ---------------------------------------------------------------- Islamic world: medina, riads, mosque, Gulf tower

function islamicPlan(rnd: () => number): CityPlan {
  const pieces: Piece[] = [];
  const SAND = ['#cdb894', '#c2a77c', '#d6c3a0', '#b89c72'];
  // Riad: plain outer walls with latticed mashrabiya windows; inside, a courtyard garden with a fountain.
  const riad = (u: number, v: number, w: number, d: number): void => {
    const color = SAND[Math.floor(rnd() * SAND.length)]!;
    const h = 12 + Math.floor(rnd() * 3) * 4;
    const t = Math.min(w, d) * 0.3;
    put(pieces, u, v, w, d, (p) => {
      // Back and left wings first, the courtyard, then the right and front wings.
      p.box(u, v, w, t, G, h, color);
      p.box(u, v + t, t, d - 2 * t, G, h, color);
      floor(p, u + t, v + t, u + w - t, v + d - t, '#5f8f46');
      p.cylinder(u + w / 2, v + d / 2, 0.1, G, 2, '#3f8fb0', 8);
      p.box(u + w - t, v + t, t, d - 2 * t, G, h, color);
      p.box(u, v + d - t, w, t, G, h, color);
      for (const face of ['left', 'right'] as const) {
        const [bw, bd] = face === 'left' ? [w, t] : [t, d];
        const [bu, bv] = face === 'left' ? [u, v + d - t] : [u + w - t, v];
        p.faceRect(face, bu, bv, bw, bd, G, h, 0.3, 0.55, 0.45, 0.8, '#6a4a2e');
        p.faceRect(face, bu, bv, bw, bd, G, h, 0.34, 0.51, 0.5, 0.75, '#8a6a46');
        p.faceRect(face, bu, bv, bw, bd, G, h, 0.42, 0.43, 0.5, 0.75, '#5a3a20');
      }
      for (const [bu, bv, bw, bd] of [[u, v, w, t], [u, v + d - t, w, t], [u, v + t, t, d - 2 * t], [u + w - t, v + t, t, d - 2 * t]] as const) {
        parapet(p, bu, bv, bw, bd, G + h, shade(color, 1.05), 0.04, 1.5);
      }
    });
  };
  // Medina: riads packed edge to edge with narrow alleys, round the mosque.
  const lots: [number, number, number, number][] = [
    [0.1, 3.7, 1.9, 1.9], [2.1, 3.7, 1.8, 1.9], [4.1, 3.7, 1.8, 1.9], [6.0, 3.7, 1.9, 1.9],
    [0.1, 5.75, 1.9, 2.1], [2.1, 5.75, 1.8, 2.1], [4.1, 5.75, 1.8, 2.1], [6.0, 5.75, 1.9, 2.1],
    [6.0, 0.15, 1.9, 1.7], [6.0, 1.95, 1.9, 1.6],
  ];
  for (const [u, v, w, d] of lots) riad(u, v, w, d);
  // The mosque (green dome, iwan, two minarets) in the back middle.
  put(pieces, 1.9, 0.2, 4.0, 3.3, (p) => drawMosque(p, 2.0, 0.2, 1.0, G));
  // Gulf super-tower (back left): a stepped silver needle.
  put(pieces, 0.2, 0.2, 1.6, 3.2, (p) => {
    p.box(0.2, 0.3, 1.6, 3.0, G, 6, '#d9d4c8');
    const tiers: [number, number, number][] = [
      [0.62, 0, 60], [0.5, 60, 46], [0.38, 106, 34], [0.26, 140, 22], [0.14, 162, 14],
    ];
    for (const [r, z, h] of tiers) {
      p.cylinder(1.0, 1.8, r, G + 6 + z, h, '#b8c4cc', 10);
      p.cylinder(1.0, 1.8, r + 0.02, G + 6 + z + h - 1.2, 1.2, '#e8eef2', 10);
    }
    p.cylinder(1.0, 1.8, 0.05, G + 182, 12, '#dfe6ea');
    p.dome(1.0, 1.8, 0.1, G + 6, 0, ISLAMIC_GREEN_DOME);
  });
  return {
    ground(p) {
      floor(p, 0, 0, N, N, '#a99474'); // packed-earth alleys of the medina
    },
    pieces,
    flag: [1.0, 1.8, G + 194, 14],
    lit: [0.2, 0.3, 1.6, 3.0, G, 6],
  };
}

/** `flagOf`: the nation whose flag flies (its owner after a capture; the city stays `faction`'s). */
export function createHappyCityArt(faction: FactionId, flagOf: FactionId = faction): BuildingArt {
  const team = FACTIONS[faction].colors.primary;
  const rnd = seeded(faction);
  const plan =
    faction === 'usa'
      ? usaPlan(team, rnd)
      : faction === 'russia'
        ? russiaPlan()
        : faction === 'china'
          ? chinaPlan(team)
          : faction === 'europe'
            ? europePlan(team, rnd)
            : islamicPlan(rnd);
  const pieces = [...plan.pieces].sort((a, b) => a.key - b.key);
  const [fu, fv, fz, pole] = plan.flag;

  return {
    footprint: { w: N, d: N },
    height: 220,

    drawStatic(p) {
      p.box(0, 0, N, N, 0, G, ASPHALT);
      plan.ground(p);
      for (const piece of pieces) piece.draw(p);
      if (pole > 0) p.pole(fu, fv, fz, pole, '#e8e8e8');
    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, flagOf, fu, fv, fz + pole, time, 0, 16, 10);
      // A few windows of the landmark light up and go dark again.
      const [lu, lv, lw, ld, lz, lh] = plan.lit;
      for (let i = 0; i < 6; i++) {
        if (Math.sin(time * 1.3 + i * 2.1) < 0.4) continue;
        const s = (i * 0.17) % 0.9;
        p.faceRect('left', lu, lv, lw, ld, lz, lh, s, s + 0.06, 0.2 + (i % 3) * 0.25, 0.26 + (i % 3) * 0.25, LIT);
      }
    },
  };
}
