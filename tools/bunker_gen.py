#!/usr/bin/env python3
"""
Procedural isometric bunker sprite-sheet generator (RA2-style 2:1 dimetric, 30deg).
Output per faction: PNG-alpha sheet. Columns = damage states, rows = 8 facings.
Usage: python3 bunker_gen.py [out_dir]
"""
import math, random, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# ------------------------------------------------------------------ config
CELL = 512                 # final frame size (px)
SS = 2                     # supersampling
W = CELL * SS
SCALE = 135 * SS           # px per world unit
ANCH = (256 * SS, 345 * SS)  # ground-centre anchor inside frame (supersampled)
ELEV = math.radians(30)
SE, CE = math.sin(ELEV), math.cos(ELEV)
K = 0.70710678
VIEW = np.array([CE * K, CE * K, SE])
LIGHT = np.array([0.15, 0.65, 0.75]); LIGHT /= np.linalg.norm(LIGHT)
STATES = ['intact', 'light_damage', 'damaged', 'heavy_damage', 'destroyed']
ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

CFG = {
    'allied': dict(
        n=8, R=1.15, ri=.62, z0=.10, H=.72, ts=.86,
        wall=(132, 130, 122), roof=(118, 116, 108), found=(88, 87, 82),
        roof_t=.20, slit=(.62, .15, .46), rivets=False, trim='none', outer='sandbags'),
    'axis': dict(
        n=6, R=1.22, ri=.65, z0=.10, H=.85, ts=.78,
        wall=(142, 98, 84), roof=(122, 82, 70), found=(84, 66, 60),
        roof_t=.22, slit=(.80, .17, .50), rivets=False, trim='none', outer='teeth'),
}

# ------------------------------------------------------------------ geometry
class Prim:
    def __init__(s, faces, layer=2.0, bias=0.0):
        s.faces, s.layer, s.bias, s.outer = faces, layer, bias, None
    @property
    def center(s):
        return np.vstack([f['pts'] for f in s.faces]).mean(0)

def face(pts, n, color, kind='side', flat=False, **kw):
    d = dict(pts=np.array(pts, float), n=np.array(n, float), color=color, kind=kind, flat=flat)
    d.update(kw); return d

def extrude(poly, z0, z1, ts=1.0, color=(128, 128, 128), pivot=(0, 0), layer=2.0, bias=0.0, rivets=False):
    px, py = pivot; n = len(poly)
    B = [np.array([x, y, z0]) for x, y in poly]
    T = [np.array([px + (x - px) * ts, py + (y - py) * ts, z1]) for x, y in poly]
    cen = np.mean(B + T, axis=0); faces = []
    for i in range(n):
        j = (i + 1) % n
        pts = [B[i], B[j], T[j], T[i]]
        nr = np.cross(pts[1] - pts[0], pts[3] - pts[0]); l = np.linalg.norm(nr)
        nr = nr / l if l > 1e-9 else np.array([1., 0, 0])
        if nr @ (np.mean(pts, 0) - cen) < 0: nr = -nr
        faces.append(face(pts, nr, color, 'side', strip=True, rivets=rivets))
    faces.append(face(T, (0, 0, 1), color, 'top'))
    return Prim(faces, layer, bias)

def ngon(n, r, start=0.0, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(start + 2 * math.pi * i / n), cy + r * math.sin(start + 2 * math.pi * i / n)) for i in range(n)]

def shift(p, dx, dy, dz):
    for f in p.faces: f['pts'] = f['pts'] + np.array([dx, dy, dz])
    return p

def rotmat(rx, ry, rz):
    rx, ry, rz = map(math.radians, (rx, ry, rz))
    Rx = np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]])
    Ry = np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]])
    Rz = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

def rotate_about(p, pivot, rx=0, ry=0, rz=0):
    R = rotmat(rx, ry, rz); pv = np.array(pivot, float)
    for f in p.faces:
        f['pts'] = (f['pts'] - pv) @ R.T + pv
        f['n'] = f['n'] @ R.T
    return p

def snap_ground(p, z=0.0):
    mz = min(f['pts'][:, 2].min() for f in p.faces)
    return shift(p, 0, 0, z - mz)

