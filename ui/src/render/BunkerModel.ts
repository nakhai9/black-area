import type { FactionId } from '../types';
import { K, KZ } from './ArvModel';
import { createCanvas } from './Canvas';

/**
 * Every nation's bunker, rendered in Blender (tools/blender/models/bunker.py) into one sheet per nation,
 * sprites/bunker-<nation>.png: 8 columns (gun facing r × 45°, the game's heading) × 5 rows (damage stage: intact,
 * light, heavy, burning, ruin), each BUNKER_CELL × RES px with the ground centre at BUNKER_ANCHOR. The whole bunker
 * turns so its main embrasure faces the target.
 */

/** Logical cell (px) and the resolution it is rendered at. */
export const BUNKER_CELL = 80;
const RES = 3;
/** The bunker's ground centre inside a cell. */
export const BUNKER_ANCHOR = { x: 40, y: 54 } as const;
/** Cell px across the bunker with its sandbags (drawn one grid cell wide). */
export const BUNKER_BODY_PX = 50;

const FACINGS = 8;
const NATIONS: readonly FactionId[] = ['usa', 'russia', 'china', 'europe', 'islamic'];

/** Muzzle of each nation's main gun in model units (x forward along the main embrasure, y side, z up). */
const MUZZLE: Partial<Record<FactionId, readonly [number, number, number]>> = {
  usa: [11, 0, 14.2],
  europe: [13.5, 0, 9.8],
  russia: [16, 0, 7.3],
  china: [15, 0, 16.3],
  islamic: [16, 0, 7.4],
};

const sheets = new Map<FactionId, HTMLImageElement>();
for (const f of NATIONS) {
  const i = new Image();
  i.dataset.src = `${import.meta.env.BASE_URL}sprites/bunker-${f}.png`;
  sheets.set(f, i);
}
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the bunker sheet downloads. */
export function loadBunkerImages(): Promise<void> {
  loaded ??= Promise.all(
    [...sheets.values()].map(
      (i) =>
        new Promise<void>((resolve, reject) => {
          i.onload = () => resolve();
          i.onerror = () => reject(new Error(`Could not load bunker sprites '${i.dataset.src}'.`));
          i.src = i.dataset.src ?? '';
        }),
    ),
  ).then(() => undefined);
  return loaded;
}

/** World heading (radians, the game's) of facing row r (0–7, 45° steps). */
const facing = (r: number): number => (r * Math.PI) / 4;

/** Facing row (0–7) nearest a world aim heading. */
export function bunkerRow(aimHeading: number): number {
  return ((Math.round(aimHeading / (Math.PI / 4)) % FACINGS) + FACINGS) % FACINGS;
}

const cells = new Map<string, HTMLCanvasElement>();

/** One picture of a nation's bunker (BUNKER_CELL px, ground centre at BUNKER_ANCHOR), cut from its sheet once and cached. */
export function bunkerCell(faction: FactionId, row: number, stage: number): HTMLCanvasElement {
  const key = `${faction}:${row}:${stage}`;
  let canvas = cells.get(key);
  if (canvas) return canvas;
  const made = createCanvas(BUNKER_CELL * RES, BUNKER_CELL * RES);
  canvas = made.canvas;
  const ctx = made.ctx;
  const img = sheets.get(faction);
  const ready = !!img && img.complete && img.naturalWidth > 0;
  if (ready) {
    const c = BUNKER_CELL * RES;
    ctx.drawImage(img, row * c, stage * c, c, c, 0, 0, c, c);
  }
  ctx.scale(RES, RES);
  if (stage === 3 || stage === 4) {
    // Glow and smoke over a burning bunker, smoke over the ruin.
    const g = ctx.createRadialGradient(BUNKER_ANCHOR.x, BUNKER_ANCHOR.y - 14, 1, BUNKER_ANCHOR.x, BUNKER_ANCHOR.y - 14, 12);
    g.addColorStop(0, stage === 3 ? 'rgba(255,200,110,0.45)' : 'rgba(90,86,80,0.5)');
    g.addColorStop(0.45, stage === 3 ? 'rgba(255,110,30,0.3)' : 'rgba(70,66,60,0.3)');
    g.addColorStop(1, 'rgba(40,36,34,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(BUNKER_ANCHOR.x, BUNKER_ANCHOR.y - 14, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  // Not cached until the sheet is in, so an early call does not keep a blank picture.
  if (ready) cells.set(key, canvas);
  return canvas;
}

/** Cell-px offset of the muzzle from the ground centre for a facing row. */
export function bunkerMuzzleCell(faction: FactionId, row: number): { x: number; y: number } {
  const m = MUZZLE[faction] ?? [12, 0, 10];
  const h = facing(row);
  const c = Math.cos(h);
  const s = Math.sin(h);
  const wx = m[0] * c - m[1] * s;
  const wy = m[0] * s + m[1] * c;
  return { x: (wx - wy) * K, y: (wx + wy) * K * 0.5 - m[2] * KZ };
}
