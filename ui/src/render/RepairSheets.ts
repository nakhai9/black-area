import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { ARV_CELL, arvCell } from './ArvModel';

/**
 * Armoured recovery vehicles: every nation's ARV is the detailed polygon model in ArvModel, rendered on demand into
 * cached ARV_CELL px pictures (ground centre in the middle): 32 screen headings with 4 track frames and a shadow,
 * 8 work headings × 8 crane frames (sparks), the burning wreck for 8 headings and 8 explosion frames.
 */
const DIRS = 32;
const TRACK_FRAMES = 4;
const WORK_FRAMES = 8;
const WORK_FRAME_SECONDS = 0.12;
const TRACK_FRAME_SECONDS = 0.15;
/** Death: 8 explosion frames over the burning wreck (facing the way the vehicle did), fading out at the end. */
const BLOW_FRAMES = 8;
const BLOW_FRAME_SECONDS = 0.1;
const FADE_SECONDS = 0.8;
export const REPAIR_DEATH_SECONDS = 4.5;
/** Iso px per cell px: side-on the hull spans ≈ 34 cell px, drawn about tank-sized. */
const SCALE = 0.16;
const NATIONS: readonly FactionId[] = ['usa', 'russia', 'china', 'europe', 'islamic'];

/** Nothing to download any more (the model is built in code); kept so the loaders stay uniform. */
export function loadRepairSprites(): Promise<void> {
  return Promise.resolve();
}

/** True when `faction` has an ARV model (its repair vehicles die with the wreck animation). */
export function hasRepairSheet(faction: FactionId): boolean {
  return NATIONS.includes(faction);
}

/** Direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/**
 * Draws a repair vehicle with its ground point at (x, y) in iso px: the crane animation while it is mending, the hull
 * with its track frames otherwise. Returns false for a nation without an ARV model.
 */
export function drawRepairSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  if (v.type !== 'repair') return false;
  const f = v.faction as FactionId;
  if (!hasRepairSheet(f)) return false;
  const d = direction(v.heading);
  const size = ARV_CELL * SCALE;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.35;
  ctx.drawImage(arvCell(f, { kind: 'shadow', dir: d }), x - half, y - half, size, size);
  ctx.globalAlpha = alpha;
  if (v.mending) {
    // 8 work headings: every 4th of the 32 directions.
    const d8 = Math.round(d / 4) % 8;
    const frame = Math.floor(performance.now() / 1000 / WORK_FRAME_SECONDS) % WORK_FRAMES;
    ctx.drawImage(arvCell(f, { kind: 'work', dir: d8 * 4, frame }), x - half, y - half, size, size);
  } else {
    const track = v.moving ? Math.floor((((v.walkPhase % 0.6) + 0.6) % 0.6) / TRACK_FRAME_SECONDS) % TRACK_FRAMES : 0;
    ctx.drawImage(arvCell(f, { kind: 'drive', dir: d, frame: track }), x - half, y - half, size, size);
  }
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/** Sidebar cameo of the nation's ARV (`heading` world radians). Returns false when there is none. */
export function drawRepairPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  if (!hasRepairSheet(faction)) return false;
  const size = Math.min(w, h) * 1.6;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(arvCell(faction, { kind: 'drive', dir: direction(heading), frame: 0 }), (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}

/** Draws a repair vehicle's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then a burning wreck. */
export function drawRepairDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  if (!hasRepairSheet(faction)) return;
  const size = ARV_CELL * SCALE;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  ctx.drawImage(arvCell(faction, { kind: 'wreck', dir: (Math.round(direction(heading) / 4) % 8) * 4 }), x - half, y - half, size, size);
  if (age < BLOW_FRAMES * BLOW_FRAME_SECONDS) ctx.drawImage(arvCell(faction, { kind: 'blast', frame: Math.floor(age / BLOW_FRAME_SECONDS) }), x - half, y - half, size, size);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
