// Turns a helicopter sheet (80 px cells, 16 × 16) into the game's aircraft sheet layout (16 headings × 9 rows:
// parked, flyA, flyB, ramp, bankLeft, bankRight, crash1, crash2, shadow — see src/render/AircraftSheets.ts).
// Source rows: 0–7 flying, 4 rotor frames × 32 headings (two rows each: headings 0–15, 16–31, starting nose down
// the screen and turning clockwise); 8–9 shadow (32 headings); 10 rockets firing, 11 gun firing; 12 missile +
// blast; 13 crash spin (16 frames); 14 damaged and smoking (16 headings from nose down); 15 wreck + blast.
//   node scripts/build-heli-sheet.mjs <input.png> <output.png>
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/build-heli-sheet.mjs <input.png> <output.png>');
  process.exit(1);
}
const CELL = 80;
const COLS = 16;
const src = sharp(input).ensureAlpha();

/** Source cell of game heading h (0 = nose up the screen, clockwise) in a 32-heading row pair starting at `row`. */
const pair32 = (row, h) => {
  const k = (2 * h + 16) % 32;
  return [k % 16, row + Math.floor(k / 16)];
};
/** Same for a 16-heading row starting nose down. */
const row16 = (row, h) => [(h + 8) % 16, row];
/** Crash spin: frame by column. */
const spin = (row, h) => [h, row];

const ROWS = [
  (h) => pair32(0, h), // parked
  (h) => pair32(0, h), // flyA (rotor frame 1)
  (h) => pair32(4, h), // flyB (rotor frame 3)
  (h) => pair32(0, h), // ramp
  (h) => pair32(2, h), // bankLeft (other rotor frames: no banked art)
  (h) => pair32(6, h), // bankRight
  (h) => row16(14, h), // crash1: damaged, smoking
  (h) => spin(13, h), // crash2: spinning down
  (h) => pair32(8, h), // shadow
];
const parts = [];
for (let r = 0; r < ROWS.length; r++) {
  for (let h = 0; h < COLS; h++) {
    const [c, sr] = ROWS[r](h);
    parts.push({ input: await src.clone().extract({ left: c * CELL, top: sr * CELL, width: CELL, height: CELL }).png().toBuffer(), left: h * CELL, top: r * CELL });
  }
}
await sharp({ create: { width: COLS * CELL, height: ROWS.length * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(parts)
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`${output}: ${COLS} × ${ROWS.length} cells of ${CELL} px`);
