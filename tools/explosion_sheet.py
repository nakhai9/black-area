"""Builds public/sprites/explosion.png from scripts/assets/explosion-source.png (12 frames x 16 variants, 384 px cells).

Columns: frames left to right (flash, fireball, black smoke rising and fading). Rows: 16 variants of the same blast.
Every cell is downscaled to CELL px; the layout stays the same.

Usage: python tools/explosion_sheet.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_CELL, CELL, COLS, ROWS = 384, 128, 12, 16
src = Image.open(ROOT / 'scripts' / 'assets' / 'explosion-source.png').convert('RGBA')
assert src.size == (COLS * SRC_CELL, ROWS * SRC_CELL), src.size
out = src.resize((COLS * CELL, ROWS * CELL), Image.LANCZOS)
out.save(ROOT / 'public' / 'sprites' / 'explosion.png', optimize=True)
print(out.size)
