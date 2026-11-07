"""Convert the game's PNG art to WebP (much smaller downloads = faster game load).

    python tools/to_webp.py            # converts ui/public/sprites/*.png and ui/public/data/earth.png (the PNGs are kept as sources; only the .webp files are loaded)

Sprites: lossy q90 with full-quality alpha (~55-75% smaller). earth.png: lossless (its pixel colours are read as map data).
Run it again after a Blender tool writes new PNG sheets into ui/public/sprites.
"""
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'ui' / 'public'
LOSSLESS = {'earth.png'}


def convert(path: str) -> tuple[str, int, int]:
    p = Path(path)
    out = p.with_suffix('.webp')
    if out.exists() and out.stat().st_mtime >= p.stat().st_mtime:
        return p.name, p.stat().st_size, out.stat().st_size  # already up to date
    with Image.open(p) as im:
        if p.name in LOSSLESS:
            im.save(out, 'WEBP', lossless=True, quality=100, method=4)
        else:
            if im.mode not in ('RGB', 'RGBA'):
                im = im.convert('RGBA')
            im.save(out, 'WEBP', quality=90, method=4, alpha_quality=100)
    return p.name, p.stat().st_size, out.stat().st_size


def main() -> None:
    files = [str(f) for f in (ROOT / 'sprites').glob('*.png')] + [str(f) for f in (ROOT / 'data').glob('earth.png')]
    total_b = total_a = 0
    with ProcessPoolExecutor() as pool:
        for name, b, a in pool.map(convert, files):
            total_b += b
            total_a += a
    print(f'{len(files)} files: {total_b / 1e6:.1f} MB -> {total_a / 1e6:.1f} MB')


if __name__ == '__main__':
    sys.exit(main())
