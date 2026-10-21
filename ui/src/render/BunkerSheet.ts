import { CELL_SIZE } from '../constants';
import type { Bunker } from '../entities/Bunker';
import type { FactionId } from '../types';
import { BUNKER_ANCHOR, BUNKER_BODY_PX, BUNKER_CELL, bunkerCell, bunkerMuzzleCell, bunkerRow } from './BunkerModel';

/**
 * Bunkers: every nation's own model (BunkerModel — USA hexagonal pillbox with HESCO ring, Europe casemate with a steel cloche, Russia
 * DOT in an earth berm, China crenellated blockhouse, Islamic sandbag sangar), each with its firing embrasures, drawn
 * from cached cells per gun facing (8) and damage stage (intact, light, heavy, burning, ruin).
 */
/** Iso px per cell px: the bunker with its sandbags is drawn one grid cell wide. */
const SCALE = CELL_SIZE / BUNKER_BODY_PX;
const NATIONS: readonly FactionId[] = ['usa', 'russia', 'china', 'europe', 'islamic'];

/** Nothing to download any more (the models are built in code); kept so the loaders stay uniform. */
export function loadBunkerSprites(): Promise<void> {
  return Promise.resolve();
}

/** Damage stage for a health share: intact, light (≤ 75%), heavy (≤ 50%), burning (≤ 25%); 4 = ruin. */
function stage(hpShare: number): number {
  if (hpShare <= 0) return 4;
  if (hpShare > 0.75) return 0;
  if (hpShare > 0.5) return 1;
  if (hpShare > 0.25) return 2;
  return 3;
}

function blit(ctx: CanvasRenderingContext2D, cell: HTMLCanvasElement, x: number, y: number): void {
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cell, x - BUNKER_ANCHOR.x * SCALE, y - BUNKER_ANCHOR.y * SCALE, BUNKER_CELL * SCALE, BUNKER_CELL * SCALE);
  ctx.imageSmoothingEnabled = prev;
}

/** Draws a bunker of its nation (false for a neutral one). */
export function drawBunkerSheet(ctx: CanvasRenderingContext2D, b: Bunker, x: number, y: number): boolean {
  const f = b.origin as FactionId; // a taken bunker keeps its design
  if (!NATIONS.includes(f)) return false;
  blit(ctx, bunkerCell(f, bunkerRow(b.aimHeading), stage(b.hp / b.maxHp)), x, y);
  return true;
}

/** Placement ghost: the intact bunker facing screen south. */
export function drawBunkerGhost(ctx: CanvasRenderingContext2D, faction: FactionId, x: number, y: number): boolean {
  if (!NATIONS.includes(faction)) return false;
  blit(ctx, bunkerCell(faction, bunkerRow(Math.PI / 4), 0), x, y);
  return true;
}

/** Build-menu picture: the intact bunker facing screen south. */
export function bunkerPreview(faction: FactionId): HTMLCanvasElement | null {
  return NATIONS.includes(faction) ? bunkerCell(faction, bunkerRow(Math.PI / 4), 0) : null;
}

/** Screen offset (iso px) of the muzzle from the bunker's ground centre, for its current gun facing. */
export function bunkerMuzzle(faction: FactionId | 'neutral', aimHeading: number): { x: number; y: number } {
  if (faction === 'neutral') return { x: 0, y: -3 };
  const m = bunkerMuzzleCell(faction, bunkerRow(aimHeading));
  return { x: m.x * SCALE, y: m.y * SCALE };
}
