import { PORT_PIER, PORT_QUAY, PORT_SLOTS } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';

import type { BuildingArt } from './BuildingArt';
import { RA2, facade, parapet } from './Ra2Kit';

const W = 12;
const D = 8;
const DECK = 3;
const YELLOW = '#d8b23a';
const RUNWAY = '#3a3c40';
const PAINT = '#d4d2c8';
const TAXI = '#c4a83a';
/** The airstrip runs along the back edge, v ∈ [0, RUNWAY_D] (the Airfield's, so aircraft use the same runway line). */
const RUNWAY_D = 1.6;

function materials(faction: FactionId): { quay: string; shed: string; roof: string } {
  switch (faction) {
    case 'russia':
      return { quay: '#7c7d78', shed: '#8a8f84', roof: '#5b6b58' };
    case 'china':
      return { quay: '#86847a', shed: '#b8b0a0', roof: '#4e6a8a' };
    case 'islamic':
      return { quay: '#a89a80', shed: '#d0bb92', roof: '#c8c0b0' };
    case 'europe':
      return { quay: '#8a8e90', shed: '#a8b0b8', roof: '#3f5a78' };
    default:
      return { quay: '#8b9095', shed: '#c0c4c8', roof: '#6c747c' };
  }
}

/** Thin painted rectangle outline on a parking pad. */
function outline(p: IsoPainter, u0: number, v0: number, u1: number, v1: number): void {
  const t = 0.04;
  const z = DECK + 0.06;
  p.topRect(u0, v0, u1, v0 + t, z, PAINT);
  p.topRect(u0, v1 - t, u1, v1, z, PAINT);
  p.topRect(u0, v0, u0 + t, v1, z, PAINT);
  p.topRect(u1 - t, v0, u1, v1, z, PAINT);
}

/** Mooring bollards along a pier's inner edge. */
function bollards(p: IsoPainter, u: number, v0: number, v1: number): void {
  for (let v = v0 + 0.5; v < v1; v += 1.1) p.cylinder(u, v, 0.08, DECK, 1.4, '#2c2e30');
}

/** Rubber fenders hung on a pier's inner wall (dark strips down to the water). */
function fenders(p: IsoPainter, face: 'left' | 'right', u: number, v: number, w: number, d: number): void {
  for (let s = 0.06; s < 0.95; s += 0.12) p.faceRect(face, u, v, w, d, 0, DECK, s, s + 0.04, 0.15, 0.95, '#1e1f21');
}

/**
 * Naval Port (12×8 tiles), a harbour complex: an airstrip along the back edge, a quay in front of it with the harbour
 * office, control tower and a gantry crane, and two wide piers down the sides, each with two marked aircraft parking
 * pads (PORT_SLOTS; the aircraft are real units). The U-shaped basin between the piers is left unpainted, so the sea
 * shows through and ships moor in it.
 */
