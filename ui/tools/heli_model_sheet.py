#!/usr/bin/env python3
"""
Renders attack helicopters from textured 3D models (Sketchfab downloads, not kept in the repo — pass the download folder)
into public/sprites/heli-<model>.png, the layout CraftSheets.ts reads: 32 columns of 80 px (screen headings clockwise from
N) by 16 rows — 0 parked (rotor stopped), 1-4 rotor turning on the ground, 5-7 lifting off, 8-11 flying (nose down),
12-13 falling, 14-15 burnt wreck; the ground rows carry a soft shadow. The rotor blades are turned a step per frame.
The explosion sheets (heli-<fx>-fx.png) are kept. Loader and point-sample renderer: tools/aircraft_model_sheet.py.
Models (MODELS): apache (USA, Europe — AH-64A), ka52 (Russia, Islamic world), z10 (China — Z-10).
Usage: python -I tools/heli_model_sheet.py <model> <download folder> [--preview out.png]   (run from the repo root)
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aircraft_model_sheet as am  # noqa: E402
import tank_model_sheet as tm  # noqa: E402

CELL = 80
DIRS = 32
LONGEST_PX = 66  # the longer of fuselage (with rotor) length and rotor span, in sheet px

# skip: object-name parts left out (blur discs, alternative decals, spinning-rotor copies); spin: main-rotor parts turned a
# step per frame; blades: main-rotor blade count; gain: brightens very dark textures so the craft reads on the map.
MODELS = {
    'apache': dict(obj='source/AH-64A/AH-64A.obj', mtl='source/AH-64A/AH-64A.mtl', spin=('prop01_1',), skip=(), blades=4, gain=2.0),
    'ka52': dict(src='source/ka52/ka52.fbx', spin=('rotor_stop',), skip=('rotor_run', 'ka52_num_'), blades=3),
    'z10': dict(obj='source/Z-10W/Z-10W.obj', mtl='source/Z-10W/Z-10W.mtl', spin=('Z10_M009', 'Z10_M011'),
                skip=('MainRotorBlurred', 'TailBlurredRotor'), blades=5, gain=1.7,
                force_textures={'Material__25': 'textures/ch_ahe_z-10w_d.tga.png'}),
}


def main():
    name, folder = sys.argv[1], sys.argv[2]
    cfg = MODELS[name]
    v, vt, tris, uvs, mats, objs, textures, kd = am.load(folder, cfg)
    names = objs.astype(str)
    has = lambda parts: np.array([any(p in o for p in parts) for o in names]) if parts else np.zeros(len(names), bool)
    keep = ~has(cfg['skip'])
    spin = has(cfg['spin'])
    body = keep & ~spin
    # Orientation from the airframe alone (the rotor disc is round and tallest).
    model = am.orient(v, tris[body], cfg.get('nose_flip', False))
    sv = np.zeros(len(v), bool)
    sv[np.unique(tris[keep])] = True
    p = model[sv]
    rp = model[tris[keep & spin].ravel()]
    hub = (rp.min(0) + rp.max(0)) / 2
    radius = (rp.max(0) - rp.min(0))[:2].max() / 2
    ext = np.maximum(p.max(0) - p.min(0), 0)
    span = max(ext[0], ext[1], 2 * radius)
    scale = LONGEST_PX / span
    zmid = (p[:, 2].max() + p[:, 2].min()) / 2
    density = (scale * tm.SS * 1.6) ** 2
    pos, col, nrm, ti = tm.sample(model, vt, tris[keep], uvs[keep], mats[keep], textures, kd, density, (110, 115, 105))
    rot = spin[keep][ti]
    col = np.clip(col * cfg.get('gain', 1.0), 0, 255)
    step = 2 * math.pi / cfg['blades'] / 4
    deg = math.radians
    # (pitch, roll, tint, rotor angle, shadow)
    rows = [(0, 0, 1, 0, True)] + [(0, 0, 1, k * step, True) for k in range(4)] + [(0, 0, 1, k * step, True) for k in range(3)] \
        + [(deg(-8), 0, 1, k * step, False) for k in range(4)] \
        + [(deg(-20), deg(25), 0.5, 0.3, False), (deg(-30), deg(-20), 0.45, 0.9, False), (0, 0, 0.3, 0.2, True), (0, deg(3), 0.26, 0.2, True)]
    am.CELL = CELL  # the aircraft renderer draws into am.CELL px cells
    sheet = Image.new('RGBA', (CELL * DIRS, CELL * len(rows)))
    for r, (pitch, roll, tint, angle, shadow) in enumerate(rows):
        q = pos.copy()
        if angle:
            c, s = math.cos(angle), math.sin(angle)
            d = q[rot, :2] - hub[:2]
            q[rot, 0] = hub[0] + d[:, 0] * c - d[:, 1] * s
            q[rot, 1] = hub[1] + d[:, 0] * s + d[:, 1] * c
        qn = nrm
        if pitch or roll:
            q, qn = am.pose(q, nrm, pitch, roll)
        for k in range(DIRS):
            h = k / DIRS * 2 * math.pi
            cell = Image.new('RGBA', (CELL, CELL))
            if shadow:
                sh = am.render(q, col, qn, h, scale, zmid, 1, True)
                a = np.asarray(sh.getchannel('A'), np.float64) * 0.35
                sh = Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
                layer = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
                layer.putalpha(sh)
                # ground under the body: the shadow sits lower on screen by the body's lift above its centre
                cell.alpha_composite(layer, (0, int(round(zmid * am.COS_E * scale))))
            cell.alpha_composite(am.render(q, col * tint, qn, h, scale, zmid))
            sheet.alpha_composite(cell, (k * CELL, r * CELL))
    sheet.save(f'public/sprites/heli-{name}.png', optimize=True)
    side = sheet.crop((8 * CELL, 8 * CELL, 9 * CELL, 9 * CELL)).getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    print(f'{name}: span {round((side[2] - side[0]) / CELL, 3) if side else 1}')
    if '--preview' in sys.argv:
        pv = Image.new('RGBA', (CELL * 8, CELL * 4), (90, 110, 70, 255))
        for i, r in enumerate((0, 8, 12, 14)):
            for c in range(8):
                pv.alpha_composite(sheet.crop((c * 4 * CELL, r * CELL, (c * 4 + 1) * CELL, (r + 1) * CELL)), (c * CELL, i * CELL))
        pv.resize((pv.width * 2, pv.height * 2), Image.LANCZOS).save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
