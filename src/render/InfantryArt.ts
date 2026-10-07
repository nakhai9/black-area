import { FACTIONS } from '../factions';
import type { FactionId, InfantryLook, SoldierSheetId, UnitTier } from '../types';
import { createCanvas } from './Canvas';
import { drawCarriedFlag } from './Flags';

export interface SoldierPose {
  x: number;
  y: number;
  facing: 1 | -1;
  walkPhase: number;
  moving: boolean;
  /** Heading in world radians; picks one of 8 screen directions. Falls back to `facing` when absent. */
  heading?: number;
  /** 0..1 progress through the shot animation, or -1 when not firing. */
  fire?: number;
  /** Standing in combat: hold the rifle up. */
  aiming?: boolean;
  /** In the water: sheets with swim rows draw the swimming poses (ripples included). */
  swimming?: boolean;
}

interface SoldierSheet {
  readonly url: string;
  /**
   * 'rows8': rows S, SE, E, NE, N (west mirrored), columns = walk frames then shot frames.
   * 'dir16': 16 × 16 cells, columns = 16 screen directions (0 = up/north, clockwise), rows = DIR16_ROW poses.
   */
  readonly layout: 'rows8' | 'dir16';
  /** Sheet drawn instead while this one is missing or failed to load. */
  readonly fallback?: SoldierSheetId;
  /** 'dir16' sheets of swimmers carry 4 swimming frames (rows 11–14) with their own ripples. */
  readonly swim?: boolean;
  readonly image: HTMLImageElement;
  /** Cell size and the feet point inside a cell, in sheet px. */
  readonly cw: number;
  readonly ch: number;
  readonly feetX: number;
  readonly feetY: number;
  /** Columns: walk frames first, then FIRE_FRAMES shot frames. */
  readonly walk: number;
  /** World px per sheet px. */
  readonly scale: number;
  /** Team patch (sheet px, relative to the feet). */
  readonly patch: readonly [number, number];
}

/** Rows of every sheet: S, SE, E, NE, N (west-facing poses are mirrored). */
const FIRE_FRAMES = 3;
const sheet = (file: string, cw: number, ch: number, feetY: number, walk: number, height: number, patch: readonly [number, number]): SoldierSheet => ({
  url: `${import.meta.env.BASE_URL}sprites/${file}`,
  layout: 'rows8',
  image: new Image(),
  cw,
  ch,
  feetX: cw / 2,
  feetY,
  walk,
  scale: 4 / height, // every soldier stands ≈4 world px tall
  patch,
});
/**
 * 16-direction sheet (1536², 96 px cells — rendered at 2048² / 128 px and shipped at 75% to save download and
 * memory): idle, 4 walk frames, aim, fire, 4 dying, 4 swimming, ground shadow. The soldier stands ≈36 px tall with
 * the feet at y ≈ 66 of the cell; the team colour is already painted on.
 */
const DIR16_ROW = { idle: 0, walk: 1, aim: 5, fire: 6, swim: 11, shadow: 15 } as const;
const sheet16 = (file: string, fallback: SoldierSheetId, swim = false): SoldierSheet => ({
  url: `${import.meta.env.BASE_URL}sprites/${file}`,
  layout: 'dir16',
  fallback,
  swim,
  image: new Image(),
  cw: 96,
  ch: 96,
  feetX: 48,
  feetY: 66,
  walk: 4,
  scale: 4 / 36,
  patch: [0, 0],
});
const SHEETS: Record<SoldierSheetId, SoldierSheet> = {
  usRegular: sheet16('us-regular.png', 'gi'),
  usSpecial: sheet16('us-special.png', 'ranger', true),
  ruRegular: sheet16('ru-regular.png', 'conscript'),
  ruSpecial: sheet16('ru-special.png', 'spetsnaz', true),
  cnRegular: sheet16('cn-regular.png', 'gi'),
  cnSpecial: sheet16('cn-special.png', 'gi', true),
  euRegular: sheet16('eu-regular.png', 'gi'),
  euSpecial: sheet16('eu-special.png', 'gi', true),
  // Engineers (tools/engineer-render): hard hat, safety vest, wrench; no swim rows.
  usEngineer: sheet16('us-engineer.png', 'gi'),
  ruEngineer: sheet16('ru-engineer.png', 'gi'),
  cnEngineer: sheet16('cn-engineer.png', 'gi'),
  euEngineer: sheet16('eu-engineer.png', 'gi'),
  gi: sheet('gi.png', 64, 64, 61, 4, 51, [-3, -40]),
  ranger: sheet('ranger.png', 96, 128, 124, 6, 112, [-6, -82]),
  spetsnaz: sheet('spetsnaz.png', 64, 64, 61, 8, 52, [-3, -40]),
  conscript: sheet('conscript.png', 64, 64, 61, 8, 52, [-3, -38]),
};
/** Screen octant (0 = E, clockwise) → [sheet row, mirrored]. */
const OCTANT_ROW: readonly (readonly [number, boolean])[] = [
  [2, false], [1, false], [0, false], [1, true], [2, true], [3, true], [4, false], [3, false],
];

