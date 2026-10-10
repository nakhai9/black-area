#!/usr/bin/env python3
"""
RA2-style tank sprite-sheet generator: procedural 3D -> software render -> PNG (alpha).
Facings: 32 (row 0 = North, clockwise, same order as RA2 SHP facings).
Usage: python tank_sprites.py --cell 256 --out out [--tanks T90M_Proryv ...] [--quick]
"""
import math, os, sys, json, argparse
import numpy as np
from numba import njit
from PIL import Image, ImageFilter

NFACE = 32
ELEV = math.radians(35)
cE, sE = math.cos(ELEV), math.sin(ELEV)
PPM_K = 0.078                     # pixels-per-meter = cell * PPM_K
LIGHT = np.array([-0.55, -0.45, 0.70]); LIGHT /= np.linalg.norm(LIGHT)
VIEW = np.array([0.0, cE, -sE])
SKY, GND = np.array([.62, .72, .88]), np.array([.28, .24, .19])
TRACK_SP = 0.34
NMOVE, NFIRE, NWRECK, NEXP = 8, 6, 4, 16

# ------------------------------------------------------------------ mesh
class Mesh:
    def __init__(s):
        s.V = np.zeros((0, 3)); s.F = np.zeros((0, 3), int)
        s.C = np.zeros((0, 3)); s.K = np.zeros((0, 2))
    def add(s, V, F, col, metal=.35, spec=.5):
        V = np.asarray(V, float); F = np.asarray(F, int).copy()
        cen = V.mean(0); n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
        bad = (n * (V[F].mean(1) - cen)).sum(1) < 0          # force outward winding (convex solids)
        t = F[bad, 1].copy(); F[bad, 1] = F[bad, 2]; F[bad, 2] = t
        s.F = np.vstack([s.F, F + len(s.V)]); s.V = np.vstack([s.V, V])
        s.C = np.vstack([s.C, np.tile(col, (len(F), 1))])
        s.K = np.vstack([s.K, np.tile([metal, spec], (len(F), 1))]); return s
    def merge(s, o):
        s.F = np.vstack([s.F, o.F + len(s.V)]); s.V = np.vstack([s.V, o.V])
        s.C = np.vstack([s.C, o.C]); s.K = np.vstack([s.K, o.K]); return s
    def rz(s, a, p=(0, 0)):
        c, sn = math.cos(a), math.sin(a); x = s.V[:, 0] - p[0]; y = s.V[:, 1] - p[1]
        s.V[:, 0] = x * c - y * sn + p[0]; s.V[:, 1] = x * sn + y * c + p[1]; return s
    def ry(s, a, p=(0, 0)):
        c, sn = math.cos(a), math.sin(a); x = s.V[:, 0] - p[0]; z = s.V[:, 2] - p[1]
        s.V[:, 0] = x * c - z * sn + p[0]; s.V[:, 2] = x * sn + z * c + p[1]; return s
    def mv(s, dx=0, dy=0, dz=0):
        s.V = s.V + np.array([dx, dy, dz]); return s

def loft(pa, a0, pb, a1, axis, col, metal=.35, spec=.5):
    pa = np.asarray(pa, float); pb = np.asarray(pb, float); n = len(pa)
    L = lambda p, a: [p[0], p[1], a] if axis == 'z' else ([p[0], a, p[1]] if axis == 'y' else [a, p[0], p[1]])
    V = [L(p, a0) for p in pa] + [L(p, a1) for p in pb]; F = []
    for i in range(1, n - 1): F += [[0, i, i + 1], [n, n + i, n + i + 1]]
    for i in range(n):
        j = (i + 1) % n; F += [[i, j, n + j], [i, n + j, n + i]]
    return Mesh().add(V, F, col, metal, spec)

def box(cx, cy, cz, sx, sy, sz, col, **k):
    p = [(cx - sx / 2, cy - sy / 2), (cx + sx / 2, cy - sy / 2), (cx + sx / 2, cy + sy / 2), (cx - sx / 2, cy + sy / 2)]
    return loft(p, cz - sz / 2, p, cz + sz / 2, 'z', col, **k)

def cyl(c, r, l, axis, col, n=12, **k):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    i = {'x': (1, 2, 0), 'y': (0, 2, 1), 'z': (0, 1, 2)}[axis]
    p = [(c[i[0]] + r * math.cos(a), c[i[1]] + r * math.sin(a)) for a in t]
    return loft(p, c[i[2]] - l / 2, p, c[i[2]] + l / 2, axis, col, **k)

