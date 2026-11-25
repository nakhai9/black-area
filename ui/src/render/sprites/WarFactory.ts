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

/** Damage stages (tools/blender/models/_wreck.py): stage 2 destroys the u > RUIN_SPLIT_U half; fallen poles stand RUIN_POLE_Z up. */
const RUIN_SPLIT_U = 2.5;
const RUIN_POLE_Z = 8;

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
export function createWarFactoryArt(faction: FactionId, flagOf: FactionId = faction, stage = 0): BuildingArt {
  const design = FACTORY_DESIGNS[faction];
  // Damaged pictures: a light whose mount is gone goes dark; a pole whose mount fell stands on a ruin block (_wreck.py).
  const flags = design.flags.map(([u, v, z]) => [u, v, stage >= 3 || (stage === 2 && u > RUIN_SPLIT_U) ? RUIN_POLE_Z : z] as const);
  const lights = stage >= 2 ? design.lights.filter(([u, , z]) => stage < 3 && u <= RUIN_SPLIT_U && z < 60) : design.lights;
  const spec = PICTURE(faction);
  const art = pictureArt(stage ? { ...spec, file: `${spec.file}-d${stage}` } : spec, {
    overlay(p) {
      for (const [u, v, z] of flags) drawNationalPole(p, faction, u, v, z, 22);
    },
    drawAnimated(p, time) {
      p.ctx.fillStyle = Math.sin(time * 3) > 0 ? '#ffb25a' : '#7a5530';
      for (const [u, v, z] of lights) {
        const [x, y] = p.project(u, v, z);
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        p.ctx.fill();
      }
      flags.forEach(([u, v, z], i) => drawFlagOnPole(p, flagOf, u, v, z + 22, time, i * 1.2));
    },
  });
  if (stage === 0) art.damaged = (n) => createWarFactoryArt(faction, flagOf, Math.min(3, Math.max(1, n)));
  return art;
}
