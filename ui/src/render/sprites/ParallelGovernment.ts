import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { RA2 } from './Ra2Kit';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { STYLES, plot } from './AlliedBuilding';

/** Two poles side by side on the forecourt: the holder's flag on the left, the host nation's on the right, both waving the same way. */
const FLAGS: readonly [number, number][] = [
  [1.72, 4.55],
  [2.28, 4.55],
];

/**
 * Parallel Government (4×5 tiles): the seat of the host nation's government (`faction`) in its own architecture on the
 * back 4×4, and a paved forecourt in front where the holder's flag (`flag`) and the host nation's fly next to each other.
 */
export function createParallelGovArt(faction: FactionId, flag: FactionId = faction): BuildingArt {
  const team = FACTIONS[faction].colors.primary;
  const style = STYLES[faction];
  return {
    footprint: { w: 4, d: 5 },
    height: Math.max(style.height, 48),

    drawStatic(p) {
      p.box(0, 0, 4, 5, 0, 2, RA2.paving);
      plot(p, style.wing, faction.length * 17);
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