def track_pt(s, a, R):
    if s < 2 * a: return (-a + s, 0.0), 0.0
    s -= 2 * a
    if s < math.pi * R:
        t = -math.pi / 2 + s / R; return (a + R * math.cos(t), R + R * math.sin(t)), t + math.pi / 2
    s -= math.pi * R
    if s < 2 * a: return (a - s, 2 * R), math.pi
    s -= 2 * a
    t = math.pi / 2 + s / R; return (-a + R * math.cos(t), R + R * math.sin(t)), t + math.pi / 2

def era_edge(P, i, j, n, th, rows, col, cen):
    m = Mesh(); p0 = np.array(P[i], float); p1 = np.array(P[j], float)
    d = p1 - p0; ln = np.linalg.norm(d); ang = math.atan2(d[1], d[0]); nr = np.array([d[1], -d[0]]) / ln
    for t in np.linspace(.12, .88, n):
        pt = p0 + d * t
        o = nr if np.dot(nr, pt - cen) > 0 else -nr
        for rz_ in rows:
            b = box(0, 0, th * rz_, ln / n * .86, .11, th * .30, col, metal=.55, spec=.6).rz(ang)
            m.merge(b.mv(pt[0] + o[0] * .09, pt[1] + o[1] * .09, 0))
    return m

# ------------------------------------------------------------------ tank specs
SPECS = {
 'T90M_Proryv': dict(col=(.30, .35, .22), col2=(.13, .16, .11), L=6.9, W=3.1, R=.50, tw=.52, hz=1.55, gl=2.0, zg=.95,
    turret=[(1.75, .45), (1.25, 1.2), (-.6, 1.3), (-1.5, .85), (-1.5, -.85), (-.6, -1.3), (1.25, -1.2), (1.75, -.45)],
    th=.75, ts=.80, tx=.25, gun=4.5, gr=.08, extractor=True, sleeve=False, era=True, skirt=[(-.2, 2.4)], bustle=False,
    crows=False, drums=True, camo=0, wedge=False),
 'M1A2_Abrams': dict(col=(.62, .53, .37), col2=(.40, .34, .24), L=7.0, W=3.2, R=.52, tw=.58, hz=1.5, gl=2.5, zg=.9,
    turret=[(2.0, .35), (1.25, 1.4), (-.7, 1.5), (-1.2, 1.25), (-1.2, -1.25), (-.7, -1.5), (1.25, -1.4), (2.0, -.35)],
    th=.90, ts=.88, tx=-.4, gun=4.8, gr=.085, extractor=True, sleeve=False, era=False, skirt=[(-2.4, 2.3)], bustle=True,
    crows=True, drums=False, camo=0, wedge=True),
 'Type99_ZTZ99': dict(col=(.22, .30, .20), col2=(.36, .31, .19), L=7.3, W=3.1, R=.52, tw=.54, hz=1.5, gl=2.2, zg=.95,
    turret=[(2.1, .5), (1.4, 1.35), (-.8, 1.45), (-1.7, 1.0), (-1.7, -1.0), (-.8, -1.45), (1.4, -1.35), (2.1, -.5)],
    th=.95, ts=.82, tx=0.0, gun=4.4, gr=.085, extractor=True, sleeve=True, era=True, skirt=[(-2.5, 2.5)], bustle=True,
    crows=False, drums=False, camo=9, wedge=True),
 'Leopard2A7V': dict(col=(.24, .29, .21), col2=(.12, .14, .10), L=7.7, W=3.2, R=.54, tw=.58, hz=1.65, gl=2.3, zg=1.0,
    turret=[(2.2, .35), (1.1, 1.5), (-1.0, 1.55), (-1.9, 1.1), (-1.9, -1.1), (-1.0, -1.55), (1.1, -1.5), (2.2, -.35)],
    th=1.05, ts=.80, tx=-.2, gun=4.5, gr=.085, extractor=True, sleeve=True, era=False, skirt=[(-2.7, 2.7)], bustle=True,
    crows=True, drums=False, camo=7, wedge=True),
}

def wreck_off(sp): return (1.1, 1.7, -(sp['hz'] - .45), .8, .28)

