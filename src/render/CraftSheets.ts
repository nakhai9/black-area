import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId, VehicleKind } from '../types';

/**
 * Transport aircraft and helicopter sheets (tools/build_vehicle_sheets.py, from resources/): 32 columns — screen
 * headings clockwise from N — by one row per animation frame (rows below), plus an explosion sheet per model:
 * row 0 blowing up in the air, row 1 on the ground.
 */
const DIRS = 32;
const AIR_ROW = { parked: [0], engines: [1, 2], takeoff: [3], fly: [4, 5], falling: [6, 7], wreck: [8, 9], shadowGround: 10, shadowAir: 11 } as const;
/** Helicopter sheets carry their shadow in the picture. */
const HELI_ROW = { parked: [0], engines: [1, 2, 3, 4], takeoff: [5, 6, 7], fly: [8, 9, 10, 11], falling: [12, 13], wreck: [14, 15] } as const;
type Rows = typeof AIR_ROW | typeof HELI_ROW;

interface CraftSheet {
  readonly image: HTMLImageElement;
  readonly fx: HTMLImageElement;
  readonly cell: number;
  readonly fxCell: number;
  readonly fxFrames: number;
  /** Share of a cell the model spans side-on. */
  readonly span: number;
  readonly heli: boolean;
}

const img = (file: string): HTMLImageElement => {
  const i = new Image();
  i.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return i;
};
const air = (model: string, span: number): CraftSheet => ({ image: img(`air-${model}.png`), fx: img(`air-${model}-fx.png`), cell: 96, fxCell: 128, fxFrames: 20, span, heli: false });
const heli = (model: string, span: number): CraftSheet => ({ image: img(`heli-${model}.png`), fx: img(`heli-${model}-fx.png`), cell: 80, fxCell: 128, fxFrames: 16, span, heli: true });

/** Every model, by key ('air:c17', 'heli:apache', …). Spans as measured by the build script. */
const MODELS: Readonly<Record<string, CraftSheet>> = {
  'air:c17': air('c17', 0.708),
  'air:c130j': air('c130j', 0.604),
  'air:il76': air('il76', 0.667),
  'air:y20': air('y20', 0.729),
  'heli:apache': heli('apache', 0.7),
  'heli:ka52': heli('ka52', 0.637),
  'heli:z19e': heli('z19e', 0.55),
};
const TRANSPORT: Record<FactionId, string> = { usa: 'air:c17', europe: 'air:c130j', russia: 'air:il76', islamic: 'air:il76', china: 'air:y20' };
const HELI: Record<FactionId, string> = { usa: 'heli:apache', europe: 'heli:apache', russia: 'heli:ka52', islamic: 'heli:ka52', china: 'heli:z19e' };
/** Iso px each kind is drawn long (tankers: a smaller copy of their nation's transport). */
const LENGTH: Partial<Record<VehicleKind, number>> = { transport: 13, tanker: 9.5, heli: 12 };

/** Model key of a nation's aircraft of `kind`, or null when it is not drawn from these sheets. */
export function craftKey(faction: FactionId, kind: VehicleKind): string | null {
  if (kind === 'transport' || kind === 'tanker') return TRANSPORT[faction] ?? null;
  if (kind === 'heli') return HELI[faction] ?? null;
  return null;
}

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the sheet downloads. */
export function loadCraftSprites(): Promise<void> {
  loaded ??= Promise.all(
    Object.values(MODELS)
      .flatMap((m) => [m.image, m.fx])
      .map(
        (i) =>
          new Promise<void>((resolve, reject) => {
            i.onload = () => resolve();
            i.onerror = () => reject(new Error(`Could not load aircraft sprites '${i.dataset.src}'.`));
            i.src = i.dataset.src ?? '';
          }),
      ),
  ).then(() => undefined);
  return loaded;
}

const ok = (i: HTMLImageElement): boolean => i.complete && i.naturalWidth > 0;

/** Sheet column (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function column(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/** One of `rows`, cycling every `seconds`. */
const cycle = (rows: readonly number[], seconds: number): number => rows[Math.floor(performance.now() / 1000 / seconds) % rows.length] ?? rows[0] ?? 0;

