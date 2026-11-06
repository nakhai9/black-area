import type { FactionId } from '../../types';
import type { IsoPainter } from '../IsoPainter';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, drawPicture, pictureArt } from './PictureArt';

/** One pole in front of each hall: the holder's flag before its hall on the left, the host nation's before its hall on the right. */
const FLAGS: readonly [number, number][] = [
  [1.0, 4.55],
  [3.0, 4.55],
];

/** Where each hall's lot starts along u: the holder's on the left, the host nation's on the right. */
const LEFT_U = 0.05;
const RIGHT_U = 2.15;

/**
 * One hall of the twin seat in each nation's architecture, rendered in Blender (tools/blender/models/parallelgov.py,
 * parallelgov-hall-<nation>) on a 1.8 × 3.4 lot starting at u = 0, v = 0.3, standing on the paving (z = 2):
 *  - USA: a red-brick Federal hall with white trim, a gable roof and a clock cupola;
 *  - Russia: a grey Constructivist block, stepped, with a round glass corner tower and a red banner;
 *  - China: a red hall on a stone terrace under a two-tier grey-tiled hip roof, with a small gate;
 *  - Europe: a stone parliament block under a glass rotunda dome with a columned portico;
 *  - Islamic: a sandstone majlis with an arched iwan portal, a dome and one minaret.
 */
const hall = (f: FactionId, originY: number): PictureSpec => ({ file: `building-parallelgov-hall-${f}`, originX: 134, originY, scale: 3, footprint: { w: 2, d: 4 }, zScale: 1.35 });
const HALLS: Record<FactionId, PictureSpec> = {
  usa: hall('usa', 87),
  russia: hall('russia', 89.7),
  china: hall('china', 68.1),
  europe: hall('europe', 84.3),
  islamic: hall('islamic', 92.4),
};
/** Paved plot with the forecourt slabs in front of the halls. */
const BASE: PictureSpec = { file: 'building-parallelgov-base', originX: 166, originY: 11.4, scale: 3, footprint: { w: 4, d: 5 }, zScale: 1.35 };

// Register every picture at load so loadPictureArts downloads them before the game starts.
for (const spec of [BASE, ...Object.values(HALLS)]) pictureArt(spec);

/** Draws a hall picture with its lot shifted `du` tiles along u. */
function drawHall(p: IsoPainter, spec: PictureSpec, du: number): void {
  const [x0, y0] = p.project(0, 0, 0);
  const [x1, y1] = p.project(du, 0, 0);
  p.ctx.save();
  p.ctx.translate(x1 - x0, y1 - y0);
  drawPicture(p, spec);
  p.ctx.restore();
}

/**
 * Parallel Government (4×5 tiles): two halls sharing one plot — the holder's (`flag`) hall in its own architecture on
 * the left and the host nation's (`faction`) hall on the right (e.g. USA–China, USA–Russia), joined by a covered
 * walkway — with a paved forecourt in front where each nation's flag flies before its hall.
 */
export function createParallelGovArt(faction: FactionId, flag: FactionId = faction): BuildingArt {
  return {
    footprint: { w: 4, d: 5 },
    height: 64,

    drawStatic(p) {
      drawPicture(p, BASE);
      drawHall(p, HALLS[flag], LEFT_U);
      // Covered walkway between the halls: in front of the left hall, behind the right one.
      p.box(1.85, 1.4, 0.3, 1.2, 2, 6, '#c9c3b6', { top: '#5c5d5a' });
      p.box(1.88, 2.55, 0.24, 0.05, 2, 4.5, '#2c3a46');
      drawHall(p, HALLS[faction], RIGHT_U);
      drawNationalPole(p, flag, FLAGS[0]![0], FLAGS[0]![1], 2, 30);
      drawNationalPole(p, faction, FLAGS[1]![0], FLAGS[1]![1], 2, 30);
    },

    drawAnimated(p, time) {
      const [[u0, v0], [u1, v1]] = FLAGS as [[number, number], [number, number]];
      drawFlagOnPole(p, flag, u0, v0, 32, time, 0);
      drawFlagOnPole(p, faction, u1, v1, 32, time, 0);
    },
  };
}
