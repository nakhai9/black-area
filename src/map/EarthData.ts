import { createCanvas } from '../render/Canvas';

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

export async function loadEarthData(url: string): Promise<EarthData> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error(`Could not load Earth texture '${url}'. Run "npm run build:earth" first.`);
  }
  const { width, height } = img;
  const { ctx } = createCanvas(width, height, { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, width, height).data;

  const n = width * height;
  const elevation = new Uint8Array(n);
  const land = new Uint8Array(n);
  const depth = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    elevation[i] = rgba[i * 4];
    land[i] = rgba[i * 4 + 1];
    depth[i] = rgba[i * 4 + 2];
  }
  return { width, height, elevation, land, depth };
}