def build(sp, st):
    W, L, R, tw, zt = sp['W'], sp['L'], sp['R'], sp['tw'], sp['hz']
    col = np.array(sp['col']); col2 = np.array(sp['col2'])
    rub = np.array([.09, .09, .10]); steel = np.array([.30, .31, .33]); dark = np.array([.07, .07, .08])
    ph = st.get('phase', 0.); bob = st.get('bob', 0.)
    trk, hull, tur = Mesh(), Mesh(), Mesh()
    Lt = L + .5; a = Lt / 2 - R
    P = 4 * a + 2 * math.pi * R; ncl = int(P / TRACK_SP); sp2 = P / ncl
    rw = R * .82
    for sg in (-1, 1):
        yc = sg * (W / 2 - tw / 2)
        pts = [(a + R * math.cos(t), R + R * math.sin(t)) for t in np.linspace(-math.pi / 2, math.pi / 2, 9)] + \
              [(-a + R * math.cos(t), R + R * math.sin(t)) for t in np.linspace(math.pi / 2, 3 * math.pi / 2, 9)]
        trk.merge(loft(pts, yc - tw / 2, pts, yc + tw / 2, 'y', rub, metal=.1, spec=.1))
        for i in range(ncl):
            pos, an = track_pt(((i - ph) * sp2) % P, a, R)
            trk.merge(box(0, yc, 0, .26, tw + .03, .13, steel * .8, metal=.6, spec=.5).ry(an).mv(pos[0], 0, pos[1]))
        for x in np.linspace(-a + .05, a - .05, 7):
            trk.merge(cyl((x, sg * (W / 2 + .02), R), rw, .06, 'y', steel * .9, n=14, metal=.6, spec=.6))
            for j in range(4):
                wa = -ph * TRACK_SP / rw + j * math.pi / 2
                trk.merge(box(x + .6 * rw * math.cos(wa), sg * (W / 2 + .06), R + .6 * rw * math.sin(wa), .07, .05, .07, dark, metal=.3))
    hw = W / 2 - tw + .12
    gl, zg = sp['gl'], sp['zg']
    prof = [(-L / 2, .5), (-L / 2, zt - .15), (-L / 2 + .4, zt), (L / 2 - gl, zt), (L / 2, zg), (L / 2 - .2, .5)]
    hull.merge(loft(prof, -hw, prof, hw, 'y', col, metal=.45, spec=.6))
    zb = max(1.15, zt - .45); sx0, sx1 = -L / 2 + .3, L / 2 - gl - .3
    for sg in (-1, 1):
        hull.merge(box((sx0 + sx1) / 2, sg * (hw + W / 2 - .1) / 2, (zb + zt - .08) / 2, sx1 - sx0, W / 2 - .1 - hw, zt - .08 - zb, col * .95, metal=.45))
        hull.merge(box(-L / 2 + 1.1, sg * hw * .45, zt + .03, 1.7, hw * .85, .06, dark, metal=.7, spec=.7))
    hull.merge(cyl((L / 2 - gl - .45, 0, zt + .05), .26, .1, 'z', steel))
    hull.merge(box(L / 2 - gl - .75, .6, zt + .08, .3, .35, .15, dark, metal=.8, spec=1))
    for sg in (-1, 1):  # headlights/towing
        hull.merge(box(L / 2 - gl + .15, sg * (hw - .3), zt + .06, .22, .22, .12, (.8, .8, .6), metal=.2, spec=1))
    if sp['era']:
        sl = math.atan2(zg - zt, gl)
        for r in (.18, .5, .82):
            for j in range(-3, 4):
                u = r; hull.merge(box(0, 0, 0, .36, .40, .10, col2 * 1.1, metal=.55, spec=.6).ry(sl)
                                  .mv(L / 2 - gl + u * gl, j * .46, zt + u * (zg - zt) + .07))
    if sp['wedge'] and not sp['era']:
        sl = math.atan2(zg - zt, gl)
        hull.merge(box(0, 0, 0, gl * .5, hw * 1.5, .08, col * 1.08, metal=.5).ry(sl).mv(L / 2 - gl + .62 * gl, 0, zt + .62 * (zg - zt) + .05))
    for x0, x1 in sp['skirt']:
        for sg in (-1, 1):
            xx = x0
            while xx < x1 - .05:
                ln = min(.95, x1 - xx)
                trk.merge(box(xx + ln / 2, sg * (W / 2 + .1), .88, ln - .04, .1, .85, col * .9, metal=.45))
                xx += ln
    if sp['drums']:
        for sg in (-1, 1): hull.merge(cyl((-L / 2 + .2, sg * .8, zt + .35), .22, 1.0, 'y', col2 * 1.4, n=10, metal=.35))
        hull.merge(box(-L / 2 - .1, 0, zt + .3, .3, 1.5, .5, col2, metal=.3))
    rs = np.random.RandomState(7)
    for i in range(sp['camo']):
        hull.merge(box(rs.uniform(-L / 2 + .5, L / 2 - gl - .3), rs.uniform(-hw, hw) * .9, zt + .012,
                       rs.uniform(.6, 1.6), rs.uniform(.5, 1.2), .03, col2 * rs.uniform(.8, 1.2), metal=.3))
    # ------------- turret (local frame, pivot at origin)
    Pt = np.array(sp['turret'], float); cen = Pt.mean(0); th, ts = sp['th'], sp['ts']
    Pt2 = (Pt - cen) * ts + cen
    tur.merge(cyl((0, 0, .02), 1.15, .22, 'z', dark, n=16, metal=.5))
    tur.merge(loft(Pt, .02, Pt2, th, 'z', col, metal=.5, spec=.65))
    xf = Pt[:, 0].max(); xr = Pt[:, 0].min(); gz = th * .5
    tur.merge(box(xf - .08, 0, gz, .55, 1.05, th * .75, col * 1.05, metal=.5))
    if sp['era']:
        for i, j in ((7, 0), (0, 1), (6, 7)): tur.merge(era_edge(Pt, i, j, 4 if (i, j) == (7, 0) else 3, th, (.3, .68), col2 * 1.1, cen))
    if sp['wedge']:
        for sg in (-1, 1):
            tur.merge(box(xf - .35, sg * .72, th * .52, .5, .55, th * .85, col * 1.06, metal=.55).rz(sg * -.55))
    gl_len = sp['gun'] * st.get('gun', 1.0); rc = st.get('recoil', 0.) * .45
    gx0 = xf - .2 - rc
    tur.merge(cyl((gx0 + gl_len / 2, 0, gz), sp['gr'], gl_len, 'x', steel * .75, n=10, metal=.75, spec=.9))
    if sp['sleeve']: tur.merge(cyl((gx0 + gl_len * .55, 0, gz), sp['gr'] * 1.4, gl_len * .45, 'x', col * .9, n=10, metal=.5))
    if sp['extractor']: tur.merge(cyl((gx0 + gl_len * .78, 0, gz), sp['gr'] * 1.6, .45, 'x', steel * .85, n=10, metal=.7))
    tur.merge(cyl((gx0 + gl_len - .1, 0, gz), sp['gr'] * 1.15, .22, 'x', dark, n=10, metal=.6))
    tur.merge(cyl((xr + .8, .6, th + .02), .30, .2, 'z', steel, n=12))
    tur.merge(cyl((xr + .8, .6, th + .14), .18, .08, 'z', dark, n=12, metal=.8, spec=1))
    tur.merge(box(xf - 1.1, -.5, th + .1, .42, .32, .26, dark, metal=.85, spec=1))
    tur.merge(cyl((xr + .5, -.9, th + .75), .015, 1.5, 'z', dark, n=5))
    for sg in (-1, 1):
        for k in range(4):
            tur.merge(box(xf - 1.2 + k * .17, sg * (Pt[1][1] * ts + .12), th * .6, .12, .12, .3, steel * .8, metal=.5))
    if sp['bustle']:
        tur.merge(box(xr - .45, 0, th * .45, 1.1, (Pt[:, 1].max() - Pt[:, 1].min()) * .85, th * .75, col2 * 1.5 if sp['crows'] else col * .95, metal=.4))
        for k in range(3): tur.merge(box(xr - .95, (k - 1) * .75, th * .45, .08, .5, th * .6, dark, metal=.4))
    if sp['crows']:
        tur.merge(cyl((xr + 1.5, -.7, th + .08), .13, .2, 'z', steel)); tur.merge(box(xr + 1.5, -.7, th + .28, .3, .22, .2, dark, metal=.8, spec=.9))
        tur.merge(cyl((xr + 1.8, -.7, th + .28), .025, .45, 'x', steel))
    # -------------- turret placement + state
    def place(M):
        M.rz(st.get('tyaw', 0.))
        if 'toff' in st:
            dx, dy, dz, yw, pt = st['toff']; M.ry(pt); M.rz(yw); M.mv(dx, dy, dz)
        return M.mv(sp['tx'], 0, zt + bob)
    place(tur); hull.mv(0, 0, bob)
    tip = Mesh(); tip.V = np.array([[gx0 + gl_len + .15, 0, gz]]); place(tip)
    m = Mesh().merge(trk).merge(hull).merge(tur)
    ch = st.get('char', 0.)
    if ch > 0:
        m.C = m.C * (1 - .88 * ch) + ch * np.array([.03, .025, .02]); m.K = m.K * (1 - .75 * ch)
    return m, dict(muzzle=tuple(tip.V[0]), zt=zt)

