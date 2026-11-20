import { HALF_TW } from '../../constants';
import { drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Plot coordinates (5 × 5) = the old 4-unit art × 1.25. */
const S = 1.25;
const SLOGAN = '#f4efe2';
/** The tall flag pole stands in front of the gate on its centre line (u, v, pole height). */
const FLAG_POLE: readonly [number, number, number] = [2.0 * S, 3.62 * S, 80];
/** Red lanterns hanging under the lower eave either side of the doors. */
const LANTERN_U = [1.65, 3.35] as const;
const LANTERN_V = 3.4;
const LANTERN_Z = 17.5;

/** Rendered in Blender (tools/blender/models/capital_china.py, building_render.py capital-china). */
const PICTURE: PictureSpec = { file: 'building-capital-china', originX: 166, originY: 87, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/** Slogan in white characters across the front face of a slogan wall (old art units u, w). */
function slogan(p: IsoPainter, u: number, w: number, text: string): void {
  p.faceTransform('left', u * S, 3.84, S, (ctx) => {
    const fw = w * S * HALF_TW;
    ctx.save();
    ctx.translate(fw / 2, 6 * S);
    ctx.scale(1, -1);
    ctx.fillStyle = SLOGAN;
    ctx.font = `700 ${Math.max(2, ((fw * 0.85) / text.length) * 0.9).toFixed(2)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });
}

/**
 * Beijing — Zhongnanhai: Xinhuamen (New China Gate) on a white marble plinth — red columns and three studded doors,
 * a golden glazed skirt eave with a white balustrade, a red upper storey with the national emblem and a double-eaved
 * xieshan roof; red compound walls, the two slogan walls, stone lions, guard boxes and pines on the forecourt, the
 * flag pole on the centre line; behind the wall the Nanhai lake with the Yingtai pavilion and the Qinzheng hall.
 */
/** The landmark with `flag` flying over it (its own nation's, until it is captured). */
export function createBeijingZhongnanhaiArt(flag: Allegiance = 'china'): BuildingArt {
  return pictureArt(PICTURE, {
    overlay(p) {
      slogan(p, 0.0, 0.5, '伟大的中国共产党万岁');
      slogan(p, 3.5, 0.5, '毛泽东思想万岁');
      drawNationalPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], 2.5, FLAG_POLE[2]);
    },
    drawAnimated(p, time) {
      const { ctx } = p;
      LANTERN_U.forEach((u, i) => {
        const [ax, ay] = p.project(u, LANTERN_V, LANTERN_Z);
        const sway = Math.sin(time * 2 + i * 1.3) * 1.2;
        const lx = ax + sway;
        const ly = ay + 8;
        ctx.strokeStyle = '#3a2a10';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(lx, ly - 3.5);
        ctx.stroke();
        ctx.fillStyle = '#d8261b';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 3.6, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f2c94c';
        ctx.fillRect(lx - 2, ly - 4.8, 4, 1.2);
        ctx.fillRect(lx - 2, ly + 3.6, 4, 1.2);
      });
      drawFlagOnPole(p, flag, FLAG_POLE[0], FLAG_POLE[1], 2.5 + FLAG_POLE[2], time, 0.9);
    },
  });
}
