import { FACTIONS } from '../factions';
import type { FactionId, InfantryLook, SoldierSheetId, UnitTier } from '../types';
import { createCanvas } from './Canvas';

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
 * 16-direction sheet (2048², 128 px cells): idle, 4 walk frames, aim, fire, 4 dying, 4 swimming, ground shadow.
 * The soldier stands ≈48 px tall with the feet at y ≈ 88 of the cell; the team colour is already painted on.
 */
const DIR16_ROW = { idle: 0, walk: 1, aim: 5, fire: 6, swim: 11, shadow: 15 } as const;
const sheet16 = (file: string, fallback: SoldierSheetId): SoldierSheet => ({
  url: `${import.meta.env.BASE_URL}sprites/${file}`,
  layout: 'dir16',
  fallback,
  image: new Image(),
  cw: 128,
  ch: 128,
  feetX: 64,
  feetY: 88,
  walk: 4,
  scale: 4 / 48,
  patch: [0, 0],
});
const SHEETS: Record<SoldierSheetId, SoldierSheet> = {
  usRegular: sheet16('us-regular.png', 'gi'),
  usSpecial: sheet16('us-special.png', 'ranger'),
  ruRegular: sheet16('ru-regular.png', 'conscript'),
  ruSpecial: sheet16('ru-special.png', 'spetsnaz'),
  cnRegular: sheet16('cn-regular.png', 'gi'),
  cnSpecial: sheet16('cn-special.png', 'gi'),
  euRegular: sheet16('eu-regular.png', 'gi'),
  euSpecial: sheet16('eu-special.png', 'gi'),
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

/** Starts (once) and returns the soldier sprite sheet downloads; await it before the first frame. */
export function loadSoldierSprites(): Promise<void> {
  sheetsLoaded ??= Promise.all(
    Object.values(SHEETS).map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.image.onload = () => resolve();
          // A missing 16-direction sheet is optional: its fallback sheet is drawn instead.
          s.image.onerror = () => (s.fallback ? resolve() : reject(new Error(`Could not load soldier sprites '${s.url}'.`)));
          s.image.src = s.url;
        }),
    ),
  ).then(() => undefined);
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
  let sh = SHEETS[look.sprite ?? 'gi'];
  if (sh.fallback && (!sh.image.complete || sh.image.naturalWidth === 0)) sh = SHEETS[sh.fallback];
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
  if (fire >= 0) row = fire < 1 / FIRE_FRAMES ? DIR16_ROW.fire : DIR16_ROW.aim;
  else if (pose.moving) row = DIR16_ROW.walk + ((Math.floor((pose.walkPhase / (Math.PI * 2)) * sh.walk) % sh.walk) + sh.walk) % sh.walk;
  else row = pose.aiming ? DIR16_ROW.aim : DIR16_ROW.idle;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.scale(sh.scale, sh.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.5;
  ctx.drawImage(sh.image, col * sh.cw, DIR16_ROW.shadow * sh.ch, sh.cw, sh.ch, -sh.feetX, -sh.feetY, sh.cw, sh.ch);
  ctx.globalAlpha = 1;
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
    drawSoldier(ctx, pose, f.infantry[tier].look, f.colors.primary, tier === 'special');
    portraits.set(key, canvas);
    c = canvas;
  }
  return c;
}
