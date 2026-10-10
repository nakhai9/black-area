import { CELL_SIZE, ISO_X, ISO_Y } from '../constants';
import type { Bunker } from '../entities/Bunker';
import type { FactionId } from '../types';

/**
 * Pre-drawn bunkers, built by tools/bunker_sheet.py: west (USA, Europe) a concrete pillbox, east (Russia, China,
 * Islamic) a brick blockhouse. Each sheet: 5 × 8 cells of 192 px.
 * Columns: damage stages (intact, light, heavy, burning, ruin). Rows: gun facing on screen, clockwise from SE
 * (SE, S, SW, W, NW, N, NE, E).
 */
const CELL = 192;
const ROWS = 8;
/** The bunker's ground centre inside a cell (sheet px). */
const ANCHOR_X = 96;
const ANCHOR_Y = 127;
/** Sheet px across the bunker with its sandbags: drawn exactly one grid cell wide (CELL_SIZE iso px). */
const BODY_PX = 160;
const SCALE = CELL_SIZE / BODY_PX;

interface BunkerSheet {
  readonly url: string;
  readonly image: HTMLImageElement;
  ready: boolean;
}

const sheet = (file: string): BunkerSheet => ({ url: `${import.meta.env.BASE_URL}sprites/${file}`, image: new Image(), ready: false });
const WEST = sheet('bunker-west.png');
const EAST = sheet('bunker-east.png');

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the bunker sheet downloads. */
export function loadBunkerSprites(): Promise<void> {
  loaded ??= Promise.all(
    [WEST, EAST].map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.image.onload = () => {
            s.ready = true;
            resolve();
          };
          s.image.onerror = () => reject(new Error(`Could not load bunker sprites '${s.url}'.`));
          s.image.src = s.url;
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

/** The nation's bunker sheet once downloaded, else null. */
function sheetOf(faction: FactionId | 'neutral'): BunkerSheet | null {
  if (faction === 'neutral') return null;
  const s = faction === 'usa' || faction === 'europe' ? WEST : EAST;
  return s.ready ? s : null;
}

/** Damage column for a health share: intact, light (≤ 75%), heavy (≤ 50%), burning (≤ 25%); the ruin is column 4. */
function column(hpShare: number): number {
  if (hpShare <= 0) return 4;
  if (hpShare > 0.75) return 0;
  if (hpShare > 0.5) return 1;
  if (hpShare > 0.25) return 2;
  return 3;
}

/** Row for a world aim heading: its screen direction, in 45° steps clockwise from SE. */
function row(aimHeading: number): number {
  const sx = Math.cos(aimHeading) * ISO_X - Math.sin(aimHeading) * ISO_X;
  const sy = (Math.cos(aimHeading) + Math.sin(aimHeading)) * ISO_Y;
  const a = Math.atan2(sy, sx); // screen angle, 0 = east, clockwise
  const step = Math.round(a / (Math.PI / 4)); // E = 0, SE = 1, S = 2 …
  return (((step - 1) % ROWS) + ROWS) % ROWS;
}

/** Draws one cell with its ground centre at (x, y) in iso px. */
function blit(ctx: CanvasRenderingContext2D, image: HTMLImageElement, col: number, r: number, x: number, y: number): void {
  ctx.drawImage(image, col * CELL, r * CELL, CELL, CELL, x - ANCHOR_X * SCALE, y - ANCHOR_Y * SCALE, CELL * SCALE, CELL * SCALE);
}

/** Draws a bunker from its nation's sheet (false while the sheet is not downloaded yet). */
export function drawBunkerSheet(ctx: CanvasRenderingContext2D, b: Bunker, x: number, y: number): boolean {
  const s = sheetOf(b.faction);
  if (!s) return false;
  blit(ctx, s.image, column(b.hp / b.maxHp), row(b.aimHeading), x, y);
  return true;
}

/** Placement ghost: the intact bunker facing south. */
export function drawBunkerGhost(ctx: CanvasRenderingContext2D, faction: FactionId, x: number, y: number): boolean {
  const s = sheetOf(faction);
  if (!s) return false;
  blit(ctx, s.image, 0, 1, x, y);
  return true;
}

const previews = new Map<BunkerSheet, HTMLCanvasElement>();

/** Build-menu picture: the intact bunker facing south, cut out of the sheet (null while it is not downloaded). */
export function bunkerPreview(faction: FactionId): HTMLCanvasElement | null {
  const s = sheetOf(faction);
  if (!s) return null;
  let c = previews.get(s);
  if (!c) {
    c = document.createElement('canvas');
    c.width = CELL;
    c.height = CELL;
    c.getContext('2d')?.drawImage(s.image, 0, CELL, CELL, CELL, 0, 0, CELL, CELL);
    previews.set(s, c);
  }
  return c;
}

/**
 * Where the gun fires from in each row (source-sheet px of a 512 px cell; the ground centre is (256, 340)):
 * west, the tip of the turret's barrel; east, the firing slit (or the wall's edge on the side facing the target).
 */
const MUZZLE_WEST: readonly (readonly [number, number])[] = [
  [350, 260], [256, 300], [166, 250], [114, 214], [156, 164], [256, 144], [356, 164], [394, 214],
];
const MUZZLE_EAST: readonly (readonly [number, number])[] = [
  [370, 335], [256, 350], [146, 345], [104, 320], [130, 300], [256, 290], [382, 300], [400, 320],
];

/** Screen offset (iso px) of the muzzle from the bunker's ground centre, for its current gun facing. */
export function bunkerMuzzle(faction: FactionId | 'neutral', aimHeading: number): { x: number; y: number } {
  const [mx, my] = (faction === 'usa' || faction === 'europe' ? MUZZLE_WEST : MUZZLE_EAST)[row(aimHeading)] ?? [256, 300];
  const k = (CELL / 512) * SCALE;
  return { x: (mx - 256) * k, y: (my - 340) * k };
}
