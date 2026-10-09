/**
 * Crazy Soldier's charge and blast, from rows 11–12 of its soldier sheet (64 px cells): row 11 col 6 / 7 = the
 * planted charge with its light on / off (it blinks faster as the fuse runs out); row 12 = the explosion (8 frames).
 */
const CELL = 64;
const ROW_CHARGE = 11;
const ROW_BLAST = 12;
const FRAMES = 8;
const CHARGE_SCALE = 0.12;
const BLAST_SCALE = 0.42;

const image = new Image();
image.src = `${import.meta.env.BASE_URL}sprites/islamic-demolition-8dir.png`;

const ready = (): boolean => image.complete && image.naturalWidth > 0;

function blit(ctx: CanvasRenderingContext2D, row: number, col: number, x: number, y: number, scale: number): void {
  const size = CELL * scale;
  ctx.drawImage(image, col * CELL, row * CELL, CELL, CELL, x - size / 2, y - size / 2, size, size);
}

/** The planted charge `left` seconds before it goes off: its light blinks quicker as the fuse runs down. */
export function drawCharge(ctx: CanvasRenderingContext2D, x: number, y: number, left: number): void {
  const rate = left < 1 ? 8 : left < 2.5 ? 4 : 2;
  const on = Math.floor(left * rate) % 2 === 0;
  if (!ready()) {
    ctx.fillStyle = on ? '#ff3b2f' : '#5a1410';
    ctx.beginPath();
    ctx.arc(x, y, 0.9, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  blit(ctx, ROW_CHARGE, on ? 6 : 7, x, y, CHARGE_SCALE);
}

/** The charge's explosion, `t` (0..1) through it. Returns false when the sheet is not loaded. */
export function drawDemolitionBlast(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): boolean {
  if (!ready()) return false;
  blit(ctx, ROW_BLAST, Math.min(FRAMES - 1, Math.floor(t * FRAMES)), x, y - 4, BLAST_SCALE);
  return true;
}
