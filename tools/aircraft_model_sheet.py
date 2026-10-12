#!/usr/bin/env python3
"""
Renders textured 3D transport aircraft (Sketchfab downloads, not kept in the repo — pass each model's download folder) into
public/sprites/air-<model>.png, the layout CraftSheets.ts reads: 32 columns of 96 px (screen headings clockwise from N) by
12 rows — 0 parked, 1-2 engines running, 3 take-off (nose up), 4-5 flying, 6-7 falling (nose down, rolled, scorched),
8-9 burnt wreck, 10 shadow on the ground, 11 shadow in flight. The explosion sheets (air-<model>-fx.png) are kept as they are.
FBX / COLLADA downloads are first turned into OBJ by tools/model_to_obj.py; the point-sample renderer is the one of
tools/tank_model_sheet.py. Prints the side-on span to put in CraftSheets.ts.
Models (MODELS): il76 (Russia), c17 (USA), c130j (Europe), y20 (China, Islamic world).
Bombers (layout 'bomber', the AircraftSheets.ts layout): public/sprites/<out>.png, 16 columns of 96 px by 9 rows — 0 parked,
1-2 flying, 3 ramp (= parked), 4 banked left, 5 banked right, 6-7 crashing, 8 shadow; side-on the aircraft spans 0.74 of a cell.
b1 (USA, B-1 Lancer), tu160 (Russia, Tu-160); fighters in the same layout: su35 (Islamic world), f22 (USA),
su57 (Russia), rafale (Europe), j31 (China). .blend downloads need Blender (tools/blend_to_obj.py).
Usage: python -I tools/aircraft_model_sheet.py <model> <download folder> [--preview out.png]   (run from the repo root)
"""
import math
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import model_to_obj  # noqa: E402
import tank_model_sheet as tm  # noqa: E402

