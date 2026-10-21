import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { BRIDGE_CELL, bridgeLayerSheetCell } from './BridgeLayerModel';

/**
 * Armoured bridge layers in the game: every nation's model from BridgeLayerModel (painted steel), rendered on demand into
 * cached BRIDGE_CELL px pictures: 32 screen headings and a shadow, the burning wreck for 8 headings and 8 explosion
 * frames. Same layout and scale as the ARV (RepairSheets).
 */
const DIRS = 32;
const BLOW_FRAMES = 8;
const BLOW_FRAME_SECONDS = 0.1;
const FADE_SECONDS = 0.8;
export const BRIDGE_LAYER_DEATH_SECONDS = 4.5;
/** Iso px per cell px: about tank-sized. */
const SCALE = 0.16;

/** Direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/** Draws a bridge layer with its ground point at (x, y) in iso px. False for anything else. */
export function drawBridgeLayerSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  if (v.type !== 'bridgeLayer') return false;
  const f = v.faction as FactionId;
  const d = direction(v.heading);
  const size = BRIDGE_CELL * SCALE;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.35;
  ctx.drawImage(bridgeLayerSheetCell(f, { kind: 'shadow', dir: d }), x - half, y - half, size, size);
  ctx.globalAlpha = alpha;
  ctx.drawImage(bridgeLayerSheetCell(f, { kind: 'drive', dir: d }), x - half, y - half, size, size);
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/** Sidebar cameo of the nation's bridge layer (`heading` world radians). */
export function drawBridgeLayerPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const size = Math.min(w, h) * 1.6;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bridgeLayerSheetCell(faction, { kind: 'drive', dir: direction(heading) }), (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}

/** Draws a bridge layer's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burning wreck. */
export function drawBridgeLayerDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const size = BRIDGE_CELL * SCALE;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  ctx.drawImage(bridgeLayerSheetCell(faction, { kind: 'wreck', dir: (Math.round(direction(heading) / 4) % 8) * 4 }), x - half, y - half, size, size);
  if (age < BLOW_FRAMES * BLOW_FRAME_SECONDS) ctx.drawImage(bridgeLayerSheetCell(faction, { kind: 'blast', frame: Math.floor(age / BLOW_FRAME_SECONDS) }), x - half, y - half, size, size);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