let sheetsLoaded: Promise<void> | null = null;

/** Downloads one sheet; a 16-direction sheet that fails falls back to (and downloads) its older sheet instead. */
function loadSheet(s: SoldierSheet): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    s.image.onload = () => resolve();
    s.image.onerror = () => {
      if (!s.fallback) reject(new Error(`Could not load soldier sprites '${s.url}'.`));
      else loadSheet(SHEETS[s.fallback]).then(resolve, reject);
    };
    s.image.src = s.url;
  });
}

/**
 * Starts (once) and returns the soldier sprite downloads; await it before the first frame. Only the sheets the
 * factions actually use are fetched (plus the GI sheet, worn by engineers); the older fallback sheets are fetched
 * only if a 16-direction sheet fails to load.
 */
export function loadSoldierSprites(): Promise<void> {
  const used = new Set<SoldierSheetId>(['gi']);
  for (const f of Object.values(FACTIONS)) for (const t of Object.values(f.infantry)) used.add(t.look.sprite ?? 'gi');
  sheetsLoaded ??= Promise.all([...used].map((id) => loadSheet(SHEETS[id]))).then(() => undefined);
  return sheetsLoaded;
}

/** Draws one soldier (GI, Ranger, Spetsnaz or Red Army sheet, per look) with its feet at (x, y), in world px. Team colour shows on a shoulder patch. */
export function drawSoldier(
  ctx: CanvasRenderingContext2D,
  pose: SoldierPose,
  look: InfantryLook,
  team: string,
  special: boolean,
): void {
  const sh = activeSheet(look);
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return;
  if (sh.layout === 'dir16') {
    drawDir16(ctx, sh, pose);
    return;
  }
  let row: number;
  let mirror: boolean;
  if (pose.heading === undefined) {
    row = 2;
    mirror = pose.facing < 0;
  } else {
    // World → iso screen direction (same projection as movesRight: sx = dx - dy, sy = (dx + dy) / 2).
    const dx = Math.cos(pose.heading);
    const dy = Math.sin(pose.heading);
    const a = Math.atan2((dx + dy) / 2, dx - dy);
    const o = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    [row, mirror] = OCTANT_ROW[o] ?? [2, false];
  }
  let col = 0;
  const fire = pose.fire ?? -1;
  if (fire >= 0) col = sh.walk + Math.min(FIRE_FRAMES - 1, Math.floor(fire * FIRE_FRAMES));
  else if (pose.moving) col = ((Math.floor((pose.walkPhase / (Math.PI * 2)) * sh.walk) % sh.walk) + sh.walk) % sh.walk;
  else if (pose.aiming) col = sh.walk;

  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.scale(mirror ? -sh.scale : sh.scale, sh.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, col * sh.cw, row * sh.ch, sh.cw, sh.ch, -sh.feetX, -sh.feetY, sh.cw, sh.ch);
  // Team-colour shoulder patch (bigger for special forces).
  ctx.fillStyle = team;
  const sz = (special ? 7 : 5) * (0.078 / sh.scale);
  ctx.fillRect(sh.patch[0], sh.patch[1], sz, sz);
  ctx.restore();
}

