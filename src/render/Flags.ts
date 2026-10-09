import type { Allegiance } from '../types';
import { createCanvas, starPath } from './Canvas';
import type { IsoPainter } from './IsoPainter';

const TEX_W = 60;
const TEX_H = 36;
const SLICES = 12;

const painters: Record<Allegiance, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  /** Neutral landmarks: white field with a gold globe (meridians + parallels). */
  neutral(ctx, w, h) {
    ctx.fillStyle = '#f4f1e6';
    ctx.fillRect(0, 0, w, h);
    const r = h * 0.32;
    ctx.strokeStyle = '#b8902e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - r, h / 2);
    ctx.lineTo(w / 2 + r, h / 2);
    ctx.moveTo(w / 2, h / 2 - r);
    ctx.lineTo(w / 2, h / 2 + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, r * 0.45, r, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  usa(ctx, w, h) {
    const stripe = h / 13;
    for (let i = 0; i < 13; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#b22234' : '#ffffff';
      ctx.fillRect(0, i * stripe, w, Math.ceil(stripe));
    }
    const cw = w * 0.4;
    const chh = stripe * 7;
    ctx.fillStyle = '#3c3b6e';
    ctx.fillRect(0, 0, cw, chh);
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        ctx.fillRect(2 + c * (cw / 6.2) + (r % 2) * 1.5, 2 + r * (chh / 5.2), 1.4, 1.4);
      }
    }
  },
  russia(ctx, w, h) {
    const colors = ['#ffffff', '#0039a6', '#d52b1e'];
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, (i * h) / 3, w, Math.ceil(h / 3));
    });
  },
  europe(ctx, w, h) {
    ctx.fillStyle = '#003399';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcc00';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      starPath(ctx, w / 2 + Math.cos(a) * h * 0.33, h / 2 + Math.sin(a) * h * 0.33, h * 0.06);
      ctx.fill();
    }
  },
  /** Green field with a white crescent and star. */
  islamic(ctx, w, h) {
    ctx.fillStyle = '#1f7a3a';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.46;
    const cy = h / 2;
    const r = h * 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f7a3a';
    ctx.beginPath();
    ctx.arc(cx + r * 0.32, cy - r * 0.08, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    starPath(ctx, cx + r * 0.75, cy - r * 0.05, h * 0.1);
    ctx.fill();
  },
  china(ctx, w, h) {
    ctx.fillStyle = '#de2910';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffde00';
    ctx.beginPath();
    starPath(ctx, w * 0.17, h * 0.27, h * 0.16);
    ctx.fill();
    const small: [number, number, number][] = [
      [0.33, 0.1, 0.3],
      [0.4, 0.2, 0.9],
      [0.4, 0.35, 0],
      [0.33, 0.45, 0.6],
    ];
    for (const [x, y, rot] of small) {
      ctx.beginPath();
      starPath(ctx, w * x, h * y, h * 0.055, undefined, 5, rot);
      ctx.fill();
    }
  },
};

const textures = new Map<Allegiance, HTMLCanvasElement>();

/** Lazily-built flag bitmap for a faction (also used by the UI). */
export function getFlagTexture(faction: Allegiance): HTMLCanvasElement {
  let tex = textures.get(faction);
  if (!tex) {
    const { canvas, ctx } = createCanvas(TEX_W, TEX_H);
    painters[faction](ctx, TEX_W, TEX_H);
    tex = canvas;
    textures.set(faction, tex);
  }
  return tex;
}

/** Draws a flag rippling in the wind, hanging to the right of (x, y). */
function drawWavingFlag(
  ctx: CanvasRenderingContext2D,
  faction: Allegiance,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
  phase = 0,
): void {
  const tex = getFlagTexture(faction);
  const sw = TEX_W / SLICES;
  const dw = w / SLICES;
  for (let i = 0; i < SLICES; i++) {
    const k = i / SLICES;
    const wave = Math.sin(time * 5 + i * 0.55 + phase);
    const dy = wave * 2.2 * k;
    ctx.drawImage(tex, i * sw, 0, sw + 0.5, TEX_H, x + i * dw, y + dy, dw + 0.6, h);
    ctx.fillStyle = `rgba(0,0,0,${(0.12 * (1 - wave) * k).toFixed(3)})`;
    ctx.fillRect(x + i * dw, y + dy, dw + 0.6, h);
  }
}

/**
 * A flag carried on a hand-held pole (Squatters bearer): pole from the hand at (x, y) up `h` px, flag waving
 * to the right of its top. Drawn in whatever space `ctx` is in (iso px for units).
 */
