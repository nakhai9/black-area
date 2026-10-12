#!/usr/bin/env python3
"""
Builds main battle tank sheets public/sprites/tank-<model>.png from labelled reference renders
resources/<model>/<model>_views_ref.png (4 × 4 cells: 8 compass views, top/bottom/iso extras, moving, firing, death,
palette), one entry per model in MODELS: t14 (Russia / Islamic, T-14 Armata look), m1a2 (USA, M1A2 Abrams),
leopard2 (Europe, Leopard 2). Same layout as the other tank sheets (TankSheets.ts): 32 columns of 64 px, screen headings clockwise from N,
by 8 rows of track frames; the hull, turret and soft shadow are one picture.

The reference has 8 views (two of them mirrored for the missing sides); each of the 32 headings uses the nearest one,
every track frame the same picture. All views share one scale: the side view spans SIDE_SPAN sheet px, like the
other nations' tanks.
Usage: python -I tools/tank_views_sheet.py [model ...]   (run from the repo root)
"""
import numpy as np
from PIL import Image, ImageOps

CELL = 64
DIRS = 32
FRAMES = 8
COL_W = 384
LABEL_H = 34  # the dark caption box at each cell's top-left
SIDE_SPAN = 50

# Per model: the reference grid's row bounds (y; rows differ in height), backdrop grey, and for each screen heading
# (0 = nose up the screen, clockwise, 8 steps) the (reference cell index, mirrored) to use.
# Cells: 0 front-left, 1 front, 2 front-right, 3 right side (nose left), 4 rear-right, 5 rear, 6 rear-left, 7 left side.
MODELS = {
    't14': dict(rows=[(0, 275), (276, 541)], bg=134,
                views={0: (5, False), 1: (4, False), 2: (3, True), 3: (2, False), 4: (1, False), 5: (0, False), 6: (3, False), 7: (4, True)}),
    'm1a2': dict(rows=[(0, 270), (274, 520)], bg=125,
                 views={0: (5, False), 1: (4, False), 2: (3, True), 3: (2, False), 4: (1, False), 5: (0, False), 6: (3, False), 7: (6, False)}),
    'leopard2': dict(rows=[(0, 267), (270, 514)], bg=125,
                     views={0: (5, False), 1: (4, False), 2: (3, True), 3: (2, False), 4: (1, False), 5: (0, False), 6: (3, False), 7: (6, False)}),
}


def cutout(cell, BG):
    a = np.asarray(cell.convert('RGB')).astype(np.float32)
    lum = a.mean(-1)
    sat = a.max(-1) - a.min(-1)
    neutral = sat < 12
    alpha = np.ones(lum.shape, np.float32)
    rgb = a.copy()
    alpha[neutral & (lum >= BG - 7)] = 0
    shadow = neutral & (lum < BG - 7) & (lum > 85)
    alpha[shadow] = np.clip((BG - lum[shadow]) / 50, 0, 1) * 0.6
    rgb[shadow] = 0
    out = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    out[:LABEL_H, :170, 3] = 0
    out[:4, :, 3] = 0
    out[-4:, :, 3] = 0
    out[:, :4, 3] = 0
    out[:, -4:, 3] = 0
    return Image.fromarray(out, 'RGBA')


def body_box(im):
    """Bounding box of the opaque vehicle (shadow left out)."""
    return Image.fromarray((np.asarray(im)[..., 3] > 200).astype(np.uint8) * 255).getbbox()


def build(model):
    cfg = MODELS[model]
    ref = Image.open(f'resources/{model}/{model}_views_ref.png')
    cells = []
    for y0, y1 in cfg['rows']:
        for c in range(4):
            cells.append(cutout(ref.crop((c * COL_W, y0, (c + 1) * COL_W, y1)), cfg['bg']))
    side = body_box(cells[3])
    k = SIDE_SPAN / (side[2] - side[0])
    views = []
    for d in range(8):
        idx, flip = cfg['views'][d]
        im = cells[idx]
        if flip:
            im = ImageOps.mirror(im)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        box = body_box(im)
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        tile = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        tile.paste(im, (round(CELL / 2 - cx), round(CELL / 2 - cy)), im)
        views.append(tile)
    sheet = Image.new('RGBA', (CELL * DIRS, CELL * FRAMES), (0, 0, 0, 0))
    for d in range(DIRS):
        v = views[round(d / 4) % 8]
        for f in range(FRAMES):
            sheet.paste(v, (d * CELL, f * CELL))
    out = f'public/sprites/tank-{model}.png'
    sheet.save(out, optimize=True)
    print('saved', out, sheet.size)


if __name__ == '__main__':
    import sys
    for m in sys.argv[1:] or MODELS:
        build(m)
