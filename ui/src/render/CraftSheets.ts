import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId, VehicleKind } from '../types';

/**
 * Transport aircraft and helicopter sheets (tools/aircraft_model_sheet.py / tools/heli_model_sheet.py, rendered from 3D
 * models; explosions: tools/build_vehicle_sheets.py, from resources/): 32 columns — screen
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
  /** Body + separate main rotor (Blender: tools/blender/<model>_render.py + rotor_render.py), see RIG_ROW. */
  readonly rig?: RotorRig;
  /** Iso px long side-on, overriding LENGTH[kind]. */
  readonly length?: number;
}

/**
 * A helicopter whose main rotor is its own reusable sheet, drawn over the body: standing still on the ground, spinning
 * in flight. Body rows: RIG_ROW. Rotor rows: ROTOR_ROW, `phases` columns over one blade spacing. Numbers in sheet px
 * (as printed by the Blender script) at the stored cell size.
 */
interface RotorRig {
  readonly rotor: HTMLImageElement;
  readonly blades: number;
  readonly phases: number;
  /** Body cell centre above the ground point (sheet px). */
  readonly groundDrop: number;
  /** Rotor hub above the body cell centre (sheet px); the mast is at the cell centre for every facing. */
  readonly hubLift: number;
}
const RIG_ROW = { parked: 0, fly: [1, 2], crashing: 3, wreck: 4, cap: 5, shadow: 6 } as const;
const ROTOR_ROW = { still: 0, spin: 1, stillShadow: 2, spinShadow: 3 } as const;

