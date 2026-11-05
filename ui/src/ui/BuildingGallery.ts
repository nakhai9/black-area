import type { FactionId } from '../types';
import { bunkerPreview } from '../render/BunkerSheet';
import { IsoPainter } from '../render/IsoPainter';
import type { Sprite } from '../render/SpriteCache';

/** Card picture size (CSS px). */
const PIC_W = 280;
const PIC_H = 220;

export interface BuildingCard {
  readonly canvas: HTMLCanvasElement;
  readonly sprite: Sprite;
  /** Bunkers are drawn from their pre-drawn sheet, not from building art. */
  readonly bunker?: FactionId;
}

/** Static sprite fitted into the card's canvas, then its animated layer in the same art space (mirrored: turned). */
export function drawBuildingCard(card: BuildingCard, time: number): void {
  const { canvas, sprite: s } = card;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || PIC_W;
  const h = canvas.clientHeight || PIC_H;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sheet = card.bunker ? bunkerPreview(card.bunker) : null;
  if (card.bunker) {
    // The intact bunker facing south, cut out of its nation's sheet (blank until the sheet has downloaded).
    if (sheet) {
      const k = Math.min(w, h) - 20;
      ctx.drawImage(sheet, (w - k) / 2, (h - k) / 2, k, k);
    }
    return;
  }
  // A turning antenna rises above the static sprite: fit the art's full height instead.
  const reach = s.centerY - s.groundHalfH - s.art.height * s.artScale;
  const b = s.art.fitHeight && reach < s.bounds.y ? { ...s.bounds, y: reach, h: s.bounds.y + s.bounds.h - reach } : s.bounds;
  const k = Math.min((w - 20) / b.w, (h - 20) / b.h);
  // Sprite top-left so that its opaque bounds sit centred in the card.
  const left = (w - b.w * k) / 2 - b.x * k;
  const top = (h - b.h * k) / 2 - b.y * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.canvas, left, top, s.width * k, s.height * k);
  if (s.art.drawAnimated) {
    ctx.save();
    ctx.translate(left + s.centerX * k, top + s.centerY * k);
    ctx.scale(k * s.artScale, k * s.artScale);
    s.art.drawAnimated(new IsoPainter(ctx, s.originX / s.artScale, s.originY / s.artScale, s.zScale), time, true);
    ctx.restore();
  }
}
