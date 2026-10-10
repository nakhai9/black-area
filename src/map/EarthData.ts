import { EARTH_TEX_WIDTH } from '../constants';
import { createCanvas } from '../render/Canvas';
import { fracToLon } from './Geo';

/** Decoded Earth texture channels (see scripts/build-earth.mjs). */
export interface EarthData {
  readonly width: number;
  readonly height: number;
  /** 0..255 land elevation (× ELEVATION_M_PER_UNIT metres). */
  readonly elevation: Uint8Array;
  /** 0..255 anti-aliased land coverage (lakes already removed). */
  readonly land: Uint8Array;
  /** 0..255 water depth (× DEPTH_M_PER_UNIT metres). */
  readonly depth: Uint8Array;
}

/** Greenland: middle meridian it is narrowed about, a cell on it to start the flood from, and its southern tip. */
const GREENLAND_LON = -42;
const GREENLAND_SEED = { lon: -42, lat: 72 };
const GREENLAND_LAT_MIN = 58;
/** Depth code (× DEPTH_M_PER_UNIT ≈ 1 km) for the sea where Greenland's stretched-out land used to be. */
const OPEN_SEA_DEPTH = 23;

/** Source-texture texels of Greenland's land (flood fill from GREENLAND_SEED; other islands are not connected). */
function greenlandMask(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const sx = Math.floor(((GREENLAND_SEED.lon + 180) / 360) * w);
  const sy = Math.floor(((90 - GREENLAND_SEED.lat) / 180) * h);
  const stack = [sy * w + sx];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (mask[i] || rgba[i * 4 + 1]! < 128) continue;
    mask[i] = 1;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return mask;
}

export async function loadEarthData(url: string): Promise<EarthData> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error(`Could not load Earth texture '${url}'. Run "npm run build:earth" first.`);
  }
  const { width: srcW, height } = img;
  const { ctx } = createCanvas(srcW, height, { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, srcW, height).data;

  // The texture file is plain equirectangular; each row is resampled so the oceans come out squeezed (Geo.lonToFrac).
  const width = EARTH_TEX_WIDTH;
  const greenland = greenlandMask(rgba, srcW, height);
  const n = width * height;
  const elevation = new Uint8Array(n);
  const land = new Uint8Array(n);
  const depth = new Uint8Array(n);
  const sea = (i: number): void => {
    elevation[i] = 0;
    land[i] = 0;
    depth[i] = OPEN_SEA_DEPTH;
  };
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) / height) * 180;
    // Greenland at its true size: the map stretches every row by 1 / cos(lat), so its land is narrowed by cos(lat)
    // about its middle (GREENLAND_LON); the strip it gives up becomes sea.
    const squeeze = lat > GREENLAND_LAT_MIN ? Math.cos((lat * Math.PI) / 180) : 1;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const lon = fracToLon((x + 0.5) / width, lat);
      // West of -180: the open-sea strip the Pacific squeeze leaves at the map's west edge.
      if (lon < -180) {
        sea(i);
        continue;
      }
      let col = Math.min(srcW - 1, Math.floor(((lon + 180) / 360) * srcW));
      if (squeeze < 1) {
        const from = Math.floor(((GREENLAND_LON + (lon - GREENLAND_LON) / squeeze + 180) / 360) * srcW);
        if (from >= 0 && from < srcW && greenland[y * srcW + from]) col = from;
        else if (greenland[y * srcW + col]) {
          sea(i);
          continue;
        }
      }
      const s = (y * srcW + col) * 4;
      elevation[i] = rgba[s]!;
      land[i] = rgba[s + 1]!;
      depth[i] = rgba[s + 2]!;
    }
  }
  return { width, height, elevation, land, depth };
}
