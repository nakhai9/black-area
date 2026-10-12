#!/usr/bin/env python3
"""
Renders textured 3D tank models (Sketchfab OBJ downloads, not kept in the repo — pass each model's download folder) into
tank sheets public/sprites/tank-<model>-hull.png and tank-<model>-turret.png: 32 columns of 64 px (screen headings clockwise
from N), 1 row, the same layout and pivot as tools/lego_tank_sheet.py, so TankSheets.ts draws the turret cell over the hull cell.
Models (MODELS): ztz96 (China, ZTZ-96), leopard2 (Europe, Leopard 2A4M), m1a1 (USA, M1A1 Abrams), t90 (Islamic, Karrar / T-90),
t14 (Russia, T-14 Armata).

No 3D package needed: every triangle is covered with texture-coloured sample points, which are projected into the game's iso
view (ground ratio ISO_Y / ISO_X), depth-sorted, flat-lit and downsampled.
Usage: python -I tools/tank_model_sheet.py <model> <download folder> [--preview out.png]   (run from the repo root)
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

CELL = 64
DIRS = 32
SS = 4  # supersampling
HULL_PX = 46  # hull length (without the gun) in sheet px
PIVOT = (32, 36)  # ground point under the turret ring
SIN_E = 0.5  # ISO_Y / ISO_X
COS_E = math.sqrt(1 - SIN_E ** 2)
LIGHT = np.array([-0.45, 0.35, 0.82])  # ground x right, ground y towards the viewer, z up
LIGHT /= np.linalg.norm(LIGHT)

# Per model, paths relative to the download folder. turret: object-name parts that turn with the turret; loose: parts that
# go with the turret only when they sit on it; skip: objects left out (LOD copies, extra track animation frames);
# ring: object whose centre is the turret pivot; gun: object that points forward; textures: material → texture when the
# download has no .mtl.
MODELS = {
    'ztz96': dict(obj='source/ZTZ96/ZTZ96.obj', mtl='source/ZTZ96/ZTZ96.mtl', turret=('turret', 'gun', 'mg_', 'antenna'),
                  loose=('hatch', 'lantern', 'decor'), skip=(), ring='bone_turret', gun='gun_barrel'),
    'leopard2': dict(obj='source/Leopard 2A4M Main Battle Tank/Leopard 2A4M Main Battle Tank.obj', mtl=None,
                     textures={'chassis.0': 'textures/Leo2A4M.png', 'chassis_vlo.1': 'textures/tracks.png'},
                     turret=('misc_a', 'misc_b', 'MG'), loose=(), ring='misc_a', gun='misc_b',
                     skip=('chassis_vlo',) + tuple(f'track_{k}' for k in range(2, 13))),
    # m1a1: the turret is not its own object — every triangle above the hull deck (above.y) within above.r of the ring
    # (barrel object 'misc_b') turns; unmapped interior materials take the sand `fill`.
    'm1a1': dict(obj='source/mboh/mboh.obj', mtl=None,
                 textures={'chassis.0': 'textures/Abrams.png', 'misc_a.0': 'textures/Tex_0026_1.png',
                           'misc_a.1': 'textures/bags.png', 'chassis_vlo.7': 'textures/Track.png'},
                 fill=(150, 132, 96), turret=('misc_b',), loose=(), ring='parts', gun='misc_b',
                 above=dict(y=1.15, r=2.2, per='tri'), skip=('chassis_vlo', 'screens') + tuple(f'track_{k}' for k in range(2, 13))),
    # t90 (Karrar look): a draw-call rip, one object per call; calls lying wholly above the hull deck near the turret turn.
    't90': dict(obj='source/t90_1/t-90_coldwar.obj', mtl=None,
                textures={'65fc2b59_dds': 'textures/65fc2b59.png', '03babf5e_dds': 'textures/03babf5e.png'},
                turret=('DrawCall_0093', 'DrawCall_0121'), loose=(), ring='DrawCall_0093', gun='DrawCall_0121',
                above=dict(y=28.5, r=40, per='object'), skip=()),
    't14': dict(obj='source/t14/t14.obj', mtl=None,
                textures={m: f'textures/{m}_albedo.jpg' for m in ('BASHNYA1', 'BASHNYA2', 'CYCLES', 'KORPUS1', 'KORPUS2', 'KORPUS3', 'TRACKS')}
                | {'PULEMET+ORUDIE': 'textures/PULEMET_ORUDIE_albedo.jpg'},
                turret=('БАШНЯ', 'ПУЛЕМЁТ', 'ПУШКА'), loose=(), ring='БАШНЯ', gun='ПУШКА', skip=()),
}


def load(folder, cfg):
    v, vt, tris, uvs, mats, objs = [], [], [], [], [], []
    mat, obj, named = None, None, False
    for line in open(os.path.join(folder, cfg['obj']), encoding='utf-8', errors='replace'):
        if line.startswith('v '):
            v.append(line.split()[1:4])
        elif line.startswith('vt '):
            vt.append(line.split()[1:3])
        elif line.startswith('f '):
            idx = [p.split('/') for p in line.split()[1:]]
            vi = [int(p[0]) for p in idx]
            ti = [int(p[1]) if len(p) > 1 and p[1] else 0 for p in idx]
            for k in range(1, len(vi) - 1):
                tris.append((vi[0], vi[k], vi[k + 1]))
                uvs.append((ti[0], ti[k], ti[k + 1]))
                mats.append(mat)
                objs.append(obj)
        elif line.startswith('usemtl '):
            mat = line.split(None, 1)[1].strip()
        elif line.startswith('o '):
            obj = line.split(None, 1)[1].strip().split('#')[-1]
            named = True
        elif line.startswith('g ') and not named:  # files with groups only name their parts with `g`
            obj = line.split(None, 1)[1].strip()
    v = np.array(v, np.float64)
    vt = np.array(vt, np.float64) if vt else np.zeros((1, 2))
    tris = np.array(tris) - 1
    uvs = np.array(uvs) - 1
    mats, objs = np.array(mats), np.array(objs)
    limit = max(1e4, 1000 * float(np.median(np.abs(v))))  # drops stray far-off vertices too
    keep = ~np.isin(objs, cfg["skip"]) & (np.abs(v[tris]) < limit).all((1, 2))
    tris, uvs, mats, objs = tris[keep], uvs[keep], mats[keep], objs[keep]
    textures = {m: os.path.join(folder, t) for m, t in cfg.get('textures', {}).items()}
    kd, m = {}, None
    if cfg['mtl']:
        for line in open(os.path.join(folder, cfg['mtl']), encoding='utf-8', errors='replace'):
            p = line.split()
            if not p:
                continue
            if p[0] == 'newmtl':
                m = p[1]
            elif p[0] == 'Kd':
                kd[m] = np.array([float(x) for x in p[1:4]])
            elif p[0] == 'map_Kd':
                t = os.path.join(folder, os.path.dirname(cfg['mtl']), ' '.join(p[1:]))
                beside = os.path.join(folder, os.path.dirname(cfg['mtl']), os.path.basename(' '.join(p[1:])))
                textures[m] = t if os.path.exists(t) or not os.path.exists(beside) else beside  # 'textures/x.jpg' shipped beside the .mtl
    return v, vt, tris, uvs, mats, objs, textures, kd


def sample(v, vt, tris, uvs, mats, textures, kd, density, fill):
    """Sample points (positions, colours, face normals) covering the triangles."""
    a, b, c = v[tris[:, 0]], v[tris[:, 1]], v[tris[:, 2]]
    cr = np.cross(b - a, c - a)
    area = np.linalg.norm(cr, axis=1) / 2
    normal = cr / np.maximum(np.linalg.norm(cr, axis=1, keepdims=True), 1e-12)
    n = np.maximum(1, np.ceil(area * density)).astype(np.int64)
    ti = np.repeat(np.arange(len(tris)), n)
    rng = np.random.default_rng(1)
    r1, r2 = np.sqrt(rng.random(len(ti))), rng.random(len(ti))
    w0, w1, w2 = 1 - r1, r1 * (1 - r2), r1 * r2
    pos = a[ti] * w0[:, None] + b[ti] * w1[:, None] + c[ti] * w2[:, None]
    uv = vt[uvs[ti, 0]] * w0[:, None] + vt[uvs[ti, 1]] * w1[:, None] + vt[uvs[ti, 2]] * w2[:, None]
    col = np.full((len(ti), 3), 128.0)
    pm = mats[ti]
    for m in np.unique(mats):
        sel = pm == m
        k = kd.get(m, np.ones(3))
        if m in textures and os.path.exists(textures[m]) and k.max() > 0:
            tex = np.asarray(Image.open(textures[m]).convert('RGB'), np.float64)
            h, w, _ = tex.shape
            x = (np.mod(uv[sel, 0], 1) * (w - 1)).astype(int)
            y = ((1 - np.mod(uv[sel, 1], 1)) * (h - 1)).astype(int)
            col[sel] = tex[y, x] * k
        else:
            col[sel] = 40 if k.max() == 0 else np.array(fill) * k
    return pos, col, normal[ti], ti


def render(pos, col, nrm, heading, scale, shadow):
    """`pos`: model points as (u forward, v left, z up) in metres; `heading`: screen direction of the nose."""
    gx, gy = math.sin(heading), -math.cos(heading) / SIN_E
    n = math.hypot(gx, gy)
    fx, fy = gx / n, gy / n
    lx, ly = fy, -fx  # left of the nose on the ground (x right, y towards the viewer)
    rot = np.array([[fx, lx, 0], [fy, ly, 0], [0, 0, 1]])
    w = pos @ rot.T
    nw = nrm @ rot.T
    view = np.array([0, COS_E, SIN_E])
    nw = np.where((nw @ view)[:, None] < 0, -nw, nw)
    shade = 0.6 + 0.8 * np.clip(nw @ LIGHT, 0, 1)
    rgb = np.clip(col * shade[:, None], 0, 255)
    size = CELL * SS
    sx = ((PIVOT[0] + w[:, 0] * scale) * SS).astype(int)
    sy = ((PIVOT[1] + (w[:, 1] * SIN_E - w[:, 2] * COS_E) * scale) * SS).astype(int)
    depth = w[:, 1] * COS_E + w[:, 2] * SIN_E
    ok = (sx >= 0) & (sx < size) & (sy >= 0) & (sy < size)
    order = np.argsort(-depth[ok], kind='stable')  # nearest first
    pix = (sy[ok] * size + sx[ok])[order]
    _, first = np.unique(pix, return_index=True)
    out = np.zeros((size * size, 4), np.uint8)
    sel = np.nonzero(ok)[0][order][first]
    out[pix[first], :3] = rgb[sel]
    out[pix[first], 3] = 255
    img = Image.fromarray(out.reshape(size, size, 4), 'RGBA')
    # close pin-holes between sample points
    filled = img.filter(ImageFilter.MaxFilter(3))
    holes = (np.asarray(img)[..., 3] == 0) & (np.asarray(img.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5))) > 0)
    a = np.asarray(img).copy()
    a[holes] = np.asarray(filled)[holes]
    img = Image.fromarray(a, 'RGBA')
    if shadow:
        gsx = ((PIVOT[0] + (w[:, 0] - w[:, 2] * 0.35) * scale) * SS).astype(int)
        gsy = ((PIVOT[1] + (w[:, 1] - w[:, 2] * 0.2) * SIN_E * scale) * SS).astype(int)
        m = np.zeros((size, size), np.uint8)
        k = (gsx >= 0) & (gsx < size) & (gsy >= 0) & (gsy < size)
        m[gsy[k], gsx[k]] = 120
        sh = Image.fromarray(m).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5 * SS))
        base = Image.new('RGBA', img.size, (0, 0, 0, 0))
        base.putalpha(sh)
        base.alpha_composite(img)
        img = base
    return img.resize((CELL, CELL), Image.LANCZOS)


def main():
    name, folder = sys.argv[1], sys.argv[2]
    cfg = MODELS[name]
    v, vt, tris, uvs, mats, objs, textures, kd = load(folder, cfg)
    has = lambda part: np.char.find(objs.astype(str), part) >= 0
    turret_tri = np.zeros(len(tris), bool)
    for part in cfg['turret']:
        turret_tri |= has(part)
    # model is Y-up; find the forward axis (Z or X) from the gun
    ring = v[tris[has(cfg['ring'])].ravel()].mean(0)
    d = v[tris[has(cfg['gun'])].ravel()].mean(0) - ring
    fwd = 2 if abs(d[2]) > abs(d[0]) else 0
    sign = np.sign(d[fwd])
    side = 0 if fwd == 2 else 2
    u = (v[:, fwd] - ring[fwd]) * sign
    lv = (v[:, side] - ring[side]) * (sign if fwd == 2 else -sign)
    z = v[:, 1] - v[np.unique(tris), 1].min()
    model = np.stack([u, lv, z], 1)
    # loose parts that sit on the turret go with it
    tp = model[tris[turret_tri].ravel()]
    rad = np.percentile(np.hypot(tp[:, 0], tp[:, 1]), 60)
    base_z = model[tris[has(cfg['ring'])].ravel(), 2].min()
    for o in np.unique(objs):
        if any(k in o for k in cfg['loose']):
            sel = objs == o
            c = model[tris[sel].ravel()].mean(0)
            if math.hypot(c[0], c[1]) < rad and c[2] > base_z:
                turret_tri |= sel
    # models without a turret object: what lies above the hull deck near the ring turns
    if 'above' in cfg:
        ab = cfg['above']
        tri_y = v[tris, 1].min(1)
        tri_r = np.hypot(model[tris, 0].mean(1), model[tris, 1].mean(1))
        if ab['per'] == 'tri':
            turret_tri |= (tri_y >= ab['y']) & (tri_r < ab['r'])
        else:
            for o in np.unique(objs):
                sel = objs == o
                if tri_y[sel].min() >= ab['y'] and tri_r[sel].mean() < ab['r']:
                    turret_tri |= sel
    hull_pts = model[tris[~turret_tri].ravel()]
    scale = HULL_PX / (hull_pts[:, 0].max() - hull_pts[:, 0].min())
    density = (scale * SS * 1.8) ** 2
    pos, col, nrm, ti = sample(model, vt, tris, uvs, mats, textures, kd, density, cfg.get('fill', (128, 128, 128)))
    is_turret = turret_tri[ti]
    sheets = {}
    for part, sel, shadow in (('hull', ~is_turret, True), ('turret', is_turret, False)):
        sheet = Image.new('RGBA', (CELL * DIRS, CELL))
        for k in range(DIRS):
            sheet.alpha_composite(render(pos[sel], col[sel], nrm[sel], k / DIRS * 2 * math.pi, scale, shadow), (k * CELL, 0))
        sheet.save(f'public/sprites/tank-{name}-{part}.png', optimize=True)
        sheets[part] = sheet
    if '--preview' in sys.argv:
        pv = Image.new('RGBA', (CELL * 8, CELL * 2), (90, 110, 70, 255))
        for c in range(8):
            for r, t in enumerate((c * 4, (c * 4 + 6) % DIRS)):
                pv.alpha_composite(sheets['hull'].crop((c * 4 * CELL, 0, (c * 4 + 1) * CELL, CELL)), (c * CELL, r * CELL))
                pv.alpha_composite(sheets['turret'].crop((t * CELL, 0, (t + 1) * CELL, CELL)), (c * CELL, r * CELL))
        pv.resize((pv.width * 2, pv.height * 2), Image.LANCZOS).save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
