import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import { RA2, facade, parapet, roofClutter } from './Ra2Kit';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';

/** Two poles side by side on the forecourt: the holder's flag on the left, the host nation's on the right, both waving the same way. */
const FLAGS: readonly [number, number][] = [
  [1.72, 4.55],
  [2.28, 4.55],
];

/**
 * The Parallel Government's own seat in each nation's architecture (never the Allied Building's design):
 *  - USA: a red-brick Federal hall with white trim, a gable roof and a clock cupola;
 *  - Russia: a grey Constructivist block, stepped, with a round glass corner tower and a red banner;
 *  - China: a walled courtyard with two grey-tiled halls and a red gate;
 *  - Europe: a stone parliament block under a glass rotunda dome;
 *  - Islamic: a sandstone majlis with an arched iwan portal, small domes and one minaret.
 */
const STYLES: Record<FactionId, { height: number; draw: (p: IsoPainter, team: string) => void }> = {
  usa: {
    height: 62,
    draw: (p, team) => {
      const BRICK = '#9c4a36';
      const TRIM = '#f2efe6';
      p.box(0.3, 0.4, 3.4, 2.8, 2, 2, '#bdb8ac');
      p.box(0.4, 0.5, 3.2, 2.6, 4, 16, BRICK, { top: RA2.roof });
      facade(p, 'left', 0.4, 0.5, 3.2, 2.6, 4, 16, { cols: 9, floors: 2, frame: TRIM, bandColor: shade(BRICK, 0.8), seed: 71 });
      facade(p, 'right', 0.4, 0.5, 3.2, 2.6, 4, 16, { cols: 7, floors: 2, frame: TRIM, bandColor: shade(BRICK, 0.75), seed: 72 });
      p.box(0.35, 0.45, 3.3, 2.7, 20, 1, TRIM);
      p.gableRoofV(0.4, 0.5, 3.2, 2.6, 21, 7, TRIM, '#4d4f55');
      // Clock cupola on the ridge.
      p.box(1.75, 1.55, 0.5, 0.5, 26, 5, TRIM);
      p.faceRect('left', 1.75, 1.55, 0.5, 0.5, 26, 5, 0.25, 0.75, 0.3, 0.8, team);
      p.box(1.7, 1.5, 0.6, 0.6, 31, 0.8, TRIM);
      p.pyramid(1.7, 1.5, 0.6, 0.6, 31.8, 5, '#3f6b5c');
      p.pole(2.0, 1.8, 36.8, 5, '#d8c070');
      // Front steps and door.
      p.box(1.55, 3.1, 0.9, 0.5, 2, 1.2, '#cfcac0');
      p.faceRect('left', 1.6, 3.05, 0.8, 0.05, 4, 8, 0.3, 0.7, 0, 0.9, '#2f2a26');
    },
  },
  russia: {
    height: 64,
    draw: (p, team) => {
      const CON = '#8e9196';
      p.box(0.3, 0.3, 3.4, 3.2, 2, 10, CON, { top: RA2.roof });
      facade(p, 'left', 0.3, 0.3, 3.4, 3.2, 2, 10, { cols: 12, floors: 2, frame: shade(CON, 1.15), bandColor: shade(CON, 0.7), seed: 81 });
      facade(p, 'right', 0.3, 0.3, 3.4, 3.2, 2, 10, { cols: 11, floors: 2, frame: shade(CON, 1.15), bandColor: shade(CON, 0.65), seed: 82 });
      p.box(0.5, 0.4, 2.0, 2.0, 12, 14, shade(CON, 0.95), { top: RA2.roof });
      facade(p, 'left', 0.5, 0.4, 2.0, 2.0, 12, 14, { cols: 6, floors: 3, frame: '#b0b3b8', bandColor: '#5e6166', seed: 83 });
      facade(p, 'right', 0.5, 0.4, 2.0, 2.0, 12, 14, { cols: 6, floors: 3, frame: '#b0b3b8', bandColor: '#56595e', seed: 84 });
      parapet(p, 0.5, 0.4, 2.0, 2.0, 26, CON, 0.06, 1.5);
      // Round glass corner tower.
      p.cylinder(2.9, 2.7, 0.55, 12, 22, RA2.glass, 6);
      p.box(2.4, 2.2, 1.0, 1.0, 34, 1, CON);
      p.pole(2.9, 2.7, 35, 12, '#9a9a9a');
      // Red banner down the front of the block.
      p.faceRect('left', 0.5, 0.4, 2.0, 2.0, 13, 12, 0.42, 0.58, 0.05, 0.95, team);
      roofClutter(p, 0.4, 2.6, 1.6, 0.8, 12, 85);
    },
  },
  china: {
    height: 46,
    draw: (p, team) => {
      const WALL = '#a8342c';
      const TILE = '#5a5e62';
      // Courtyard wall with a gate at the front.
      p.box(0.2, 0.2, 3.6, 3.6, 2, 0.3, '#b9b4a8');
      for (const [u, v, w, d] of [[0.2, 0.2, 3.6, 0.2], [0.2, 0.2, 0.2, 3.6], [3.6, 0.2, 0.2, 3.6], [0.2, 3.6, 1.3, 0.2], [2.5, 3.6, 1.3, 0.2]] as const) {
        p.box(u, v, w, d, 2, 4, WALL, { top: TILE });
      }
      // Gate house.
      p.box(1.5, 3.5, 1.0, 0.4, 2, 6, WALL);
      p.hipRoof(1.4, 3.4, 1.2, 0.6, 8, 2.5, 0.12, TILE, 0.3);
      p.faceRect('left', 1.5, 3.5, 1.0, 0.4, 2, 6, 0.3, 0.7, 0, 0.8, '#3a2018');
      // Back hall (main) and side hall.
      p.box(0.5, 0.5, 3.0, 1.3, 2, 1.2, '#cfcac0');
      p.box(0.6, 0.6, 2.8, 1.1, 3.2, 10, WALL);
      facade(p, 'left', 0.6, 0.6, 2.8, 1.1, 3.2, 10, { cols: 8, floors: 1, frame: '#d8b04a', bandColor: '#6e1e18', seed: 91 });
      p.hipRoof(0.45, 0.45, 3.1, 1.4, 13.2, 7, 0.2, TILE, 0.4);
      p.box(0.5, 2.1, 1.0, 1.2, 2, 8, WALL);
      p.hipRoof(0.4, 2.0, 1.2, 1.4, 10, 5, 0.15, TILE, 0.3);
      p.box(2.6, 2.3, 0.4, 0.4, 2, 2, '#9a9488');
      p.faceRect('left', 0.6, 0.6, 2.8, 1.1, 5, 4, 0.45, 0.55, 0, 1, team);
    },
  },
  europe: {
    height: 58,
    draw: (p, team) => {
      const STONE = '#cdc6b4';
      p.box(0.3, 0.3, 3.4, 3.2, 2, 14, STONE, { top: RA2.roof });
      facade(p, 'left', 0.3, 0.3, 3.4, 3.2, 2, 14, { cols: 13, floors: 3, frame: '#e6e0d0', bandColor: '#a39c8a', seed: 101 });
      facade(p, 'right', 0.3, 0.3, 3.4, 3.2, 2, 14, { cols: 12, floors: 3, frame: '#e6e0d0', bandColor: '#958e7c', seed: 102 });
      parapet(p, 0.3, 0.3, 3.4, 3.2, 16, shade(STONE, 0.9), 0.08, 2);
      // Corner towers.
      for (const [u, v] of [[0.3, 0.3], [3.0, 0.3], [0.3, 2.8], [3.0, 2.8]] as const) p.box(u, v, 0.7, 0.7, 2, 17, shade(STONE, 0.95));
      // Glass rotunda dome in the middle.
      p.cylinder(2.0, 1.9, 0.9, 16, 4, shade(STONE, 0.85));
      p.dome(2.0, 1.9, 0.88, 20, 16, RA2.glass);
      p.pole(2.0, 1.9, 36, 4, '#d0d0d0');
      // Portico columns and a blue band.
      p.colonnade('left', 1.0, 3.45, 2.0, 0.1, 2, 10, 6, '#f2eee4', '#5a5448');
      p.box(0.95, 3.35, 2.1, 0.3, 12, 1.5, STONE);
      p.faceRect('left', 0.95, 3.35, 2.1, 0.3, 12, 1.5, 0, 1, 0.1, 0.9, team);
    },
  },
  islamic: {
    height: 66,
    draw: (p, team) => {
      const SAND = '#d2b68a';
      p.box(0.3, 0.4, 3.2, 3.0, 2, 12, SAND, { top: shade(SAND, 0.9) });
      facade(p, 'left', 0.3, 0.4, 3.2, 3.0, 2, 12, { cols: 8, floors: 2, frame: shade(SAND, 1.12), bandColor: shade(SAND, 0.75), seed: 111 });
      facade(p, 'right', 0.3, 0.4, 3.2, 3.0, 2, 12, { cols: 8, floors: 2, frame: shade(SAND, 1.12), bandColor: shade(SAND, 0.7), seed: 112 });
      parapet(p, 0.3, 0.4, 3.2, 3.0, 14, shade(SAND, 0.92), 0.06, 1.2);
      // Iwan portal: tall frame with a dark arched niche and a tile band.
      p.box(1.2, 3.2, 1.4, 0.3, 2, 18, shade(SAND, 1.05));
      p.faceRect('left', 1.2, 3.2, 1.4, 0.3, 2, 18, 0.25, 0.75, 0, 0.7, '#3a2e22');
      p.faceRect('left', 1.2, 3.2, 1.4, 0.3, 2, 18, 0.08, 0.92, 0.8, 0.9, team);
      // Small domes on the roof.
      for (const [u, v] of [[0.9, 1.0], [1.9, 1.0], [0.9, 2.2], [1.9, 2.2]] as const) p.dome(u, v, 0.35, 14, 5, '#e8dcc4');
      p.cylinder(2.9, 1.6, 0.42, 14, 2, shade(SAND, 0.9));
      p.dome(2.9, 1.6, 0.42, 16, 8, team);
      // One minaret at the back corner.
      p.cylinder(3.4, 0.6, 0.22, 2, 38, '#e6d6b6', 3);
      p.cylinder(3.4, 0.6, 0.3, 32, 1.2, shade(SAND, 0.85));
      p.dome(3.4, 0.6, 0.2, 40, 5, team);
      p.pole(3.4, 0.6, 45, 4, '#d8c070');
    },
  },
};

/**
 * Parallel Government (4×5 tiles): its own seat in the host nation's (`faction`) architecture on the back 4×4, and a
 * paved forecourt in front where the holder's flag (`flag`) and the host nation's fly next to each other.
 */
export function createParallelGovArt(faction: FactionId, flag: FactionId = faction): BuildingArt {
  const team = FACTIONS[faction].colors.primary;
  const style = STYLES[faction];
  return {
    footprint: { w: 4, d: 5 },
    height: Math.max(style.height, 48),

    drawStatic(p) {
      p.box(0, 0, 4, 5, 0, 2, RA2.paving);
      style.draw(p, team);
      for (const [u, v] of FLAGS) drawNationalPole(p, flag, u, v, 2, 30);
    },

    drawAnimated(p, time) {
      const [[u0, v0], [u1, v1]] = FLAGS as [[number, number], [number, number]];
      drawFlagOnPole(p, flag, u0, v0, 32, time, 0, 15, 9);
      drawFlagOnPole(p, faction, u1, v1, 32, time, 0, 15, 9);
    },
  };
}
