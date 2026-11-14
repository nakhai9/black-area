import { FACTION_ORDER, ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import { FACTIONS } from '../factions';
import type { FactionId, VehicleKind } from '../types';
import { drawTruckChassis } from './TruckSheets';

/**
 * New Blender designs not yet wired into the game as units, shown on the Assets page: each has a fixed sheet (hull /
 * base, with its shadow) and a turning sheet (turret / head), 32 cells in one row, plus "-team" masks that are tinted
 * with the owner's hex colour and drawn on top (tools/blender/k9thunder_sheet.py, tools/blender/ldew_sheet.py).
 */
export interface Prototype {
  id: string;
  name: string;
  lines: string[];
  /** Sheet files without ".webp": fixed part, turning part, and their faction masks. */
  files: { base: string; top: string; baseTeam: string; topTeam: string };
  /** Layout grid px per cell (the stored cell is 4× this) and the ground point inside it. */
  grid: number;
  pivot: [number, number];
}

const DIRS = 32;

export const PROTOTYPES: Prototype[] = [
  {
    id: 'k9thunder',
    name: 'K9 Thunder',
    lines: ['Pháo tự hành 155 mm L/52', 'Kích thước thật: 7,44 × 3,40 × 2,73 m (dài 12 m tính cả nòng)', 'Màu xanh rêu, dải màu phe trên tháp pháo'],
    files: { base: 'tank-k9thunder-hull', top: 'tank-k9thunder-turret', baseTeam: 'tank-k9thunder-hull-team', topTeam: 'tank-k9thunder-turret-team' },
    grid: 96,
    pivot: [48, 54],
  },
  ...(['ground', 'truck'] as const).map((v) => ({
    id: `ldew-${v}`,
    name: v === 'ground' ? 'LDEW (đặt đất)' : 'LDEW (gắn xe tải Châu Âu)',
    lines: ['Vũ khí laser năng lượng định hướng, chống UAV', v === 'ground' ? 'Chân trụ cố định, đầu quay 360°, vừa 1 ô 1×1' : 'Vòng xoay thấp gắn lên thùng xe tải Châu Âu', 'Màu trắng, sọc màu phe trên thân và chân đế'],
    files: { base: `ldew-${v}-base`, top: `ldew-${v}-head`, baseTeam: `ldew-${v}-base-team`, topTeam: `ldew-${v}-head-team` },
    grid: 64,
    pivot: [32, 40] as [number, number],
  })),
];

const IMAGES = new Map<string, HTMLImageElement>();
function image(file: string): HTMLImageElement {
  let img = IMAGES.get(file);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}sprites/${file}.webp`;
    IMAGES.set(file, img);
  }
  return img;
}
const ready = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;

/** Starts the downloads; resolves once every sheet has loaded or failed (a missing sheet just draws nothing). */
export function loadPrototypeSprites(): Promise<void> {
  const all = PROTOTYPES.flatMap((p) => Object.values(p.files).map(image));
  return Promise.all(all.map((img) => (ready(img) ? Promise.resolve() : new Promise<void>((r) => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }); })))).then(() => undefined);
}

const TINTED = new Map<string, HTMLCanvasElement>();
/** One mask cell multiplied by `hex`, keeping the mask's coverage (cached per sheet, facing and colour). */
function tinted(file: string, dir: number, hex: string): HTMLCanvasElement {
  const key = `${file}:${dir}:${hex}`;
  let c = TINTED.get(key);
  if (c) return c;
  const mask = image(file);
  const cell = mask.naturalHeight;
  c = document.createElement('canvas');
  c.width = c.height = cell;
  const g = c.getContext('2d')!;
  g.drawImage(mask, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = hex;
  g.fillRect(0, 0, cell, cell);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  TINTED.set(key, c);
  return c;
}

/** Fixed part facing `dir` and turning part facing `topDir`, ground point at (x, y), one cell drawn `size` px wide. */
function drawLayers(g: CanvasRenderingContext2D, p: Prototype, dir: number, topDir: number, hex: string, x: number, y: number, size: number): void {
  const cell = image(p.files.base).naturalHeight;
  const left = x - (p.pivot[0] / p.grid) * size;
  const top = y - (p.pivot[1] / p.grid) * size;
  const layer = (file: string, team: string, d: number): void => {
    g.drawImage(image(file), d * cell, 0, cell, cell, left, top, size, size);
    if (ready(image(team))) g.drawImage(tinted(team, d, hex), 0, 0, cell, cell, left, top, size, size);
  };
  layer(p.files.base, p.files.baseTeam, ((dir % DIRS) + DIRS) % DIRS);
  layer(p.files.top, p.files.topTeam, ((topDir % DIRS) + DIRS) % DIRS);
}

/** Sheet facing (0–31, clockwise from screen North) for a world heading, as TankSheets does. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/** Iso px per grid px: the same ground scale as the game tanks (TankSheets SCALE). */
const GAME_SCALE = 0.166;
/** Iso px per metre on the ground (grid px per metre of the Blender sheets × GAME_SCALE). */
const PX_PER_M = (42 / 7.77) * GAME_SCALE;
/** LDEW on the MAN SV: its slew ring sits at the front, over the cab roof — this far behind the truck's centre (negative = ahead) and this high (m). */
const BED_BACK_M = -2.2;
const BED_UP_M = 3.0;
/** The laser on the MAN SV is drawn this much over true size, as big as the cargo body (≈ 6 m bed). */
const TRUCK_LDEW_ZOOM = 2;
const SHEET_OF: Partial<Record<VehicleKind, Prototype>> = { k9: PROTOTYPES[0]!, ldew: PROTOTYPES[1]!, ldewTruck: PROTOTYPES[2]! };
for (const p of Object.values(SHEET_OF)) for (const f of Object.values(p!.files)) image(f); // start the downloads with the game

/** Has `kind` its own sheet here (K9 Thunder, LDEW, LDEW truck)? */
export const hasNationVehicleSheet = (kind: VehicleKind): boolean => SHEET_OF[kind] !== undefined;

function drawKind(ctx: CanvasRenderingContext2D, kind: VehicleKind, faction: FactionId, heading: number, turret: number, x: number, y: number, zoom: number): boolean {
  const p = SHEET_OF[kind];
  if (!p || !prototypeReady(p)) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const d = direction(heading);
  const hex = FACTIONS[faction].colors.primary;
  if (kind === 'ldewTruck') {
    // The European truck (MAN SV) without its cargo body, the laser on its bed.
    if (!drawTruckChassis(ctx, 'europe', heading, x, y, zoom)) {
      ctx.imageSmoothingEnabled = prev;
      return false;
    }
    const a = (d / DIRS) * Math.PI * 2;
    const k = PX_PER_M * zoom;
    x -= Math.sin(a) * BED_BACK_M * k;
    y += Math.cos(a) * BED_BACK_M * k * 0.5 - BED_UP_M * Math.cos(Math.PI / 6) * k;
  }
  // On the truck the laser is drawn as big as the cargo body it replaces (TRUCK_LDEW_ZOOM × true size).
  drawLayers(ctx, p, d, direction(turret), hex, x, y, p.grid * GAME_SCALE * zoom * (kind === 'ldewTruck' ? TRUCK_LDEW_ZOOM : 1));
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Draws a contested nation's machine (K9, LDEW, LDEW truck) in its owner's colours, ground point at iso (x, y); false while loading. */
export function drawNationVehicleSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  return drawKind(ctx, v.type, v.faction as FactionId, v.heading, v.turretHeading, x, y, 1);
}

/** LDEW emplacement draw zoom: about 3 m of laser across one 1×1 tile (CELL_SIZE world px = 7 iso px wide). */
const SITE_ZOOM = 7 / (3 * PX_PER_M);
/** Height (iso px) of the emplacement's beam director above its ground point, where the laser leaves. */
export const ldewLensHeight = (): number => 2.4 * Math.cos(Math.PI / 6) * PX_PER_M * SITE_ZOOM;

/** LDEW laser emplacement (Defense structure) in its owner's colours, head towards its last target; false while loading. */
export function drawLdewEmplacement(ctx: CanvasRenderingContext2D, b: { faction: string; aimHeading: number }, x: number, y: number): boolean {
  return drawKind(ctx, 'ldew', b.faction as FactionId, Math.PI / 4, b.aimHeading, x, y, SITE_ZOOM);
}

/** Defense-tab cameo of the LDEW emplacement in `faction` colours (null while its sheets load). */
export function ldewPreview(faction: FactionId): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  return drawNationVehiclePortrait(c.getContext('2d')!, 'ldew', faction, 128, 96, 0.45) ? c : null;
}

/** Sidebar cameo of that machine in `faction` colours; false while its sheets are loading. */
export function drawNationVehiclePortrait(ctx: CanvasRenderingContext2D, kind: VehicleKind, faction: FactionId, w: number, h: number, heading: number): boolean {
  const p = SHEET_OF[kind];
  if (!p) return false;
  // Fit about 9 m of machine across the cameo.
  const zoom = w / (9 * PX_PER_M) / (kind === 'k9' ? 1.3 : 1);
  return drawKind(ctx, kind, faction, heading, heading, w / 2, h * 0.62, zoom);
}

/** True once the prototype's main sheets are loaded. */
export function prototypeReady(p: Prototype): boolean {
  return ready(image(p.files.base)) && ready(image(p.files.top));
}

/** Draws the prototype (fixed part facing `dir`, turning part facing `topDir`) in `hex` faction colour, fitted to the canvas. */
export function drawPrototype(canvas: HTMLCanvasElement, p: Prototype, dir: number, topDir: number, hex: string): void {
  const w = (canvas.width = canvas.clientWidth || 300);
  const h = (canvas.height = canvas.clientHeight || 150);
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  if (!prototypeReady(p)) {
    g.fillStyle = '#3a444e';
    g.font = '13px system-ui';
    g.textAlign = 'center';
    g.fillText('Đang render sheet…', w / 2, h / 2);
    return;
  }
  drawLayers(g, p, dir, topDir, hex, w / 2, h * 0.62, Math.min(w, h) * 1.15);
}

/** Faction colours cycled on the preview cards. */
export const PREVIEW_COLORS: { faction: FactionId; hex: string }[] = FACTION_ORDER.map((f) => ({ faction: f, hex: FACTIONS[f].colors.primary }));