# ------------------------------------------------------------------ rasterizer (numba)
@njit(cache=True)
def raster_k(X, Y, D, Z, F, fid, zb, idb, zw):
    H, W = zb.shape
    for t in range(F.shape[0]):
        i0, i1, i2 = F[t, 0], F[t, 1], F[t, 2]
        x0, y0, x1, y1, x2, y2 = X[i0], Y[i0], X[i1], Y[i1], X[i2], Y[i2]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9: continue
        minx = max(int(math.floor(min(x0, min(x1, x2)))), 0); maxx = min(int(math.ceil(max(x0, max(x1, x2)))), W - 1)
        miny = max(int(math.floor(min(y0, min(y1, y2)))), 0); maxy = min(int(math.ceil(max(y0, max(y1, y2)))), H - 1)
        for py in range(miny, maxy + 1):
            for px in range(minx, maxx + 1):
                gx = px + .5; gy = py + .5
                a = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / den
                b = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / den
                c = 1 - a - b
                if a < -1e-6 or b < -1e-6 or c < -1e-6: continue
                d = a * D[i0] + b * D[i1] + c * D[i2]
                if d < zb[py, px]:
                    zb[py, px] = d; idb[py, px] = fid[t]; zw[py, px] = a * Z[i0] + b * Z[i1] + c * Z[i2]

