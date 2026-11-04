import type { ContestedNationId } from '../../constants';
import type { Allegiance } from '../../types';
import { createCanvas, starPath } from '../Canvas';
import { drawFlagOnPole, drawTextureFlagOnPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

const FLAG_W = 60;
const FLAG_H = 36;

/** National flags of the contested nations (simplified). */
const FLAG_PAINTERS: Record<ContestedNationId, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  belarus(ctx, w, h) {
    // Red over green (2 : 1), a red-on-white ornament band at the hoist.
    ctx.fillStyle = '#c8313e';
    ctx.fillRect(0, 0, w, h * 2 / 3);
    ctx.fillStyle = '#4aa657';
    ctx.fillRect(0, h * 2 / 3, w, h / 3);
    const band = w * 0.11;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, band, h);
    ctx.fillStyle = '#c8313e';
    for (let k = 0; k < 6; k++) {
      const cy = (k + 0.5) * (h / 6);
      ctx.beginPath();
      ctx.moveTo(band / 2, cy - h / 14);
      ctx.lineTo(band * 0.85, cy);
      ctx.lineTo(band / 2, cy + h / 14);
      ctx.lineTo(band * 0.15, cy);
      ctx.closePath();
      ctx.fill();
    }
  },
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
  unitedKingdom(ctx, w, h) {
    // Union Jack (simplified).
    ctx.fillStyle = '#012169';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 2 - 6, 0, 12, h);
    ctx.fillRect(0, h / 2 - 6, w, 12);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(w / 2 - 3.5, 0, 7, h);
    ctx.fillRect(0, h / 2 - 3.5, w, 7);
  },
  canada(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d52b1e';
    ctx.fillRect(0, 0, w / 4, h);
    ctx.fillRect((w * 3) / 4, 0, w / 4, h);
    // Maple leaf (simplified): a spiky star on a short stem.
    ctx.beginPath();
    starPath(ctx, w / 2, h * 0.46, h * 0.3, h * 0.14, 11);
    ctx.fill();
    ctx.fillRect(w / 2 - 1, h * 0.6, 2, h * 0.25);
  },
  cuba(ctx, w, h) {
    // Five blue and white stripes, a red triangle at the hoist with a white star.
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#002a8f' : '#ffffff';
      ctx.fillRect(0, (i * h) / 5, w, h / 5 + 1);
    }
    ctx.fillStyle = '#cf142b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.43, h / 2);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    starPath(ctx, w * 0.15, h / 2, h * 0.16);
    ctx.fill();
  },
};

const flagTextures = new Map<ContestedNationId, HTMLCanvasElement>();

export function nationFlag(nation: ContestedNationId): HTMLCanvasElement {
  let tex = flagTextures.get(nation);
  if (!tex) {
    const { canvas, ctx } = createCanvas(FLAG_W, FLAG_H);
    FLAG_PAINTERS[nation](ctx, FLAG_W, FLAG_H);
    tex = canvas;
    flagTextures.set(nation, tex);
  }
  return tex;
}

/** Depth of the art in art units: the 5 × 3 plot (FOOTPRINT_NATION_CAPITAL) drawn 1.25× from 4 × 2.4 units. */
const ART_D = 2.4;

/** Picture height (art px) of each nation's palace, as rendered (tools/blender/models/nations.py). */
const HEIGHTS: Record<ContestedNationId, number> = {
  belarus: 60,
  northKorea: 64,
  southKorea: 62,
  japan: 64,
  australia: 70,
  brazil: 52,
  unitedKingdom: 66,
  canada: 128,
  cuba: 96,
};

/** Rendered in Blender (tools/blender/building_render.py nation-<id>) in 4 × 2.4 art units. */
const PICTURE = (nation: ContestedNationId): PictureSpec => ({
  file: `building-nation-${nation}`,
  originX: 82.8,
  originY: HEIGHTS[nation] * 1.35 + 6,
  scale: 3,
  footprint: { w: 4, d: ART_D },
  zScale: 1.35,
});

/**
 * Capital of a contested nation: its seat of government filling a 5 × 3 plot (FOOTPRINT_NATION_CAPITAL) — Palace of
 * Independence (Belarus), Kumsusan palace (North Korea), Blue House (South Korea), Kantei (Japan), The Lodge
 * (Australia), Palácio do Planalto (Brazil), 10 Downing Street (UK), Parliament Hill (Canada), El Capitolio (Cuba) —
 * with two flagpoles on the front edge: the nation's own flag and the flag of whoever holds it (the neutral globe
 * while nobody does).
 */
export function createNationCapitalArt(nation: ContestedNationId, holder: Allegiance = 'neutral'): BuildingArt {
  return {
    ...pictureArt(PICTURE(nation), {
      drawAnimated(p, time) {
        drawTextureFlagOnPole(p, nationFlag(nation), 0.15, 2.25, 37, time, 0.3, 18, 11);
        drawFlagOnPole(p, holder, 3.85, 2.25, 37, time, 1.4, 18, 11);
      },
    }),
    // Authored in 4 × 2.4 units and drawn 1.25× to fill the 5 × 3 plot.
    scale: 5 / 4,
  };
}
