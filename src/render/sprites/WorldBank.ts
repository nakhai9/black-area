import { shade } from '../Color';
import { drawFlagOnPole } from '../Flags';
import { type IsoPainter, LIGHT } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { facade, parapet, roofClutter } from './Ra2Kit';

const PLAZA = '#a29d92';
const STONE = '#c8c0ae';
const RECESS = '#5e594f';
const GLASS = '#3a5064';
const GOLD = '#c49a3e';

const TOWER = { u: 1.35, v: 0.85, w: 1.3, d: 1.3, z: 38, h: 46 } as const;
const ANTENNA_TOP = 38 + 46 + 6 + 14;

function glassTower(p: IsoPainter): void {
  const { u, v, w, d, z, h } = TOWER;
  p.box(u, v, w, d, z, h, '#8a8f92', { top: shade(GLASS, 1.15) });
  for (const face of ['left', 'right'] as const) {
    facade(p, face, u, v, w, d, z, h, { cols: 9, floors: 11, glass: GLASS, frame: null, fill: 0.7, band: 0.3, bandColor: '#6c7174', lit: 0.1, seed: face === 'left' ? 41 : 42 });
    // Stone corner piers.
    p.faceRect(face, u, v, w, d, z, h, 0, 0.05, 0, 1, STONE);
    p.faceRect(face, u, v, w, d, z, h, 0.95, 1, 0, 1, STONE);
  }
  p.box(u - 0.05, v - 0.05, w + 0.1, d + 0.1, z + h, 6, STONE);
  parapet(p, u - 0.05, v - 0.05, w + 0.1, d + 0.1, z + h + 6, shade(STONE, 0.9), 0.06, 2);
  roofClutter(p, u, v, w, d, z + h + 6, 7);
}

/**
 * Global Financial Center (Zürich, neutral) — neoclassical banking hall with a colonnade
 * and pediment, crowned by a modern glass tower and a golden globe.
 */
export const WorldBankArt: BuildingArt = {
  footprint: { w: 4, d: 4 },
  height: 112,

  drawStatic(p) {
    p.box(0, 0, 4, 4, 0, 3, PLAZA);
    p.topRect(0.2, 3.1, 3.8, 3.85, 3, shade(PLAZA, 1.08));

    // Podium and banking hall.
    p.box(0.45, 0.45, 3.1, 2.65, 3, 6, shade(STONE, 0.92));
    p.box(0.7, 0.6, 2.6, 2.2, 9, 26, STONE);
    p.colonnade('left', 0.7, 0.6, 2.6, 2.2, 9, 22, 10, shade(STONE, LIGHT.left + 0.18), RECESS);
    p.colonnade('right', 0.7, 0.6, 2.6, 2.2, 9, 22, 8, shade(STONE, LIGHT.right + 0.08), RECESS);
    p.box(0.66, 0.56, 2.68, 2.28, 31, 4, shade(STONE, 1.04));
    p.box(0.62, 0.52, 2.76, 2.36, 35, 3, STONE);
    // Rooftop of the banking hall: tar roof with plant either side of the tower.
    p.topRect(0.7, 0.6, 3.3, 2.8, 38, '#4a4c50');
    roofClutter(p, 0.75, 2.2, 2.5, 0.5, 38, 9);
    // Lamp posts and planters on the plaza.
    for (const lu of [0.3, 1.1, 2.9, 3.7]) {
      p.pole(lu, 3.4, 3, 9, '#3a3c3e');
      p.box(lu - 0.08, 3.75, 0.16, 0.16, 3, 2, '#7a756a', { top: '#4a6a30' });
    }

    glassTower(p);

    // Front steps and pediment.
    p.box(1.3, 2.8, 1.4, 0.45, 3, 6, shade(STONE, 0.95));
    p.box(1.4, 2.78, 1.2, 0.2, 31, 4, STONE);
    p.gableRoofV(1.4, 2.78, 1.2, 0.2, 35, 8, STONE, '#cfc8b8');

    // Golden globe and antenna.
    p.cylinder(2.0, 1.5, 0.12, TOWER.z + TOWER.h + 6, 4, STONE);
    p.dome(2.0, 1.5, 0.2, TOWER.z + TOWER.h + 10, 14, GOLD);
    p.pole(2.0, 1.5, TOWER.z + TOWER.h + 24, 6, '#bfc4c8');

    // One flag at each side (mirror images about u = 2).
    p.pole(0.35, 3.6, 3, 34);
    p.pole(3.65, 3.6, 3, 34);
  },

  drawAnimated(p, time) {
    // Blinking aviation light.
    if (Math.sin(time * 3.2) > 0.2) {
      const [x, y] = p.project(2.0, 1.5, ANTENNA_TOP);
      p.ctx.fillStyle = '#ff3b30';
      p.ctx.shadowColor = '#ff3b30';
      p.ctx.shadowBlur = 6;
      p.ctx.beginPath();
      p.ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.shadowBlur = 0;
    }
    drawFlagOnPole(p, 'neutral', 0.35, 3.6, 37, time, 0.3, 18, 11);
    drawFlagOnPole(p, 'neutral', 3.65, 3.6, 37, time, 1.4, 18, 11);
  },
};
