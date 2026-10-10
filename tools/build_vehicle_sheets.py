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


def tanks(meta):
    # <model>_move.png: 32 rows (facings) × 8 track frames of 256 px, shadow baked in.
    for model, src in {'m1a2': 'M1A2_Abrams_move.png', 'leopard2': 'Leopard2A7V_move.png',
                       't90m': 'T90M_Proryv_move.png', 'type99': 'Type99_ZTZ99_move.png'}.items():
        im = Image.open(os.path.join(SRC, src)).convert('RGBA')
        cell = 64
        rows = [[im.crop((f * 256, k * 256, f * 256 + 256, k * 256 + 256)).resize((cell, cell), Image.LANCZOS)
                 for k in range(FACINGS)] for f in range(8)]
        save_grid(rows, cell, f'tank-{model}.png')
        meta[f'tank-{model}'] = dict(cell=cell, frames=8, span=span(rows[0][8]))


def aircraft(meta):
    cell, fx_cell = 96, 128
    for model, folder in {'c17': 'c17_sprites', 'c130j': 'c130j_sprites', 'il76': 'il76_sprites', 'y20': 'y20_sprites'}.items():
        d = os.path.join(SRC, folder)
        info = json.load(open(os.path.join(d, f'{model}_meta.json')))['states']
        p = lambda s: os.path.join(d, f'{model}_{s}.png')
        two = lambda s: [0, 1] if info[s]['frames'] > 1 else [0, 0]
        idle = 'idle_spin' if 'idle_spin' in info else 'parked'
        rows = (cells(p('parked'), cell, [0], 512)                    # 0 parked
                + cells(p(idle), cell, two(idle), 512)                # 1-2 engines running on the ground
                + cells(p('takeoff'), cell, [0], 512)                 # 3 take-off (nose up)
                + cells(p('flying'), cell, two('flying'), 512)        # 4-5 flying
                + cells(p('falling'), cell, [0, 2], 512)              # 6-7 falling
                + cells(p('wreck'), cell, [0, 2], 512)                # 8-9 burning wreck
                + cells(p('parked_shadow'), cell, [0], 512)           # 10 shadow on the ground
                + cells(p('flying_shadow'), cell, [0], 512))          # 11 shadow in flight
        save_grid(rows, cell, f'air-{model}.png')
        fx = [strip(p('explode_air'), fx_cell, 512, 5, 20), strip(p('explode_ground'), fx_cell, 512, 5, 20)]
        save_grid(fx, fx_cell, f'air-{model}-fx.png')
        meta[f'air-{model}'] = dict(cell=cell, span=span(rows[4][8]), fxCell=fx_cell, fxFrames=20)


def helis(meta):
    cell, fx_cell = 80, 128
    for model in ['apache', 'ka52', 'z19e']:
        d = os.path.join(SRC, model)
        p = lambda f: os.path.join(d, f)
        rows = (cells(p('01_parked_rotor_stopped.png'), cell, [0], 320)           # 0 parked
                + cells(p('02_ground_rotor_spinning.png'), cell, [0, 1, 2, 3], 320)  # 1-4 rotor turning on the ground
                + cells(p('03_takeoff_ascending.png'), cell, [0, 1, 2], 320)      # 5-7 lifting off
                + cells(p('04_flying_rotor_spinning.png'), cell, [0, 1, 2, 3], 320)  # 8-11 flying
                + cells(p('05_crash_falling.png'), cell, [0, 1], 320)             # 12-13 falling
                + cells(p('06_wreck_burning.png'), cell, [0, 1], 320))            # 14-15 burning wreck
        save_grid(rows, cell, f'heli-{model}.png')
        fx = [strip(p('07_explosion_air.png'), fx_cell, 320, 8, 16), strip(p('08_explosion_ground.png'), fx_cell, 320, 8, 16)]
        save_grid(fx, fx_cell, f'heli-{model}-fx.png')
        meta[f'heli-{model}'] = dict(cell=cell, span=span(rows[8][8]), fxCell=fx_cell, fxFrames=16)


if __name__ == '__main__':
    meta = {}
    tanks(meta)
    aircraft(meta)
    helis(meta)
    print(json.dumps(meta, indent=1))
