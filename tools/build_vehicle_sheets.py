#!/usr/bin/env python3
"""
Packs the high-resolution vehicle renders in resources/ into the small game sheets in public/sprites/.

Every output sheet has one column per screen facing (32, clockwise from nose up the screen) and one row per
animation frame, in the order listed below; explosions are one row of frames.
Usage: python -I tools/build_vehicle_sheets.py   (run from the repo root)
"""
import json, os
from PIL import Image

SRC = 'resources'
OUT = 'public/sprites'
FACINGS = 32


def cells(path, cell, frames, src_cell, per_row=8, rows_per_frame=4):
    """Cells (facing-major lists) of an 8 × 4-per-frame sheet, frames stacked downwards."""
    im = Image.open(path).convert('RGBA')
    out = []
    for f in frames:
        row = []
        for k in range(FACINGS):
            x = (k % per_row) * src_cell
            y = (f * rows_per_frame + k // per_row) * src_cell
            row.append(im.crop((x, y, x + src_cell, y + src_cell)).resize((cell, cell), Image.LANCZOS))
        out.append(row)
    return out


def strip(path, cell, src_cell, cols, count, step=1):
    """Frames of an explosion sheet (left to right, top to bottom), every `step`-th."""
    im = Image.open(path).convert('RGBA')
    out = []
    for i in range(0, count, step):
        x, y = (i % cols) * src_cell, (i // cols) * src_cell
        out.append(im.crop((x, y, x + src_cell, y + src_cell)).resize((cell, cell), Image.LANCZOS))
    return out


def save_grid(rows, cell, name):
    sheet = Image.new('RGBA', (len(rows[0]) * cell, len(rows) * cell), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for c, im in enumerate(row):
            sheet.alpha_composite(im, (c * cell, r * cell))
    sheet.save(os.path.join(OUT, name), optimize=True)
    return sheet


def span(im):
    """Share of the cell the side-on silhouette (facing 8) spans."""
    box = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    return round((box[2] - box[0]) / im.width, 3) if box else 1


def aircraft(meta):
    fx_cell = 128
    for model, folder in {'c17': 'c17_sprites', 'c130j': 'c130j_sprites', 'il76': 'il76_sprites', 'y20': 'y20_sprites'}.items():
        d = os.path.join(SRC, folder)
        p = lambda s: os.path.join(d, f'{model}_{s}.png')
        # air-<model>.png itself is rendered from the 3D model by tools/aircraft_model_sheet.py.
        fx = [strip(p('explode_air'), fx_cell, 512, 5, 20), strip(p('explode_ground'), fx_cell, 512, 5, 20)]
        save_grid(fx, fx_cell, f'air-{model}-fx.png')
        meta[f'air-{model}-fx'] = dict(fxCell=fx_cell, fxFrames=20)


def helis(meta):
    fx_cell = 128
    for model in ['apache', 'ka52', 'z19e']:
        d = os.path.join(SRC, model)
        p = lambda f: os.path.join(d, f)
        # heli-<model>.png itself is rendered from the 3D model by tools/heli_model_sheet.py.
        fx = [strip(p('07_explosion_air.png'), fx_cell, 320, 8, 16), strip(p('08_explosion_ground.png'), fx_cell, 320, 8, 16)]
        save_grid(fx, fx_cell, f'heli-{model}-fx.png')
        meta[f'heli-{model}-fx'] = dict(fxCell=fx_cell, fxFrames=16)


if __name__ == '__main__':
    meta = {}
    aircraft(meta)
    helis(meta)
    print(json.dumps(meta, indent=1))