export function createPortArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors.primary;
  const { quay: QUAY, shed: SHED } = materials(faction);
  const inner0 = PORT_PIER;
  const inner1 = W - PORT_PIER;
  return {
    footprint: { w: W, d: D },
    height: 70,

    drawStatic(p) {
      // Quay and piers: one U of concrete, edges painted yellow.
      // No edge style: a low slab from the plot corner is otherwise taken for a ground plate and left out (IsoPainter.box).
      p.box(0, 0, W, PORT_QUAY, 0, DECK, QUAY, { edge: null });
      p.box(0, PORT_QUAY, PORT_PIER, D - PORT_QUAY, 0, DECK, QUAY);
      p.box(inner1, PORT_QUAY, PORT_PIER, D - PORT_QUAY, 0, DECK, QUAY);
      p.topRect(inner0, PORT_QUAY - 0.1, inner1, PORT_QUAY - 0.04, DECK + 0.05, YELLOW);
      p.topRect(inner0 - 0.1, PORT_QUAY, inner0 - 0.04, D, DECK + 0.05, YELLOW);
      p.topRect(inner1 + 0.04, PORT_QUAY, inner1 + 0.1, D, DECK + 0.05, YELLOW);
      p.faceRect('left', inner0, 0, inner1 - inner0, PORT_QUAY, 0, DECK, 0, 1, 0.6, 0.85, team);
      fenders(p, 'left', inner0, 0, inner1 - inner0, PORT_QUAY);
      fenders(p, 'right', 0, PORT_QUAY, PORT_PIER, D - PORT_QUAY);
      bollards(p, inner0 - 0.2, PORT_QUAY, D);
      bollards(p, inner1 + 0.2, PORT_QUAY, D);

      // Airstrip along the back edge: edge lines, centre dashes, threshold marks.
      p.topRect(0, 0, W, RUNWAY_D, DECK + 0.02, RUNWAY);
      p.topRect(0, 0.06, W, 0.12, DECK + 0.05, PAINT);
      p.topRect(0, RUNWAY_D - 0.12, W, RUNWAY_D - 0.06, DECK + 0.05, PAINT);
      const mid = RUNWAY_D / 2;
      for (let u = 0.6; u < W - 0.7; u += 0.9) p.topRect(u, mid - 0.04, u + 0.5, mid + 0.04, DECK + 0.05, PAINT);
      for (const u of [0.15, W - 0.3]) for (let k = 0; k < 4; k++) p.topRect(u, 0.22 + k * 0.33, u + 0.15, 0.4 + k * 0.33, DECK + 0.05, PAINT);

      // Taxiways from the strip down each pier, and the four parking pads (two per pier).
      for (const u of [PORT_PIER / 2, W - PORT_PIER / 2]) p.topRect(u - 0.04, RUNWAY_D, u + 0.04, D - 0.3, DECK + 0.05, TAXI);
      for (const [u, v] of PORT_SLOTS) {
        p.topRect(u - 1.25, v - 0.9, u + 1.25, v + 0.9, DECK + 0.03, shade(QUAY, 0.9));
        outline(p, u - 1.25, v - 0.9, u + 1.25, v + 0.9);
        p.topRect(u - 0.35, v - 0.04, u + 0.35, v + 0.04, DECK + 0.06, PAINT);
      }

      // Harbour office on the quay, with the control tower on its roof.
      p.box(3.4, RUNWAY_D + 0.15, 2.2, 1.0, DECK, 8, SHED, { top: RA2.roof });
      facade(p, 'left', 3.4, RUNWAY_D + 0.15, 2.2, 1.0, DECK, 8, { cols: 6, floors: 2, frame: '#d0d4d8', bandColor: shade(SHED, 0.7), seed: 31 });
      facade(p, 'right', 3.4, RUNWAY_D + 0.15, 2.2, 1.0, DECK, 8, { cols: 3, floors: 2, frame: '#d0d4d8', bandColor: shade(SHED, 0.65), seed: 32 });
      const tu = 4.0;
      const tv = RUNWAY_D + 0.65;
      p.box(tu - 0.16, tv - 0.16, 0.32, 0.32, DECK + 8, 12, SHED);
      p.box(tu - 0.34, tv - 0.34, 0.68, 0.68, DECK + 20, 1.2, RA2.steelDark);
      p.box(tu - 0.3, tv - 0.3, 0.6, 0.6, DECK + 21, 5, RA2.glass, { top: RA2.tar });
      p.box(tu - 0.36, tv - 0.36, 0.72, 0.72, DECK + 26, 1.4, shade(team, 0.85));
      parapet(p, tu - 0.36, tv - 0.36, 0.72, 0.72, DECK + 27.4, RA2.steelDark, 0.05, 1);
      p.pole(tu, tv, DECK + 27.4, 8, '#c0c0c0');

      // Gantry crane on the quay, its boom reaching out over the basin.
      const CRANE = shade(team, 0.95);
      for (const u of [7.0, 7.9]) for (const v of [RUNWAY_D + 0.2, PORT_QUAY - 0.2]) p.box(u - 0.07, v - 0.07, 0.14, 0.14, DECK, 20, CRANE);
      p.box(6.85, RUNWAY_D + 0.1, 1.2, PORT_QUAY - RUNWAY_D - 0.2, DECK + 20, 2.5, CRANE);
      p.box(7.35, RUNWAY_D + 0.2, 0.2, 4.2, DECK + 22.5, 1.2, CRANE);
      p.box(7.1, RUNWAY_D + 0.25, 0.7, 0.6, DECK + 22.5, 3, '#e0e0d8');
      p.pole(7.45, 4.9, DECK + 8, 14.5, '#2a2a2a');
      // A few containers and a fuel tank on the quay corners.
      p.box(0.3, RUNWAY_D + 0.2, 1.3, 0.55, DECK, 3, '#b8432f');
      p.box(1.7, RUNWAY_D + 0.2, 1.3, 0.55, DECK, 3, '#2f6e9c');
      p.box(0.9, RUNWAY_D + 0.2, 1.3, 0.55, DECK + 3, 3, '#c49a2a');
      p.cylinder(W - 1.2, RUNWAY_D + 0.7, 0.55, DECK, 6, '#d8dadc', 2);
      // Pier-head lights.
      for (const u of [PORT_PIER / 2, W - PORT_PIER / 2]) p.box(u - 0.12, D - 0.3, 0.24, 0.24, DECK, 5, '#e8e8e0');
    },

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
  };
}
