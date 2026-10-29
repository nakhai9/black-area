#!/usr/bin/env python3
"""
Packs the frames rendered by tools/blender/soldier_render.py (<frames dir>/r<row>_c<col>.png, 128 px cells) into the
game's 8-direction soldier sheet public/sprites/<out>.png (InfantryArt 'dir8' layout: 8 columns; 11 rows, 27 for
swimmers, 8 for walk-only engineers). Missing frames stay empty.
Several frame dirs (a squad's bearer and escort passes) are laid over each other, cell by cell; the cell size is
taken from the frames.
Usage: python -I tools/soldier_sheet.py <out name> <frames dir> [<frames dir> ...]   (run from ui/)
"""
import os
import re
import sys

from PIL import Image

out, dirs = sys.argv[1], sys.argv[2:]
cells = {}
for frames in dirs:
    for f in os.listdir(frames):
        m = re.match(r'r(\d+)_c(\d+)\.png$', f)
        if m:
            cells.setdefault((int(m.group(1)), int(m.group(2))), []).append(os.path.join(frames, f))
CELL = Image.open(next(iter(cells.values()))[0]).size[0]
rows = max(r for r, _ in cells) + 1
sheet = Image.new('RGBA', (CELL * 8, CELL * rows))
for (r, c), fs in cells.items():
    for f in fs:
        sheet.alpha_composite(Image.open(f).convert('RGBA'), (c * CELL, r * CELL))
dest = f'public/sprites/{out}.png'
sheet.save(dest, optimize=True)
print(dest, sheet.size)
