// Turns a generated aircraft sheet (16 headings × 9 states on a plain white or magenta background) into a
// transparent, downscaled sprite sheet for the game.
//   node scripts/build-aircraft-sheet.mjs <input.png> <output.png> [cellOut=128]
import sharp from 'sharp';

const [input, output, cellArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/build-aircraft-sheet.mjs <input.png> <output.png> [cellOut=128]');
  process.exit(1);
}
const COLS = 16;
const ROWS = 9;
const cellOut = Number(cellArg) || 128;

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

/** Background: near-white or near-magenta, flat (no saturation from the art's own colours). */
const isBg = (i) => {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const white = r >= 228 && g >= 228 && b >= 228;
  const magenta = r >= 200 && b >= 200 && g <= 70;
  return white || magenta;
};

// Flood fill from the image border so light parts inside the art are kept.
const seen = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (seen[p] || !isBg(p * 4)) return;
  seen[p] = 1;
  stack.push(p);
};
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
// Gaps between cells are background too, even where art would cut them off from the border.
const cw = W / COLS, ch = H / ROWS;
for (let c = 0; c <= COLS; c++) for (let y = 0; y < H; y++) push(Math.min(W - 1, Math.round(c * cw)), y);
for (let r = 0; r <= ROWS; r++) for (let x = 0; x < W; x++) push(x, Math.min(H - 1, Math.round(r * ch)));
while (stack.length) {
  const p = stack.pop();
  const x = p % W, y = (p - x) / W;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}
// Background trapped inside the art (between wing and fuselage): pure, flat white blobs of some size.
const isHole = (p) => data[p * 4] >= 240 && data[p * 4 + 1] >= 240 && data[p * 4 + 2] >= 240;
for (let p0 = 0; p0 < W * H; p0++) {
  if (seen[p0] || !isHole(p0)) continue;
  const blob = [p0];
  seen[p0] = 2;
  for (let k = 0; k < blob.length; k++) {
    const p = blob[k], x = p % W, y = (p - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (!seen[q] && isHole(q)) { seen[q] = 2; blob.push(q); }
    }
  }
  const keep = blob.length < 40; // tiny specks are highlights in the art
  for (const p of blob) seen[p] = keep ? 3 : 1;
}
for (let p = 0; p < W * H; p++) if (seen[p] === 3) seen[p] = 0;
let cleared = 0;
for (let p = 0; p < W * H; p++) if (seen[p]) { data[p * 4 + 3] = 0; cleared++; }

await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .resize(COLS * cellOut, ROWS * cellOut, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`${output}: ${COLS * cellOut}×${ROWS * cellOut}, ${((cleared / (W * H)) * 100).toFixed(1)}% background removed`);
