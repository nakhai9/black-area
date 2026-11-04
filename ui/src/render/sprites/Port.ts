import { PORT_PIER } from '../../constants';
import type { FactionId } from '../../types';

import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

const W = 12;
const D = 8;
const DECK = 3;
/** The airstrip runs along the back edge, v ∈ [0, RUNWAY_D] (the Airfield's, so aircraft use the same runway line). */
const RUNWAY_D = 1.6;

/** Rendered in Blender (tools/blender/building_render.py port-<nation>): the same harbour in each nation's concrete, sheds and team colour. */
const PICTURE = (faction: FactionId): PictureSpec => ({ file: `building-port-${faction}`, originX: 262, originY: 60, scale: 3, footprint: { w: W, d: D }, zScale: 1.35 });

/**
 * Naval Port (12×8 tiles), a harbour complex: an airstrip along the back edge, a quay in front of it with a warehouse,
 * the harbour office and control tower, a gantry crane and containers, and two wide piers down the sides, each with two
 * marked aircraft parking pads (PORT_SLOTS; the aircraft are real units). The U-shaped basin between the piers is left
 * transparent, so the sea shows through and ships moor in it.
 */
export function createPortArt(faction: FactionId): BuildingArt {
  return pictureArt(PICTURE(faction), {
    drawAnimated(p, time) {
      // Runway lights along both edges of the strip.
      const lit = Math.sin(time * 4) > 0;
      p.ctx.fillStyle = lit ? '#ffe9a0' : '#8a7a40';
      for (let u = 0.15; u < W; u += 1.1) {
        for (const v of [0.03, RUNWAY_D - 0.03]) {
          const [x, y] = p.project(u, v, DECK + 0.3);
          p.ctx.beginPath();
          p.ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          p.ctx.fill();
        }
      }
      // Green / red harbour lights at the pier heads, blinking alternately.
      const on = Math.sin(time * 3) > 0;
      for (const [u, c] of [[PORT_PIER / 2, '#30e060'], [W - PORT_PIER / 2, '#ff3b30']] as const) {
        if ((u < W / 2) !== on) continue;
        const [x, y] = p.project(u, D - 0.18, DECK + 5.4);
        p.ctx.fillStyle = c;
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  });
}