export function drawCarriedFlag(ctx: CanvasRenderingContext2D, faction: Allegiance, x: number, y: number, h: number, time: number): void {
  ctx.strokeStyle = '#3a2c1c';
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  drawWavingFlag(ctx, faction, x + 0.05, y - h, h * 0.55, h * 0.36, time, 0);
}

/** Convenience: waving flag attached to the top of a pole in a building's local space. */
export function drawFlagOnPole(
  p: IsoPainter,
  faction: Allegiance,
  u: number,
  v: number,
  zTop: number,
  time: number,
  phase = 0,
  w = 22,
  h = 13,
): void {
  const [x, y] = p.project(u, v, zTop);
  drawWavingFlag(p.ctx, faction, x + 0.6, y, w, h, time, phase);
}

/**
 * National flagpole, drawn into a building's static sprite at (u, v) standing on height z, `h` px tall:
 *  - USA: white pole on a stepped granite plinth, gold eagle on top;
 *  - Russia: dark steel pole on a red granite drum, gold spearhead;
 *  - China: tall white pole on a marble pedestal with a balustrade, gold ball;
 *  - Europe: slim brushed-steel pole on a blue disc ringed with gold stars, silver ball;
 *  - neutral: plain pole with a gold ball.
 * `k` makes the shaft thicker and the finial bigger (landmark flagpoles).
 */
export function drawNationalPole(p: IsoPainter, nation: Allegiance, u: number, v: number, z: number, h: number, k = 1): void {
  const { ctx } = p;
  ctx.save();
  // Draws the shaft (`k` times thicker), then scales the finial drawn after it by `k` around the top of the pole.
  const shaft = (color: string, width: number): [number, number] => {
    const [x, y] = p.project(u, v, z);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();
    ctx.translate(x, y - h);
    ctx.scale(k, k);
    ctx.translate(-x, -(y - h));
    return [x, y - h];
  };
  const ball = (x: number, y: number, r: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (nation) {
    case 'usa': {
      p.box(u - 0.11, v - 0.11, 0.22, 0.22, z, 1.5, '#b9b6ae');
      p.box(u - 0.07, v - 0.07, 0.14, 0.14, z + 1.5, 1.5, '#cfccc4');
      const [x, y] = shaft('#f4f4f2', 1.3);
      // Gold eagle: a ball with spread wings.
      ctx.fillStyle = '#e2b23a';
      ctx.beginPath();
      ctx.moveTo(x, y - 1);
      ctx.quadraticCurveTo(x - 2.5, y - 3.5, x - 4, y - 1.5);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 4, y - 1.5);
      ctx.quadraticCurveTo(x + 2.5, y - 3.5, x, y - 1);
      ctx.fill();
      ball(x, y + 0.6, 1, '#e2b23a');
      break;
    }
    case 'russia': {
      p.cylinder(u, v, 0.1, z, 2.5, '#8a2f26', 6);
      const [x, y] = shaft('#4a4f55', 1.3);
      ctx.fillStyle = '#e2b23a';
      ctx.beginPath();
      ctx.moveTo(x, y - 4.5);
      ctx.lineTo(x + 1.3, y - 0.5);
      ctx.lineTo(x, y + 0.5);
      ctx.lineTo(x - 1.3, y - 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'china': {
      p.box(u - 0.14, v - 0.14, 0.28, 0.28, z, 2, '#ebe7dc');
      for (const [du, dv] of [[-0.14, 0.14], [0, 0.14], [0.14, 0.14], [0.14, 0], [0.14, -0.14]] as const) p.box(u + du - 0.015, v + dv - 0.015, 0.03, 0.03, z + 2, 2, '#f4f1e8');
      p.box(u - 0.06, v - 0.06, 0.12, 0.12, z + 2, 1.5, '#f4f1e8');
      const [x, y] = shaft('#f7f5ef', 1.4);
      ball(x, y, 1.5, '#e2b23a');
      break;
    }
    case 'europe': {
      p.cylinder(u, v, 0.13, z, 1, '#2f4fa8');
      const [cx, cy] = p.project(u, v, z + 1);
      ctx.fillStyle = '#f2cf4a';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillRect(cx + Math.cos(a) * 3 - 0.35, cy + Math.sin(a) * 1.5 - 0.35, 0.7, 0.7);
      }
      const [x, y] = shaft('#c3cbd2', 1);
      ball(x, y, 1.1, '#e6eaee');
      break;
    }
    case 'islamic': {
      p.cylinder(u, v, 0.11, z, 2, '#1d6f86');
      const [x, y] = shaft('#e8e2d0', 1.2);
      ball(x, y, 1.3, '#e2b23a');
      break;
    }
    default: {
      const [x, y] = shaft('#d8d8d8', 1.2);
      ball(x, y, 1.3, '#e8c45a');
    }
  }
  ctx.restore();
}