@njit(cache=True)
def fill_k(X, Y, F, mask):
    H, W = mask.shape
    for t in range(F.shape[0]):
        i0, i1, i2 = F[t, 0], F[t, 1], F[t, 2]
        x0, y0, x1, y1, x2, y2 = X[i0], Y[i0], X[i1], Y[i1], X[i2], Y[i2]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9: continue
        minx = max(int(math.floor(min(x0, min(x1, x2)))), 0); maxx = min(int(math.ceil(max(x0, max(x1, x2)))), W - 1)
        miny = max(int(math.floor(min(y0, min(y1, y2)))), 0); maxy = min(int(math.ceil(max(y0, max(y1, y2)))), H - 1)
        for py in range(miny, maxy + 1):
            for px in range(minx, maxx + 1):
                gx = px + .5; gy = py + .5
                a = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / den
                b = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / den
                c = 1 - a - b
                if a >= -1e-6 and b >= -1e-6 and c >= -1e-6: mask[py, px] = 255

class Ctx:
    def __init__(s, S, sc, phi, cx, cy):
        s.rgb = np.zeros((S, S, 3), np.float32); s.a = np.zeros((S, S), np.float32)
        s.s, s.phi, s.cx, s.cy, s.sE = sc, phi, cx, cy, sE
    def P(s, x, y, z):
        c, sn = math.cos(s.phi), math.sin(s.phi); xr = x * c - y * sn; yr = x * sn + y * c
        return s.cx + xr * s.s, s.cy - (z * cE + yr * sE) * s.s
    def blob(s, sx, sy, rx, ry, col, al, pw=1.4):
        H, W = s.a.shape
        x0, x1 = max(int(sx - rx), 0), min(int(sx + rx) + 2, W); y0, y1 = max(int(sy - ry), 0), min(int(sy + ry) + 2, H)
        if x1 <= x0 or y1 <= y0 or al <= 0: return
        yy, xx = np.mgrid[y0:y1, x0:x1]
        w = (np.clip(1 - (((xx + .5 - sx) / rx) ** 2 + ((yy + .5 - sy) / ry) ** 2), 0, 1) ** pw * al).astype(np.float32)
        sa = s.a[y0:y1, x0:x1]; ao = w + sa * (1 - w)
        s.rgb[y0:y1, x0:x1] = (np.asarray(col, np.float32) * w[..., None] + s.rgb[y0:y1, x0:x1] * (sa * (1 - w))[..., None]) / np.maximum(ao, 1e-6)[..., None]
        s.a[y0:y1, x0:x1] = ao
    def ball(s, x, y, z, r, col, al, pw=1.4): 
        sx, sy = s.P(x, y, z); s.blob(sx, sy, r * s.s, r * s.s, col, al, pw)
    def ground(s, x, y, r, col, al, pw=1.2):
        sx, sy = s.P(x, y, 0); s.blob(sx, sy, r * s.s, r * s.s * sE, col, al, pw)

