import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId, VehicleKind } from '../types';
import { drawCraftPortrait, drawCraftSheet, loadCraftSprites } from './CraftSheets';

/**
 * Fighter and bomber sheets (transports and helicopters: see CraftSheets), rendered from 3D models by
 * tools/aircraft_model_sheet.py at 96 px cells.
 * Columns: screen headings clockwise from N (nose up the screen) — 16 on the old fighter / drone sheets, 32 (Red Alert 2
 * facings, like the tanks) on the Blender-rendered bombers, AWACS and transports; read from the sheet width. Rows below.
 */
const ROW = { parked: 0, flyA: 1, flyB: 2, ramp: 3, bankLeft: 4, bankRight: 5, crash1: 6, crash2: 7, shadow: 8 } as const;

interface AircraftSheet {
  readonly url: string;
  readonly image: HTMLImageElement;
  /** Cell size in sheet px; the aircraft's centre sits in the middle of the cell. */
  readonly cell: number;
  /** Iso px per sheet px. */
  readonly scale: number;
}

const sheet = (file: string, cell: number, length: number): AircraftSheet => ({
  url: `${import.meta.env.BASE_URL}sprites/${file}`,
  image: new Image(),
  cell,
  // Side-on the aircraft spans ≈ 0.74 of a cell; it is drawn `length` iso px long.
  scale: length / (cell * 0.74),
});

/** Every national bomber (Tu-160, B-1A, H-6K) is drawn this long (iso px): the Tu-160 is the standard. */
const BOMBER_LENGTH = 15.2;
/** AWACS are drawn no longer than a fighter (iso px, the fighters' length). */
const AWACS_LENGTH = 9.5;

const SHEETS: Partial<Record<`${FactionId}:${VehicleKind}`, AircraftSheet>> = {
  'usa:jet': sheet('jet-usa.webp', 96, 9.5),
  'russia:jet': sheet('jet-russia.webp', 96, 9.5),
  'china:jet': sheet('jet-china.webp', 96, 9.5),
  'europe:jet': sheet('jet-europe.webp', 96, 9.5),
  'islamic:jet': sheet('jet-islamic.webp', 96, 9.5),
  // National bombers, one nation each (rendered from 3D models by tools/aircraft_model_sheet.py).
  // Tu-160: wings spread (192 px cells, sharp when zoomed); swept back only while the turbo runs (TURBO_SHEETS).
  'russia:bomber': sheet('tu160-russia.webp', 192, BOMBER_LENGTH),
  'china:bomber': sheet('h6-china.webp', 192, BOMBER_LENGTH), // H-6K: fixed wing, no turbo sheet (tools/h6_model_sheet.py)
  'usa:bomber': sheet('b1-usa.webp', 192, BOMBER_LENGTH), // B-1 Lancer: the same, after its blueprint (tools/b1_model_sheet.py)
  // The USA's C-17 Globemaster III transport: its own Blender model (tools/blender/c17_render.py), 192 px cells.
  'usa:transport': sheet('c17-usa.webp', 192, 13),
  // Russia's Il-76MD transport: its own Blender model (tools/blender/il76_render.py), white with a blue cheatline.
  'russia:transport': sheet('il76-russia.webp', 192, 13),
  // China's Y-20A Kunpeng transport: its own Blender model (tools/blender/y20_render.py), PLAAF grey.
  'china:transport': sheet('y20-china.webp', 192, 13),
  // Europe's A400M Atlas: its own Blender model (tools/blender/a400m_render.py), 8-blade scimitar propellers, grey.
  'europe:transport': sheet('a400m-europe.webp', 192, 13),
  // AWACS, every nation (built in code, rendered in Blender by tools/awacs_blender_sheet.py at 192 px cells), as long as a fighter.
  'usa:awacs': sheet('awacs-usa.webp', 192, AWACS_LENGTH),
  'europe:awacs': sheet('awacs-europe.webp', 192, AWACS_LENGTH),
  'china:awacs': sheet('awacs-china.webp', 192, AWACS_LENGTH),
  'russia:awacs': sheet('awacs-russia.webp', 192, AWACS_LENGTH),
  'islamic:awacs': sheet('awacs-islamic.webp', 192, AWACS_LENGTH),
  // Kamikaze drone (Islamic world's B-767).
  'islamic:drone': sheet('drone-islamic.webp', 96, 9.5), // same size as the fighters
};

/** Variable-geometry aircraft: the sheet drawn while the turbo runs (wings swept back). */
const TURBO_SHEETS: Partial<Record<`${FactionId}:${VehicleKind}`, AircraftSheet>> = {
  'russia:bomber': sheet('tu160-russia-turbo.webp', 192, BOMBER_LENGTH),
  'usa:bomber': sheet('b1-usa-turbo.webp', 192, BOMBER_LENGTH),
};