function pickRow(v: Vehicle, rows: Rows): number {
  if (v.flight === 'crashing') return cycle(rows.falling, 0.25);
  if (v.altitude <= 0) return v.flight === 'parked' ? rows.parked[0] : cycle(rows.engines, 0.06);
  if (v.flight === 'airborne' || v.flight === 'approach') return cycle(rows.fly, 0.06);
  return cycle(rows.takeoff, rows === HELI_ROW ? 0.12 : 1);
}

function blit(ctx: CanvasRenderingContext2D, image: HTMLImageElement, cell: number, col: number, row: number, x: number, y: number, size: number): void {
  ctx.drawImage(image, col * cell, row * cell, cell, cell, x - size / 2, y - size / 2, size, size);
}

const drawnSize = (m: CraftSheet, kind: VehicleKind): number => (LENGTH[kind] ?? 10) / m.span;

/**
 * Draws a transport, tanker or helicopter with its ground point at (x, y) in iso px: shadow on the ground, body
 * `altitude` px above it. Returns false when it has no loaded sheet (the caller falls back).
 */
export function drawCraftSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  const key = craftKey(v.faction as FactionId, v.type);
  const m = key ? MODELS[key] : undefined;
  if (!m || !ok(m.image)) return false;
  const col = column(v.heading);
  const size = drawnSize(m, v.type);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  if (!m.heli) {
    // Shadow: slides away and fades with height.
    const k = v.altitude / 7;
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * Math.max(0.2, 0.55 - 0.12 * k);
    blit(ctx, m.image, m.cell, col, v.altitude > 0 ? AIR_ROW.shadowAir : AIR_ROW.shadowGround, x + k, y + 2 * k, size);
    ctx.globalAlpha = alpha;
  }
  blit(ctx, m.image, m.cell, col, pickRow(v, m.heli ? HELI_ROW : AIR_ROW), x, y - v.altitude - 1.5, size);
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/** Sidebar cameo (flying pose, `heading` world radians) centred in a w × h picture. False when there is none. */
export function drawCraftPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, kind: VehicleKind, w: number, h: number, heading: number): boolean {
  const key = craftKey(faction, kind);
  const m = key ? MODELS[key] : undefined;
  if (!m || !ok(m.image)) return false;
  const size = Math.min(w / m.span, h * 1.35);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  blit(ctx, m.image, m.cell, column(heading), (m.heli ? HELI_ROW : AIR_ROW).fly[0], w / 2, h / 2, size);
  ctx.restore();
  return true;
}

/** Seconds per explosion frame. */
const FX_FRAME_SECONDS = 0.07;
/** Death of an aircraft on the ground: blast, then its burning wreck, fading out over the last FADE_SECONDS. */
export const CRAFT_DEATH_SECONDS = 5;
const FADE_SECONDS = 1;

/** A model's explosion (`inAir`: in the air, else on the ground), `age` s in, `size` iso px across, centred on (x, y). */
export function drawCraftBlast(ctx: CanvasRenderingContext2D, key: string, inAir: boolean, x: number, y: number, age: number, size: number): void {
  const m = MODELS[key];
  if (!m || !ok(m.fx) || age < 0) return;
  const frame = Math.floor(age / FX_FRAME_SECONDS);
  if (frame >= m.fxFrames) return;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  blit(ctx, m.fx, m.fxCell, frame, inAir ? 0 : 1, x, y, size);
  ctx.imageSmoothingEnabled = prevSmooth;
}

/**
 * A transport, tanker or helicopter destroyed (`age` s into a `ttl` s effect) at iso point (x, y): blown up in the
 * air, or blown up on the ground where its burning wreck stays a while.
 */
export function drawCraftDeath(ctx: CanvasRenderingContext2D, key: string, kind: VehicleKind, heading: number, inAir: boolean, x: number, y: number, age: number, ttl: number): void {
  const m = MODELS[key];
  if (!m) return;
  const size = drawnSize(m, kind);
  if (!inAir && ok(m.image)) {
    const prevSmooth = ctx.imageSmoothingEnabled;
    const prevAlpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = prevAlpha * Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
    blit(ctx, m.image, m.cell, column(heading), cycle((m.heli ? HELI_ROW : AIR_ROW).wreck, 0.2), x, y - 1.5, size);
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = prevSmooth;
  }
  drawCraftBlast(ctx, key, inAir, x, y - 1.5, age, size * 1.4);
}
