#!/usr/bin/env python3
"""
Packs the MANTIS air-defence vehicle reference render (resources/mantis/mantis_ref.png: 4 × 4 cells, 384 px wide, rows ROWS px tall, on a
flat grey backdrop) into public/sprites/mantis.png for the game.

Output: one row of CELL px cells.
  c0-11  the vehicle seen from 12 angles (order as in the reference; MantisSheet.ts maps headings onto them)
  c12    missile launch, c13 small blast, c14 big blast, c15 burning wreck
The grey backdrop becomes transparent; its darker soft shadow under the vehicle is kept as a black, half-transparent shadow.
Usage: python -I tools/mantis_sheet.py   (run from the repo root)
"""
import numpy as np
from PIL import Image

SRC = 'resources/mantis/mantis_ref.png'
OUT = 'public/sprites/mantis.png'
CELL = 96
SRC_W = 384
# Row bounds (y) of the reference grid: its rows are not equally tall.
ROWS = [(0, 304), (304, 588), (588, 860), (860, 1024)]
BG = 108


def cutout(cell):
    a = np.asarray(cell.convert('RGB')).astype(np.float32)
    lum = a.mean(-1)
    sat = a.max(-1) - a.min(-1)
    neutral = sat < 14
    alpha = np.ones(lum.shape, np.float32)
    rgb = a.copy()
    # Backdrop (and the light grid lines): fully transparent.
    alpha[neutral & (lum >= BG - 6)] = 0
    # Soft shadow on the backdrop: neutral grey a little darker than it → black at partial opacity.
    shadow = neutral & (lum < BG - 6) & (lum > 62)
    alpha[shadow] = np.clip((BG - lum[shadow]) / 46, 0, 1) * 0.55
    rgb[shadow] = 0
    out = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    # Clear the cell border (grid lines).
    out[:3, :, 3] = 0
    out[-3:, :, 3] = 0
    out[:, :3, 3] = 0
    out[:, -3:, 3] = 0
    return Image.fromarray(out, 'RGBA')


def main():
    ref = Image.open(SRC)
    cells = []
    for y0, y1 in ROWS:
        for c in range(4):
            im = cutout(ref.crop((c * SRC_W, y0, (c + 1) * SRC_W, y1)))
            # Square crop centred on the cell (the art sits in its middle), then down to CELL px.
            sq = Image.new('RGBA', (SRC_W, SRC_W), (0, 0, 0, 0))
            sq.alpha_composite(im, (0, (SRC_W - (y1 - y0)) // 2))
            cells.append(sq.resize((CELL, CELL), Image.LANCZOS))
    sheet = Image.new('RGBA', (CELL * len(cells), CELL), (0, 0, 0, 0))
    for i, im in enumerate(cells):
        sheet.alpha_composite(im, (i * CELL, 0))
    sheet.save(OUT, optimize=True)
    # Barrel lean of each view (topmost opaque pixel's x offset from the hull's centre, as a share of half the width).
    for i, im in enumerate(cells[:12]):
        a = np.asarray(im)[..., 3] > 200
        ys, xs = np.nonzero(a)
        top = xs[ys <= ys.min() + 2].mean()
        mid = (xs.min() + xs.max()) / 2
        print(i, round((top - mid) / ((xs.max() - xs.min()) / 2), 2))


if __name__ == '__main__':
    main()