/** Turn rate (rad/s) above which an airborne aircraft is drawn banked. */
const BANK_TURN_RATE = 0.35;
/** Seconds into a crash before the steeper, burning pose. */
const CRASH_STEEP_AFTER = 0.9;

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the aircraft sheet downloads. */
export function loadAircraftSprites(): Promise<void> {
  loaded ??= Promise.all([
    loadCraftSprites(),
    ...[...new Set([...Object.values(SHEETS), ...Object.values(TURBO_SHEETS)])].filter((s, i, all) => all.findIndex((o) => o.image === s.image) === i).map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.image.onload = () => resolve();
          s.image.onerror = () => reject(new Error(`Could not load aircraft sprites '${s.url}'.`));
          s.image.src = s.url;
        }),
    ),
  ]).then(() => undefined);
  return loaded;
}

/** Last heading and time per aircraft, to tell whether it is turning (and which way). */
const turnTrack = new WeakMap<Vehicle, { heading: number; at: number; rate: number }>();

function turnRate(v: Vehicle): number {
  const now = performance.now() / 1000;
  const t = turnTrack.get(v);
  if (!t) {
    turnTrack.set(v, { heading: v.heading, at: now, rate: 0 });
    return 0;
  }
  const dt = now - t.at;
  if (dt > 0.02) {
    let d = v.heading - t.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // Smoothed so a single odd frame does not flick the wings.
    t.rate += (d / dt - t.rate) * Math.min(1, dt * 6);
    t.heading = v.heading;
    t.at = now;
  }
  return t.rate;
}

/** Sheet column for a world heading: its direction on screen, clockwise from straight up. */
function column(heading: number, cols: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const sx = (c - s) * ISO_X;
  const sy = (c + s) * ISO_Y;
  const a = Math.atan2(sx, -sy);
  return ((Math.round((a / (Math.PI * 2)) * cols) % cols) + cols) % cols;
}

function pickRow(v: Vehicle): number {
  if (v.flight === 'crashing') return v.phaseTime < CRASH_STEEP_AFTER ? ROW.crash1 : ROW.crash2;
  if (v.altitude <= 0) {
    const s = v.carrierState;
    return s === 'loading' || s === 'unloading' ? ROW.ramp : ROW.parked;
  }
  if (v.flight === 'airborne' || v.flight === 'approach') {
    // World headings grow clockwise on screen: a positive rate is a right turn.
    const r = turnRate(v);
    if (r > BANK_TURN_RATE) return ROW.bankRight;
    if (r < -BANK_TURN_RATE) return ROW.bankLeft;
  }
  const engine = Math.floor((v.walkPhase * 3.1) / Math.PI) & 1;
  return engine ? ROW.flyB : ROW.flyA;
}

/**
 * Draws `v` from its faction's aircraft sheet with its ground point at (x, y) in iso px: shadow on the ground,
 * body `altitude` px above it. Returns false when there is no sheet for it (the caller draws the vector art).
 */
export function drawAircraftSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  if (drawCraftSheet(ctx, v, x, y)) return true;
  const key = `${v.faction as FactionId}:${v.type}` as const;
  const sh = (v.turboLeft > 0 && v.flight === 'airborne' ? TURBO_SHEETS[key] : undefined) ?? SHEETS[key];
  if (!sh) return false;
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return false;
  const col = column(v.heading, Math.round(img.naturalWidth / sh.cell));
  const row = pickRow(v);
  const size = sh.cell * sh.scale;
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;

  // Shadow: slides away and fades with height, like the vector art's.
  const k = v.altitude / 7;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0.12, 0.34 - 0.1 * k);
  ctx.drawImage(img, col * sh.cell, ROW.shadow * sh.cell, sh.cell, sh.cell, x + 0.6 + k - half, y + 0.6 + 2 * k - half, size, size);
  ctx.globalAlpha = alpha;

  // Body: its centre sits about 1.5 px over the wheels.
  ctx.drawImage(img, col * sh.cell, row * sh.cell, sh.cell, sh.cell, x - half, y - v.altitude - 1.5 - half, size, size);
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/**
 * Draws the faction's aircraft sheet (flying pose, `heading` world radians) centred in a w × h cameo.
 * Returns false when there is no loaded sheet for it.
 */
export function drawAircraftPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, kind: VehicleKind, w: number, h: number, heading: number): boolean {
  if (drawCraftPortrait(ctx, faction, kind, w, h, heading)) return true;
  const sh = SHEETS[`${faction}:${kind}`];
  if (!sh) return false;
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return false;
  const col = column(heading, Math.round(img.naturalWidth / sh.cell));
  const size = Math.min(w / 0.74, h * 1.35);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, col * sh.cell, ROW.flyA * sh.cell, sh.cell, sh.cell, (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}