def box(cx, cy, z0, z1, lx, ly, yaw=0.0, ts=1.0, color=(128, 128, 128), layer=2.0, bias=0.0):
    c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    poly = [(x * c - y * s, x * s + y * c) for x, y in
            [(-lx / 2, -ly / 2), (lx / 2, -ly / 2), (lx / 2, ly / 2), (-lx / 2, ly / 2)]]
    return shift(extrude(poly, z0, z1, ts, color, (0, 0), layer, bias), cx, cy, 0)

def prism(cx, cy, z0, z1, r, n, start=0.0, ts=1.0, color=(128, 128, 128), layer=2.0, bias=0.0):
    return shift(extrude(ngon(n, r, start), z0, z1, ts, color, (0, 0), layer, bias), cx, cy, 0)

def barrel(x0, x1, yc, zc, t, color, layer=4.0):
    return box((x0 + x1) / 2, yc, zc - t / 2, zc + t / 2, x1 - x0, t, 0, 1.0, color, layer)

def flat_poly(poly_xy, z, color, layer=0.5, bias=0.0):
    pts = [(x, y, z) for x, y in poly_xy]
    return Prim([face(pts, (0, 0, 1), color, 'decal', flat=True)], layer, bias)

def irregular(rng, cx, cy, r, k=12, jit=.25):
    return [(cx + r * (1 + rng.uniform(-jit, jit)) * math.cos(2 * math.pi * i / k),
             cy + r * (1 + rng.uniform(-jit, jit)) * math.sin(2 * math.pi * i / k)) for i in range(k)]

# ------------------------------------------------------------------ decals on wall faces
def wall_decal_faces(prim, rng, scorch=True, holes=2, cracks=1):
    f = prim.outer; b1, b2, t2, t1 = f['pts']; n = f['n']
    def P(u, v):
        bl = b1 + (b2 - b1) * u; tl = t1 + (t2 - t1) * u
        return bl + (tl - bl) * v + n * 0.006
    out = []
    def add(uvs, col): out.append(face([P(u, v) for u, v in uvs], n, col, 'decal', flat=True))
    u0, v0 = rng.uniform(.3, .7), rng.uniform(.35, .75)
    if scorch:
        add([(u0 + .22 * (1 + rng.uniform(-.25, .25)) * math.cos(a), v0 + .28 * (1 + rng.uniform(-.25, .25)) * math.sin(a))
             for a in [2 * math.pi * i / 14 for i in range(14)]], (12, 10, 8, 95))
    for _ in range(holes):
        u, v = rng.uniform(.2, .8), rng.uniform(.2, .8)
        add([(u + .055 * math.cos(a), v + .07 * math.sin(a)) for a in [2 * math.pi * i / 8 for i in range(8)]], (205, 205, 195, 110))
        add([(u + .03 * math.cos(a), v + .04 * math.sin(a)) for a in [2 * math.pi * i / 8 for i in range(8)]], (20, 18, 16, 235))
    for _ in range(cracks):
        u, v = rng.uniform(.15, .85), 1.0; ang = math.radians(rng.uniform(-30, 30))
        for _s in range(rng.randint(4, 7)):
            du, dv = math.sin(ang) * .09, -math.cos(ang) * .12
            nu, nv = u + du, v + dv; w = .009
            add([(u - w, v), (u + w, v), (nu + w, nv), (nu - w, nv)], (24, 21, 19, 235))
            u, v = nu, nv; ang += math.radians(rng.uniform(-35, 35))
    return out

def masonry_faces(prim, rng, rows=3):
    f = prim.outer; b1, b2, t2, t1 = f['pts']; n = f['n']
    def P(u, v):
        bl = b1 + (b2 - b1) * u; tl = t1 + (t2 - t1) * u
        return bl + (tl - bl) * v + n * 0.004
    out = []
    def add(uvs, col): out.append(face([P(u, v) for u, v in uvs], n, col, 'decal', flat=True))
    for r in range(rows):
        v0, v1 = r / rows, (r + 1) / rows
        cuts = [0.0] + sorted(rng.uniform(.2, .8) for _ in range(rng.randint(1, 2))) + [1.0]
        for k in range(len(cuts) - 1):
            col = (0, 0, 0, rng.randint(0, 38)) if rng.random() < .55 else (255, 255, 255, rng.randint(0, 24))
            add([(cuts[k], v0), (cuts[k + 1], v0), (cuts[k + 1], v1), (cuts[k], v1)], col)
        if r:
            add([(0, v0 - .014), (1, v0 - .014), (1, v0 + .014), (0, v0 + .014)], (14, 12, 10, 150))
        for u in cuts[1:-1]:
            add([(u - .012, v0), (u + .012, v0), (u + .012, v1), (u - .012, v1)], (14, 12, 10, 150))
    return out

