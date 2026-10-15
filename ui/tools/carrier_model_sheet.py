#!/usr/bin/env python3
"""
Renders aircraft carriers from textured 3D models (Sketchfab downloads, not kept in the repo — pass the download
folder) into public/sprites/<out>.png: 32 columns of CELL px (screen headings clockwise from N) by 2 rows — 0 the ship,
1 its burnt-out wreck. Same view and lighting as the tank sheets (tools/tank_model_sheet.py), in bigger cells; loading
(OBJ, texture lookup) is tools/aircraft_model_sheet.py's.
Models (MODELS): cvn80 (USA — USS Enterprise CVN-80), r08 (Europe — HMS Queen Elizabeth R08), type004 (China — Type 004).
Usage: python -I tools/carrier_model_sheet.py <model> <download folder> [--preview out.png]   (run from ui/)
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aircraft_model_sheet as am  # noqa: E402
import tank_model_sheet as tm  # noqa: E402

CELL = 192
DIRS = tm.DIRS
tm.CELL = CELL
tm.PIVOT = (CELL // 2, CELL // 2 + 8)

# length: ship length in sheet px; nose: +1 when the bow points along +X / +Z (the longer horizontal axis), else -1.
MODELS = {
    'cvn80': dict(obj='source/USS Enterprise CVN-80 Aircraft Carrier.obj', mtl=None,
                  force_textures={'boat.0': 'textures/Cvn_80_Enterprise.png', 'boat.1': 'textures/Cvn_80_Enterprise2.png'},
                  out='ship-cvn80', length=176, nose=1),
    'r08': dict(obj='source/HMS Queen Elizabeth R08 Aircraft Carrier/HMS Queen Elizabeth R08 Aircraft Carrier.obj', mtl=None,
                force_textures={'boat.0': 'textures/QueenElizabeth2.png', 'boat.1': 'textures/QueenElizabeth.png',
                                'boat.2': 'textures/QueenElizabeth3.png'},
                out='ship-r08', length=170, nose=1),
    'type004': dict(obj='source/Type-004 Aircraft Carrier/Type-004 Aircraft Carrier.obj', mtl=None,
                    force_textures={'boat.0': 'textures/Type004.png', 'boat.1': 'textures/Type004_2.png'},
                    out='ship-type004', length=176, nose=1),
}


def main():
    name, folder = sys.argv[1], sys.argv[2]
    cfg = MODELS[name]
    v, vt, tris, uvs, mats, objs, textures, kd = am.load(folder, cfg)
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
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        pv = Image.new('RGBA', (CELL * 4, CELL), (40, 70, 110, 255))
        for k, d in enumerate((0, 8, 16, 4)):
            pv.alpha_composite(tm.render(pos, col, nrm, d / DIRS * 2 * math.pi, scale, True), (k * CELL, 0))
        pv.save(out)
        return
    sheet = Image.new('RGBA', (CELL * DIRS, CELL * 2))
    for row, tint in enumerate((1.0, 0.3)):
        for d in range(DIRS):
            sheet.alpha_composite(tm.render(pos, col * tint, nrm, d / DIRS * 2 * math.pi, scale, row == 0), (d * CELL, row * CELL))
    sheet.save(f'public/sprites/{cfg["out"]}.png', optimize=True)


if __name__ == '__main__':
    main()
