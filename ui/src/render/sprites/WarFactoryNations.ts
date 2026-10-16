import { HALF_TW } from '../../constants';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import { ISLAMIC_GREEN_DOME } from './IslamicPalette';
import { roofStar } from './PowerPlant';
import { RA2 } from './Ra2Kit';

type Team = { primary: string; light: string; dark: string };

/** A nation's own War Factory (5×4 plot): its picture, flag poles (u, v, base z) and blinking lights (u, v, z). */
export interface FactoryDesign {
  draw(p: IsoPainter, team: Team): void;
  readonly flags: readonly [number, number, number][];
  readonly lights: readonly [number, number, number][];
}

const DOOR = '#262a2f';

/**
 * Tower crane standing at (u, v) from height z: lattice mast `h` px tall in the crane yellow, operator cab, a jib
 * reaching `reach` tiles along `dir` (+1 = +u, -1 = -u) with trolley, cable and hook, and a counter-jib with
 * its concrete counterweight. Exported for every War Factory (the USA one too).
 */
export function towerCrane(p: IsoPainter, u: number, v: number, z: number, h: number, reach: number, dir: 1 | -1, color = '#e0b23a'): void {
  const { ctx } = p;
  const m = 0.11; // half mast width (tiles)
  const steel = shade(color, 0.7);
  const line = (a: [number, number], b: [number, number], c: string, w = 0.45): void => {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  };
  // Footing.
  p.box(u - 0.2, v - 0.2, 0.4, 0.4, z, 2, '#8a8a84');
  // Mast: four corner chords with zig-zag bracing on the two visible faces.
  const top = z + h;
  const corners: [number, number][] = [[u - m, v + m], [u + m, v + m], [u + m, v - m]];
  for (const [cu, cv] of corners) line(p.project(cu, cv, z + 2), p.project(cu, cv, top), color, 0.7);
  const bays = Math.max(4, Math.round(h / 5));
  for (let k = 0; k < bays; k++) {
    const z0 = z + 2 + ((top - z - 2) * k) / bays;
    const z1 = z + 2 + ((top - z - 2) * (k + 1)) / bays;
    line(p.project(u - m, v + m, z0), p.project(u + m, v + m, z1), steel);
    line(p.project(u + m, v + m, z0), p.project(u + m, v - m, z1), steel);
    line(p.project(u - m, v + m, z1), p.project(u + m, v + m, z1), steel, 0.35);
  }
  // Slewing unit and cab.
  p.box(u - 0.16, v - 0.16, 0.32, 0.32, top, 3, shade(color, 0.9));
  p.box(u - 0.05 + dir * 0.1, v + 0.12, 0.22, 0.2, top - 4, 5, '#d8dce0');
  p.faceRect('left', u - 0.05 + dir * 0.1, v + 0.12, 0.22, 0.2, top - 4, 5, 0.1, 0.9, 0.35, 0.9, '#5a7a96');
  // Jib and counter-jib (a flat lattice girder).
  const jz = top + 3;
  const tip = u + dir * reach;
  const back = u - dir * reach * 0.35;
  p.box(Math.min(u, tip), v - 0.05, Math.abs(tip - u), 0.1, jz, 1.4, color, { edge: null });
  p.box(Math.min(u, back), v - 0.05, Math.abs(back - u), 0.1, jz, 1.4, color, { edge: null });
  const panels = Math.max(3, Math.round(reach * 4));
  for (let k = 0; k < panels; k++) {
    const a = u + (dir * reach * k) / panels;
    const b = u + (dir * reach * (k + 1)) / panels;
    line(p.project(a, v, jz + 1.4), p.project(b, v, jz + 3.6), steel, 0.35);
    line(p.project(b, v, jz + 3.6), p.project(b, v, jz + 1.4), steel, 0.35);
  }
  line(p.project(u, v, jz + 3.6), p.project(tip, v, jz + 3.6), color, 0.5);
  // Apex and tie bars.
  line(p.project(u, v, jz), p.project(u, v, jz + 10), color, 0.8);
  line(p.project(u, v, jz + 10), p.project(tip, v, jz + 3.6), steel, 0.4);
  line(p.project(u, v, jz + 10), p.project(back, v, jz + 1.4), steel, 0.4);
  p.box(back - (dir > 0 ? 0 : 0.3), v - 0.12, 0.3, 0.24, jz - 3, 4, '#9a9890');
  // Trolley, cable and hook block.
  const tu = u + dir * reach * 0.62;
  p.box(tu - 0.08, v - 0.08, 0.16, 0.16, jz - 1, 1.2, '#3a3a3a', { edge: null });
  const hz = Math.max(z + 6, jz - 18);
  line(p.project(tu, v, jz - 1), p.project(tu, v, hz + 2), '#2a2a2a', 0.35);
  p.box(tu - 0.06, v - 0.06, 0.12, 0.12, hz, 2.2, '#d84a2a', { edge: null });
  // Warning light on the apex.
  const [lx, ly] = p.project(u, v, jz + 10.5);
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(lx, ly, 0.7, 0, Math.PI * 2);
  ctx.fill();
}