def crack_poly_prim(rng, Rr, z, layer=3.5, k=2):
    prims = []
    for _ in range(k):
        a = rng.uniform(0, 2 * math.pi); x, y = Rr * .9 * math.cos(a), Rr * .9 * math.sin(a)
        d = a + math.pi
        for _s in range(rng.randint(4, 7)):
            nx, ny = x + .14 * math.cos(d), y + .14 * math.sin(d)
            px_, py_ = -math.sin(d) * .012, math.cos(d) * .012
            prims.append(flat_poly([(x + px_, y + py_), (nx + px_, ny + py_), (nx - px_, ny - py_), (x - px_, y - py_)],
                                   z + .004, (24, 21, 19, 235), layer, .02))
            x, y = nx, ny; d += math.radians(rng.uniform(-40, 40))
    return prims

# ------------------------------------------------------------------ model builder
def mul(c, f): return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + tuple(c[3:])

def build(cfg, state, seed):
    rng = random.Random(seed * 1000 + state)
    n, R, ri, z0, H, ts = cfg['n'], cfg['R'], cfg['ri'], cfg['z0'], cfg['H'], cfg['ts']
    off = -math.pi / n
    char = [1.0, .95, .85, .70, .52][state]
    wall_c = mul(cfg['wall'], char); roof_c = mul(cfg['roof'], char)
    P, smoke, fire, embers = [], [], [], []

    # ground scorch / crater
    sa = [0, 0, 60, 105, 150][state]
    if sa:
        P.append(flat_poly(irregular(rng, 0, 0, R * 1.45, 18, .12), .002, (14, 11, 9, sa), 0.3))
    if state >= 3:
        P.append(flat_poly(irregular(rng, 0, 0, R * 1.05, 16, .15), .004, (28, 22, 18, 190), 0.4))
    # foundation + interior floor
    fnd = prism(0, 0, 0, z0, R + .12, n, off, 1.0, mul(cfg['found'], char * (1 if state < 4 else .8)), 1.0)
    P.append(fnd)
    P.append(prism(0, 0, z0, z0 + .004, ri * 1.1, n, off, 1.0, (34, 32, 31), 1.1))

    # wall sectors
    m = 2 if state >= 3 else 1
    fr = {0: [1.0], 1: [1.0], 2: [1.0], 3: [1.0], 4: [1.0]}
    total = n * m
    heights = []
    for i in range(total):
        if state == 0: f = 1.0
        elif state == 1: f = 1.0
        elif state == 2: f = rng.uniform(.88, 1.0)
        elif state == 3: f = rng.uniform(.35, .78)
        else: f = rng.uniform(.10, .32)
        heights.append(f)
    if state == 1: heights[rng.randrange(total)] = .93
    if state == 2:
        for _ in range(2): heights[rng.randrange(total)] = rng.uniform(.62, .75)
    if state == 3: heights[rng.randrange(total)] = .12
    if state == 4:
        for _ in range(2): heights[rng.randrange(total)] = .04
    step = 2 * math.pi / total
    decal_sectors = set()
    if state == 1: decal_sectors = set(rng.sample(range(total), 3))
    if state == 2: decal_sectors = set(rng.sample(range(total), 5))
    if state == 3: decal_sectors = set(rng.sample(range(total), min(total, 6)))
    for i in range(total):
        a0, a1 = off + i * step, off + (i + 1) * step
        h = H * heights[i]
        tse = 1 - (1 - ts) * heights[i]
        poly = [(ri * math.cos(a0), ri * math.sin(a0)), (R * math.cos(a0), R * math.sin(a0)),
                (R * math.cos(a1), R * math.sin(a1)), (ri * math.cos(a1), ri * math.sin(a1))]
        col = mul(wall_c, rng.uniform(.88, 1.08))
        pr = extrude(poly, z0, z0 + h, tse, col, (0, 0), 2.0, 0.0, cfg['rivets'])
        pr.outer = pr.faces[1]; pr.outer['kind'] = 'outer'
        pr.faces += masonry_faces(pr, rng, 3 if m == 1 else 2)
        if cfg['trim'] == 'band' and state <= 1:
            fo = pr.outer; bb1, bb2, tt2, tt1 = fo['pts']; nn = fo['n']
            Q = lambda u, v: (bb1 + (bb2 - bb1) * u) + ((tt1 + (tt2 - tt1) * u) - (bb1 + (bb2 - bb1) * u)) * v + nn * .005
            pr.faces.append(face([Q(0, .36), Q(1, .36), Q(1, .48), Q(0, .48)], nn, (200, 160, 44, 255), 'decal', flat=True))
        if i in decal_sectors:
            pr.faces += wall_decal_faces(pr, rng, True, rng.randint(1, 3), rng.randint(0, 2) if state < 3 else 1)
        P.append(pr)

    def dist(z): return R * math.cos(math.pi / n) * (1 - (1 - ts) * (z - z0) / H)

    # roof
    Rr = R * ts + .06; rz0 = z0 + H; rz1 = rz0 + cfg['roof_t']
    tri = lambda a0_, a1_: [(0, 0), (Rr * math.cos(a0_), Rr * math.sin(a0_)), (Rr * math.cos(a1_), Rr * math.sin(a1_))]
    if state <= 1:
        roof = prism(0, 0, rz0, rz1, Rr, n, off, .93, roof_c, 3.0)
        P.append(roof)
        if state == 1:
            P += crack_poly_prim(rng, Rr, rz1 * .93 + rz0 * .07, 2)
            P.append(flat_poly(irregular(rng, rng.uniform(-.3, .3), rng.uniform(-.3, .3), .3, 12, .3), rz1 + .003, (10, 8, 8, 110), 3.5, .01))
    elif state == 2:
        tris = []
        drop = rng.randrange(n)
        for i in range(n):
            a0, a1 = off + 2 * math.pi * i / n, off + 2 * math.pi * (i + 1) / n
            pr = extrude(tri(a0, a1), rz0, rz1, .96, mul(roof_c, rng.uniform(.92, 1.04)), (0, 0), 3.0)
            if i == drop:
                mid = np.array([Rr * .6 * math.cos((a0 + a1) / 2), Rr * .6 * math.sin((a0 + a1) / 2), rz0])
                rotate_about(pr, mid, rng.uniform(-14, 14), rng.uniform(10, 18), 0); shift(pr, 0, 0, -.1)
            P.append(pr)
        P.append(flat_poly(irregular(rng, .1, -.15, .36, 12, .25), rz1 + .003, (90, 88, 84, 255), 3.5, .01))
        P.append(flat_poly(irregular(rng, .1, -.15, .27, 12, .25), rz1 + .006, (14, 12, 11, 255), 3.5, .02))
        P += crack_poly_prim(rng, Rr, rz1, 4)
        smoke.append((.1, -.15, rz1)); 
    elif state == 3:
        keep = rng.sample(range(n), max(2, n // 2 - 1))
        for i in keep:
            a0, a1 = off + 2 * math.pi * i / n, off + 2 * math.pi * (i + 1) / n
            pr = extrude(tri(a0, a1), rz0 - .3, rz1 - .3, .96, mul(roof_c, rng.uniform(.85, 1.0)), (0, 0), 3.0)
            pr.faces.append(face([(x, y, rz1 - .3 + .004) for x, y in irregular(rng, Rr * .5 * math.cos((a0 + a1) / 2), Rr * .5 * math.sin((a0 + a1) / 2), .13, 8, .3)],
                                 (0, 0, 1), (10, 8, 8, 120), 'decal', flat=True))
            mid = np.array([Rr * .5 * math.cos((a0 + a1) / 2), Rr * .5 * math.sin((a0 + a1) / 2), rz0 - .3])
            rotate_about(pr, mid, rng.uniform(-28, 28), rng.uniform(-28, 28), rng.uniform(-20, 20))
            shift(pr, rng.uniform(-.1, .1), rng.uniform(-.1, .1), rng.uniform(-.05, .1))
            P.append(pr)
    else:
        for _ in range(2):
            a = rng.uniform(0, 2 * math.pi); a0 = a; a1 = a + 2 * math.pi / n
            pr = extrude(tri(a0, a1), 0, .13, .96, mul(roof_c, .8), (0, 0), 2.0)
            rotate_about(pr, (0, 0, 0), rng.uniform(-14, 14), rng.uniform(-14, 14), rng.uniform(0, 360))
            r = rng.uniform(.9, 1.4); aa = rng.uniform(0, 2 * math.pi)
            shift(pr, r * math.cos(aa), r * math.sin(aa), 0); snap_ground(pr, .01)
            P.append(pr)

    # firing slit only
    if state <= 2:
        sw, sh, szc = cfg['slit']
        sx = dist(szc)
        P.append(box(sx, 0, szc - sh / 2, szc + sh / 2, .10, sw, 0, 1.0, (10, 10, 12), 2.0, 0.01))
        # stone lintel + sill
        P.append(box(sx + .01, 0, szc + sh / 2, szc + sh / 2 + .05, .12, sw + .12, 0, 1.0, mul(cfg['wall'], .75 * char), 2.0, 0.015))
        P.append(box(sx + .01, 0, szc - sh / 2 - .04, szc - sh / 2, .12, sw + .08, 0, 1.0, mul(cfg['wall'], .70 * char), 2.0, 0.015))

    # outer defences
    items = []
    if cfg['outer'] == 'sandbags':
        r0 = R + .30
        for a in range(-70, 71, 14): items.append((r0, a, 0.0, .17, .34, .24, .85, (176, 150, 100)))
        for a in range(-63, 64, 14): items.append((r0 - .03, a, .16, .32, .34, .24, .85, (170, 144, 96)))
    else:
        r0 = R + .42
        for a in range(-63, 64, 21): items.append((r0, a, 0.0, .34, .30, .30, .22, (118, 116, 108)))
    keep_n = {0: 0, 1: 1, 2: 4, 3: 8, 4: 14 if cfg['outer'] == 'sandbags' else 5}[state]
    drop = set(rng.sample(range(len(items)), min(keep_n, len(items))))
    for idx, (r, a, za, zb, lx, ly, tsb, col) in enumerate(items):
        if idx in drop: continue
        ar = math.radians(a)
        px, py = r * math.cos(ar), r * math.sin(ar)
        c = mul(col, char * rng.uniform(.92, 1.06))
        if state >= 2:
            px += rng.uniform(-.1, .1) * state / 2; py += rng.uniform(-.1, .1) * state / 2
        pr = box(px, py, za, zb, lx, ly, a + 90 + (rng.uniform(-20, 20) if state >= 2 else 0), tsb, c, 2.0)
        if cfg['outer'] == 'teeth' and state >= 3 and rng.random() < .5:
            rotate_about(pr, (px, py, 0), rng.uniform(-70, 70), rng.uniform(-70, 70), 0); snap_ground(pr, 0)
        elif cfg['outer'] == 'sandbags' and state >= 3 and za > 0 and rng.random() < .5:
            rotate_about(pr, (px, py, za), rng.uniform(-20, 20), rng.uniform(-20, 20), 0)
            shift(pr, 0, 0, -za * .6)
        P.append(pr)

    # rubble & rebar
    cnt = [0, 4, 10, 22, 44][state]
    big = [0, .10, .16, .24, .30][state]
    for _ in range(cnt):
        r = rng.uniform(R * .45 if state >= 3 else R * .95, R * 1.55); a = rng.uniform(0, 2 * math.pi)
        s = rng.uniform(big * .35, big)
        c = mul(cfg['wall'], rng.uniform(.45, 1.0) * char)
        pr = box(r * math.cos(a), r * math.sin(a), 0, s * rng.uniform(.4, 1), s, s * rng.uniform(.6, 1.1), rng.uniform(0, 360),
                 rng.uniform(.5, 1.0), c, 2.0)
        if rng.random() < .5: rotate_about(pr, tuple(pr.center), rng.uniform(-25, 25), rng.uniform(-25, 25), 0); snap_ground(pr, 0)
        P.append(pr)
        if state == 4 and rng.random() < .25: embers.append((r * math.cos(a), r * math.sin(a), s * .6))
    for _ in range([0, 0, 0, 5, 4][state]):
        a = rng.uniform(0, 2 * math.pi); r = R * rng.uniform(.55, .9)
        hh = rng.uniform(.3, .75)
        pr = box(r * math.cos(a), r * math.sin(a), 0, hh, .035, .035, rng.uniform(0, 360), 1.0, (96, 62, 40), 2.0, .01)
        rotate_about(pr, (r * math.cos(a), r * math.sin(a), 0), rng.uniform(-18, 18), rng.uniform(-18, 18), 0)
        P.append(pr)

    if state == 3:
        fire += [(rng.uniform(-.5, .5), rng.uniform(-.5, .5), .55) for _ in range(2)]
    if state == 4:
        fire += [(rng.uniform(-.7, .7), rng.uniform(-.7, .7), .2) for _ in range(3)]
        smoke += [(rng.uniform(-.4, .4), rng.uniform(-.4, .4), .3) for _ in range(2)]
    if state == 3:
        smoke += [(x, y, z) for x, y, z in fire]
    return P, smoke, fire, embers

# ------------------------------------------------------------------ rendering
def rotz(v, c, s): return np.array([v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]])

def project(p):
    sx = (p[0] - p[1]) * K; sy = (p[0] + p[1]) * K * SE - p[2] * CE
    return (ANCH[0] + sx * SCALE, ANCH[1] + sy * SCALE)

def shade(col, n):
    lit = .48 + .62 * max(0.0, float(n @ LIGHT))
    return tuple(max(0, min(255, int(c * lit))) for c in col[:3]) + (col[3] if len(col) > 3 else 255,)

def render_bunker(prims, theta, shadow_r):
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    c, s = math.cos(math.radians(theta)), math.sin(math.radians(theta))
    # soft cast shadow (to screen-right)
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    sp = [project(rotz(np.array([.35 + shadow_r * math.cos(a), -.5 + shadow_r * math.sin(a), 0]), 1, 0))
          for a in [2 * math.pi * i / 28 for i in range(28)]]
    sd.polygon(sp, fill=(0, 0, 0, 95))
    img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(.075 * SCALE)))
    d = ImageDraw.Draw(img, 'RGBA')
    order = sorted(prims, key=lambda p: (p.layer, float(rotz(p.center, c, s) @ VIEW) + p.bias))
    lw = max(1, int(1.1 * SS))
    for p in order:
        for f in p.faces:
            n = rotz(f['n'], c, s)
            if n @ VIEW <= 0.02: continue
            pts3 = [rotz(q, c, s) for q in f['pts']]
            pts = [project(q) for q in pts3]
            col = f['color'] if f['flat'] and f['kind'] == 'decal' and False else shade(f['color'], n)
            if col[3] < 255: draw_alpha(img, pts, col)
            else: d.polygon(pts, fill=col)
            if f['kind'] == 'decal': continue
            edge = tuple(int(v * .55) for v in col[:3]) + (255,)
            d.line(pts + [pts[0]], fill=edge, width=lw)
            if f['kind'] in ('side', 'outer') and len(pts) == 4 and f.get('strip'):
                b0, b1, t1, t0 = pts3
                lerp = lambda a_, b_, t_: a_ + (b_ - a_) * t_
                draw_alpha(img, [project(b0), project(b1), project(lerp(b1, t1, .22)), project(lerp(b0, t0, .22))], (0, 0, 0, 62))
                draw_alpha(img, [project(t0), project(t1), project(lerp(t1, b1, .07)), project(lerp(t0, b0, .07))], (255, 255, 255, 34))
                if f.get('rivets') and f['kind'] == 'outer':
                    for u in (.12, .3, .5, .7, .88):
                        pu = project(lerp(lerp(b0, b1, u), lerp(t0, t1, u), .87))
                        r = 2.3 * SS
                        d.ellipse([pu[0] - r, pu[1] - r, pu[0] + r, pu[1] + r], fill=(30, 12, 10, 255))
                        d.ellipse([pu[0] - r * .55, pu[1] - r * .75, pu[0] + r * .15, pu[1] - r * .05], fill=(220, 150, 130, 255))
    return img