def render(mesh, k, cell, ss=3, fxb=None, fxf=None):
    phi = math.radians(90 - k * 360 / NFACE); c, sn = math.cos(phi), math.sin(phi)
    V = mesh.V.copy(); x, y = V[:, 0].copy(), V[:, 1].copy(); V[:, 0] = x * c - y * sn; V[:, 1] = x * sn + y * c
    S = cell * ss; sc = cell * PPM_K * ss; cx, cy = S * .5, S * .62
    X = cx + V[:, 0] * sc; Y = cy - (V[:, 2] * cE + V[:, 1] * sE) * sc; D = V[:, 1] * cE - V[:, 2] * sE; Zw = V[:, 2]
    F = mesh.F; n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    ndl = np.clip(n @ LIGHT, 0, 1); h = LIGHT - VIEW; h /= np.linalg.norm(h)
    spc = np.clip(n @ h, 0, 1) ** 28; rv = VIEW - 2 * (n @ VIEW)[:, None] * n
    t = np.clip(rv[:, 2] * .5 + .5, 0, 1)[:, None]; env = SKY * t + GND * (1 - t)
    met, sp_ = mesh.K[:, :1], mesh.K[:, 1:2]
    fc = mesh.C * (.34 + .78 * ndl[:, None]); fc = fc * (1 - .45 * met) + env * mesh.C * met * .85 + sp_ * spc[:, None] * np.array([1, .96, .88]) * (.25 + met)
    fc *= (.8 + .2 * np.clip(n[:, 2] * .5 + .5, 0, 1))[:, None]; fc = np.clip(fc, 0, 1).astype(np.float32)
    vis = np.where((n @ VIEW) < 0)[0]
    zb = np.full((S, S), 1e3, np.float32); idb = np.full((S, S), -1, np.int32); zw = np.zeros((S, S), np.float32)
    raster_k(X, Y, D, Zw, F[vis], vis.astype(np.int32), zb, idb, zw)
    ctx = Ctx(S, sc, phi, cx, cy)
    # shadow
    sh = np.zeros((S, S), np.uint8)
    Xs = cx + (V[:, 0] - V[:, 2] * LIGHT[0] / LIGHT[2]) * sc; Ys = cy - ((V[:, 1] - V[:, 2] * LIGHT[1] / LIGHT[2]) * sE) * sc
    fill_k(Xs, Ys, F, sh)
    sha = np.asarray(Image.fromarray(sh).filter(ImageFilter.GaussianBlur(1.3 * ss)), np.float32) / 255 * .5
    ctx.rgb[:] = (.02, .02, .04); ctx.a[:] = sha
    if fxb: fxb(ctx)
    body = idb >= 0
    img = fc[np.clip(idb, 0, None)] * (.72 + .28 * np.clip(zw / 2.6, 0, 1))[..., None]
    ex = np.zeros((S, S), bool); dz = np.zeros((S, S), np.float32)
    ex[:, 1:] |= idb[:, 1:] != idb[:, :-1]; ex[1:, :] |= idb[1:, :] != idb[:-1, :]
    dz[:, 1:] = np.maximum(dz[:, 1:], np.abs(zb[:, 1:] - zb[:, :-1])); dz[1:, :] = np.maximum(dz[1:, :], np.abs(zb[1:, :] - zb[:-1, :]))
    img *= np.where(ex & body & (dz < .15), .80, 1.0)[..., None]       # panel creases
    img *= np.where(ex & body & (dz >= .15) & (dz < 50), .55, 1.0)[..., None]  # contour lines
    ctx.rgb[body] = img[body]; ctx.a[body] = 1.0
    if fxf: fxf(ctx)
    out = np.dstack([np.clip(ctx.rgb, 0, 1) * 255, np.clip(ctx.a, 0, 1) * 255]).astype(np.uint8)
    return np.asarray(Image.fromarray(out, 'RGBA').resize((cell, cell), Image.LANCZOS))

