import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import { type BuildingArt, groundShadow } from './BuildingArt';

const PAD = '#a3a095';
const WALL = '#c4c0b4';
const STEEL = '#8b9199';
const DISH = '#e9ecef';
const MASTS: readonly [number, number][] = [
  [0.3, 0.3],
  [3.7, 0.3],
  [0.3, 3.7],
  [3.7, 3.7],
];

/**
 * Radar Station (4×4 tiles, mirror-symmetric about its centre line): a low
 * control block with a team-colour band and four corner masts, and a tall
 * tower carrying a slowly rotating radar dish.
 */
export function createRadarArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  return {
    footprint: { w: 4, d: 4 },
    height: 90,

    drawStatic(p) {
      groundShadow(p, 4, 4);
      p.box(0, 0, 4, 4, 0, 2, PAD);

      // Corner masts with a team-colour tip (mirror images).
      for (const [u, v] of MASTS) {
        p.cylinder(u, v, 0.05, 2, 20, STEEL);
        p.cylinder(u, v, 0.07, 22, 3, team.primary);
      }

      // Control block around the tower foot.
      p.box(0.9, 0.9, 2.2, 2.2, 2, 12, WALL);
      p.windows('left', 0.9, 0.9, 2.2, 2.2, 2, 12, 5, 1, '#566b7a', 0.12, 0.45);
      p.windows('right', 0.9, 0.9, 2.2, 2.2, 2, 12, 5, 1, '#6a8090', 0.12, 0.45);
      p.faceRect('left', 0.9, 0.9, 2.2, 2.2, 2, 12, 0, 1, 0.82, 0.94, team.primary);
      p.box(0.85, 0.85, 2.3, 2.3, 14, 1.5, shade(WALL, 0.85));

      // Tower and the platform the dish sits on.
      p.cylinder(2.0, 2.0, 0.28, 15, 36, STEEL, 6);
      p.cylinder(2.0, 2.0, 0.36, 51, 3, shade(team.primary, 0.9));
      p.pole(2.0, 2.0, 54, 6, '#bfc4c8');
    },

    drawAnimated(p, time) {
      // Dish seen from the side while it turns: its apparent width follows cos(angle).
      const [x, y] = p.project(2.0, 2.0, 62);
      const { ctx } = p;
      const a = time * 0.9;
      const w = Math.abs(Math.cos(a)) * 17 + 2;
      const lean = Math.sin(a) * 4;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = DISH;
      ctx.strokeStyle = '#6b7178';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(lean * 0.4, -1, w / 2, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shade(team.primary, 1.1);
      ctx.beginPath();
      ctx.ellipse(lean * 0.4, -1, Math.max(1, w / 7), 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b7178';
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(lean, -1);
      ctx.stroke();
      ctx.restore();
      // Blinking beacon.
      if (Math.sin(time * 3) > 0.2) {
        const [bx, by] = p.project(2.0, 2.0, 62 + 8);
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath();
        ctx.arc(bx, by - 8, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