/** Roller doors on the front (left) face of a hall: `count` bays, `t1` = door height share of the wall. */
function rollerDoors(p: IsoPainter, u: number, v: number, w: number, d: number, z: number, h: number, count: number, t1: number, frame: string): void {
  for (let i = 0; i < count; i++) {
    const c = (i + 0.5) / count;
    const hw = 0.32 / count;
    p.faceRect('left', u, v, w, d, z, h, c - hw - 0.02, c + hw + 0.02, 0, t1 + 0.05, frame);
    p.faceRect('left', u, v, w, d, z, h, c - hw, c + hw, 0, t1, DOOR);
    for (let k = 1; k < 6; k++) p.faceRect('left', u, v, w, d, z, h, c - hw, c + hw, (t1 * k) / 6, (t1 * k) / 6 + 0.012, '#41464d');
  }
}

/**
 * Russia — Soviet "kombinat": a long red-brick hall with a raised clerestory roof light, a heavy concrete
 * administration tower in the middle of the front carrying a big red star, and a tall red-and-white chimney.
 */
const RUSSIA: FactoryDesign = {
  flags: [[1.55, 3.55, 40]],
  lights: [[4.4, 0.6, 72]],
  draw(p, team) {
    const BRICK = '#8a4a36';
    const CONC = '#9a9a8a';
    p.box(0, 0, 5, 4, 0, 2, '#6a645a');
    // Chimney at the back corner (drawn first: farthest from the viewer).
    p.cylinder(4.4, 0.6, 0.25, 2, 68, '#e4e0d8');
    for (let i = 0; i < 5; i++) p.cylinder(4.4, 0.6, 0.26, 6 + i * 14, 6, team.primary);
    // Brick hall with brick piers and strip windows.
    p.box(0.1, 0.1, 4.8, 3.3, 2, 22, BRICK);
    for (let i = 0; i <= 10; i++) p.faceRect('left', 0.1, 0.1, 4.8, 3.3, 2, 22, i / 10 - 0.012, i / 10 + 0.012, 0, 1, shade(BRICK, 0.75));
    p.windows('left', 0.1, 0.1, 4.8, 3.3, 2, 22, 10, 1, RA2.glass, 0.1, 0.35);
    p.windows('right', 0.1, 0.1, 4.8, 3.3, 2, 22, 7, 1, RA2.glass, 0.1, 0.35);
    p.topRect(0.1, 0.1, 4.9, 3.4, 24, '#4e4640');
    // Clerestory (monitor) roof along the hall.
    p.box(0.5, 1.3, 4.0, 0.9, 24, 8, shade(BRICK, 0.9));
    p.windows('left', 0.5, 1.3, 4.0, 0.9, 24, 8, 12, 1, RA2.glassLit, 0.15, 0.3);
    p.box(0.45, 1.25, 4.1, 1.0, 32, 1.5, '#4e4640');
    // Concrete front block across the whole width with the bay doors.
    p.box(0.1, 3.4, 4.8, 0.55, 2, 18, CONC);
    rollerDoors(p, 0.1, 3.4, 4.8, 0.55, 2, 18, 3, 0.72, shade(CONC, 0.7));
    p.faceRect('left', 0.1, 3.4, 4.8, 0.55, 2, 18, 0, 1, 0.85, 1, team.primary);
    // Central administration tower with the red star.
    p.box(1.9, 2.9, 1.2, 1.05, 2, 40, CONC);
    p.windows('left', 1.9, 2.9, 1.2, 1.05, 2, 40, 3, 4, RA2.glass, 0.12, 0.45);
    p.windows('right', 1.9, 2.9, 1.2, 1.05, 2, 40, 3, 4, RA2.glass, 0.12, 0.45);
    p.box(1.85, 2.85, 1.3, 1.15, 42, 2, shade(CONC, 0.85));
    p.faceTransform('left', 1.9, 3.95, 30, (ctx) => {
      const cx = 0.6 * HALF_TW;
      ctx.fillStyle = team.primary;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? 2.6 : 6.4;
        ctx.lineTo(cx + Math.cos(a) * r, 2 + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    });
    roofStar(p, 2.5, 3.42, 44.1, 0.4, team.primary);
    towerCrane(p, 0.45, 0.45, 2, 56, 1.9, 1);
  },
};

/**
 * China — imperial workshop: grey brick walls on a stone base, a front gallery of red lacquered columns under a
 * curled double-eave roof with golden ridge, and gate pavilions at both ends.
 */
const CHINA: FactoryDesign = {
  flags: [[0.45, 3.55, 44], [4.55, 3.55, 44]],
  lights: [[1.6, 3.85, 14], [3.4, 3.85, 14]],
  draw(p, team) {
    const BRICK = '#8a8478';
    const RED = '#a8281c';
    const TILE = '#3e3a36';
    p.box(0, 0, 5, 4, 0, 3, '#c8c0ac');
    // Main hall.
    p.box(0.6, 0.3, 3.8, 3.0, 3, 20, BRICK);
    p.windows('right', 0.6, 0.3, 3.8, 3.0, 3, 20, 6, 1, '#3a2a22', 0.12, 0.4);
    p.hipRoof(0.6, 0.3, 3.8, 3.0, 23, 11, 0.25, TILE, 3);
    p.hipRoof(1.3, 1.0, 2.4, 1.6, 31, 8, 0.2, TILE, 2.5);
    p.box(1.3, 1.75, 2.4, 0.1, 39, 1.5, team.primary);
    // Front gallery: red columns, open bays.
    p.box(0.6, 3.3, 3.8, 0.6, 3, 16, '#2a2622');
    for (let i = 0; i <= 6; i++) p.box(0.6 + (i * 3.7) / 6, 3.75, 0.1, 0.1, 3, 16, RED);
    rollerDoors(p, 0.6, 3.3, 3.8, 0.6, 3, 16, 3, 0.8, RED);
    p.hipRoof(0.6, 3.3, 3.8, 0.6, 19, 4, 0.2, shade(TILE, 1.15), 2);
    p.faceRect('left', 0.6, 3.3, 3.8, 0.6, 3, 16, 0, 1, 0.88, 1, team.primary);
    // Gate pavilions.
    for (const u of [0.05, 4.05]) {
      p.box(u, 2.6, 0.8, 1.3, 3, 26, RED);
      p.windows('left', u, 2.6, 0.8, 1.3, 3, 26, 1, 2, '#3a2a22', 0.25, 0.4);
      p.hipRoof(u, 2.6, 0.8, 1.3, 29, 9, 0.18, TILE, 3);
      p.box(u + 0.3, 3.15, 0.2, 0.2, 38, 4, team.primary);
    }
    towerCrane(p, 4.6, 0.35, 3, 52, 1.8, -1, '#d8a62a');
  },
};

/**
 * Europe — Belle Époque works hall: pale limestone walls with tall arched windows, a grey slate mansard roof with
 * dormers and a central glass lantern, a pedimented entrance pavilion with a clock and the ring of twelve golden
 * stars on a team-colour field, and slim corner pavilions under slate domes.
 */
const EUROPE: FactoryDesign = {
  flags: [[2.5, 3.55, 46]],
  lights: [[2.5, 1.9, 50]],
  draw(p, team) {
    const STONE = '#ddd6c6';
    const SLATE = '#4e5866';
    const TRIM = '#b8ae98';
    p.box(0, 0, 5, 4, 0, 2, '#9c968a');
    // Hall walls: rusticated base, arched windows, cornice.
    p.box(0.2, 0.2, 4.6, 3.4, 2, 20, STONE);
    p.faceRect('left', 0.2, 0.2, 4.6, 3.4, 2, 20, 0, 1, 0, 0.15, TRIM);
    p.faceRect('right', 0.2, 0.2, 4.6, 3.4, 2, 20, 0, 1, 0, 0.15, shade(TRIM, 0.85));
    p.windows('right', 0.2, 0.2, 4.6, 3.4, 2, 20, 8, 1, '#3a4a5c', 0.18, 0.5);
    p.faceRect('right', 0.2, 0.2, 4.6, 3.4, 2, 20, 0, 1, 0.92, 1, shade(TRIM, 0.9));
    // Mansard roof with dormers and a glass lantern on the ridge.
    p.hipRoof(0.2, 0.2, 4.6, 3.4, 22, 12, 0.05, SLATE);
    for (const u of [0.7, 1.5, 3.5, 4.3]) {
      p.box(u - 0.15, 3.25, 0.3, 0.2, 24, 5, STONE);
      p.pyramid(u - 0.15, 3.25, 0.3, 0.2, 29, 3, SLATE);
    }
    p.box(1.4, 1.6, 2.2, 0.6, 30, 5, '#8aa6bc');
    p.hipRoof(1.4, 1.6, 2.2, 0.6, 35, 3, 0.04, shade(SLATE, 1.1));
    // Front: arched bay doors along the hall.
    p.box(0.2, 3.6, 4.6, 0.35, 2, 16, STONE);
    archDoors(p, 0.2, 3.95, 4.6, 2, 4, 11, TRIM);
    p.faceRect('left', 0.2, 3.6, 4.6, 0.35, 2, 16, 0, 1, 0.88, 1, team.primary);
    // Corner pavilions with slate domes.
    for (const u of [0.05, 4.25]) {
      p.box(u, 3.25, 0.7, 0.7, 2, 26, STONE);
      p.windows('left', u, 3.25, 0.7, 0.7, 2, 26, 1, 2, '#3a4a5c', 0.28, 0.45);
      p.box(u - 0.04, 3.21, 0.78, 0.78, 28, 1.5, TRIM);
      p.dome(u + 0.35, 3.6, 0.36, 29.5, 10, SLATE);
      p.pole(u + 0.35, 3.6, 39.5, 3, '#c8a850');
    }
    // Central pedimented pavilion: clock, star ring, gable.
    p.box(1.8, 3.2, 1.4, 0.75, 2, 32, STONE);
    p.faceRect('left', 1.8, 3.2, 1.4, 0.75, 2, 32, 0.08, 0.14, 0, 0.9, TRIM);
    p.faceRect('left', 1.8, 3.2, 1.4, 0.75, 2, 32, 0.86, 0.92, 0, 0.9, TRIM);
    p.faceTransform('left', 1.8, 3.95, 2, (ctx) => {
      const w = 1.4 * HALF_TW;
      const cx = w / 2;
      // Pediment.
      ctx.fillStyle = TRIM;
      ctx.beginPath();
      ctx.moveTo(-1, 32);
      ctx.lineTo(cx, 40);
      ctx.lineTo(w + 1, 32);
      ctx.closePath();
      ctx.fill();
      // Star field and ring.
      ctx.fillStyle = shade(team.primary, 0.85);
      ctx.beginPath();
      ctx.arc(cx, 21, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 4.4, 21 + Math.sin(a) * 4.4, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      // Clock under the pediment.
      ctx.fillStyle = '#f4f0e4';
      ctx.beginPath();
      ctx.arc(cx, 30.2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, 30.2);
      ctx.lineTo(cx, 31.6);
      ctx.moveTo(cx, 30.2);
      ctx.lineTo(cx + 1, 30.2);
      ctx.stroke();
      // Main door.
      ctx.fillStyle = DOOR;
      ctx.fillRect(cx - 4.5, 0, 9, 11);
    });
    p.box(1.75, 3.15, 1.5, 0.85, 34, 1.5, TRIM);
    p.hipRoof(1.8, 3.2, 1.4, 0.75, 35.5, 8, 0.05, SLATE);
    towerCrane(p, 4.65, 0.35, 2, 54, 1.9, -1, '#e8c23a');
  },
};

/** Pointed (Islamic) arch doors across the front face, drawn in face space. */
function archDoors(p: IsoPainter, u: number, v: number, w: number, z: number, count: number, h: number, frame: string): void {
  p.faceTransform('left', u, v, z, (ctx) => {
    for (let i = 0; i < count; i++) {
      const cx = ((i + 0.5) * w * HALF_TW) / count;
      const hw = (w * HALF_TW * 0.3) / count;
      for (const [grow, color] of [[1.5, frame], [0, DOOR]] as const) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - hw - grow, 0);
        ctx.lineTo(cx - hw - grow, h * 0.62);
        ctx.quadraticCurveTo(cx - hw - grow, h + grow * 0.6, cx, h + grow);
        ctx.quadraticCurveTo(cx + hw + grow, h + grow * 0.6, cx + hw + grow, h * 0.62);
        ctx.lineTo(cx + hw + grow, 0);
        ctx.closePath();
        ctx.fill();
      }
    }
  });
}