# ------------------------------------------------------------------ effects
def fx_dust(c, sp, f, n):
    for i in range(7):
        age = ((i + f * 7 / n) / 7) % 1
        for sg in (-1, 1):
            c.ball(-sp['L'] / 2 - .4 - age * 2.4, sg * (.9 + .5 * (i % 3)) , .15 + age * .9, .35 + age * .8, (.62, .55, .43), .30 * (1 - age) ** 1.3, 1.0)

def fx_muzzle(c, info, f):
    mx, my, mz = info['muzzle']; fl = [1, .8, .45, .2, 0, 0][f]
    if fl > 0:
        for d, r, col in ((.2, .55, (1, .45, .08)), (.55, .38, (1, .75, .2)), (1.0, .25, (1, .95, .7)), (.0, .30, (1, 1, .9))):
            c.ball(mx + d * 1.4, my, mz, r * fl, col, .95 * fl)
    for i in range(4):
        age = (f + i * .5) / 6
        if f >= 1: c.ball(mx + 1.2 + age * 3 + i * .3, my + (i - 1.5) * .15, mz + age * .6, .35 + age * .8, (.55, .55, .55), .45 * (1 - age))

def fx_explode(c, sp, t, zt):
    rs = np.random.RandomState(3)
    r = .5 + 3.0 * min(1, t * 2.2); fade = 1 if t < .45 else max(0., 1 - (t - .45) / .75)
    if t < .5: c.ground(0, 0, r * 1.5, (1, .55, .1), .7 * (1 - t * 2), 1.2)
    sm = np.clip((t - .12) * 2, 0, 1)
    for i in range(7):
        ox, oy = rs.uniform(-1.2, 1.2, 2); h = 1.5 + t * 5.5 * rs.uniform(.6, 1.2)
        c.ball(ox + t * rs.uniform(-.5, .5), oy, h, .9 + t * 1.4, (.1, .1, .11), .55 * sm * (1 - .3 * t), 1.0)
    for li, (colr, s_, al) in enumerate([((.85, .22, .04), 1., .9), ((1, .5, .08), .78, .95), ((1, .85, .3), .52, .95), ((1, 1, .85), .28, .9)]):
        for i in range(8):
            o = rs.normal(0, .5, 3) * r * .6
            c.ball(o[0], o[1], zt + abs(o[2]) * .7, r * s_ * rs.uniform(.6, 1.), colr, al * fade * (1 if li < 3 else max(0, 1 - t * 3)), 1.3)
    for i in range(22):
        v = rs.uniform(-1, 1, 3) * np.array([4, 4, 1]) + np.array([0, 0, 6]) * rs.uniform(.4, 1)
        z = max(.1, zt + v[2] * t - 6 * t * t)
        if t > .04: c.ball(v[0] * t * .8, v[1] * t * .8, z, rs.uniform(.07, .16), (1, .5, .1) if i % 3 == 0 else (.12, .12, .13), .95)

def fx_wreck(c, sp, f, zt, scorch=1.0):
    d = wreck_off(sp); tx = sp['tx'] + d[0], d[1]
    srcs = [(-sp['L'] / 2 + 1.1, 0., zt + .15), (sp['tx'], 0., zt + .3), (tx[0], tx[1], .6)]
    rj = np.random.RandomState(100 + f)
    for (x, y, z) in srcs:
        for i in range(3):
            jx, jy = rj.uniform(-.12, .12, 2)
            c.ball(x + jx, y + jy, z + .15 + i * .18 + rj.uniform(0, .2), .30 - i * .06 + rj.uniform(0, .1), ((1, .45, .08), (1, .75, .2), (1, .95, .6))[i], .95)
        for i in range(8):
            age = ((i + 2 * f) / 8) % 1
            c.ball(x + age * .8, y, z + .3 + age * 3.2, .35 + age * .9, (.13, .13, .14), .5 * (1 - age) ** 1.2 * min(1, age * 6))

