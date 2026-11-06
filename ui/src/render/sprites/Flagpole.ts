import type { FactionId } from '../../types';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, drawPicture, pictureArt } from './PictureArt';

/** A landmark pole: twice as tall as the poles on other buildings, thicker; its flag is the standard size (FLAG_W × FLAG_H). */
const POLE_H = 84;
const POLE_K = 1.8;

/** One nation's flag plaza. */
interface Plaza {
  /** Height of the podium top, where the pole stands. */
  top: number;
  /** Extra animation (flame, lights…), drawn under the flag. */
  animate?: (p: IsoPainter, time: number) => void;
}

const PLAZAS: Record<FactionId, Plaza> = {
  // USA: three granite steps (a memorial plinth), a bronze plaque, lamp posts at the front corners.
  usa: { top: 6.8 },
  // Russia: red granite podium on a black stone base, with the Eternal Flame in front of it.
  russia: {
    top: 6.8,
    animate: (p, time) => {
      const [x, y] = p.project(0.84, 0.84, 3.4);
      const f = 0.8 + Math.sin(time * 11) * 0.15 + Math.sin(time * 7.3) * 0.1;
      const g = p.ctx.createRadialGradient(x, y - 1.5, 0.2, x, y - 1.5, 3.2 * f);
      g.addColorStop(0, 'rgba(255,240,170,0.95)');
      g.addColorStop(0.5, 'rgba(255,140,40,0.85)');
      g.addColorStop(1, 'rgba(200,40,10,0)');
      p.ctx.fillStyle = g;
      p.ctx.beginPath();
      p.ctx.ellipse(x, y - 1.8 * f, 1.6, 2.8 * f, 0, 0, Math.PI * 2);
      p.ctx.fill();
    },
  },
  // China: white marble terrace in two tiers with a balustrade and red lanterns at the front.
  china: { top: 6.4 },
  // Europe: modern round blue-glass podium on a steel plate, with twelve star lights round its rim.
  europe: {
    top: 5.5,
    animate: (p, time) => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const [x, y] = p.project(0.5 + Math.cos(a) * 0.37, 0.5 + Math.sin(a) * 0.37, 4);
        const on = 0.55 + 0.45 * Math.sin(time * 2.4 + i * 0.52);
        p.ctx.fillStyle = `rgba(255,214,70,${on.toFixed(3)})`;
        p.ctx.beginPath();
        p.ctx.arc(x, y, 0.75, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  },
  // Islamic: sand-stone plinth wrapped in a band of green tile.
  islamic: { top: 6 },
};

/** Rendered in Blender (tools/blender/models/flagpole.py, flagpole-<nation>): the podium only; pole and flag are drawn on top. */
const PICTURE = (f: FactionId): PictureSpec => ({ file: `building-flagpole-${f}`, originX: 38, originY: 20, scale: 3, footprint: { w: 1, d: 1 }, zScale: 1 });
const PICTURES: Record<FactionId, PictureSpec> = {
  usa: PICTURE('usa'),
  russia: PICTURE('russia'),
  china: PICTURE('china'),
  europe: PICTURE('europe'),
  islamic: PICTURE('islamic'),
};
for (const spec of Object.values(PICTURES)) pictureArt(spec);

/**
 * Flagpole (1 × 1 cell): each nation's flag plaza with the nation's own pole (see drawNationalPole) and its flag
 * waving on top. `flagOf`: the nation whose flag flies (its owner after a capture; the plaza stays `faction`'s).
 */
export function createFlagpoleArt(faction: FactionId, flagOf: FactionId = faction): BuildingArt {
  const plaza = PLAZAS[faction];
  const base = plaza.top;
  return {
    footprint: { w: 1, d: 1 },
    height: POLE_H + 30,

    drawStatic(p) {
      drawPicture(p, PICTURES[faction]);
      drawNationalPole(p, faction, 0.5, 0.5, base, POLE_H, POLE_K);
    },

    drawAnimated(p, time) {
      plaza.animate?.(p, time);
      drawFlagOnPole(p, flagOf, 0.5, 0.5, base + POLE_H, time, 0.3);
    },
  };
}
