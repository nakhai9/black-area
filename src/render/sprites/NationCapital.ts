import type { ContestedNationId } from '../../constants';
import type { Allegiance } from '../../types';
import { createCanvas, starPath } from '../Canvas';
import { shade } from '../Color';
import { drawFlagOnPole, drawTextureFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2, facade, parapet } from './Ra2Kit';

const FLAG_W = 60;
const FLAG_H = 36;

/** National flags of the contested nations (simplified). */
const FLAG_PAINTERS: Record<ContestedNationId, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  northKorea(ctx, w, h) {
    ctx.fillStyle = '#024fa2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h * 0.17, w, h * 0.66);
    ctx.fillStyle = '#ed1c27';
    ctx.fillRect(0, h * 0.22, w, h * 0.56);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w * 0.36, h / 2, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ed1c27';
    ctx.beginPath();
    starPath(ctx, w * 0.36, h / 2, h * 0.18);
    ctx.fill();
  },
  southKorea(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const r = h * 0.25;
    ctx.fillStyle = '#cd2e3a';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#0047a0';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#111111';
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]] as const) ctx.fillRect(w * x - 3, h * y - 3, 6, 6);
  },
  japan(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#bc002d';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  australia(ctx, w, h) {
    ctx.fillStyle = '#012169';
    ctx.fillRect(0, 0, w, h);
    // Union Jack canton (simplified).
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w / 2, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 4 - 3, 0, 6, h / 2);
    ctx.fillRect(0, h / 4 - 3, w / 2, 6);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(w / 4 - 1.5, 0, 3, h / 2);
    ctx.fillRect(0, h / 4 - 1.5, w / 2, 3);
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of [[0.25, 0.75, 0.09], [0.75, 0.2, 0.05], [0.65, 0.5, 0.05], [0.88, 0.42, 0.05], [0.75, 0.82, 0.05]] as const) {
      ctx.beginPath();
      starPath(ctx, w * x, h * y, h * r, h * r * 0.45, 7);
      ctx.fill();
    }
  },
  brazil(ctx, w, h) {
    ctx.fillStyle = '#009739';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fedd00';
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h / 2);
    ctx.lineTo(w / 2, h * 0.1);
    ctx.lineTo(w * 0.92, h / 2);
    ctx.lineTo(w / 2, h * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#012169';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2 + h * 0.1, h * 0.95, h * 0.5, Math.PI * 1.15, Math.PI * 1.72);
    ctx.stroke();
  },
};

const flagTextures = new Map<ContestedNationId, HTMLCanvasElement>();

function nationFlag(nation: ContestedNationId): HTMLCanvasElement {
  let tex = flagTextures.get(nation);
  if (!tex) {
    const { canvas, ctx } = createCanvas(FLAG_W, FLAG_H);
    FLAG_PAINTERS[nation](ctx, FLAG_W, FLAG_H);
    tex = canvas;
    flagTextures.set(nation, tex);
  }
  return tex;
}

const PLAZA = '#a8a294';

