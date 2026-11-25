import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';
import { FOOTPRINT_MILITARY_GARAGE } from '../../constants';

/**
 * Military Garage (6 × 4 plot: the long side along the front, doors on it), each nation its own design, rendered in Blender (building-garage-<nation>, plus the
 * -d1..-d3 damage pictures): Russia one steel vault, one door; China two steel vaults, two doors; USA a steel box,
 * one door; Islamic world a three-bay gabled shed, three doors; Europe a concrete vault, one door.
 * originX / originY as printed by kit.render: originX = d × 32 + 6 = 134 for every design; originY = height × 1.35 + 6.
 * Script: tools/blender/models/garage.py (kit.render footprint (6, 4) = w along u, d along v).
 */
const ORIGINS: Record<FactionId, readonly [number, number]> = {
  russia: [134, 62.7],
  china: [134, 54.6],
  usa: [134, 57.3],
  islamic: [134, 54.6],
  europe: [134, 60],
};

const PICTURE = (faction: FactionId): PictureSpec => ({
  file: `building-garage-${faction}`,
  originX: ORIGINS[faction][0],
  originY: ORIGINS[faction][1],
  scale: 3,
  footprint: FOOTPRINT_MILITARY_GARAGE,
  zScale: 1.35,
});

export function createMilitaryGarageArt(faction: FactionId): BuildingArt {
  const spec = PICTURE(faction);
  return pictureArt(spec, { damageFiles: [1, 2, 3].map((n) => `${spec.file}-d${n}`) });
}