def fx_scorch(c, sp, al):
    c.ground(0, 0, 4.2, (.05, .04, .035), .55 * al, 1.0); c.ground(sp['tx'] + 1.1, 1.7, 2.2, (.05, .04, .035), .45 * al, 1.0)

# ------------------------------------------------------------------ frame tasks
def tank_frame(args):
    key, act, k, f, cell, ss = args
    sp = SPECS[key]; zt = sp['hz']; st = {}; fxb = fxf = None
    if act == 'move':
        st = dict(phase=f / NMOVE, bob=.022 * math.sin(4 * math.pi * f / NMOVE)); fxf = lambda c: fx_dust(c, sp, f, NMOVE)
    elif act == 'fire':
        rec = [.7, 1, .75, .45, .2, 0][f]; st = dict(recoil=rec, bob=-.012 * rec)
    elif act == 'wreck':
        st = dict(toff=wreck_off(sp), gun=.6, char=.85)
        fxb = lambda c: fx_scorch(c, sp, 1); fxf = lambda c: fx_wreck(c, sp, f, zt)
    elif act == 'explode':
        t = f / (NEXP - 1); u = min(1., max(0., (t - .08) / .62)); o = wreck_off(sp)
        st = dict(toff=(o[0] * u, o[1] * u, o[2] * u + 3.8 * math.sin(math.pi * u), o[3] * u + 6.28 * u, o[4] * u),
                  gun=1 - .4 * u, char=min(1., t * 2.5))
        fxb = lambda c: fx_scorch(c, sp, min(1, t * 2))
        fxf = lambda c: fx_explode(c, sp, t, zt)
    mesh, info = build(sp, st)
    if act == 'fire': fxf = lambda c: fx_muzzle(c, info, f)
    return render(mesh, k, cell, ss, fxb, fxf)

ACTIONS = {'idle': (NFACE, 1), 'move': (NFACE, NMOVE), 'fire': (NFACE, NFIRE), 'wreck': (NFACE, NWRECK), 'explode': (8, NEXP)}

def make_sheet(key, act, cell, ss, outdir, meta):
    rows, cols = ACTIONS[act]; sheet = Image.new('RGBA', (cols * cell, rows * cell), (0, 0, 0, 0))
    for r in range(rows):
        k = r * (NFACE // rows)
        for f in range(cols):
            sheet.paste(Image.fromarray(tank_frame((key, act, k, f, cell, ss)), 'RGBA'), (f * cell, r * cell))
    fn = f'{key}_{act}.png'; sheet.save(os.path.join(outdir, fn), optimize=True)
    meta[fn] = dict(cell=cell, rows=rows, cols=cols, facing_step_deg=360 / rows, row0='north', direction='clockwise')
    print('saved', fn, sheet.size, flush=True)

def preview(keys, cell, ss, outdir):
    cols = ['idle:3:0', 'move:3:2', 'fire:3:1', 'explode:4:2', 'explode:4:5', 'explode:4:8', 'explode:4:12', 'wreck:3:0']
    sheet = Image.new('RGBA', (len(cols) * cell, len(keys) * cell), (70, 74, 70, 255))
    for r, key in enumerate(keys):
        for c, s in enumerate(cols):
            a, k, f = s.split(':'); im = Image.fromarray(tank_frame((key, a, int(k), int(f), cell, ss)), 'RGBA'); sheet.alpha_composite(im, (c * cell, r * cell))
    sheet.save(os.path.join(outdir, 'preview_all.png')); print('saved preview_all.png')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--cell', type=int, default=256); ap.add_argument('--ss', type=int, default=3)
    ap.add_argument('--out', default='out'); ap.add_argument('--tanks', nargs='*', default=list(SPECS)); ap.add_argument('--preview-only', action='store_true')
    ap.add_argument('--actions', nargs='*', default=list(ACTIONS)); a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); preview(a.tanks, a.cell, a.ss, a.out)
    if not a.preview_only:
        meta = {}
        for key in a.tanks:
            for act in a.actions: make_sheet(key, act, a.cell, a.ss, a.out, meta)
        json.dump(meta, open(os.path.join(a.out, 'sheets.json'), 'w'), indent=1)
