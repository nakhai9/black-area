"""Builds public/sprites/nuke-cloud.png from scripts/assets/nuke-cloud-source.png (6 x 6 frames of a nuclear mushroom cloud).

Source: 1254 px square RGB, 6 x 6 cells (209 px) read left to right, top to bottom: the fireball rises into a column,
the cap forms and burns, turns to dark smoke and breaks up (36 frames). Its "transparent" background is a baked-in
grey / white checkerboard: every low-saturation light pixel connected to the cell border is keyed out, and the edge
gets a soft alpha from how far each pixel is from that background.
Output: one row of 36 frames of CELL px, the ground point (foot of the column) at (CELL / 2, ANCHOR_Y) in every cell
(used by ui/src/render/NukeCloudSheet.ts).

Usage: python tools/nuke_cloud_sheet.py   (then python ../tools/to_webp.py)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'assets' / 'nuke-cloud-source.png'
OUT = ROOT / 'public' / 'sprites' / 'nuke-cloud.png'
GRID = 6
CELL = 208
ANCHOR_Y = 200
# Source cells keep the column foot this far above their bottom edge (px).
FOOT_MARGIN = 14
# From this frame on the cloud is mostly smoke with see-through gaps; before it the white-hot fire core (as grey-white
# as the checker) must never be keyed inside the cloud, only from the outside.
SMOKE_FROM = 18


def outside(bad: np.ndarray) -> np.ndarray:
    """The `bad` pixels connected (4-way) to the cell border through other `bad` pixels."""
    out = np.zeros_like(bad)
    out[0], out[-1], out[:, 0], out[:, -1] = bad[0], bad[-1], bad[:, 0], bad[:, -1]
    while True:
        grow = out.copy()
        grow[1:] |= out[:-1]
        grow[:-1] |= out[1:]
        grow[:, 1:] |= out[:, :-1]
        grow[:, :-1] |= out[:, 1:]
        grow &= bad
        if (grow == out).all():
            return out
        out = grow


def clean(cell: Image.Image, smoke: bool) -> Image.Image:
    a = np.array(cell.convert('RGBA')).astype(np.float32)
    rgb = a[..., :3]
    lum = rgb.mean(-1)
    sat = rgb.max(-1) - rgb.min(-1)
    # Checkerboard: grey-white, almost no colour.
    bg = (sat < 10) & (lum > 150)
    # Checker seen through gaps inside the smoke is keyed too: any sizeable patch, or anything touching the outside.
    # The white-hot fire core is also grey-white: patches ringed by saturated fire (high local saturation) stay.
    fiery = np.array(Image.fromarray(np.clip(sat, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(12))) > 55
    # Checker squares alternate two greys: high local contrast; the white-hot core is flat.
    l8 = Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8))
    m1 = np.array(l8.filter(ImageFilter.BoxBlur(5))).astype(np.float32)
    m2 = np.array(Image.fromarray(np.clip(lum * lum / 255, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(5))).astype(np.float32) * 255
    checker = np.sqrt(np.maximum(m2 - m1 * m1, 0)) > 12
    inner = smoke & bg & ~fiery & checker & (np.array(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))) > 0)
    out = outside(bg) | inner
    out |= bg & (np.array(Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0)
    # Soft edge: alpha grows with colour and darkness away from the checker, only for pixels touching the outside.
    near = np.array(Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    soft = np.clip(np.maximum((sat - 10) / 50, (190 - lum) / 90), 0, 1)
    alpha = np.where(out, 0, np.where(near, soft, 1))
    # Thin grey smoke over the checker: un-mix it from the light background (alpha from darkness, colour = smoke).
    thin = smoke & (sat < 24) & (lum > 70) & ~out & ~fiery & ~(~checker & (lum > 228))
    k = np.clip((235 - lum) / (235 - 60), 0, 1)
    alpha = np.where(thin, np.minimum(alpha, k), alpha)
    for ch, v in enumerate((62, 50, 44)):
        rgb[..., ch] = np.where(thin, v, rgb[..., ch])
    a[..., :3] = rgb
    a[..., 3] = alpha * 255
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def main() -> None:
    src = Image.open(SRC)
    step = src.width / GRID
    out = Image.new('RGBA', (CELL * GRID * GRID, CELL), (0, 0, 0, 0))
    for i in range(GRID * GRID):
        row, col = divmod(i, GRID)
        box = (round(col * step), round(row * step), round((col + 1) * step), round((row + 1) * step))
        cell = clean(src.crop(box), i >= SMOKE_FROM)
        x = i * CELL + (CELL - cell.width) // 2
        y = ANCHOR_Y - (cell.height - FOOT_MARGIN)
        out.alpha_composite(cell, (x, y))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, optimize=True)
    print(OUT, out.size)


if __name__ == '__main__':
    main()
