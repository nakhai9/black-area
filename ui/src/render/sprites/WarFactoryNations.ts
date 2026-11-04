import type { FactionId } from '../../types';

/** A nation's War Factory (5×4 plot): flag poles (u, v, base z) and blinking lights (u, v, z) on its picture. */
export interface FactoryDesign {
  readonly flags: readonly [number, number, number][];
  readonly lights: readonly [number, number, number][];
}

/**
 * Every nation's War Factory is rendered in Blender (tools/blender/models/warfactory.py → building-warfactory-<nation>):
 * USA — steel assembly hall with sawtooth north-light roofs, three hazard-framed roller bays, gantry cranes, two stacks;
 * Russia — red-brick "kombinat" with clerestory, concrete administration tower with a red star and a banded chimney;
 * China — imperial workshop under curled double eaves, red-column front gallery and gate pavilions;
 * Europe — Belle Époque limestone hall with a slate mansard, dormers, glass lantern and pedimented star-ring pavilion;
 * Islamic — fortified caravanserai with crenellations, four domed corner towers, pointed-arch bays and a great green dome.
 * Each has a tower crane. These are the flags and lights drawn over the pictures.
 */
export const FACTORY_DESIGNS: Record<FactionId, FactoryDesign> = {
  usa: {
    flags: [[0.3, 3.7, 22], [4.7, 3.7, 22]],
    lights: [[0.95, 0.25, 43], [4.05, 0.25, 43]],
  },
  russia: { flags: [[1.55, 3.55, 40]], lights: [[4.4, 0.6, 72]] },
  china: { flags: [[0.45, 3.55, 44], [4.55, 3.55, 44]], lights: [[1.6, 3.85, 14], [3.4, 3.85, 14]] },
  europe: { flags: [[2.5, 3.55, 46]], lights: [[2.5, 1.9, 46.5]] },
  islamic: { flags: [[2.5, 3.6, 22]], lights: [[0.35, 0.35, 49], [4.65, 0.35, 49]] },
};
