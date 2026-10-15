/**
 * Builds `public/data/earth.png` — the packed world texture the game loads.
 *
 *   R = land elevation   (NASA Visible Earth / GEBCO 2008, 0 = sea level, 255 ≈ 6400 m)
 *   G = land coverage     (Natural Earth 1:50m land minus 1:50m lakes, anti-aliased)
 *   B = water depth       (NASA Visible Earth / GEBCO 2008 bathymetry, 0 = shallow, 255 = deepest)
 *
 * Equirectangular projection, EARTH_W × EARTH_H, lon -180..180, lat 90..-90.
 * Run with `npm run build:earth` (downloads ~40 MB of source imagery into .cache/).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { feature } from 'topojson-client';

const EARTH_W = 4096;
const EARTH_H = 2048;
/** Inland water (Caspian…) is "land" in Natural Earth but has GEBCO depth. */
const LAKE_MIN_DEPTH = 3;
/** Rows below this latitude are solid Antarctic ice. */
const SOUTH_POLE_FILL_LAT = -84;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.cache');
const outFile = join(root, 'public', 'data', 'earth.png');
const require = createRequire(import.meta.url);

const SOURCES = {
  elevation: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png',
  bathymetry: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73963/gebco_08_rev_bath_21600x10800.png',
  lakes: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson',
};

async function download(name, url, ext = 'png') {
  const file = join(cacheDir, `${name}.${ext}`);
  if (existsSync(file)) return file;
  console.log(`Downloading ${name}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** Resamples a huge greyscale source to EARTH_W × EARTH_H, one byte per pixel. */
async function resample(file) {
  return sharp(file, { limitInputPixels: false })
    .greyscale()
    .resize(EARTH_W, EARTH_H, { fit: 'fill', kernel: 'lanczos3' })
    .extractChannel(0)
    .raw()
    .toBuffer();
}

/** Rasterises GeoJSON (Multi)Polygons to a coverage mask, handling antimeridian crossings. */
async function rasterize(geoms) {
  const px = (lon) => ((lon + 180) / 360) * EARTH_W;
  const py = (lat) => ((90 - lat) / 180) * EARTH_H;
  const ringPath = (ring, offset) => {
    let prevLon = ring[0][0];
    let shift = 0;
    return (
      ring
        .map(([lon, lat], i) => {
          // Unwrap longitude so rings that cross ±180° stay contiguous.
          if (i > 0) {
            if (lon - prevLon > 180) shift -= 360;
            else if (lon - prevLon < -180) shift += 360;
          }
          prevLon = lon;
          return `${i === 0 ? 'M' : 'L'}${(px(lon + shift) + offset).toFixed(2)},${py(lat).toFixed(2)}`;
        })
        .join('') + 'Z'
    );
  };

  const paths = [];
  for (const g of geoms) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      for (const offset of [-EARTH_W, 0, EARTH_W]) {
        paths.push(`<path fill-rule="evenodd" d="${poly.map((r) => ringPath(r, offset)).join('')}"/>`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EARTH_W}" height="${EARTH_H}"><rect width="100%" height="100%" fill="#000"/><g fill="#fff">${paths.join("")}</g></svg>`;
  return sharp(Buffer.from(svg)).greyscale().extractChannel(0).raw().toBuffer();
}

/** Natural Earth land polygons (world-atlas TopoJSON). */
function landGeometries() {
  const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'));
  const land = feature(topo, topo.objects.land);
  return land.type === 'FeatureCollection' ? land.features.map((f) => f.geometry) : [land.geometry];
}

mkdirSync(cacheDir, { recursive: true });
mkdirSync(dirname(outFile), { recursive: true });

const [elevFile, bathFile, lakesFile] = await Promise.all([
  download('elevation', SOURCES.elevation),
  download('bathymetry', SOURCES.bathymetry),
  download('lakes', SOURCES.lakes, 'geojson'),
]);
const lakeGeoms = JSON.parse(readFileSync(lakesFile, 'utf8')).features.map((f) => f.geometry);
const [elev, bath, mask, lakes] = await Promise.all([
  resample(elevFile),
  resample(bathFile),
  rasterize(landGeometries()),
  rasterize(lakeGeoms),
]);

const poleRow = Math.floor(((90 - SOUTH_POLE_FILL_LAT) / 180) * EARTH_H);
const rgb = Buffer.alloc(EARTH_W * EARTH_H * 3);
for (let i = 0; i < EARTH_W * EARTH_H; i++) {
  const depth = 255 - bath[i];
  let land = Math.round((mask[i] * (255 - lakes[i])) / 255);
  if (Math.floor(i / EARTH_W) >= poleRow) land = 255;
  else if (land > 0 && elev[i] === 0 && depth >= LAKE_MIN_DEPTH) land = 0;
  rgb[i * 3] = elev[i];
  rgb[i * 3 + 1] = land;
  rgb[i * 3 + 2] = 255 - bath[i]; // source is reversed (white = shallow)
}
await sharp(rgb, { raw: { width: EARTH_W, height: EARTH_H, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile(outFile);

// Sanity samples (lon, lat).
const sample = (name, lon, lat) => {
  const x = Math.round(((lon + 180) / 360) * (EARTH_W - 1));
  const y = Math.round(((90 - lat) / 180) * (EARTH_H - 1));
  const i = y * EARTH_W + x;
  console.log(`${name.padEnd(12)} elev=${elev[i]} land=${mask[i]} depth=${255 - bath[i]}`);
};
sample('Everest', 86.93, 27.99);
sample('Netherlands', 5.3, 52.2);
sample('Mariana', 142.2, 11.35);
sample('N.Atlantic', -40, 40);
sample('Caspian', 51, 42);
sample('Washington', -77.04, 38.9);
console.log(`Wrote ${outFile}`);
