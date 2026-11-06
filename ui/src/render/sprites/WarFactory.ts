import type { FactionId } from '../../types';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';
import { FACTORY_DESIGNS } from './WarFactoryNations';

/** Where the art origin lies in each nation's picture (from building-warfactory-<nation>.json). */
const ORIGINS: Record<FactionId, [number, number]> = {
  usa: [134, 127.5],
  russia: [134, 130.2],
  china: [134, 127.5],
  europe: [134, 127.5],
  islamic: [134, 127.5],
};

/** Rendered in Blender (tools/blender/building_render.py warfactory-<nation>). */
const PICTURE = (faction: FactionId): PictureSpec => ({
  file: `building-warfactory-${faction}`,
  originX: ORIGINS[faction][0],
  originY: ORIGINS[faction][1],
  scale: 3,
  footprint: { w: 5, d: 4 },
  zScale: 1.35,
});

/**
 * War Factory (5×4 tiles) in each nation's own architecture (see WarFactoryNations), with its flags and blinking lights.
 * `flagOf`: the nation whose flags fly (its owner after a capture; the design stays `faction`'s).
 */
export function createWarFactoryArt(faction: FactionId, flagOf: FactionId = faction): BuildingArt {
  const design = FACTORY_DESIGNS[faction];
  return pictureArt(PICTURE(faction), {
    overlay(p) {
      for (const [u, v, z] of design.flags) drawNationalPole(p, faction, u, v, z, 22);
    },
    drawAnimated(p, time) {
      p.ctx.fillStyle = Math.sin(time * 3) > 0 ? '#ffb25a' : '#7a5530';
      for (const [u, v, z] of design.lights) {
        const [x, y] = p.project(u, v, z);
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        p.ctx.fill();
      }
      design.flags.forEach(([u, v, z], i) => drawFlagOnPole(p, flagOf, u, v, z + 22, time, i * 1.2));
    },
  });
}
