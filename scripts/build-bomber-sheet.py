"""Builds the bomber sheets (16 headings x 9 rows, 96 px cells) from the source sheets in scripts/assets:
tu26-source.png → tu26-russia.png, b52-source.png → b52-usa.png, su35-source.png → jet-islamic.png (the Islamic world's jet).

Each source sheet is 16 x 11 cells: row 4 is a clean 16-heading turn (clockwise from N, like the game's sheets),
rows 6 and 8 are burning/crashing poses. Output rows follow AircraftSheets.ts:
parked, flyA, flyB, ramp, bankLeft, bankRight, crash1, crash2, shadow.
"""
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
OUT, COLS = 96, 16
rows_from = [4, 4, 4, 4, 4, 4, 6, 8]


def build(source: str, target: str) -> None:
    src = Image.open(root / 'scripts/assets' / source).convert('RGBA')
    SRC = src.width // COLS
    sheet = Image.new('RGBA', (COLS * OUT, 9 * OUT), (0, 0, 0, 0))
    for r, sr in enumerate(rows_from + [4]):
        for c in range(COLS):
            cell = src.crop((c * SRC, sr * SRC, (c + 1) * SRC, (sr + 1) * SRC)).resize((OUT, OUT), Image.LANCZOS)
            if r == 8:  # shadow: black silhouette of the clean pose
                a = cell.getchannel('A')
                cell = Image.new('RGBA', cell.size, (0, 0, 0, 255))
                cell.putalpha(a)
            sheet.paste(cell, (c * OUT, r * OUT))
    sheet.save(root / 'public/sprites' / target, optimize=True)
    print('ok', sheet.size)


build('tu26-source.png', 'tu26-russia.png')
build('b52-source.png', 'b52-usa.png')
build('su35-source.png', 'jet-islamic.png')