def draw_alpha(img, pts, col):
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    x0,y0=max(0,int(min(xs))-1),max(0,int(min(ys))-1); x1,y1=min(W,int(max(xs))+2),min(W,int(max(ys))+2)
    if x1<=x0 or y1<=y0: return
    t=Image.new('RGBA',(x1-x0,y1-y0),(0,0,0,0))
    ImageDraw.Draw(t).polygon([(x-x0,y-y0) for x,y in pts],fill=col)
    img.alpha_composite(t,(x0,y0))

def grain(img, seed):
    rng = np.random.default_rng(seed)
    a = np.array(img).astype(np.int16)
    mask = a[..., 3] >= 250
    fine = rng.normal(0, 7, (W, W))
    lo = rng.normal(0, 128, (W // 18, W // 18)).clip(-128, 127) + 128
    lo = np.array(Image.fromarray(lo.astype(np.uint8)).resize((W, W), Image.BICUBIC)).astype(np.float32) - 128
    noise = (fine + lo * .09).astype(np.int16)
    for ch in range(3): a[..., ch] = np.where(mask, np.clip(a[..., ch] + noise, 0, 255), a[..., ch])
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

def blob(d, cx, cy, rx, ry, col): d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=col)

def effects(base, theta, smoke, fire, embers, state, seed):
    rng = random.Random(seed + state * 77)
    c, s = math.cos(math.radians(theta)), math.sin(math.radians(theta))
    if fire:
        fl = Image.new('RGBA', (W, W), (0, 0, 0, 0)); fd = ImageDraw.Draw(fl)
        fs = 1.0 if state == 3 else .6
        for (x, y, z) in fire:
            px, py = project(rotz(np.array([x, y, z]), c, s))
            blob(fd, px, py, .42 * SCALE * fs, .22 * SCALE * fs, (255, 120, 20, 38))
            for k, (col) in enumerate([(235, 70, 10, 165), (255, 150, 30, 205), (255, 228, 125, 235)]):
                rx = (.16 - .045 * k) * SCALE * fs
                blob(fd, px + rng.uniform(-.03, .03) * SCALE, py - rx * (1.1 + .25 * k), rx, rx * 1.75, col)
        base = Image.alpha_composite(base, fl.filter(ImageFilter.GaussianBlur(.02 * SCALE)))
    if embers:
        el = Image.new('RGBA', (W, W), (0, 0, 0, 0)); ed = ImageDraw.Draw(el)
        for (x, y, z) in embers:
            px, py = project(rotz(np.array([x, y, z]), c, s)); r = rng.uniform(.015, .03) * SCALE
            blob(ed, px, py, r, r, (255, 150, 40, 230))
        base = Image.alpha_composite(base, el.filter(ImageFilter.GaussianBlur(.008 * SCALE)))
    if smoke:
        sl = Image.new('RGBA', (W, W), (0, 0, 0, 0)); sd = ImageDraw.Draw(sl)
        a0 = {2: 75, 3: 150, 4: 125}.get(state, 0); sm = {2: .8, 3: 1.0, 4: 1.0}.get(state, 0)
        for (x, y, z) in smoke:
            for k in range(5):
                px, py = project(rotz(np.array([x, y, z + k * .22 * sm]), c, s))
                px += (k * .05 + rng.uniform(-.02, .02)) * SCALE
                r = (.13 + .05 * k) * SCALE * sm
                g = int(38 + k * 16)
                blob(sd, px, py, r, r * .9, (g, g, g, int(a0 * (1 - k / 6))))
        base = Image.alpha_composite(base, sl.filter(ImageFilter.GaussianBlur(.055 * SCALE)))
    return base

def downsample(img):
    return img.convert('RGBa').resize((CELL, CELL), Image.LANCZOS).convert('RGBA')

def make_sheet(name, cfg, seed, out_dir):
    sheet = Image.new('RGBA', (CELL * len(STATES), CELL * len(ANGLES)), (0, 0, 0, 0))
    for si, st in enumerate(STATES):
        P, smoke, fire, embers = build(cfg, si, seed)
        for ai, ang in enumerate(ANGLES):
            frame = render_bunker(P, ang, 1.35 - .08 * si)
            frame = grain(frame, seed + si * 10 + ai)
            frame = effects(frame, ang, smoke, fire, embers, si, seed)
            sheet.paste(downsample(frame), (si * CELL, ai * CELL))
        print(name, st, 'done', flush=True)
    path = os.path.join(out_dir, f'bunker_{name}_sheet.png')
    sheet.save(path, optimize=True)
    return path

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/outputs'
    os.makedirs(out, exist_ok=True)
    only = sys.argv[2:] or list(CFG)
    atlas = {'cell': [CELL, CELL], 'anchor_ground_centre': [ANCH[0] // SS, ANCH[1] // SS],
             'columns_damage_states': STATES, 'rows_facing_deg': ANGLES,
             'projection': '2:1 dimetric, elevation 30deg', 'files': {}}
    for k in only:
        atlas['files'][k] = os.path.basename(make_sheet(k, CFG[k], 7 if k == 'allied' else 11, out))
    json.dump(atlas, open(os.path.join(out, 'bunker_atlas.json'), 'w'), indent=2)
