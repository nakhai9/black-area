import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawEmblemFlagOnPole, drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { drawMosque } from './GrandMosque';
import { RA2, facade, parapet, roofClutter } from './Ra2Kit';

const PAD = RA2.paving;
/** Height of the office wing that fills the whole plot; the main hall and the flags stand on it. */
const WING_H = 6;

/**
 * Two flags side by side along the front edge (on the wing roof), facing each other: the owner's national flag on
 * the left waving right, the ally flag (black, emblem) on the right waving left (mirrored).
 */
const FLAGS: readonly [number, number][] = [
  [0.45, 3.7],
  [3.55, 3.7],
];

/** Plot shared by every nation: a low office wing in the nation's stone covering the whole 4×4 plot edge to edge. */
function plot(p: IsoPainter, wing: string, seed: number): void {
  p.box(0, 0, 4, 4, 0, 2, PAD);
  p.box(0.03, 0.03, 3.94, 3.94, 2, WING_H, wing);
  facade(p, 'left', 0.03, 0.03, 3.94, 3.94, 2, WING_H, { cols: 18, floors: 1, frame: shade(wing, 1.12), bandColor: shade(wing, 0.8), seed });
  facade(p, 'right', 0.03, 0.03, 3.94, 3.94, 2, WING_H, { cols: 18, floors: 1, frame: shade(wing, 1.12), bandColor: shade(wing, 0.75), seed: seed + 1 });
  p.topRect(0.07, 0.07, 3.93, 3.93, 2 + WING_H, RA2.roof);
  parapet(p, 0.03, 0.03, 3.94, 3.94, 2 + WING_H, shade(wing, 0.92), 0.06, 1.5);
}

/**
 * The seat of an allied government, built in the architecture of the nation it follows:
 *  - USA: a white neoclassical hall with a columned portico and a low dome;
 *  - Russia: a Stalinist tower in red-brown stone with a spire and red star;
 *  - China: a hall on a white terrace under a red-gold sweeping roof, red columns in front;
 *  - Europe: a glass office block with a blue band and a ring of gold stars;
 *  - Islamic: a grand mosque with a green dome and two minarets.
 */