CELL = 96
DIRS = 32
SS = 3
LONGEST_PX = 78  # the longer of length and wingspan, in sheet px
SIN_E, COS_E, LIGHT = tm.SIN_E, tm.COS_E, tm.LIGHT
BLENDER = os.environ.get('BLENDER', 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')

# obj: OBJ path (or src: FBX / DAE to convert), relative to the download folder; textures: material → texture overrides.
MODELS = {
    'il76': dict(obj='source/il-76/il76.obj', mtl='source/il-76/il76.mtl'),
    'c17': dict(obj='source/C-17/C17.obj', mtl='source/C-17/C17.mtl'),
    'c130j': dict(src='source/Lockheed Martin C-130J _Super Hercules_/C130J.fbx'),
    'y20': dict(src='source/Y-20/model.dae', psd_as='textures/y20.png'),
    'b1': dict(obj='source/Rockwell B-1B Lancer Strategic Bomber Aircraft/Rockwell B-1B Lancer Strategic Bomber Aircraft.obj', mtl=None,
               textures={'Material': 'textures/texture_0009.png'}, layout='bomber', out='b1-usa',
               floor=(84, 86, 90)),  # the ripped texture is mostly black: lift it to the B-1's dark grey
    'tu160': dict(src='source/Tu160/Tu160.fbx', layout='bomber', out='tu160-russia'),
    # Fighters: the same 16-heading layout (AircraftSheets.ts), public/sprites/jet-<faction>.png.
    'su35': dict(obj='source/Sukhoi SU-35 Fighter Jet/Sukhoi SU-35 Fighter Jet.obj', mtl=None, layout='bomber', out='jet-islamic',
                 textures={'chassis.0': 'textures/su-30.png', 'rudder.0': 'textures/su-30.png', 'misc_a.2': 'textures/Gear.png',
                           'misc_a.3': 'textures/Oleo.png', 'missiles.0': 'textures/R-27R.png', 'missiles.1': 'textures/KillermachineKh-31.png',
                           'missiles.2': 'textures/R-27R.png', 'Cockpit.0': 'textures/Pak_Fa_cockpit.png', 'Cockpit.1': 'textures/Pak_Fa_cockpit2.png'},
                 fill=(60, 70, 80), nose_flip=True),  # its tallest points are the canopy, not the fins
    'f22': dict(blend='source/F22Raptor.blend', layout='bomber', out='jet-usa', nose_flip=True),
    'su57': dict(blend='source/su57.blend', layout='bomber', out='jet-russia'),
    'rafale': dict(blend='source/Rafale 2024_8_30 export version.blend', layout='bomber', out='jet-europe'),
    'j31': dict(blend='source/J31 Export version 2024_7_15.blend', layout='bomber', out='jet-china', nose_flip=True),
}


def load(folder, cfg):
    if 'src' in cfg:
        tmp = tempfile.mkdtemp()
        out = os.path.join(tmp, 'model.obj')
        model_to_obj.write_obj(model_to_obj.fbx_meshes(os.path.join(folder, cfg['src'])) if cfg['src'].lower().endswith('.fbx')
                               else model_to_obj.dae_meshes(os.path.join(folder, cfg['src'])), out)
        c = dict(obj=out, mtl=os.path.join(tmp, 'model.obj')[:-4] + '.mtl', skip=())
        data = tm.load('', c)
    elif 'blend' in cfg:
        # .blend downloads: Blender (BLENDER, or its default install path) exports them through tools/blend_to_obj.py.
        tmp = tempfile.mkdtemp()
        out = os.path.join(tmp, 'model.obj')
        subprocess.run([BLENDER, '--background', os.path.join(folder, cfg['blend']), '--python',
                        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blend_to_obj.py'), '--', out],
                       check=True, capture_output=True)
        data = tm.load('', dict(obj=out, mtl=out[:-4] + '.mtl', skip=()))
    else:
        data = tm.load(folder, dict(obj=cfg['obj'], mtl=cfg['mtl'], skip=(), textures=cfg.get('textures', {})))
    v, vt, tris, uvs, mats, objs, textures, kd = data
    # Texture paths baked into the download often point elsewhere: find the file of that name in <folder>/textures.
    key = lambda f: re.sub(r'[^a-z0-9]', '', os.path.basename(f.replace(chr(92), '/')).lower().split('.')[0])
    local = {key(f): os.path.join(folder, 'textures', f) for f in os.listdir(os.path.join(folder, 'textures'))} if os.path.isdir(os.path.join(folder, 'textures')) else {}
    for m, t in textures.items():
        if not os.path.exists(t) and key(t) in local:
            textures[m] = local[key(t)]
    # No .mtl at all: a material named after its texture ('Tex_1082_0_dds') takes that file from beside the model.
    if 'obj' in cfg:
        src_dir = os.path.join(folder, os.path.dirname(cfg['obj']))
        beside = {key(f): os.path.join(src_dir, f) for f in os.listdir(src_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))}
        for m in np.unique(mats):
            k = re.sub(r'dds$', '', key(str(m)))
            if m not in textures and (k in beside or k in local):
                textures[m] = beside.get(k) or local[k]
    for m, t in cfg.get('force_textures', {}).items():
        textures[m] = os.path.join(folder, t)
    if 'psd_as' in cfg:
        for m, t in textures.items():
            if t.lower().endswith('.psd'):
                textures[m] = os.path.join(folder, cfg['psd_as'])
    return v, vt, tris, uvs, mats, objs, textures, kd


def orient(v, tris, nose_flip=False):
    """Model (Y up) → (u forward, v left, z up), centred: the fuselage is the horizontal axis the tail fin sits far along."""
    p = v[np.unique(tris)]
    lo, hi = p.min(0), p.max(0)
    mid = (lo + hi) / 2
    fin = p[p[:, 1] > np.percentile(p[:, 1], 98)].mean(0) - mid
    fwd = 0 if abs(fin[0]) / (hi[0] - lo[0]) > abs(fin[2]) / (hi[2] - lo[2]) else 2
    sign = -np.sign(fin[fwd]) * (-1 if nose_flip else 1)  # the nose is away from the fin
    side = 2 if fwd == 0 else 0
    u = (v[:, fwd] - mid[fwd]) * sign
    lv = (v[:, side] - mid[side]) * (sign if fwd == 2 else -sign)
    z = v[:, 1] - lo[1]
    return np.stack([u, lv, z], 1)


def pose(pos, nrm, pitch, roll):
    """Pitch (nose up +) about the lateral axis, then roll about the fuselage, around the model centre."""
    c = pos.copy()
    zc = (pos[:, 2].max() + pos[:, 2].min()) / 2
    c[:, 2] -= zc
    cp, sp, cr, sr = math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    rp = np.array([[cp, 0, -sp], [0, 1, 0], [sp, 0, cp]])
    rr = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    r = rr @ rp
    c = c @ r.T
    c[:, 2] += zc
    return c, nrm @ r.T


def render(pos, col, nrm, heading, scale, zmid, tint=1.0, shadow=False):
    gx, gy = math.sin(heading), -math.cos(heading) / SIN_E
    n = math.hypot(gx, gy)
    fx, fy = gx / n, gy / n
    lx, ly = fy, -fx
    rot = np.array([[fx, lx, 0], [fy, ly, 0], [0, 0, 1]])
    w = pos @ rot.T
    size = CELL * SS
    if shadow:
        sx = ((CELL / 2 + w[:, 0] * scale) * SS).astype(int)
        sy = ((CELL / 2 + w[:, 1] * SIN_E * scale) * SS).astype(int)
        k = (sx >= 0) & (sx < size) & (sy >= 0) & (sy < size)
        m = np.zeros((size, size), np.uint8)
        m[sy[k], sx[k]] = 255
        m = Image.fromarray(m).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        img.putalpha(m)
        return img.resize((CELL, CELL), Image.LANCZOS)
    nw = nrm @ rot.T
    view = np.array([0, COS_E, SIN_E])
    nw = np.where((nw @ view)[:, None] < 0, -nw, nw)
    shade = (0.6 + 0.8 * np.clip(nw @ LIGHT, 0, 1)) * tint
    rgb = np.clip(col * shade[:, None], 0, 255)
    sx = ((CELL / 2 + w[:, 0] * scale) * SS).astype(int)
    sy = ((CELL / 2 + (w[:, 1] * SIN_E - (w[:, 2] - zmid) * COS_E) * scale) * SS).astype(int)
    depth = w[:, 1] * COS_E + w[:, 2] * SIN_E
    ok = (sx >= 0) & (sx < size) & (sy >= 0) & (sy < size)
    order = np.argsort(-depth[ok], kind='stable')
    pix = (sy[ok] * size + sx[ok])[order]
    _, first = np.unique(pix, return_index=True)
    out = np.zeros((size * size, 4), np.uint8)
    sel = np.nonzero(ok)[0][order][first]
    out[pix[first], :3] = rgb[sel]
    out[pix[first], 3] = 255
    img = Image.fromarray(out.reshape(size, size, 4), 'RGBA')
    filled = img.filter(ImageFilter.MaxFilter(3))
    holes = (np.asarray(img)[..., 3] == 0) & (np.asarray(img.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5))) > 0)
    a = np.asarray(img).copy()
    a[holes] = np.asarray(filled)[holes]
    return Image.fromarray(a, 'RGBA').resize((CELL, CELL), Image.LANCZOS)


