#!/usr/bin/env python3
"""
Packs the AWACS frames rendered by tools/blender/awacs_render.py into public/sprites/awacs-<faction>.png, the
AircraftSheets.ts 'bomber' layout: 16 columns (screen headings clockwise from N) by 9 rows of 128 px — 0 parked,
1-2 flying, 3 ramp (= parked), 4 banked left, 5 banked right, 6-7 crashing (darkened), 8 shadow (black silhouette).
Adds a thin dark outline round each silhouette so blocks and edges read crisply at game scale.
Usage: python -I tools/awacs_pack.py <frames dir> [faction ...] [--preview out.png]   (run from ui/)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

CELL = 128
DIRS = 16
ROWS = [('level', 1), ('level', 1), ('level', 1), ('level', 1), ('bankL', 1), ('bankR', 1), ('crash1', 0.6), ('crash2', 0.4), ('shadow', 1)]


def frame(path, tint, shadow):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float64)
    if shadow:
        alpha = (a[..., 3] > 40).astype(np.uint8) * 255
        out = np.zeros(a.shape, np.uint8)
        out[..., 3] = alpha
        return Image.fromarray(out, 'RGBA').resize((CELL, CELL), Image.LANCZOS)
    small = im.resize((CELL, CELL), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.8, percent=60, threshold=1))
    s = np.asarray(small).astype(np.float64)
    al = s[..., 3] / 255
    # Outline: the 1 px ring just outside the silhouette, dark and half opaque.
    grown = np.asarray(small.getchannel('A').filter(ImageFilter.MaxFilter(3))).astype(np.float64) / 255
    ring = np.clip(grown - al, 0, 1) * 0.55
    rgb = s[..., :3] * tint
    out_a = al + ring * (1 - al)
    dark = np.array([22, 24, 28], np.float64) * tint
    with np.errstate(invalid='ignore', divide='ignore'):
        rgb = np.where(out_a[..., None] > 0, (rgb * al[..., None] + dark * (ring * (1 - al))[..., None]) / np.maximum(out_a, 1e-6)[..., None], 0)
    o = np.dstack([np.clip(rgb, 0, 255), np.clip(out_a * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(o, 'RGBA')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    if preview in args:
        args.remove(preview)
    src, factions = args[0], args[1:] or ['usa', 'europe', 'china', 'russia', 'islamic']
    pv = Image.new('RGBA', (CELL * 16, CELL * 2 * len(factions) * 2), (96, 116, 74, 255)) if preview else None
    for fi, f in enumerate(factions):
        out = f'public/sprites/awacs-{f}.png'
        old = Image.open(out).convert('RGBA') if preview else None
        sheet = Image.new('RGBA', (CELL * DIRS, CELL * len(ROWS)))
        cache = {}
        for r, (pose, tint) in enumerate(ROWS):
            for d in range(DIRS):
                key = (pose, tint, d)
                if key not in cache:
                    cache[key] = frame(os.path.join(src, f, f'{pose}_{d:02d}.png'), tint, pose == 'shadow')
                sheet.alpha_composite(cache[key], (d * CELL, r * CELL))
        sheet.save(out, optimize=True)
        print(f'{f}: {out}')
        if preview:
            # Per faction: old flying row, new flying row, new banked-left row, new shadow + crash (alternating columns).
            y0 = fi * 4 * CELL
            for c in range(DIRS):
                for i, (img, row) in enumerate(((old, 1), (sheet, 1), (sheet, 4), (sheet, 8 if c % 2 == 0 else 7))):
                    pv.alpha_composite(img.crop((c * CELL, row * CELL, (c + 1) * CELL, (row + 1) * CELL)), (c * CELL, y0 + i * CELL))
    if preview:
        pv.save(preview)


if __name__ == '__main__':
    main()
