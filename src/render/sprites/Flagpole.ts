import type { FactionId } from '../../types';
import { shade } from '../Color';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

/** A landmark pole: twice as tall as the poles on other buildings, thicker, with a big flag. */
const POLE_H = 84;
const POLE_K = 1.8;
const FLAG_W = 36;
const FLAG_H = 22;

/** One nation's flag plaza. */
interface Plaza {
  /** Height of the podium top, where the pole stands. */
  top: number;
  podium: (p: IsoPainter) => void;
  /** Extra animation (flame, lights…), drawn under the flag. */
  animate?: (p: IsoPainter, time: number) => void;
}

/** Square step centred in the cell. */
const step = (p: IsoPainter, inset: number, z: number, h: number, color: string, top?: string): void =>
  p.box(inset, inset, 1 - 2 * inset, 1 - 2 * inset, z, h, color, top ? { top } : {});

/** Small post with a lamp on top. */
const lamp = (p: IsoPainter, u: number, v: number, z: number, glow: string): void => {
  p.pole(u, v, z, 7, '#3b3f44');
  const [x, y] = p.project(u, v, z + 7);
  p.ctx.fillStyle = glow;
  p.ctx.beginPath();
  p.ctx.arc(x, y, 1.1, 0, Math.PI * 2);
  p.ctx.fill();
};

const PLAZAS: Record<FactionId, Plaza> = {
  // USA: three granite steps (a memorial plinth), a bronze plaque, lamp posts at the front corners.
  usa: {
    top: 6.8,
    podium: (p) => {
      step(p, 0, 0, 2, '#b9b6ae');
      p.topRect(0.04, 0.04, 0.96, 0.96, 2, '#6d9f4a');
      step(p, 0.18, 2, 1.6, '#c9c5bb');
      step(p, 0.28, 3.6, 1.6, '#d6d2c8');
      step(p, 0.36, 5.2, 1.6, '#e2ded5');
      p.faceRect('left', 0.18, 0.18, 0.64, 0.64, 2, 1.6, 0.35, 0.65, 0.15, 0.85, '#8a6a3a');
      lamp(p, 0.12, 0.88, 2, '#fff2c0');
      lamp(p, 0.88, 0.12, 2, '#fff2c0');
    },
  },
  // Russia: red granite podium on a black stone base, with the Eternal Flame in front of it.
  russia: {
    top: 6.8,
    podium: (p) => {
      step(p, 0, 0, 2, '#77706a');
      p.topRect(0.04, 0.04, 0.96, 0.96, 2, '#5b5650');
      step(p, 0.22, 2, 2.4, '#7d2a22', '#8f3329');
      step(p, 0.3, 4.4, 2.4, '#8f3329', '#a23d31');
      // Eternal Flame bowl (front).
      p.cylinder(0.72, 0.72, 0.1, 2, 1.4, '#2f2b28');
      // Low chain posts round the podium.
      for (const [u, v] of [[0.1, 0.9], [0.5, 0.92], [0.9, 0.9], [0.92, 0.5], [0.9, 0.1]] as const) p.box(u - 0.025, v - 0.025, 0.05, 0.05, 2, 3, '#2f2b28');
    },
    animate: (p, time) => {
      const [x, y] = p.project(0.72, 0.72, 3.4);
      const f = 0.8 + Math.sin(time * 11) * 0.15 + Math.sin(time * 7.3) * 0.1;
      const g = p.ctx.createRadialGradient(x, y - 1.5, 0.2, x, y - 1.5, 3.2 * f);
      g.addColorStop(0, 'rgba(255,240,170,0.95)');
      g.addColorStop(0.5, 'rgba(255,140,40,0.85)');
      g.addColorStop(1, 'rgba(200,40,10,0)');
      p.ctx.fillStyle = g;
      p.ctx.beginPath();
      p.ctx.ellipse(x, y - 1.8 * f, 1.6, 2.8 * f, 0, 0, Math.PI * 2);
      p.ctx.fill();
    },
  },
  // China: white marble terrace in two tiers with a balustrade all round and red lanterns at the front.
  china: {
    top: 6.4,
    podium: (p) => {
      step(p, 0, 0, 2, '#cfcabd');
      step(p, 0.08, 2, 2.4, '#ebe7dc');
      // Balustrade along the two front edges: a rail on little posts.
      for (let t = 0.1; t <= 0.91; t += 0.135) {
        p.box(t - 0.02, 0.88, 0.04, 0.04, 4.4, 2.2, '#f7f4ec');
        p.box(0.88, t - 0.02, 0.04, 0.04, 4.4, 2.2, '#f7f4ec');
      }
      p.box(0.08, 0.88, 0.84, 0.04, 6.6, 0.6, '#f7f4ec');
      p.box(0.88, 0.08, 0.04, 0.84, 6.6, 0.6, '#f7f4ec');
      step(p, 0.3, 4.4, 2, '#f4f1e8');
      for (const [u, v] of [[0.2, 0.85], [0.85, 0.2]] as const) {
        p.pole(u, v, 4.4, 8, '#5a2a1a');
        const [x, y] = p.project(u, v, 10.5);
        p.ctx.fillStyle = '#d42a1e';
        p.ctx.beginPath();
        p.ctx.ellipse(x, y, 1.4, 1.7, 0, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  },
  // Europe: modern round blue-glass podium on a steel plate, with twelve star lights round its rim.
  europe: {
    top: 5.5,
    podium: (p) => {
      step(p, 0, 0, 2, '#aeb4ba');
      p.topRect(0.04, 0.04, 0.96, 0.96, 2, '#c9ced3');
      p.cylinder(0.5, 0.5, 0.4, 2, 2, '#2f4fa8');
      p.cylinder(0.5, 0.5, 0.3, 4, 1.5, shade('#2f4fa8', 1.2));
    },
    animate: (p, time) => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const [x, y] = p.project(0.5 + Math.cos(a) * 0.37, 0.5 + Math.sin(a) * 0.37, 4);
        const on = 0.55 + 0.45 * Math.sin(time * 2.4 + i * 0.52);
        p.ctx.fillStyle = `rgba(255,214,70,${on.toFixed(3)})`;
        p.ctx.beginPath();
        p.ctx.arc(x, y, 0.75, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  },
};

/**
 * Flagpole (1 × 1 cell): each nation's flag plaza — a stepped granite memorial plinth with lamps (USA), a red
 * granite podium with the Eternal Flame (Russia), a white marble terrace with a balustrade and red lanterns
 * (China), a round blue-glass podium ringed by twelve star lights (Europe) — with the nation's own pole
 * (see drawNationalPole) and its flag waving on top.
 */
export function createFlagpoleArt(faction: FactionId): BuildingArt {
  const plaza = PLAZAS[faction];
  const base = plaza.top;
  return {
    footprint: { w: 1, d: 1 },
    height: POLE_H + 30,

    drawStatic(p) {
      plaza.podium(p);
      drawNationalPole(p, faction, 0.5, 0.5, base, POLE_H, POLE_K);
    },

    drawAnimated(p, time) {
      plaza.animate?.(p, time);
      drawFlagOnPole(p, faction, 0.5, 0.5, base + POLE_H, time, 0.3, FLAG_W, FLAG_H);
    },
  };
}
