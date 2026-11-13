import { DAY_NIGHT_DARKNESS, DAY_NIGHT_SECONDS, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { worldToGeo } from '../map/Geo';
import { createCanvas } from './Canvas';

/** Resolution of the night mask over the whole world (stretched and smoothed when drawn). */
const MASK_W = 384;
const MASK_H = 192;
/** The mask is recomputed this often (game seconds): the terminator moves slowly. */
const REFRESH = 0.5;
/** Sun this far below the horizon (degrees) = full night; between 0 and this = twilight. */
const TWILIGHT_DEG = 12;
const RAD = Math.PI / 180;

/**
 * Real-Earth day and night: the sun's declination is today's (season), and the sub-solar longitude starts at the real
 * UTC time when the game opens, then turns westward one full day every DAY_NIGHT_SECONDS of game time.
 * The night side is only tinted dark blue (DAY_NIGHT_DARKNESS), so everything stays visible and playable.
 */
export class DayNight {
  private readonly mask = createCanvas(MASK_W, MASK_H);
  private readonly canvas = this.mask.canvas;
  private readonly ctx = this.mask.ctx;
  private readonly image = this.ctx.createImageData(MASK_W, MASK_H);
  private readonly sinLat = new Float32Array(MASK_W * MASK_H);
  private readonly cosLat = new Float32Array(MASK_W * MASK_H);
  private readonly lon = new Float32Array(MASK_W * MASK_H);
  private readonly sinDec: number;
  private readonly cosDec: number;
  private readonly lon0: number;
  private last = -Infinity;

  constructor(now = new Date()) {
    // Solar declination for today (approximation good to ~1°).
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const day = (now.getTime() - start) / 86_400_000;
    const dec = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
    this.sinDec = Math.sin(dec * RAD);
    this.cosDec = Math.cos(dec * RAD);
    const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
    this.lon0 = (12 - hours) * 15;
    // Geographic position of every mask pixel (the map's projection squeezes the oceans, so lon depends on lat).
    for (let j = 0; j < MASK_H; j++) {
      for (let i = 0; i < MASK_W; i++) {
        const g = worldToGeo({ x: ((i + 0.5) / MASK_W) * WORLD_WIDTH, y: ((j + 0.5) / MASK_H) * WORLD_HEIGHT });
        const k = j * MASK_W + i;
        this.sinLat[k] = Math.sin(g.lat * RAD);
        this.cosLat[k] = Math.cos(g.lat * RAD);
        this.lon[k] = g.lon * RAD;
      }
    }
  }

  /** Longitude (degrees) where the sun stands overhead at game time `time`. */
  subsolarLon(time: number): number {
    return this.lon0 - (time / DAY_NIGHT_SECONDS) * 360;
  }

  private update(time: number): void {
    const sub = this.subsolarLon(time) * RAD;
    const d = this.image.data;
    const max = DAY_NIGHT_DARKNESS * 255;
    for (let k = 0; k < this.lon.length; k++) {
      const sinElev = this.sinLat[k] * this.sinDec + this.cosLat[k] * this.cosDec * Math.cos(this.lon[k] - sub);
      const below = -Math.asin(Math.max(-1, Math.min(1, sinElev))) / RAD; // degrees below the horizon
      const t = Math.max(0, Math.min(1, below / TWILIGHT_DEG));
      const p = k * 4;
      d[p] = 6;
      d[p + 1] = 12;
      d[p + 2] = 38;
      d[p + 3] = t * t * (3 - 2 * t) * max;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  /** Paints the night side over the world; `ctx` must be in the ground (world px) transform. */
  draw(ctx: CanvasRenderingContext2D, time: number, x = 0, y = 0, w = WORLD_WIDTH, h = WORLD_HEIGHT): void {
    if (Math.abs(time - this.last) >= REFRESH) {
      this.last = time;
      this.update(time);
    }
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, x, y, w, h);
    ctx.imageSmoothingEnabled = smooth;
  }
}

/** One shared sky for the battlefield and the radar (same terminator, computed once). */
export const dayNight = new DayNight();
