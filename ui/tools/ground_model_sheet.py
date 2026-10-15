#!/usr/bin/env python3
"""
Renders wheeled / tracked support vehicles from textured 3D models (Sketchfab downloads, not kept in the repo — pass the
download folder) into public/sprites/<out>.png: 32 columns of 64 px (screen headings clockwise from N) by 2 rows — 0 the
vehicle with its soft shadow, 1 its burnt-out wreck. Same view and pivot as the tank sheets (tools/tank_model_sheet.py);
loading (OBJ / FBX / .blend, texture lookup) is tools/aircraft_model_sheet.py's.
Models (MODELS):
  air-defence vehicles (`mantis`): nomads (USA, Europe — NOMADS), buk (Russia, China, Islamic world — Buk-M3 9K317);
  army trucks (`truck`): mtvr (USA — Oshkosh MTVR), zetros (Europe — Mercedes-Benz Zetros), kamaz (Russia, China,
  Islamic world — KamAZ-5330).
Usage: python -I tools/ground_model_sheet.py <model> <download folder> [--preview out.png]   (run from the repo root)
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aircraft_model_sheet as am  # noqa: E402
import tank_model_sheet as tm  # noqa: E402

CELL, DIRS = tm.CELL, tm.DIRS

# length: vehicle length in sheet px (a tank hull is 46); nose: +1 when the nose points along +X / +Z (the longer
# horizontal axis), else -1; skip: object-name parts left out.
MODELS = {
    'nomads': dict(obj='source/NOMADS/NOMADS.obj', mtl='source/NOMADS/NOMADS.mtl', out='sam-nomads', length=50, nose=1),
    'buk': dict(obj='source/Buk-M3 9K317/Buk-M3 9K317.obj', mtl='source/Buk-M3 9K317/9K317M_&quot;BUK-M3&quot;_(TELAR).mtl',
                out='sam-buk', length=50, nose=1),
    'mtvr': dict(src='source/mtvr-armed/mtvr-armed.fbx', out='truck-mtvr', length=54, nose=1),
    'zetros': dict(obj='source/zetrosgermany/ZetrosGermany.obj', mtl=None, out='truck-zetros', length=54, nose=-1),
    'kamaz': dict(blend='source/Kamaz5330.blend', out='truck-kamaz', length=54, nose=1),
}


def main():
    name, folder = sys.argv[1], sys.argv[2]
    cfg = MODELS[name]
    v, vt, tris, uvs, mats, objs, textures, kd = am.load(folder, cfg)
    if cfg.get('skip'):
        keep = np.array([not any(p in str(o) for p in cfg['skip']) for o in objs])
        tris, uvs, mats, objs = tris[keep], uvs[keep], mats[keep], objs[keep]
    p = v[np.unique(tris)]
    lo, hi = p.min(0), p.max(0)
    mid = (lo + hi) / 2
    fwd = 0 if hi[0] - lo[0] > hi[2] - lo[2] else 2
    side = 2 if fwd == 0 else 0
    s = cfg['nose']
    u = (v[:, fwd] - mid[fwd]) * s
    lv = (v[:, side] - mid[side]) * (s if fwd == 2 else -s)
    model = np.stack([u, lv, v[:, 1] - lo[1]], 1)
    scale = cfg['length'] / (hi[fwd] - lo[fwd])
    pos, col, nrm, _ = tm.sample(model, vt, tris, uvs, mats, textures, kd, (scale * tm.SS * 1.8) ** 2, (128, 128, 128))
    sheet = Image.new('RGBA', (CELL * DIRS, CELL * 2))
    for row, tint in enumerate((1.0, 0.3)):
        for d in range(DIRS):
            sheet.alpha_composite(tm.render(pos, col * tint, nrm, d / DIRS * 2 * math.pi, scale, row == 0), (d * CELL, row * CELL))
    sheet.save(f'public/sprites/{cfg["out"]}.png', optimize=True)
    if '--preview' in sys.argv:
        pv = Image.new('RGBA', (CELL * 8, CELL * 2), (90, 110, 70, 255))
        for r in range(2):
            for c in range(8):
                pv.alpha_composite(sheet.crop((c * 4 * CELL, r * CELL, (c * 4 + 1) * CELL, (r + 1) * CELL)), (c * CELL, r * CELL))
        pv.resize((pv.width * 2, pv.height * 2), Image.LANCZOS).save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
