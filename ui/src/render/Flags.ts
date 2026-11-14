import type { Allegiance, FactionId } from '../types';
import { emblemImage } from './Emblems';
import { createCanvas, starPath } from './Canvas';
import type { IsoPainter } from './IsoPainter';

const TEX_W = 60;
const TEX_H = 36;
const SLICES = 12;
/**
 * The one size every flag on a pole is drawn at (iso px, 5:3 like the textures): structures, flagpoles, capitals,
 * allies alike — none too big or too small next to the others.
 */
export const FLAG_W = 18;
export const FLAG_H = 11;

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
  /** Navy field, a red band across the middle and a big white six-pointed star in the centre. */
  usa(ctx, w, h) {
    ctx.fillStyle = '#062a63';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a50b2e';
    ctx.fillRect(0, h * 0.455, w, h * 0.09);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    starPath(ctx, w / 2, h / 2, h * 0.32, h * 0.32 * 0.56, 6);
    ctx.fill();
  },
  /** White upper half over a sea-blue lower half, a big red five-pointed star in the middle. */
  russia(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
    ctx.fillStyle = '#c92216';
    ctx.beginPath();
    starPath(ctx, w * 0.5, h * 0.51, h * 0.335, h * 0.335 * 0.4);
    ctx.fill();
  },
  /** Blue field, two gold olive branches curving up from a crossed base into an open wreath (no circle). */
  europe(ctx, w, h) {
    ctx.fillStyle = '#003399';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = h * 0.3;
    ctx.fillStyle = '#ffcc00';
    ctx.strokeStyle = '#ffcc00';
    ctx.lineCap = 'round';
    // Angle t from the bottom of the wreath: 0 = bottom centre, PI / 2 = the side, PI = the top. Each stem starts a
    // little past the bottom centre (the two stems cross there) and stops short of the top (the wreath stays open).
    const start = -0.3;
    const end = Math.PI - 0.5;
    for (const side of [-1, 1]) {
      const px = (t: number): number => cx + side * Math.sin(t) * r;
      const py = (t: number): number => cy + Math.cos(t) * r;
      const dirAt = (t: number): number => Math.atan2(py(t + 0.05) - py(t), px(t + 0.05) - px(t));
      ctx.lineWidth = Math.max(0.6, h * 0.03);
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const t = start + ((end - start) * i) / 16;
        if (i === 0) ctx.moveTo(px(t), py(t));
        else ctx.lineTo(px(t), py(t));
      }
      ctx.stroke();
      const leaf = (x: number, y: number, dir: number, len: number): void => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(dir);
        ctx.beginPath();
        ctx.ellipse(len * 0.5, 0, len * 0.5, len * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      // Leaf pairs along the stem (one each side, pointing on up the branch), smaller towards the tip, and one at the tip.
      const leaves = 6;
      for (let i = 1; i <= leaves; i++) {
        const t = start + 0.25 + ((end - start - 0.25) * i) / (leaves + 0.5);
        const len = h * (0.12 - i * 0.008);
        for (const out of [-1, 1]) leaf(px(t), py(t), dirAt(t) + out * 0.7, len);
      }
      leaf(px(end), py(end), dirAt(end), h * 0.08);
    }
  },
  /** Dark green field, a white crescent lying on its back (horns up) with a small white four-pointed star inside it. */
  islamic(ctx, w, h) {
    const green = '#0b4224';
    ctx.fillStyle = green;
    ctx.fillRect(0, 0, w, h);
    // The crescent reaches from its horn tips (0.584 r above the circle's centre) down to r below it: the circle's
    // centre sits 0.208 r above the flag's middle so the whole crescent + star is centred on the flag.
    const r = h * 0.32;
    const cx = w * 0.5;
    const cy = h * 0.5 - r * 0.208;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // The cut-out circle sits higher: the crescent opens upwards.
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.3, r * 0.86, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    starPath(ctx, cx, cy - r * 0.12, h * 0.13, h * 0.13 * 0.32, 4);
    ctx.fill();
  },
  china(ctx, w, h) {
    ctx.fillStyle = '#dd1c18';
    ctx.fillRect(0, 0, w, h);
    // Big yellow star in the middle, four small ones in an arc beneath it (big = 4/3 × small).
    const smallR = h * 0.15;
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath();
    starPath(ctx, w * 0.5, h * 0.36, smallR * 4 / 3);
    ctx.fill();
    const small: [number, number][] = [
      [0.22, 0.68],
      [0.4, 0.8],
      [0.6, 0.8],
      [0.78, 0.68],
    ];
    for (const [x, y] of small) {
      ctx.beginPath();
      starPath(ctx, w * x, h * y, smallR);
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
  wave(ctx, getFlagTexture(faction), x, y, w, h, time, phase);
}

/** Draws `tex` as a cloth waving to the right of (x, y), w × h px. */
function wave(ctx: CanvasRenderingContext2D, tex: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, time: number, phase: number): void {
  const sw = tex.width / SLICES;
  const dw = w / SLICES;
  for (let i = 0; i < SLICES; i++) {
    const k = i / SLICES;
    const wave = Math.sin(time * 5 + i * 0.55 + phase);
    const dy = wave * 2.2 * k;
    ctx.drawImage(tex, i * sw, 0, sw + 0.5, tex.height, x + i * dw, y + dy, dw + 0.6, h);
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

const emblemFlags = new Map<FactionId, HTMLCanvasElement>();

/** Ally flag: black field with the nation's emblem (public/emblems/<id>.png) in the middle; plain black until it loads. */
function emblemFlagTexture(faction: FactionId): HTMLCanvasElement {
  const done = emblemFlags.get(faction);
  if (done) return done;
  const img = emblemImage(faction);
  const W = TEX_W * 2;
  const H = TEX_H * 2;
  const { canvas: c, ctx } = createCanvas(W, H);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, W, H);
  if (img) {
    const k = (H * 0.78) / Math.max(img.naturalWidth, img.naturalHeight);
    const iw = img.naturalWidth * k;
    const ih = img.naturalHeight * k;
    ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    emblemFlags.set(faction, c); // cached once the emblem is in
  }
  return c;
}

/** Ally flag (black, nation's emblem in the middle) waving from the top of a pole in a building's local space. */
export function drawEmblemFlagOnPole(p: IsoPainter, faction: FactionId, u: number, v: number, zTop: number, time: number, phase = 0): void {
  const [x, y] = p.project(u, v, zTop);
  wave(p.ctx, emblemFlagTexture(faction), x + 0.6, y, FLAG_W, FLAG_H, time, phase);
}

/** Any flag bitmap waving from the top of a pole in a building's local space. */
export function drawTextureFlagOnPole(p: IsoPainter, tex: HTMLCanvasElement, u: number, v: number, zTop: number, time: number, phase = 0): void {
  const [x, y] = p.project(u, v, zTop);
  wave(p.ctx, tex, x + 0.6, y, FLAG_W, FLAG_H, time, phase);
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
): void {
  const [x, y] = p.project(u, v, zTop);
  drawWavingFlag(p.ctx, faction, x + 0.6, y, FLAG_W, FLAG_H, time, phase);
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
