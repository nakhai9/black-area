"""Builds public/sprites/bunker-<name>.png from a 5 x 8 source sheet of 512 px cells
(west: USA / Europe concrete pillbox; east: Russia / China / Islamic brick blockhouse).

Columns: damage stages (intact, light, heavy, burning, ruin). Rows: turret facing on screen, clockwise from SE
(SE, S, SW, W, NW, N, NE, E). Every cell is downscaled to CELL px; the layout stays the same.

Usage: python tools/bunker_sheet.py <source.png> <west|east>
"""
import sys
from pathlib import Path

from PIL import Image

SRC_CELL = 512
CELL = 192
COLS, ROWS = 5, 8

src = Image.open(sys.argv[1]).convert('RGBA')
assert src.size == (COLS * SRC_CELL, ROWS * SRC_CELL), src.size
out = src.resize((COLS * CELL, ROWS * CELL), Image.LANCZOS)
dest = Path(__file__).resolve().parent.parent / 'public' / 'sprites' / f'bunker-{sys.argv[2]}.png'
out.save(dest, optimize=True)
print(dest, out.size)