const STYLES: Record<FactionId, { height: number; wing: string; draw: (p: IsoPainter, team: string) => void }> = {
  usa: {
    wing: '#d8d2c2',
    height: 70,
    draw: (p, team) => {
      const W = '#d8d2c2';
      p.box(0.4, 0.5, 3.2, 2.3, 2, 4, '#b8b2a2');
      p.box(0.5, 0.6, 3.0, 2.0, 6, 20, W, { top: RA2.roof });
      facade(p, 'left', 0.5, 0.6, 3.0, 2.0, 6, 20, { cols: 14, floors: 3, frame: '#ece8dc', bandColor: '#bdb6a4', seed: 51 });
      facade(p, 'right', 0.5, 0.6, 3.0, 2.0, 6, 20, { cols: 10, floors: 3, frame: '#ece8dc', bandColor: '#ada694', seed: 52 });
      parapet(p, 0.5, 0.6, 3.0, 2.0, 26, '#cfc9b8', 0.06, 2);
      roofClutter(p, 0.6, 0.7, 0.6, 1.8, 26, 53);
      // Portico: columns under a pediment-like slab.
      p.box(1.25, 2.6, 1.5, 0.45, 6, 0.8, W);
      p.colonnade('left', 1.25, 2.6, 1.5, 0.45, 6.8, 15, 5, '#ffffff', '#6f6a5e');
      p.box(1.15, 2.55, 1.7, 0.55, 21.8, 2.5, W);
      p.faceRect('left', 1.15, 2.55, 1.7, 0.55, 21.8, 2.5, 0, 1, 0.2, 0.8, team);
      p.cylinder(2.0, 1.6, 0.62, 26, 5, '#d8d2c2');
      p.dome(2.0, 1.6, 0.6, 31, 12, '#cfcabb');
      p.pole(2.0, 1.6, 43, 6, '#d8d8d8');
    },
  },
  russia: {
    wing: '#86604e',
    height: 120,
    draw: (p, team) => {
      const STONE = '#86604e';
      const LIGHT = '#b5a28a';
      p.box(0.4, 0.4, 3.2, 2.6, 2, 18, STONE, { top: RA2.roof });
      facade(p, 'left', 0.4, 0.4, 3.2, 2.6, 2, 18, { cols: 16, floors: 3, frame: '#c9b49a', bandColor: RA2.brickDark, seed: 61 });
      facade(p, 'right', 0.4, 0.4, 3.2, 2.6, 2, 18, { cols: 12, floors: 3, frame: '#c9b49a', bandColor: RA2.brickDark, seed: 62 });
      parapet(p, 0.4, 0.4, 3.2, 2.6, 20, LIGHT, 0.06, 2);
      roofClutter(p, 0.5, 0.5, 0.55, 2.3, 20, 63);
      p.box(1.1, 1.0, 1.8, 1.6, 20, 30, LIGHT, { top: RA2.roof });
      facade(p, 'left', 1.1, 1.0, 1.8, 1.6, 20, 30, { cols: 8, floors: 6, frame: '#d6c8b0', bandColor: '#9a8870', seed: 64 });
      facade(p, 'right', 1.1, 1.0, 1.8, 1.6, 20, 30, { cols: 7, floors: 6, frame: '#d6c8b0', bandColor: '#8a7860', seed: 65 });
      p.box(1.4, 1.3, 1.2, 1.0, 50, 14, STONE);
      p.faceRect('left', 1.4, 1.3, 1.2, 1.0, 50, 14, 0, 1, 0.8, 1, team);
      p.pyramid(1.5, 1.4, 1.0, 0.8, 64, 18, shade(STONE, 0.9));
      p.pole(2.0, 1.8, 82, 20, '#d9b13b');
    },
  },
  china: {
    wing: '#d9d2c0',
    height: 92,
    draw: (p, team) => {
      // A hall of the people in miniature: a cream stone hall behind a tall square colonnade, a band of green glazed
      // tiles under its cornice, the red national emblem over the entrance, and a two-tier red-and-gold pavilion
      // rising from the middle of its roof.
      const STONE = '#ddd5c2';
      const COL = '#efe9da';
      const GLAZE = '#3f7a54';
      const RED = '#a52a1e';
      const ROOF = '#d9a52c';
      p.box(0.35, 0.45, 3.3, 2.6, 8, 2, shade(STONE, 0.88));
      p.box(0.5, 0.6, 3.0, 2.0, 10, 20, STONE, { top: RA2.roof });
      facade(p, 'left', 0.5, 0.6, 3.0, 2.0, 10, 20, { cols: 14, floors: 3, frame: '#f1ecdf', bandColor: '#b8ae98', seed: 81 });
      facade(p, 'right', 0.5, 0.6, 3.0, 2.0, 10, 20, { cols: 10, floors: 3, frame: '#f1ecdf', bandColor: '#a89e88', seed: 82 });
      // Green glazed-tile cornice and a stepped stone parapet.
      p.faceRect('left', 0.5, 0.6, 3.0, 2.0, 10, 20, 0, 1, 0.86, 0.96, GLAZE);
      p.faceRect('right', 0.5, 0.6, 3.0, 2.0, 10, 20, 0, 1, 0.86, 0.96, shade(GLAZE, 0.85));
      parapet(p, 0.5, 0.6, 3.0, 2.0, 30, shade(STONE, 0.95), 0.07, 2.2);
      // Tall colonnade across the front, under a deep entablature with the team band.
      p.box(0.75, 2.6, 2.5, 0.42, 10, 1, shade(STONE, 0.92));
      p.colonnade('left', 0.75, 2.6, 2.5, 0.42, 11, 16, 10, COL, '#6a6252');
      p.box(0.68, 2.56, 2.64, 0.5, 27, 3, STONE);
      p.faceRect('left', 0.68, 2.56, 2.64, 0.5, 27, 3, 0, 1, 0.35, 0.65, team);
      // The national emblem: gold-ringed red disc with a gold star, over the middle of the colonnade.
      p.faceTransform('left', 0.68, 3.06, 27, (ctx) => {
        const x = 1.32 * HALF_TW;
        ctx.fillStyle = '#f0c445';
        ctx.beginPath();
        ctx.arc(x, 1.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c8261d';
        ctx.beginPath();
        ctx.arc(x, 1.5, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0c445';
        ctx.fillRect(x - 0.6, 1.0, 1.2, 1.0);
      });
      // Two-tier pavilion on the roof: red walls, golden glazed roofs with upturned eaves.
      p.box(1.4, 1.1, 1.2, 1.0, 30, 11, RED);
      p.colonnade('left', 1.4, 1.1, 1.2, 1.0, 30, 11, 5, shade(RED, 1.15), '#4a150f');
      p.colonnade('right', 1.4, 1.1, 1.2, 1.0, 30, 11, 4, RED, '#4a150f');
      p.hipRoof(1.4, 1.1, 1.2, 1.0, 41, 4, 0.1, ROOF, 1.2);
      p.box(1.6, 1.3, 0.8, 0.6, 45, 8, RED);
      p.colonnade('left', 1.6, 1.3, 0.8, 0.6, 45, 8, 4, shade(RED, 1.15), '#4a150f');
      p.colonnade('right', 1.6, 1.3, 0.8, 0.6, 45, 8, 3, RED, '#4a150f');
      p.hipRoof(1.6, 1.3, 0.8, 0.6, 53, 7, 0.1, ROOF, 1.6);
      p.box(1.97, 1.57, 0.06, 0.06, 59, 4, '#f0c445');
    },
  },
  europe: {
    wing: '#b3b7ba',
    height: 92,
    draw: (p, team) => {
      const GLASS = '#56687a';
      p.box(0.5, 0.5, 3.0, 2.4, 2, 10, '#b3b7ba');
      facade(p, 'left', 0.5, 0.5, 3.0, 2.4, 2, 10, { cols: 16, floors: 1, frame: '#d6d9dc', seed: 71 });
      p.box(0.8, 0.7, 2.4, 2.0, 12, 54, GLASS);
      facade(p, 'left', 0.8, 0.7, 2.4, 2.0, 12, 54, { cols: 12, floors: 12, frame: '#b9bec4', fill: 0.78, band: 0.2, lit: 0.18, seed: 72 });
      facade(p, 'right', 0.8, 0.7, 2.4, 2.0, 12, 54, { cols: 10, floors: 12, frame: '#a9aeb4', fill: 0.78, band: 0.2, lit: 0.18, seed: 73 });
      p.faceRect('left', 0.8, 0.7, 2.4, 2.0, 12, 54, 0, 1, 0.45, 0.52, team);
      p.faceRect('right', 0.8, 0.7, 2.4, 2.0, 12, 54, 0, 1, 0.45, 0.52, shade(team, 0.85));
      p.box(0.9, 0.8, 2.2, 1.8, 66, 4, '#b9bdc2', { top: RA2.roof });
      p.box(1.0, 0.85, 0.35, 0.3, 70, 4, '#a9adb2');
      p.pole(2.9, 0.9, 70, 14, '#8a8f96');
      // Ring of twelve gold stars on the roof.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        p.topRect(2.0 + Math.cos(a) * 0.6 - 0.05, 1.7 + Math.sin(a) * 0.6 - 0.05, 2.0 + Math.cos(a) * 0.6 + 0.05, 1.7 + Math.sin(a) * 0.6 + 0.05, 70, '#d8b23a');
      }
    },
  },
  islamic: {
    wing: '#cdb994',
    height: 96,
    draw: (p, team) => drawMosque(p, 0, 0.3, 1, 2, team),
  },
};

/** Draws `draw` mirrored left-right about the pole at (u, v, z): the flag then flies to the pole's left. */
function mirrored(p: IsoPainter, u: number, v: number, z: number, draw: () => void): void {
  const [x] = p.project(u, v, z);
  p.ctx.save();
  p.ctx.translate(x, 0);
  p.ctx.scale(-1, 1);
  p.ctx.translate(-x, 0);
  draw();
  p.ctx.restore();
}

/** Allied Building (4×4 tiles) in the leading nation's architecture, with the owner's national flag (`flag`) and its ally flag (black, the nation's emblem) side by side at the front, facing each other. */
export function createAlliedBuildingArt(faction: FactionId, flag: FactionId = faction): BuildingArt {
  const team = FACTIONS[faction].colors.primary;
  const style = STYLES[faction];
  return {
    footprint: { w: 4, d: 4 },
    height: Math.max(style.height, 48),

    drawStatic(p) {
      plot(p, style.wing, faction.length * 13);
      style.draw(p, team);
      for (const [u, v] of FLAGS) drawNationalPole(p, flag, u, v, 2 + WING_H, 30);
    },

    drawAnimated(p, time) {
      FLAGS.forEach(([u, v], i) =>
        i === 0
          ? drawFlagOnPole(p, flag, u, v, 32 + WING_H, time, 0, 15, 9)
          : mirrored(p, u, v, 32 + WING_H, () => drawEmblemFlagOnPole(p, flag, u, v, 32 + WING_H, time, 1.1, 15, 9)),
      );
    },
  };
}