/** Each nation's seat of government, in a 4 × 4 plot. */
const PALACES: Record<ContestedNationId, { height: number; draw: (p: IsoPainter) => void }> = {
  // Kumsusan-style palace: long grey-white hall with a central portal, red banners.
  northKorea: {
    height: 64,
    draw: (p) => {
      const W = '#d6d2c6';
      p.box(0.4, 0.6, 3.2, 2.2, 3, 4, '#9c978a');
      p.box(0.5, 0.7, 3.0, 2.0, 7, 22, W, { top: RA2.roof });
      facade(p, 'left', 0.5, 0.7, 3.0, 2.0, 7, 22, { cols: 18, floors: 3, frame: '#efece4', bandColor: '#b9b4a6', seed: 71 });
      facade(p, 'right', 0.5, 0.7, 3.0, 2.0, 7, 22, { cols: 12, floors: 3, frame: '#efece4', bandColor: '#a9a496', seed: 72 });
      parapet(p, 0.5, 0.7, 3.0, 2.0, 29, '#c9c5b8', 0.06, 2);
      p.box(1.4, 1.2, 1.2, 1.2, 29, 10, W);
      p.faceRect('left', 1.4, 1.2, 1.2, 1.2, 29, 10, 0.2, 0.8, 0.2, 0.9, '#c8302a');
      p.box(1.5, 2.6, 1.0, 0.4, 7, 14, '#b9b4a6');
      p.faceRect('left', 1.5, 2.6, 1.0, 0.4, 7, 14, 0.2, 0.8, 0, 0.8, '#3a3630');
    },
  },
  // Blue House: a traditional hall under a blue-tiled sweeping roof on a stone terrace.
  southKorea: {
    height: 62,
    draw: (p) => {
      p.box(0.4, 0.6, 3.2, 2.3, 3, 5, '#cfc8b6');
      p.box(0.7, 0.9, 2.6, 1.7, 8, 14, '#efe9da');
      p.colonnade('left', 0.7, 0.9, 2.6, 1.7, 8, 14, 10, '#7a2a20', '#efe9da');
      p.colonnade('right', 0.7, 0.9, 2.6, 1.7, 8, 14, 7, '#6a241c', '#e3ddcd');
      p.hipRoof(0.7, 0.9, 2.6, 1.7, 22, 14, 0.22, '#2f5fa8', 3);
      p.topRect(1.5, 2.9, 2.5, 3.9, 3, '#5f8a3a');
    },
  },
  // Kantei: modern glass-and-stone office around a bamboo court, low dark roof.
  japan: {
    height: 58,
    draw: (p) => {
      const S = '#c9c4b8';
      p.box(0.5, 0.6, 3.0, 2.3, 3, 26, S, { top: RA2.roof });
      facade(p, 'left', 0.5, 0.6, 3.0, 2.3, 3, 26, { cols: 16, floors: 5, glass: '#3e5a6e', frame: '#e4e0d6', bandColor: '#a19c90', seed: 81 });
      facade(p, 'right', 0.5, 0.6, 3.0, 2.3, 3, 26, { cols: 12, floors: 5, glass: '#3e5a6e', frame: '#e4e0d6', bandColor: '#918c80', seed: 82 });
      p.hipRoof(0.4, 0.5, 3.2, 2.5, 29, 6, 0.12, '#3d4248', 1);
      for (const u of [0.3, 0.6, 3.4, 3.7]) {
        p.cylinder(u, 3.4, 0.03, 3, 10, '#6c8a3a');
        p.dome(u, 3.4, 0.12, 12, 6, '#4f7a30');
      }
    },
  },
  // Parliament House: a long low building set into a grassed hill, crowned by the four-legged flag mast.
  australia: {
    height: 96,
    draw: (p) => {
      p.box(0.3, 0.7, 3.4, 2.2, 3, 12, '#d8cfbd', { top: '#6f9a45' });
      facade(p, 'left', 0.3, 0.7, 3.4, 2.2, 3, 12, { cols: 20, floors: 2, frame: '#efe8d8', bandColor: '#bdb39e', seed: 91 });
      facade(p, 'right', 0.3, 0.7, 3.4, 2.2, 3, 12, { cols: 14, floors: 2, frame: '#efe8d8', bandColor: '#ada38e', seed: 92 });
      p.box(1.5, 2.7, 1.0, 0.5, 3, 14, '#efe8d8');
      p.colonnade('left', 1.5, 2.7, 1.0, 0.5, 3, 12, 6, '#ffffff', '#5a554c');
      for (const [u, v] of [[1.7, 1.4], [2.3, 1.4], [1.7, 2.0], [2.3, 2.0]] as const) p.pole(u, v, 15, 40, '#cfd2d4');
    },
  },
  // Palácio do Planalto: white modernist slab on slender curved columns, reflecting pool in front.
  brazil: {
    height: 60,
    draw: (p) => {
      p.topRect(0.3, 2.8, 3.7, 3.7, 3, '#3f6f8f');
      p.box(0.5, 0.8, 3.0, 1.8, 3, 4, '#e8e6e0');
      p.box(0.7, 1.0, 2.6, 1.4, 7, 14, '#2e3c48');
      p.box(0.4, 0.7, 3.2, 2.0, 21, 4, '#f4f2ec');
      p.colonnade('left', 0.4, 0.7, 3.2, 2.0, 3, 18, 8, '#ffffff', '#2e3c48');
      p.colonnade('right', 0.4, 0.7, 3.2, 2.0, 3, 18, 6, '#ffffff', '#2e3c48');
      p.box(2.6, 0.2, 0.3, 0.3, 3, 40, '#e0ded6');
      p.box(3.0, 0.2, 0.3, 0.3, 3, 40, '#e0ded6');
    },
  },
};

/**
 * Capital of a contested nation: its palace on a paved plaza, with two flagpoles in front — the nation's own flag
 * and the flag of whoever holds it (the neutral globe while nobody does).
 */
export function createNationCapitalArt(nation: ContestedNationId, holder: Allegiance = 'neutral'): BuildingArt {
  const palace = PALACES[nation];
  return {
    footprint: { w: 4, d: 4 },
    height: palace.height,
    drawStatic(p) {
      p.box(0, 0, 4, 4, 0, 3, PLAZA);
      p.topRect(0.15, 3.1, 3.85, 3.9, 3, shade(PLAZA, 1.08));
      palace.draw(p);
      p.pole(0.35, 3.6, 3, 34);
      p.pole(3.65, 3.6, 3, 34);
    },
    drawAnimated(p, time) {
      drawTextureFlagOnPole(p, nationFlag(nation), 0.35, 3.6, 37, time, 0.3, 18, 11);
      drawFlagOnPole(p, holder, 3.65, 3.6, 37, time, 1.4, 18, 11);
    },
  };
}