def main():
    name, folder = sys.argv[1], sys.argv[2]
    cfg = MODELS[name]
    bomber = cfg.get('layout') == 'bomber'
    v, vt, tris, uvs, mats, objs, textures, kd = load(folder, cfg)
    model = orient(v, tris, cfg.get('nose_flip', False))
    p = model[np.unique(tris)]
    ext = p.max(0) - p.min(0)
    scale = CELL * 0.74 / ext[0] if bomber else LONGEST_PX / max(ext[0], ext[1])
    zmid = (p[:, 2].max() + p[:, 2].min()) / 2
    density = (scale * SS * 1.6) ** 2
    pos, col, nrm, _ = tm.sample(model, vt, tris, uvs, mats, textures, kd, density, cfg.get('fill', (190, 190, 190)))
    if 'floor' in cfg:
        col = np.maximum(col, np.array(cfg['floor'], np.float64))
    # every row: (pitch, roll, tint, shadow)
    deg = math.radians
    if bomber:
        rows = [(0, 0, 1, False), (0, 0, 1, False), (0, 0, 1, False), (0, 0, 1, False), (0, deg(-25), 1, False), (0, deg(25), 1, False),
                (deg(-20), deg(10), 0.6, False), (deg(-35), deg(30), 0.4, False), (0, 0, 1, True)]
        dirs = 16
    else:
        dirs = DIRS
        rows = [(0, 0, 1, False), (0, 0, 1, False), (0, 0, 1, False), (math.radians(10), 0, 1, False),
                (0, 0, 1, False), (0, 0, 1, False),
                (math.radians(-25), math.radians(18), 0.55, False), (math.radians(-28), math.radians(-14), 0.5, False),
                (0, 0, 0.3, False), (0, math.radians(4), 0.26, False), (0, 0, 1, True), (0, 0, 1, True)]
    sheet = Image.new('RGBA', (CELL * dirs, CELL * len(rows)))
    for r, (pitch, roll, tint, shadow) in enumerate(rows):
        rp, rn = pose(pos, nrm, pitch, roll) if (pitch or roll) else (pos, nrm)
        for d in range(dirs):
            sheet.alpha_composite(render(rp, col, rn, d / dirs * 2 * math.pi, scale, zmid, tint, shadow), (d * CELL, r * CELL))
    sheet.save(f'public/sprites/{cfg.get("out", "air-" + name)}.png', optimize=True)
    fly = 1 if bomber else 4
    side = sheet.crop((dirs // 4 * CELL, fly * CELL, (dirs // 4 + 1) * CELL, (fly + 1) * CELL)).getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    print(f'{name}: span {round((side[2] - side[0]) / CELL, 3) if side else 1}')
    if '--preview' in sys.argv:
        pv = Image.new('RGBA', (CELL * 8, CELL * 4), (90, 110, 70, 255))
        step = dirs // 8
        for i, r in enumerate((1, 4, 6, 8) if bomber else (4, 3, 6, 8)):
            for c in range(8):
                pv.alpha_composite(sheet.crop((c * step * CELL, r * CELL, (c * step + 1) * CELL, (r + 1) * CELL)), (c * CELL, i * CELL))
        pv.save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