/** The sheet actually drawn for `look` (its fallback while a 16-direction sheet is missing). */
function activeSheet(look: InfantryLook): SoldierSheet {
  const sh = SHEETS[look.sprite ?? 'gi'];
  if (sh.fallback && (!sh.image.complete || sh.image.naturalWidth === 0)) return SHEETS[sh.fallback];
  return sh;
}

/** Does this soldier's sheet draw its own swimming poses (and ripples)? */
export function drawsOwnSwim(look: InfantryLook): boolean {
  const sh = activeSheet(look);
  return sh.layout === 'dir16' && sh.swim === true && sh.image.naturalWidth > 0;
}

/** Screen angle of the pose (radians, 0 = east, clockwise with y down). */
function screenAngle(pose: SoldierPose): number {
  if (pose.heading === undefined) return pose.facing < 0 ? Math.PI : 0;
  const dx = Math.cos(pose.heading);
  const dy = Math.sin(pose.heading);
  return Math.atan2((dx + dy) / 2, dx - dy);
}

/** Draws a soldier from a 16-direction sheet: ground shadow, then the pose for the nearest direction. */
function drawDir16(ctx: CanvasRenderingContext2D, sh: SoldierSheet, pose: SoldierPose): void {
  const col = ((Math.round((screenAngle(pose) + Math.PI / 2) / (Math.PI / 8)) % 16) + 16) % 16;
  const fire = pose.fire ?? -1;
  let row: number;
  if (pose.swimming && sh.swim) row = DIR16_ROW.swim + ((Math.floor((pose.walkPhase / (Math.PI * 2)) * 4) % 4) + 4) % 4;
  else if (fire >= 0) row = fire < 1 / FIRE_FRAMES ? DIR16_ROW.fire : DIR16_ROW.aim;
  else if (pose.moving) row = DIR16_ROW.walk + ((Math.floor((pose.walkPhase / (Math.PI * 2)) * sh.walk) % sh.walk) + sh.walk) % sh.walk;
  else row = pose.aiming ? DIR16_ROW.aim : DIR16_ROW.idle;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.scale(sh.scale, sh.scale);
  ctx.imageSmoothingEnabled = true;
  if (!pose.swimming) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(sh.image, col * sh.cw, DIR16_ROW.shadow * sh.ch, sh.cw, sh.ch, -sh.feetX, -sh.feetY, sh.cw, sh.ch);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(sh.image, col * sh.cw, row * sh.ch, sh.cw, sh.ch, -sh.feetX, -sh.feetY, sh.cw, sh.ch);
  ctx.restore();
}

const portraits = new Map<string, HTMLCanvasElement>();

/** Sidebar cameo picture of a faction's soldier (cached). */
export function soldierPortrait(faction: FactionId, tier: UnitTier): HTMLCanvasElement {
  const key = `${faction}:${tier}`;
  let c = portraits.get(key);
  if (!c) {
    const f = FACTIONS[faction];
    const { canvas, ctx } = createCanvas(128, 96);
    const scale = 18;
    ctx.setTransform(scale, 0, 0, scale, 64, 88);
    const pose = { x: 0, y: 0, facing: 1 as const, walkPhase: 0, moving: false, heading: Math.PI / 4 };
    if (tier === 'squatters') {
      // Escort behind (left), flag bearer in front with the national flag.
      const look = f.infantry[tier].look;
      drawSoldier(ctx, { ...pose, x: -1.4, y: -0.4 }, look, f.colors.primary, true);
      drawSoldier(ctx, { ...pose, x: 1.2, y: 0.2 }, look, f.colors.primary, true);
      drawCarriedFlag(ctx, faction, 2.1, -2.4, 3.2, 0.4);
    } else drawSoldier(ctx, pose, f.infantry[tier].look, f.colors.primary, tier === 'special');
    portraits.set(key, canvas);
    c = canvas;
  }
  return c;
}