/**
 * Islamic — fortified caravanserai workshop: sandstone walls with a crenellated parapet, four corner towers with
 * green domes, pointed-arch bay doors under a tiled band, and a great green dome over the hall.
 */
const ISLAMIC: FactoryDesign = {
  flags: [[2.5, 3.6, 22]],
  lights: [[0.35, 0.35, 44], [4.65, 0.35, 44]],
  draw(p, team) {
    const SAND = '#d0b88c';
    p.box(0, 0, 5, 4, 0, 2, '#a8946c');
    const tower = (u: number, v: number): void => {
      p.box(u, v, 0.7, 0.7, 2, 30, shade(SAND, 0.95));
      p.windows('left', u, v, 0.7, 0.7, 2, 30, 1, 3, '#3a3024', 0.3, 0.5);
      p.box(u - 0.05, v - 0.05, 0.8, 0.8, 32, 2, shade(SAND, 0.85));
      p.dome(u + 0.35, v + 0.35, 0.33, 34, 10, ISLAMIC_GREEN_DOME);
      p.pole(u + 0.35, v + 0.35, 44, 3, '#e8c860');
    };
    tower(0, 0);
    tower(4.3, 0);
    // Hall walls with crenellations and a team-colour tile band.
    p.box(0.3, 0.3, 4.4, 3.4, 2, 20, SAND);
    for (let i = 0; i < 16; i++) {
      p.box(0.3 + (i * 4.4) / 16, 3.6, 0.14, 0.1, 22, 2.5, shade(SAND, 0.9));
      if (i < 12) p.box(4.6, 0.3 + (i * 3.4) / 12, 0.1, 0.14, 22, 2.5, shade(SAND, 0.9));
    }
    p.faceRect('left', 0.3, 0.3, 4.4, 3.4, 2, 20, 0, 1, 0.8, 0.9, team.primary);
    p.faceRect('right', 0.3, 0.3, 4.4, 3.4, 2, 20, 0, 1, 0.8, 0.9, shade(team.primary, 0.8));
    archDoors(p, 0.3, 3.7, 4.4, 2, 3, 12, '#8a6a44');
    p.topRect(0.3, 0.3, 4.7, 3.7, 22.01, '#a8946c');
    // Great dome on a drum.
    p.cylinder(2.5, 2.0, 1.0, 22, 6, shade(SAND, 1.05));
    p.windows('left', 1.8, 1.3, 1.4, 1.4, 22, 6, 6, 1, '#3a3024', 0.1, 0.5);
    p.dome(2.5, 2.0, 1.0, 28, 26, ISLAMIC_GREEN_DOME);
    p.pole(2.5, 2.0, 54, 6, '#e8c860');
    tower(0, 3.3);
    tower(4.3, 3.3);
    towerCrane(p, 3.6, 0.6, 22, 34, 1.6, -1, '#d4a83a');
  },
};

/** Nations with their own War Factory design here (the USA keeps the one in WarFactory.ts). */
export const FACTORY_DESIGNS: Partial<Record<FactionId, FactoryDesign>> = {
  russia: RUSSIA,
  china: CHINA,
  europe: EUROPE,
  islamic: ISLAMIC,
};
