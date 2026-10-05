import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import { type IsoPainter, LIGHT } from '../IsoPainter';
import { type BuildingArt, groundShadow } from './BuildingArt';

const PAD = '#9a958a';
const WALL = '#b9ad8f';
const ARMORY = '#8d8a7d';
const YARD = '#a88a5c';
const SANDBAG = '#c2ad7a';
const GLASS = '#3d4650';
const POST = '#5d4a36';

const FLAG = { u: 1.5, v: 2.72, z: 2, h: 30 } as const;

/** Watchtower on four posts, centred at (cu, cv). */
function tower(p: IsoPainter, cu: number, cv: number, roof: string): void {
  for (const du of [-0.2, 0.2]) for (const dv of [-0.2, 0.2]) p.box(cu + du - 0.025, cv + dv - 0.025, 0.05, 0.05, 2, 22, POST);
  p.box(cu - 0.27, cv - 0.27, 0.54, 0.54, 24, 3, '#7a6a52');
  p.pyramid(cu - 0.27, cv - 0.27, 0.54, 0.54, 27, 8, roof);
}

/**
 * Infantry barracks (3×3 tiles), mirror-symmetric about its centre line: a
 * khaki dormitory hall with a team-coloured roof and central door, matching
 * armory annexes on both sides, a watchtower at each front corner, a training
 * yard with obstacle bars, a sandbag line and the national flag in the middle.
 */
export function createBarracksArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const ROOF = shade(team.primary, 0.85);

  return {
    footprint: { w: 3, d: 3 },
    height: 64,

    drawStatic(p) {
      groundShadow(p, 3, 3);
      p.box(0, 0, 3, 3, 0, 2, PAD);

      // Training yard with obstacle bars (centred).
      p.topRect(0.6, 1.7, 2.4, 2.6, 2, YARD);
      for (const u of [0.9, 1.5, 2.1]) {
        p.box(u - 0.03, 1.85, 0.06, 0.06, 2, 6, POST);
        p.box(u - 0.03, 2.3, 0.06, 0.06, 2, 6, POST);
        p.box(u - 0.03, 1.85, 0.06, 0.51, 7, 1, POST);
      }

      // Armory annexes (mirror images).
      for (const u of [0.1, 2.5]) {
        p.box(u, 0.35, 0.4, 0.95, 2, 11, ARMORY, { top: shade(team.primary, 0.9) });
        p.faceRect('left', u, 0.35, 0.4, 0.95, 2, 11, 0.2, 0.8, 0, 0.7, '#4a4840');
      }

      // Central dormitory hall: team-colour band, centred door, hip roof.
      p.box(0.55, 0.25, 1.9, 1.1, 2, 14, WALL);
      p.windows('left', 0.55, 0.25, 1.9, 1.1, 2, 14, 6, 1, GLASS, 0.12, 0.5);
      p.windows('right', 0.55, 0.25, 1.9, 1.1, 2, 14, 3, 1, GLASS, 0.12, 0.5);
      p.faceRect('left', 0.55, 0.25, 1.9, 1.1, 2, 14, 0.46, 0.54, 0, 0.62, shade(team.dark, 1.2));
      p.faceRect('left', 0.55, 0.25, 1.9, 1.1, 2, 14, 0, 1, 0.86, 1, shade(team.primary, LIGHT.left + 0.1));
      p.hipRoof(0.55, 0.25, 1.9, 1.1, 16, 9, 0.08, ROOF);

      // Sandbag line along the front, centred on u = 1.5.
      for (let i = -2; i <= 2; i++) p.box(1.5 + i * 0.24 - 0.11, 2.85, 0.22, 0.1, 2, 3, SANDBAG);

      // Corner watchtowers (mirror images).
      tower(p, 0.4, 2.35, ROOF);
      tower(p, 2.6, 2.35, ROOF);

      p.pole(FLAG.u, FLAG.v, FLAG.z, FLAG.h);
    },

    drawAnimated(p, time) {
      drawFlagOnPole(p, faction, FLAG.u, FLAG.v, FLAG.z + FLAG.h, time, 0.6, 16, 10);
    },
  };
}
