// Turns a 64-heading aircraft sheet (80 px cells, 16 columns; 5 poses × 4 rows: level, bank one way, bank the
// other way, crash, crash steeper — headings clockwise from N, row-major) into the game's 16-heading × 9-row
// sheet (96 px cells: parked, flyA, flyB, ramp, bankLeft, bankRight, crash1, crash2, shadow).
//   node scripts/build-jet64-sheet.mjs <input.png> <output.png> [sideSpan=84]
// sideSpan: width (px of the 96 px cell) the side-on aircraft should span, to match the other jet sheets.
import sharp from 'sharp';

const [input, output, spanArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/build-jet64-sheet.mjs <input.png> <output.png> [sideSpan=84]');
  process.exit(1);
}
const IN = 80;
const OUT = 96;
const COLS = 16;
const sideSpan = Number(spanArg) || 84;

const src = sharp(input).ensureAlpha();
const cellAt = (pose, h16) => {
  const i = h16 * 4; // every 4th of the 64 headings
  return { left: (i % COLS) * IN, top: (pose * 4 + Math.floor(i / COLS)) * IN };
};

// Scale from the side-on level pose (heading E = 16 of 64).
const side = cellAt(0, 4);
const { data, info } = await src.clone().extract({ left: side.left, top: side.top, width: IN, height: IN }).raw().toBuffer({ resolveWithObject: true });
let x0 = IN, x1 = -1;
for (let y = 0; y < IN; y++) for (let x = 0; x < IN; x++) if (data[(y * IN + x) * info.channels + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
const k = sideSpan / (x1 - x0 + 1);
const big = Math.round(IN * k);
const off = Math.round((big - OUT) / 2);

const tile = async (pose, h16, shadow = false) => {
  const c = cellAt(pose, h16);
  let img = sharp(await src.clone().extract({ left: c.left, top: c.top, width: IN, height: IN }).resize(big, big, { kernel: 'lanczos3' }).png().toBuffer());
  img = big > OUT ? img.extract({ left: off, top: off, width: OUT, height: OUT }) : img.extend({ top: -off, bottom: OUT - big + off, left: -off, right: OUT - big + off, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (!shadow) return img.png().toBuffer();
  const { data: d, info: inf } = await img.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = d[i + 3] > 40 ? 255 : 0; }
  return sharp(d, { raw: { width: inf.width, height: inf.height, channels: 4 } }).png().toBuffer();
};

// Output row → source pose (0 level, 1 / 2 banks, 3 / 4 crash).
const ROWS = [0, 0, 0, 0, 1, 2, 3, 4];
const parts = [];
for (let r = 0; r < ROWS.length; r++) for (let h = 0; h < COLS; h++) parts.push({ input: await tile(ROWS[r], h), left: h * OUT, top: r * OUT });
for (let h = 0; h < COLS; h++) parts.push({ input: await tile(0, h, true), left: h * OUT, top: 8 * OUT });
await sharp({ create: { width: COLS * OUT, height: 9 * OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(parts)
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`${output}: ${COLS} × 9 cells of ${OUT} px (scale ×${k.toFixed(2)})`);