const img = (file: string): HTMLImageElement => {
  const i = new Image();
  i.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}`;
  return i;
};
const air = (model: string, span: number): CraftSheet => ({ image: img(`air-${model}.webp`), fx: img(`air-${model}-fx.webp`), cell: 96, fxCell: 128, fxFrames: 20, span, heli: false });
/** `fx`: the model whose explosion sheet it uses (the Z-10 blows up with the old Z-19E explosion). */
const heli = (model: string, span: number, fx = model): CraftSheet => ({ image: img(`heli-${model}.webp`), fx: img(`heli-${fx}-fx.webp`), cell: 80, fxCell: 128, fxFrames: 16, span, heli: true });

/** USA AH-64E Apache: body (tools/blender/ah64_render.py) + 4-blade rotor (rotor_render.py --name ah64), 192 px cells. */
const ah64: CraftSheet = {
  image: img('heli-ah64-usa.webp'),
  fx: img('heli-apache-fx.webp'),
  cell: 192,
  fxCell: 128,
  fxFrames: 16,
  span: 0.74,
  heli: true,
  // 1.5x the old 2/3-tank size: 17.4 m fuselage drawn 11.52 iso px long -> 0.662 iso px/m; axis v (stub-wing span
  // 5.35 m) = 3.54 iso px = 1.0 tank (Abrams 3.94 m at 0.897 iso px/m = 3.53), axis z 5.36 m = 3.55 iso px.
  length: 11.52,
  rig: { rotor: img('rotor-ah64.webp'), blades: 4, phases: 16, groundDrop: 15.56, hubLift: 14.5 },
};

/** Russia Ka-52 Alligator: body (tools/blender/ka52_render.py) + coaxial 2 x 3-blade rotor (rotor_render.py --name ka52 --coax 1.2). */
const ka52: CraftSheet = {
  image: img('heli-ka52-russia.webp'),
  fx: img('heli-ka52-fx.webp'),
  cell: 192,
  fxCell: 128,
  fxFrames: 16,
  span: 0.74,
  heli: true,
  // 1.3x the AH-64 world scale: drawn as long as the AH-64 (11.52 iso px for the 13.4 m fuselage, 0.86 iso px/m).
  length: 11.52,
  rig: { rotor: img('rotor-ka52.webp'), blades: 3, phases: 16, groundDrop: 19.65, hubLift: 18.46 },
};

/** China Z-10: body (tools/blender/z10_render.py) + 5-blade rotor (rotor_render.py --name z10), 192 px cells. */
const z10: CraftSheet = {
  image: img('heli-z10-china.webp'),
  fx: img('heli-z19e-fx.webp'),
  cell: 192,
  fxCell: 128,
  fxFrames: 16,
  span: 0.74,
  heli: true,
  // Drawn as long as the AH-64 and Ka-52 (11.52 iso px for the 14.3 m fuselage).
  length: 11.52,
  rig: { rotor: img('rotor-z10.webp'), blades: 5, phases: 16, groundDrop: 16.39, hubLift: 14.58 },
};

/** Every model, by key ('air:c17', 'heli:apache', …). Spans as measured by the build script. */
const MODELS: Readonly<Record<string, CraftSheet>> = {
  'air:c17': air('c17', 0.833),
  'air:il76': air('il76', 0.76),
  'air:y20': air('y20', 0.833),
  'heli:apache': heli('apache', 0.825),
  'heli:ah64': ah64,
  'heli:ka52': ka52,
  'heli:z10': z10,
};
/** The USA's C-17, Russia's Il-76, China's Y-20 and Europe's A400M have their own sharp sheets in AircraftSheets.ts. */
const TRANSPORT: Partial<Record<FactionId, string>> = { islamic: 'air:y20' };
const HELI: Record<FactionId, string> = { usa: 'heli:ah64', europe: 'heli:ah64', russia: 'heli:ka52', islamic: 'heli:ka52', china: 'heli:z10' };
/** Iso px each kind is drawn long. */
const LENGTH: Partial<Record<VehicleKind, number>> = { transport: 13, heli: 11.4 };

/** Model key of a nation's aircraft of `kind`, or null when it is not drawn from these sheets. */
export function craftKey(faction: FactionId, kind: VehicleKind): string | null {
  if (kind === 'transport') return TRANSPORT[faction] ?? null;
  if (kind === 'heli') return HELI[faction] ?? null;
  return null;
}

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the sheet downloads. */
export function loadCraftSprites(): Promise<void> {
  loaded ??= Promise.all(
    Object.values(MODELS)
      .flatMap((m) => (m.rig ? [m.image, m.fx, m.rig.rotor] : [m.image, m.fx]))
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
  // On the ground the rotors / propellers stand still while it sits (parked, set down, unloading); they only turn
  // while it taxis, spins up to lift off or settles after landing.
  if (v.altitude <= 0) return v.flight === 'parked' || v.flight === 'landed' || v.flight === 'unloading' ? rows.parked[0] : cycle(rows.engines, 0.06);
  if (v.flight === 'airborne' || v.flight === 'approach') return cycle(rows.fly, 0.06);
  return cycle(rows.takeoff, rows === HELI_ROW ? 0.12 : 1);
}

function blit(ctx: CanvasRenderingContext2D, image: HTMLImageElement, cell: number, col: number, row: number, x: number, y: number, size: number): void {
  ctx.drawImage(image, col * cell, row * cell, cell, cell, x - size / 2, y - size / 2, size, size);
}

/** World yaw (Blender rig frame) of sheet column `col`: the inverse of the scripts' heading(k). */
function rigYaw(col: number): number {
  const h = (col / DIRS) * Math.PI * 2;
  return Math.atan2(Math.cos(h) / 0.5, Math.sin(h));
}

/** Still rotor column: blades parked in an X across the fuselage (45° off the nose). */
function parkedPhase(r: RotorRig, col: number): number {
  const spacing = (Math.PI * 2) / r.blades;
  const a = (((rigYaw(col) + Math.PI / 4) % spacing) + spacing) % spacing;
  return Math.round((a / spacing) * r.phases) % r.phases;
}

/** Rotor turns while the engines run: in the air, and on the ground unless parked / set down / unloading. */
const rotorTurning = (v: Vehicle): boolean => !(v.altitude <= 0 && (v.flight === 'parked' || v.flight === 'landed' || v.flight === 'unloading'));

/** Body + rotor + mast-top cap of a rigged helicopter, the body cell centred on (x, y). */
function drawRig(ctx: CanvasRenderingContext2D, m: CraftSheet, r: RotorRig, col: number, bodyRow: number, spinning: boolean, x: number, y: number, size: number, rotor = true): void {
  const k = size / m.cell;
  blit(ctx, m.image, m.cell, col, bodyRow, x, y, size);
  if (rotor && ok(r.rotor)) {
    const phase = spinning ? Math.floor(performance.now() / 22) % r.phases : parkedPhase(r, col);
    blit(ctx, r.rotor, m.cell, phase, spinning ? ROTOR_ROW.spin : ROTOR_ROW.still, x, y - r.hubLift * k, size);
  }
  if (bodyRow !== RIG_ROW.crashing && bodyRow !== RIG_ROW.wreck) blit(ctx, m.image, m.cell, col, RIG_ROW.cap, x, y, size);
}

function drawRigged(ctx: CanvasRenderingContext2D, m: CraftSheet, r: RotorRig, v: Vehicle, x: number, y: number, size: number): void {
  const col = column(v.heading);
  const k = size / m.cell;
  const spinning = rotorTurning(v);
  // Shadow on the ground (body + rotor), fading with height.
  const alpha = ctx.globalAlpha;
  const s = v.altitude / 7;
  ctx.globalAlpha = alpha * Math.max(0.15, 0.38 - 0.08 * s);
  blit(ctx, m.image, m.cell, col, RIG_ROW.shadow, x + 0.4 * s, y + 0.8 * s, size);
  if (ok(r.rotor)) blit(ctx, r.rotor, m.cell, spinning ? Math.floor(performance.now() / 22) % r.phases : parkedPhase(r, col), spinning ? ROTOR_ROW.spinShadow : ROTOR_ROW.stillShadow, x + 0.4 * s, y + 0.8 * s, size);
  ctx.globalAlpha = alpha;
  const row = v.flight === 'crashing' ? RIG_ROW.crashing : spinning && v.altitude > 0 ? RIG_ROW.fly[Math.floor(performance.now() / 50) % 2] : spinning ? RIG_ROW.fly[0] : RIG_ROW.parked;
  drawRig(ctx, m, r, col, row ?? RIG_ROW.parked, spinning, x, y - v.altitude - r.groundDrop * k, size);
}

const drawnSize = (m: CraftSheet, kind: VehicleKind): number => (m.length ?? LENGTH[kind] ?? 10) / m.span;

/**
 * Draws a transport or helicopter with its ground point at (x, y) in iso px: shadow on the ground, body
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
  if (m.rig) {
    drawRigged(ctx, m, m.rig, v, x, y, size);
    ctx.imageSmoothingEnabled = prevSmooth;
    return true;
  }
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
  if (m.rig) drawRig(ctx, m, m.rig, column(heading), RIG_ROW.parked, false, w / 2, h / 2 + (m.rig.hubLift * size) / m.cell / 2, size);
  else blit(ctx, m.image, m.cell, column(heading), (m.heli ? HELI_ROW : AIR_ROW).fly[0], w / 2, h / 2, size);
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
 * A transport or helicopter destroyed (`age` s into a `ttl` s effect) at iso point (x, y): blown up in the
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
    if (m.rig) blit(ctx, m.image, m.cell, column(heading), RIG_ROW.wreck, x, y - (m.rig.groundDrop * size) / m.cell, size);
    else blit(ctx, m.image, m.cell, column(heading), cycle((m.heli ? HELI_ROW : AIR_ROW).wreck, 0.2), x, y - 1.5, size);
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = prevSmooth;
  }
  drawCraftBlast(ctx, key, inAir, x, y - 1.5, age, size * 1.4);
}
