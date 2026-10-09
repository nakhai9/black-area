import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId, VehicleKind } from '../types';

/**
 * Pre-drawn aircraft sheets (RA2 style), built with scripts/build-aircraft-sheet.mjs at 128 px cells and shipped
 * at 75% (96 px cells) to save download and memory.
 * Columns: 16 screen headings, clockwise from N (nose up the screen). Rows below.
 */
const COLS = 16;
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

const SHEETS: Partial<Record<`${FactionId}:${VehicleKind}`, AircraftSheet>> = {
  'usa:transport': sheet('transport-usa.png', 96, 13),
  'russia:transport': sheet('transport-russia.png', 96, 13),
  'china:transport': sheet('transport-china.png', 96, 13),
  'europe:transport': sheet('transport-europe.png', 96, 13),
  'usa:jet': sheet('jet-usa.png', 96, 10),
  'russia:jet': sheet('jet-russia.png', 96, 10),
  'china:jet': sheet('jet-china.png', 96, 10),
  'europe:jet': sheet('jet-europe.png', 96, 10),
  'islamic:jet': sheet('jet-islamic.png', 96, 10),
  // National bombers, one nation each (built from scripts/assets/*-source.png by scripts/build-bomber-sheet.py).
  'russia:bomber': sheet('tu26-russia.png', 96, 14),
  'usa:bomber': sheet('b52-usa.png', 96, 16),
};
// Tankers: the faction's transport airframe drawn smaller (a short, fat refueler); they share the transport image.
for (const f of ['usa', 'russia', 'china', 'europe', 'islamic'] as const) {
  const t = SHEETS[`${f}:transport`];
  if (t) SHEETS[`${f}:tanker`] = { ...t, scale: t.scale * (9.5 / 13) };
}

/** Turn rate (rad/s) above which an airborne aircraft is drawn banked. */
const BANK_TURN_RATE = 0.35;
/** Seconds into a crash before the steeper, burning pose. */
const CRASH_STEEP_AFTER = 0.9;

let loaded: Promise<void> | null = null;

/** Starts (once) and returns the aircraft sheet downloads. */
export function loadAircraftSprites(): Promise<void> {
  loaded ??= Promise.all(
    [...new Set(Object.values(SHEETS))].filter((s, i, all) => all.findIndex((o) => o.image === s.image) === i).map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.image.onload = () => resolve();
          s.image.onerror = () => reject(new Error(`Could not load aircraft sprites '${s.url}'.`));
          s.image.src = s.url;
        }),
    ),
  ).then(() => undefined);
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
function column(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const sx = (c - s) * ISO_X;
  const sy = (c + s) * ISO_Y;
  const a = Math.atan2(sx, -sy);
  return ((Math.round((a / (Math.PI * 2)) * COLS) % COLS) + COLS) % COLS;
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
  const sh = SHEETS[`${v.faction as FactionId}:${v.type}`];
  if (!sh) return false;
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return false;
  const col = column(v.heading);
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
  const sh = SHEETS[`${faction}:${kind}`];
  if (!sh) return false;
  const img = sh.image;
  if (!img.complete || img.naturalWidth === 0) return false;
  const col = column(heading);
  const size = Math.min(w / 0.74, h * 1.35);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, col * sh.cell, ROW.flyA * sh.cell, sh.cell, sh.cell, (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}
