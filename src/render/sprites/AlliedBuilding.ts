import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

const PAD = '#b3b1a7';
const LAWN = '#6d9f4a';
const PATH = '#cbc7bb';

/** Flags at the two front corners of the plot. */
const FLAGS: readonly [number, number][] = [
  [0.35, 3.65],
  [3.65, 0.35],
];

/** Plot shared by every nation: paved pad, two lawns and a path to the door. */
function plot(p: IsoPainter): void {
  p.box(0, 0, 4, 4, 0, 2, PAD);
  p.topRect(0.15, 3.0, 1.55, 3.85, 2, LAWN);
  p.topRect(2.45, 3.0, 3.85, 3.85, 2, LAWN);
  p.topRect(1.6, 3.0, 2.4, 3.95, 2, PATH);
}

/**
 * The seat of an allied government, built in the architecture of the nation it follows:
 *  - USA: a white neoclassical hall with a columned portico and a low dome;
 *  - Russia: a Stalinist tower in red-brown stone with a spire and red star;
 *  - China: a hall on a white terrace under a red-gold sweeping roof, red columns in front;
 *  - Europe: a glass office block with a blue band and a ring of gold stars.
 */
const STYLES: Record<FactionId, { height: number; draw: (p: IsoPainter, team: string) => void }> = {
  usa: {
    height: 70,
    draw: (p, team) => {
      const W = '#f2efe6';
      p.box(0.4, 0.5, 3.2, 2.3, 2, 4, '#dcd8cc');
      p.box(0.5, 0.6, 3.0, 2.0, 6, 20, W);
      p.windows('left', 0.5, 0.6, 3.0, 2.0, 6, 20, 6, 2, '#7d93a6', 0.1, 0.45);
      p.windows('right', 0.5, 0.6, 3.0, 2.0, 6, 20, 4, 2, '#8aa1b4', 0.1, 0.45);
      // Portico: columns under a pediment-like slab.
      p.box(1.25, 2.6, 1.5, 0.45, 6, 0.8, W);
      p.colonnade('left', 1.25, 2.6, 1.5, 0.45, 6.8, 15, 5, '#ffffff', '#6f6a5e');
      p.box(1.15, 2.55, 1.7, 0.55, 21.8, 2.5, W);
      p.faceRect('left', 1.15, 2.55, 1.7, 0.55, 21.8, 2.5, 0, 1, 0.2, 0.8, team);
      p.topRect(0.6, 0.7, 3.4, 2.5, 26, '#c9c6bc');
      p.dome(2.0, 1.6, 0.6, 26, 12, '#e9e6dc');
      p.pole(2.0, 1.6, 38, 6, '#d8d8d8');
    },
  },
  russia: {
    height: 120,
    draw: (p, team) => {
      const STONE = '#9b6b55';
      const LIGHT = '#c9b49a';
      p.box(0.4, 0.4, 3.2, 2.6, 2, 18, STONE);
      p.windows('left', 0.4, 0.4, 3.2, 2.6, 2, 18, 7, 3, '#e8dcb0', 0.08, 0.45);
      p.windows('right', 0.4, 0.4, 3.2, 2.6, 2, 18, 5, 3, '#efe3b8', 0.08, 0.45);
      p.box(1.1, 1.0, 1.8, 1.6, 20, 30, LIGHT);
      p.windows('left', 1.1, 1.0, 1.8, 1.6, 20, 30, 4, 5, '#7a5a44', 0.1, 0.45);
      p.windows('right', 1.1, 1.0, 1.8, 1.6, 20, 30, 3, 5, '#7a5a44', 0.1, 0.45);
      p.box(1.4, 1.3, 1.2, 1.0, 50, 14, STONE);
      p.faceRect('left', 1.4, 1.3, 1.2, 1.0, 50, 14, 0, 1, 0.8, 1, team);
      p.pyramid(1.5, 1.4, 1.0, 0.8, 64, 18, shade(STONE, 0.9));
      p.pole(2.0, 1.8, 82, 20, '#d9b13b');
    },
  },
  china: {
    height: 64,
    draw: (p, team) => {
      p.box(0.3, 0.4, 3.4, 2.6, 2, 5, '#ebe7dc');
      p.box(0.6, 0.7, 2.8, 2.0, 7, 15, '#c8b79a');
      p.windows('left', 0.6, 0.7, 2.8, 2.0, 7, 15, 6, 1, '#5a3a22', 0.12, 0.4);
      p.windows('right', 0.6, 0.7, 2.8, 2.0, 7, 15, 4, 1, '#5a3a22', 0.12, 0.4);
      for (let i = 0; i < 6; i++) p.box(0.75 + i * 0.5, 2.62, 0.1, 0.1, 7, 15, '#b3261e');
      p.hipRoof(0.6, 0.7, 2.8, 2.0, 22, 14, 0.35, '#c9a227', 0.6);
      p.faceRect('left', 0.6, 0.7, 2.8, 2.0, 7, 15, 0.3, 0.7, 0.7, 0.95, team);
    },
  },
  europe: {
    height: 92,
    draw: (p, team) => {
      const GLASS = '#5d89ad';
      p.box(0.5, 0.5, 3.0, 2.4, 2, 10, '#d7dbdf');
      p.box(0.8, 0.7, 2.4, 2.0, 12, 54, GLASS);
      p.windows('left', 0.8, 0.7, 2.4, 2.0, 12, 54, 6, 9, '#a9d6ef', 0.07, 0.36);
      p.windows('right', 0.8, 0.7, 2.4, 2.0, 12, 54, 5, 9, shade('#a9d6ef', 1.1), 0.07, 0.36);
      p.faceRect('left', 0.8, 0.7, 2.4, 2.0, 12, 54, 0, 1, 0.45, 0.52, team);
      p.faceRect('right', 0.8, 0.7, 2.4, 2.0, 12, 54, 0, 1, 0.45, 0.52, shade(team, 0.85));
      p.box(0.9, 0.8, 2.2, 1.8, 66, 4, '#e3e6ea');
      // Ring of twelve gold stars on the roof.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        p.topRect(2.0 + Math.cos(a) * 0.6 - 0.05, 1.7 + Math.sin(a) * 0.6 - 0.05, 2.0 + Math.cos(a) * 0.6 + 0.05, 1.7 + Math.sin(a) * 0.6 + 0.05, 70, '#ffd646');
      }
    },
  },
};

/** Allied Building (4×4 tiles) in the leading nation's architecture, with its flag at two corners. */
export function createAlliedBuildingArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors.primary;
  const style = STYLES[faction];
  return {
    footprint: { w: 4, d: 4 },
    height: Math.max(style.height, 48),

    drawStatic(p) {
      plot(p);
      style.draw(p, team);
      for (const [u, v] of FLAGS) drawNationalPole(p, faction, u, v, 2, 30);
    },

    drawAnimated(p, time) {
      FLAGS.forEach(([u, v], i) => drawFlagOnPole(p, faction, u, v, 32, time, i * 1.1, 15, 9));
    },
  };
}
