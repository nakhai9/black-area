"""Import a 4096x4096 16-direction soldier sheet into public/sprites at 2048x2048.

Usage: python scripts/import-soldier-sheet.py <source.png> <us-regular|us-special|ru-regular|ru-special|cn-regular|cn-special|eu-regular|eu-special>
"""
import sys
from PIL import Image

src, name = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
if im.size != (4096, 4096):
    sys.exit(f'expected a 4096x4096 sheet, got {im.size}')
im.resize((2048, 2048), Image.LANCZOS).save(f'public/sprites/{name}.png', optimize=True)
print(f'public/sprites/{name}.png written')
