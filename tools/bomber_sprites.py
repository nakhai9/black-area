"""
RA2-style sprite sheet generator: Tu-16 (USSR) & B-52H (USA)
Orthographic 2:1 (camera elevation 30 deg), z-buffer rasterizer, deferred shading.
Sheet layout (16 columns):
  R0-1  FLY      32 facings (frame 0 = screen-up, clockwise, 11.25 deg step)
  R2-3  SHADOW   32 facings (black, alpha ~0.5)
  R4    BOMBBAY  16 facings (every 2nd facing) bay doors open + bombs
  R5    c0-7 BOMB projectile 8 facings | c8-15 EXPLOSION 8 frames
  R6-9  CRASH    8 facings x 8 frames (2 facings per row)
  R10   WRECK    c0-3 burning, c4-5 smoldering, c6 smoke, c7 cold, c8-15 wreck shadow + debris variants
"""
import math, sys
import numpy as np
from PIL import Image, ImageDraw
from matplotlib.path import Path

SS = 3
SCALE = 2.4  # px per meter
C30, S30 = math.sqrt(3) / 2, 0.5
VIEW = np.array([0.0, -C30, S30])
def nz(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
LIGHT = nz([-0.55, 0.45, 0.85])
HALF = nz(LIGHT + VIEW)

FUSE, WING_U, WING_L, FIN, STAB, NAC, BLISTER, POD, PYLON, DOOR, BOMB, RADOME, GLASSB = range(13)

# ---------------------------------------------------------------- mesh
class Mesh:
    def __init__(self):
        self.V, self.N, self.T, self.P, self.C = [], [], [], [], []
    def add_grid(self, G, wrap=False, part=0, comp=0):
        G = np.asarray(G, float)
        nu, nv, _ = G.shape
        du = np.gradient(G, axis=0)
        dv = (np.roll(G, -1, 1) - np.roll(G, 1, 1)) if wrap else np.gradient(G, axis=1)
        Nn = np.cross(du, dv)
        nn = np.linalg.norm(Nn, axis=2, keepdims=True)
        dun = du / np.maximum(np.linalg.norm(du, axis=2, keepdims=True), 1e-9)
        Nn = np.where(nn > 1e-7, Nn / np.maximum(nn, 1e-9), dun)
        jmax = nv if wrap else nv - 1
        i, j = np.meshgrid(np.arange(nu - 1), np.arange(jmax), indexing="ij")
        i, j = i.ravel(), j.ravel()
        j1 = (j + 1) % nv
        a, b, c, d = (i, j), (i + 1, j), (i + 1, j1), (i, j1)
        for t in ((a, b, c), (a, c, d)):
            V = np.stack([G[p] for p in t], 1)
            N = np.stack([Nn[p] for p in t], 1)
            self.V.append(V); self.N.append(N); self.T.append(V.copy())
            self.P.append(np.full(len(V), part)); self.C.append(np.full(len(V), comp))
    def add_box(self, corners, part, comp=0):
        c = np.asarray(corners, float)  # 8 corners, index bits (x,y,z)
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        for f in faces:
            G = np.array([[c[f[0]], c[f[1]]], [c[f[3]], c[f[2]]]])
            self.add_grid(G, part=part, comp=comp)
    def merge(self, other):
        for k in "VNTPC": getattr(self, k).extend(getattr(other, k))
    def arrays(self):
        return (np.concatenate(self.V), np.concatenate(self.N), np.concatenate(self.T),
                np.concatenate(self.P), np.concatenate(self.C))

def loft(m, xs, ry, rz, zc, yc=0.0, n=20, power=2.0, part=FUSE, comp=0):
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    cy = np.sign(np.cos(th)) * np.abs(np.cos(th)) ** (2 / power)
    sz = np.sign(np.sin(th)) * np.abs(np.sin(th)) ** (2 / power)
    xs = np.asarray(xs, float)
    G = np.zeros((len(xs), n, 3))
    G[..., 0] = xs[:, None]
    G[..., 1] = yc + np.asarray(ry)[:, None] * cy[None]
    G[..., 2] = np.asarray(zc)[:, None] + np.asarray(rz)[:, None] * sz[None]
    m.add_grid(G, wrap=True, part=part, comp=comp)

def body(m, x0, x1, rprof, cy, cz, n=14, ns=16, part=NAC, comp=0, flat_ends=True, rz_scale=1.0):
    """body of revolution along x; rprof(t) t:0(front x0)..1(back x1); x0>x1"""
    t = np.linspace(0, 1, ns)
    xs = x0 + (x1 - x0) * t
    r = rprof(t)
    if flat_ends:
        xs = np.concatenate([[x0], xs, [x1]]); r = np.concatenate([[0], r, [0]])
    loft(m, xs, r, r * rz_scale, np.full(len(xs), cz), yc=cy, n=n, part=part, comp=comp)

def naca(t): return 5 * (0.2969 * np.sqrt(t) - 0.126 * t - 0.3516 * t**2 + 0.2843 * t**3 - 0.1036 * t**4)

def wing(m, root, tip, th_root, th_tip, side=1, vertical=False, ns=14, nc=10,
         parts=(WING_U, WING_L), comp=0, dihedral=0.0):
    """root/tip = (span_pos, x_le, chord, base_height)"""
    s = np.linspace(0, 1, ns)[:, None]
    t = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, nc)))[None, :]
    sp = root[0] + (tip[0] - root[0]) * s
    xle = root[1] + (tip[1] - root[1]) * s
    ch = root[2] + (tip[2] - root[2]) * s
    h0 = root[3] + (sp - root[0]) * math.tan(math.radians(dihedral))
    th = th_root + (th_tip - th_root) * s
    half = th * naca(t) * np.ones_like(s)
    x = xle - t * ch
    def mk(sign):
        G = np.zeros((ns, nc, 3))
        if vertical:
            G[..., 0] = x; G[..., 1] = sign * half; G[..., 2] = sp * np.ones_like(t)
        else:
            G[..., 0] = x; G[..., 1] = side * sp * np.ones_like(t); G[..., 2] = h0 + sign * half
        return G
    up, lo = mk(1), mk(-1)
    m.add_grid(up, part=parts[0], comp=comp)
    m.add_grid(lo, part=parts[1], comp=comp)
    m.add_grid(np.stack([up[-1], lo[-1]]), part=parts[0], comp=comp)
    m.add_grid(np.stack([up[0], lo[0]]), part=parts[1], comp=comp)

def box_c(x0, x1, y0, y1, z0, z1):
    return [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]

def rot_x(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def bomb_mesh(m, cx, cy, cz, L, r, part=BOMB, comp=0, fins=True):
    prof = lambda t: r * np.where(t < 0.28, np.sqrt(np.clip(t / 0.28, 0, 1)) * 0.98 + 0.02,
                                  np.where(t < 0.72, 1.0, 1.0 - 0.65 * (t - 0.72) / 0.28))
    body(m, cx + L / 2, cx - L / 2, prof, cy, cz, n=10, ns=12, part=part, comp=comp)
    if fins:
        xa, xb = cx - L / 2 - 0.05, cx - L / 2 + 0.28 * L
        f = r * 1.25
        m.add_box(box_c(xa, xb, cy - f, cy + f, cz - 0.02, cz + 0.02), part, comp)
        m.add_box(box_c(xa, xb, cy - 0.02, cy + 0.02, cz - f, cz + f), part, comp)

# ---------------------------------------------------------------- insignia helpers
def star_path(cu, cv, R, inner=0.382):
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = R if k % 2 == 0 else R * inner
        pts.append((cu + rr * math.cos(a), cv + rr * math.sin(a)))
    return Path(pts)

def in_star(u, v, cu, cv, R):
    pts = np.stack([np.asarray(u - cu, float) * np.ones_like(v), np.asarray(v - cv, float) * np.ones_like(u)], 1)
    if len(pts) == 0: return np.zeros(0, bool)
    return star_path(0.0, 0.0, R).contains_points(pts)

def soviet_star(col, u, v, cu, cv, R):
    red, white = np.array([0.78, 0.08, 0.07]), np.array([0.95, 0.95, 0.93])
    m1 = in_star(u, v, cu, cv, R); col[m1] = red
    m2 = in_star(u, v, cu, cv, R * 0.88); col[m2] = white
    m3 = in_star(u, v, cu, cv, R * 0.74); col[m3] = red
    return col

def usaf_roundel(col, u, v, cu, cv, R):
    blue, white, red = np.array([0.07, 0.13, 0.36]), np.array([0.93, 0.93, 0.92]), np.array([0.72, 0.08, 0.10])
    du, dv = u - cu, v - cv
    bar_o = (np.abs(du) < 2.0 * R + 0.12 * R) & (np.abs(dv) < 0.27 * R + 0.12 * R)
    disc_o = du**2 + dv**2 < (R * 1.06)**2
    col[bar_o | disc_o] = blue
    bar = (np.abs(du) < 2.0 * R) & (np.abs(dv) < 0.27 * R) & (np.abs(du) > 0.6 * R)
    col[bar] = white
    col[bar & (np.abs(dv) < 0.09 * R)] = red
    col[du**2 + dv**2 < R**2] = blue
    col[in_star(u, v, cu, cv, R)] = white
    return col

def panel(col, P, size=2.2, a=0.012):
    chk = ((np.floor(P[:, 0] / size) + np.floor((P[:, 1] + P[:, 2]) / (size * 0.8))) % 2) * 2 - 1
    line = (np.mod(P[:, 0] / size, 1) < 0.05)
    return col * (1 + a * chk)[:, None] * np.where(line, 0.94, 1.0)[:, None]

# ---------------------------------------------------------------- aircraft definitions
class Tu16:
    name = "Tu-16"
    cell = 112
    L = 17.4
    METAL = np.array([0.75, 0.77, 0.79])
    GLASS = np.array([0.20, 0.30, 0.40])
    spec, shininess, sky = 0.55, 22, 0.10
    bay = (-5.0, 1.5, 0.85)
    dmg_pt = np.array([-1.0, -2.1, -0.2])
    def prof(self, x):
        X = [-17.4, -17.2, -16.6, -15.5, -13, -8, 0, 10, 13, 14.8, 16.0, 16.9, 17.3, 17.4]
        R = [0.0, 0.32, 0.52, 0.66, 0.85, 1.15, 1.25, 1.25, 1.22, 1.08, 0.86, 0.55, 0.25, 0.0]
        zc = np.interp(x, [-17.4, -10, 0, 17.4], [0.55, 0.35, 0.0, -0.05])
        r = np.interp(x, X, R)
        return zc, r, r * 1.05
    def wing_le(self, y): return 4.0 + (-6.8 - 4.0) * (abs(y) - 1.2) / (16.5 - 1.2)
    def wing_ch(self, y): return 8.0 + (2.6 - 8.0) * (abs(y) - 1.2) / (16.5 - 1.2)
    def build(self, bay_open=False):
        m = Mesh()
        xs = self.L * np.sin(np.linspace(-np.pi / 2, np.pi / 2, 56))
        zc, ry, rz = self.prof(xs)
        loft(m, xs, ry, rz, zc, n=20, comp=1)
        for sd in (1, -1):
            wing(m, (1.2, 4.0, 8.0, -0.35), (16.5, -6.8, 2.6, -0.35), 1.15, 0.30, side=sd,
                 comp=2 if sd > 0 else 3, dihedral=-3.0)
            # engine nacelles at wing root
            nprof = lambda t: np.interp(t, [0, 0.04, 0.15, 0.7, 1], [0.92, 1.02, 1.08, 1.0, 0.72])
            body(m, 5.9, -9.6, nprof, sd * 2.05, -0.2, n=16, ns=18, part=NAC, comp=1)
            # main gear pods on wing trailing edge
            y = 6.4
            gprof = lambda t: np.interp(t, [0, 0.15, 0.6, 1], [0.15, 0.5, 0.55, 0.12])
            body(m, self.wing_le(y) - 1.6, self.wing_le(y) - self.wing_ch(y) - 4.2, gprof, sd * y,
                 -0.35 - 0.6 * math.tan(math.radians(3)) - 0.15, n=10, ns=10, part=POD, comp=2 if sd > 0 else 3)
            # stabilisers
            wing(m, (0.5, -12.9, 4.3, 0.6), (5.9, -16.2, 1.6, 0.6), 0.35, 0.12, side=sd,
                 parts=(STAB, STAB), comp=4, ns=8, nc=8, dihedral=3)
        # vertical fin
        wing(m, (0.9, -9.4, 7.2, 0), (6.6, -15.3, 2.3, 0), 0.5, 0.18, vertical=True,
             parts=(FIN, FIN), comp=4, ns=10, nc=10)
        # chin radome, turrets
        body(m, 13.4, 10.4, lambda t: 0.55 * np.sin(np.pi * np.clip(t, 0.02, 0.98)) ** 0.6, 0, -1.25,
             n=12, ns=10, part=RADOME, comp=1, rz_scale=0.8)
        body(m, -7.0, -8.6, lambda t: 0.48 * np.sin(np.pi * np.clip(t, 0.02, 0.98)) ** 0.6, 0, 1.35,
             n=12, ns=8, part=BLISTER, comp=1, rz_scale=0.8)
        body(m, -10.3, -11.8, lambda t: 0.45 * np.sin(np.pi * np.clip(t, 0.02, 0.98)) ** 0.6, 0, -0.85,
             n=12, ns=8, part=BLISTER, comp=4, rz_scale=0.8)
        if bay_open: self.add_bay(m, n_bombs=[(-3.6, 0), (-1.6, 0), (0.4, 0)], L=1.9, r=0.25)
        return m
    def add_bay(self, m, n_bombs, L, r):
        x0, x1, hy = self.bay
        zc, ry, rz = self.prof(np.array([(x0 + x1) / 2]))
        zb = float(zc[0] - rz[0] * 0.93)
        for sd in (1, -1):
            dm = Mesh()
            dm.add_box(box_c(x0, x1, 0, 0.06, -hy * 1.15, 0), DOOR, comp=1)
            V, N, T, P, C = dm.arrays()
            R = rot_x(math.radians(-8 if sd > 0 else 8))
            V = V @ R.T; N = N @ R.T
            V[..., 1] = V[..., 1] * sd + sd * hy; V[..., 2] += zb
            m.V.append(V); m.N.append(N); m.T.append(V.copy()); m.P.append(P); m.C.append(C)
        for bx, by in n_bombs:
            bomb_mesh(m, bx, by, zb + 0.05, L, r, comp=1)
    def colorize(self, part, P, ctx):
        n = len(P)
        col = np.tile(self.METAL, (n, 1))
        col = panel(col, P)
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        if part == FUSE:
            zc, ry, rz = self.prof(x)
            rel = (z - zc) / np.maximum(rz, 1e-3)
            ang = np.arctan2(z - zc, y)
            glass = np.zeros(n, bool); frame = np.zeros(n, bool)
            g1 = x > 15.2
            frame |= g1 & ((np.mod((x - 15.2) / 0.55, 1) < 0.2) | (np.mod(ang / (2 * np.pi) * 10, 1) < 0.12))
            glass |= g1
            g2 = (x > 10.7) & (x < 13.8) & (rel > 0.55)
            frame |= g2 & (np.mod((x - 10.7) / 0.78, 1) < 0.16)
            glass |= g2
            g3 = (x < -16.0) & (rel > -0.5)
            frame |= g3 & (np.mod(ang / (2 * np.pi) * 8, 1) < 0.15)
            glass |= g3
            col[glass] = self.GLASS; col[glass & frame] = self.METAL * 0.9
            # nose bort number area (red) on sides
            bort = (x > 8.8) & (x < 10.2) & (np.abs(rel) < 0.25) & (np.mod(x * 2.1, 1) < 0.55)
            col[bort] = [0.75, 0.1, 0.08]
            if ctx.get("bay"):
                x0, x1, hy = self.bay
                bay = (x > x0) & (x < x1) & (np.abs(y) < hy) & (rel < -0.55)
                col[bay] = [0.06, 0.06, 0.07]
        elif part in (WING_U, WING_L):
            yc = 11.5 * np.sign(y); xc = self.wing_le(11.5) - self.wing_ch(11.5) * 0.48
            col = soviet_star(col, y, x, yc, xc, 1.25)
        elif part == FIN:
            col = soviet_star(col, -x, z, 13.6, 3.5, 1.25)
        elif part == NAC:
            col[(x > 5.75) | (x < -9.45)] = [0.10, 0.10, 0.11]
        elif part in (BLISTER,):
            col[:] = self.GLASS
        elif part == RADOME:
            col[:] = [0.45, 0.49, 0.47]
        elif part == DOOR:
            col *= 0.85
        elif part == BOMB:
            col[:] = [0.36, 0.40, 0.34]
            col[np.mod(x * 2.2, 1) < 0.1] = [0.8, 0.7, 0.2]
        return col

class B52:
    name = "B-52H"
    cell = 160
    L = 24.2
    GRAY = np.array([0.44, 0.46, 0.48])
    GLASS = np.array([0.12, 0.17, 0.22])
    spec, shininess, sky = 0.22, 14, 0.05
    bay = (-4.5, 5.0, 1.1)
    dmg_pt = np.array([0.0, -9.5, -0.3])
    def prof(self, x):
        X = [-24.2, -23.9, -22.5, -16, -8, 0, 16, 19, 21, 22.8, 23.8, 24.2]
        RY = [0, 0.35, 0.55, 0.9, 1.4, 1.45, 1.45, 1.42, 1.3, 1.0, 0.55, 0]
        RZ = [0, 0.40, 0.62, 1.1, 1.75, 1.85, 1.85, 1.75, 1.55, 1.15, 0.6, 0]
        zc = np.interp(x, [-24.2, -14, 0, 19, 24.2], [0.9, 0.6, 0.0, -0.05, -0.25])
        return zc, np.interp(x, X, RY), np.interp(x, X, RZ)
    def wing_le(self, y): return 7.0 - math.tan(math.radians(36)) * (abs(y) - 1.4)
    def wing_ch(self, y): return 12.5 + (3.2 - 12.5) * (abs(y) - 1.4) / (28.2 - 1.4)
    WZ = 1.45
    def build(self, bay_open=False):
        m = Mesh()
        xs = self.L * np.sin(np.linspace(-np.pi / 2, np.pi / 2, 64))
        zc, ry, rz = self.prof(xs)
        loft(m, xs, ry, rz, zc, n=22, power=2.6, comp=1)
        tip_le = self.wing_le(28.2)
        for sd in (1, -1):
            cp = 2 if sd > 0 else 3
            wing(m, (1.4, 7.0, 12.5, self.WZ), (28.2, tip_le, 3.2, self.WZ), 1.25, 0.35, side=sd,
                 comp=cp, ns=18, nc=10)
            for yc in (9.5, 16.5):
                xf = self.wing_le(yc) + 3.4
                pz = self.WZ - 1.75
                eprof = lambda t: np.interp(t, [0, 0.05, 0.2, 0.75, 1], [0.52, 0.62, 0.64, 0.6, 0.42])
                for dy in (-0.62, 0.62):
                    body(m, xf, xf - 6.4, eprof, sd * yc + dy, pz, n=12, ns=12, part=NAC, comp=cp)
                m.add_box(box_c(xf - 4.6, xf - 1.2, sd * yc - 0.16, sd * yc + 0.16, pz + 0.4, self.WZ),
                          PYLON, cp)
            # external tank
            yt = 22.4; xt = self.wing_le(yt) + 1.8
            tprof = lambda t: 0.5 * np.sin(np.pi * np.clip(t, 0.03, 0.97)) ** 0.5
            body(m, xt, xt - 6.8, tprof, sd * yt, self.WZ - 0.85, n=10, ns=12, part=POD, comp=cp)
            # outrigger gear fairing
            yo = 24.6; xo = self.wing_le(yo) - 0.6
            body(m, xo, xo - 2.6, lambda t: 0.25 * np.sin(np.pi * np.clip(t, 0.05, 0.95)) ** 0.5,
                 sd * yo, self.WZ - 0.4, n=8, ns=8, part=POD, comp=cp)
            # horizontal stabiliser
            wing(m, (0.7, -16.0, 5.6, 0.85), (7.8, -20.4, 2.0, 0.85), 0.45, 0.15, side=sd,
                 parts=(STAB, STAB), comp=4, ns=8, nc=8)
        wing(m, (1.4, -11.8, 10.0, 0), (8.8, -19.6, 4.2, 0), 0.6, 0.25, vertical=True,
             parts=(FIN, FIN), comp=4, ns=10, nc=10)
        # EVS chin blisters
        for dy in (-0.5, 0.5):
            body(m, 21.4, 20.0, lambda t: 0.32 * np.sin(np.pi * np.clip(t, 0.03, 0.97)) ** 0.6,
                 dy, -1.45, n=10, ns=8, part=GLASSB, comp=1)
        if bay_open:
            self.add_bay(m, [(bx, by) for bx in (-3.0, -0.4, 2.2) for by in (-0.45, 0.45)], L=2.2, r=0.2)
        return m
    add_bay = Tu16.add_bay
    def colorize(self, part, P, ctx):
        n = len(P)
        col = np.tile(self.GRAY, (n, 1))
        col = panel(col, P, a=0.025)
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        if part == FUSE:
            zc, ry, rz = self.prof(x)
            rel = (z - zc) / np.maximum(rz, 1e-3)
            col[x > 22.6] = [0.30, 0.31, 0.33]
            win = (x > 18.7) & (x < 20.7) & (rel > 0.35) & (rel < 0.86)
            frame = np.mod((x - 18.7) / 0.5, 1) < 0.2
            col[win & ~frame] = self.GLASS
            side = np.abs(y) > 0.55 * ry
            ins = side & (np.abs(x + 7.0) < 2.2) & (np.abs(z - zc) < 1.2)
            if ins.any():
                c2 = usaf_roundel(col[ins].copy(), x[ins] * np.sign(y[ins]), z[ins],
                                  -7.0 * np.sign(y[ins]), zc[ins], 0.75)
                col[ins] = c2
            if ctx.get("bay"):
                x0, x1, hy = self.bay
                bay = (x > x0) & (x < x1) & (np.abs(y) < hy) & (rel < -0.55)
                col[bay] = [0.05, 0.05, 0.06]
        elif part == WING_U:
            yc = 20.0; xc = self.wing_le(yc) - self.wing_ch(yc) * 0.45
            sel = y > 0
            c2 = usaf_roundel(col[sel].copy(), y[sel], x[sel], yc, xc, 1.25); col[sel] = c2
        elif part == WING_L:
            yc = -20.0; xc = self.wing_le(yc) - self.wing_ch(yc) * 0.45
            sel = y < 0
            c2 = usaf_roundel(col[sel].copy(), y[sel], x[sel], yc, xc, 1.25); col[sel] = c2
        elif part == FIN:
            col[(z > 7.0) & (z < 7.7)] = [0.62, 0.10, 0.10]
            col[(z > 7.7) & (z < 7.9)] = [0.10, 0.10, 0.12]
        elif part == NAC:
            fr = np.zeros(n, bool)
            for yc in (9.5, 16.5):
                xf = self.wing_le(yc) + 3.4
                near = np.abs(np.abs(y) - yc) < 1.4
                fr |= near & ((x > xf - 0.12) | (x < xf - 6.3))
            col[fr] = [0.09, 0.09, 0.10]
        elif part == GLASSB:
            col[:] = [0.12, 0.12, 0.13]
        elif part == DOOR:
            col *= 0.8
        elif part == BOMB:
            col[:] = [0.30, 0.33, 0.20]
            col[np.abs(x - np.round(x / 2.6) * 2.6 - 0.75) < 0.07] = [0.85, 0.75, 0.15]
        return col

# ---------------------------------------------------------------- render core
def rot_model(heading_deg, pitch_deg=0.0, roll_deg=0.0):
    a = math.radians(heading_deg)
    f = np.array([math.sin(a), math.cos(a), 0.0]); l = np.array([-math.cos(a), math.sin(a), 0.0]); u = np.array([0, 0, 1.0])
    B = np.stack([f, l, u], 1)  # model->world basis
    th, ph = math.radians(pitch_deg), math.radians(roll_deg)
    Ry = np.array([[math.cos(th), 0, -math.sin(th)], [0, 1, 0], [math.sin(th), 0, math.cos(th)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(ph), -math.sin(ph)], [0, math.sin(ph), math.cos(ph)]])
    return B @ Ry @ Rx

def project(W, scale, cw, ch, off=(0.0, 0.0)):
    sx = W[..., 0] * scale + cw / 2 + off[0]
    sy = -(W[..., 1] * S30 + W[..., 2] * C30) * scale + ch / 2 + off[1]
    d = -W[..., 1] * C30 + W[..., 2] * S30
    return sx, sy, d

def raster(sx, sy, d, w, h):
    zb = np.full((h, w), -np.inf); ib = np.full((h, w), -1, np.int64)
    for t in range(len(sx)):
        x, y, z = sx[t], sy[t], d[t]
        x0 = max(int(math.floor(x.min())), 0); x1 = min(int(math.ceil(x.max())), w - 1)
        y0 = max(int(math.floor(y.min())), 0); y1 = min(int(math.ceil(y.max())), h - 1)
        if x0 > x1 or y0 > y1: continue
        area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0])
        if abs(area) < 1e-9: continue
        PX = np.arange(x0, x1 + 1)[None, :] + 0.5; PY = np.arange(y0, y1 + 1)[:, None] + 0.5
        w0 = ((x[1] - PX) * (y[2] - PY) - (x[2] - PX) * (y[1] - PY)) / area
        w1 = ((PX - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (PY - y[0])) / area
        w2 = 1 - w0 - w1
        m = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not m.any(): continue
        zz = w0 * z[0] + w1 * z[1] + w2 * z[2]
        sub = zb[y0:y1 + 1, x0:x1 + 1]; isub = ib[y0:y1 + 1, x0:x1 + 1]
        u = m & (zz > sub)
        sub[u] = zz[u]; isub[u] = t
    return ib

def _vnoise(P, seed):
    i = np.floor(P).astype(np.int64); fr = P - i; fr = fr * fr * (3 - 2 * fr)
    def h(ix, iy, iz):
        v = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
        v = (v ^ (v >> 13)) * 1274126177
        return ((v ^ (v >> 16)) & 0xFFFF) / 65535.0 * 2 - 1
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fr[:, 0] if dx else 1 - fr[:, 0]) * (fr[:, 1] if dy else 1 - fr[:, 1]) * (fr[:, 2] if dz else 1 - fr[:, 2])
                out = out + w * h(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz)
    return out

def noise3(P, f=1.3, seed=0):
    return 0.65 * _vnoise(P * f * 0.5, seed) + 0.35 * _vnoise(P * f * 1.3, seed + 1)

def shade(ac, mesh_arrays, Rw, scale, cw, ch, ctx=None, off=(0.0, 0.0), world_override=None):
    """returns premultiplied RGBA float (ch, cw, 4) at final res"""
    ctx = ctx or {}
    V, N, T, P, C = mesh_arrays
    W = V @ Rw.T if world_override is None else world_override
    NW = N @ Rw.T if world_override is None else ctx["NW"]
    w, h = cw * SS, ch * SS
    sx, sy, d = project(W, scale * SS, w, h, (off[0] * SS, off[1] * SS))
    ib = raster(sx, sy, d, w, h)
    out = np.zeros((h, w, 4))
    msk = ib >= 0
    if msk.any():
        yy, xx = np.nonzero(msk); t = ib[msk]
        px, py = xx + 0.5, yy + 0.5
        X, Y = sx[t], sy[t]
        area = (X[:, 1] - X[:, 0]) * (Y[:, 2] - Y[:, 0]) - (X[:, 2] - X[:, 0]) * (Y[:, 1] - Y[:, 0])
        b0 = ((X[:, 1] - px) * (Y[:, 2] - py) - (X[:, 2] - px) * (Y[:, 1] - py)) / area
        b1 = ((px - X[:, 0]) * (Y[:, 2] - Y[:, 0]) - (X[:, 2] - X[:, 0]) * (py - Y[:, 0])) / area
        b = np.clip(np.stack([b0, b1, 1 - b0 - b1], 1), 0, 1)
        Pl = np.einsum("nk,nkc->nc", b, T[t])
        Nw = np.einsum("nk,nkc->nc", b, NW[t])
        Nw /= np.maximum(np.linalg.norm(Nw, axis=1, keepdims=True), 1e-9)
        flip = (Nw @ VIEW) < 0
        Nw[flip] *= -1
        parts = P[t]
        base = np.zeros((len(t), 3))
        for p in np.unique(parts):
            s = parts == p
            base[s] = ac.colorize(int(p), Pl[s], ctx)
        if ctx.get("damage", 0) > 0:
            dd = np.linalg.norm(Pl - ac.dmg_pt, axis=1)
            k = np.clip(np.exp(-(dd / 4.0) ** 2) * ctx["damage"] * (0.8 + 0.5 * noise3(Pl, 1.5, 3)), 0, 0.95)
            base = base * (1 - k[:, None]) + np.array([0.08, 0.07, 0.06]) * k[:, None]
        if ctx.get("char", 0) > 0:
            nn = noise3(Pl, 0.9, 7)
            k = np.clip(ctx["char"] * (0.6 + 1.1 * nn), 0, 1)
            base = base * (1 - k[:, None]) + np.array([0.09, 0.08, 0.07]) * k[:, None]
        ndl = np.clip(Nw @ LIGHT, 0, 1)
        ndh = np.clip(Nw @ HALF, 0, 1)
        spec = ac.spec * (1 - ctx.get("char", 0) * 0.9)
        glassy = np.isin(parts, [BLISTER, GLASSB])
        col = base * (0.55 + 0.6 * ndl)[:, None] * (0.88 + 0.12 * Nw[:, 2])[:, None]
        col += (spec * ndh ** ac.shininess + glassy * 0.35 * ndh ** 40)[:, None]
        col += ac.sky * np.clip(Nw[:, 2], 0, 1)[:, None] * np.array([0.6, 0.75, 1.0])
        out[yy, xx, :3] = np.clip(col, 0, 1); out[yy, xx, 3] = 1
    return out.reshape(ch, SS, cw, SS, 4).mean((1, 3))

def shadow_layer(W, scale, cw, ch, light_proj=False, alpha=0.5, off=(0.0, 0.0)):
    W = W.copy()
    if light_proj:
        W = W - LIGHT[None, None, :] * (W[..., 2:3] / LIGHT[2])
    W[..., 2] = 0
    sx, sy, _ = project(W, scale * SS, cw * SS, ch * SS, (off[0] * SS, off[1] * SS))
    img = Image.new("L", (cw * SS, ch * SS), 0)
    dr = ImageDraw.Draw(img)
    for t in range(len(sx)):
        dr.polygon(list(zip(sx[t], sy[t])), fill=255)
    a = np.asarray(img, float).reshape(ch, SS, cw, SS).mean((1, 3)) / 255 * alpha
    out = np.zeros((ch, cw, 4)); out[..., 3] = a
    return out

def over(top, bot):
    return top + bot * (1 - top[..., 3:4])

def blob(img, cx, cy, r, col, a, hard=1.5):
    h, w = img.shape[:2]
    x0, x1 = max(int(cx - r - 1), 0), min(int(cx + r + 2), w)
    y0, y1 = max(int(cy - r - 1), 0), min(int(cy + r + 2), h)
    if x0 >= x1 or y0 >= y1 or r <= 0.3: return
    X = np.arange(x0, x1)[None] + 0.5; Y = np.arange(y0, y1)[:, None] + 0.5
    d2 = ((X - cx) ** 2 + (Y - cy) ** 2) / (r * r)
    k = (np.clip(1 - d2, 0, 1) ** hard * a)[..., None]
    sub = img[y0:y1, x0:x1]
    src = np.concatenate([np.array(col, float) * k[..., 0][..., None] / 1.0, k], -1)
    img[y0:y1, x0:x1] = src + sub * (1 - k)

def fire(img, cx, cy, size, rng, intensity=1.0):
    for i in range(int(7 * intensity) + 3):
        ox, oy = rng.normal(0, size * 0.35), -abs(rng.normal(0, size * 0.6))
        r = size * rng.uniform(0.45, 0.9) * (1 - min(abs(oy) / (size * 2.2), 0.6))
        c = [1.0, rng.uniform(0.35, 0.6), 0.05]
        blob(img, cx + ox, cy + oy, r, c, 0.85)
    for i in range(3):
        blob(img, cx + rng.normal(0, size * 0.15), cy - abs(rng.normal(0, size * 0.2)), size * 0.45,
             [1.0, 0.92, 0.55], 0.95)

def smoke(img, cx, cy, r, rng, a=0.55, shade_=0.3):
    g = shade_ + rng.uniform(-0.05, 0.08)
    blob(img, cx, cy, r, [g, g, g * 0.97], a, hard=1.2)

def explosion(cw, ch, k, seed=11):
    img = np.zeros((ch, cw, 4))
    rng = np.random.default_rng(seed)
    cx, cy = cw / 2, ch * 0.6
    R = cw * 0.22
    t = k / 7
    pts = rng.normal(0, 1, (26, 2)); temp = rng.uniform(0, 1, 26)
    # scorch/dust ring on ground
    blob(img, cx, cy + R * 0.25, R * (0.6 + 0.9 * t), [0.18, 0.15, 0.12], 0.35 * (1 - t * 0.5), hard=0.8)
    for i in range(26):
        grow = 0.35 + 1.1 * t ** 0.6
        px = cx + pts[i, 0] * R * 0.45 * grow
        py = cy + pts[i, 1] * R * 0.25 * grow - R * 0.9 * t * (0.5 + temp[i])
        r = R * (0.25 + 0.3 * temp[i]) * grow
        heat = max(0.0, 1.0 - t * (1.4 + temp[i]))
        if heat > 0.05:
            c = [1.0, 0.45 + 0.5 * heat, 0.1 + 0.6 * heat ** 2]
            blob(img, px, py, r, c, 0.9)
        else:
            g = 0.22 + 0.25 * temp[i]
            blob(img, px, py, r * 1.15, [g, g, g], 0.6 * (1 - t ** 2.5), hard=1.1)
    if k < 3:
        blob(img, cx, cy - R * 0.2, R * (0.5 + 0.3 * k), [1, 1, 0.85], 0.95)
    return img

# ---------------------------------------------------------------- sheet builder
def build_sheet(ac, out_path):
    cs = ac.cell
    cols, rows = 16, 11
    sheet = np.zeros((rows * cs, cols * cs, 4))
    def put(img, r, c):
        sheet[r * cs:(r + 1) * cs, c * cs:(c + 1) * cs] = img
    base = ac.build().__class__  # noqa
    m_fly = ac.build().arrays()
    m_bay = ac.build(bay_open=True).arrays()
    # FLY + SHADOW
    for f in range(32):
        R = rot_model(f * 11.25)
        put(shade(ac, m_fly, R, SCALE, cs, cs), f // 16, f % 16)
        W = m_fly[0] @ R.T
        put(shadow_layer(W, SCALE, cs, cs), 2 + f // 16, f % 16)
        print(ac.name, "fly", f, flush=True)
    # BOMB BAY
    for i in range(16):
        R = rot_model(i * 22.5)
        put(shade(ac, m_bay, R, SCALE, cs, cs, {"bay": True}), 4, i)
    # BOMB projectile (enlarged x3 for readability)
    bm = Mesh()
    if isinstance(ac, B52): bomb_mesh(bm, 0, 0, 0, 2.2, 0.2)
    else: bomb_mesh(bm, 0, 0, 0, 1.9, 0.25)
    bma = bm.arrays()
    for i in range(8):
        R = rot_model(i * 45, pitch_deg=-50)
        put(shade(ac, bma, R, SCALE * 5, cs, cs), 5, i)
    for k in range(8):
        put(explosion(cs, cs, k), 5, 8 + k)
    # CRASH: 8 facings x 8 frames
    for fi in range(8):
        hd0 = fi * 45
        for k in range(8):
            pitch = -4 - 8.5 * k; roll = -9 * k; hd = hd0 + 2.5 * k
            R = rot_model(hd, pitch, roll)
            ctx = {"damage": 0.4 + 0.08 * k}
            plane = shade(ac, m_fly, R, SCALE, cs, cs, ctx)
            rng = np.random.default_rng(100 + fi * 8 + k)
            E = R @ ac.dmg_pt
            fwd = R @ np.array([1.0, 0, 0])
            vel = nz(fwd * 1.0 + np.array([0, 0, -0.35 - 0.06 * k]))
            back = np.zeros((cs, cs, 4))
            nseg = 22
            for s in range(nseg, 0, -1):
                dist = s * 1.6
                p = E - vel * dist + np.array([0, 0, 0.12 * dist]) + rng.normal(0, 0.25 * math.sqrt(s), 3)
                sx_, sy_, _ = project(p, SCALE, cs, cs)
                rr = (1.4 + 0.12 * dist) * SCALE * 0.75
                smoke(back, sx_, sy_, rr, rng, a=0.72 * (1 - s / (nseg + 4)), shade_=0.18 + 0.012 * s)
            fr = np.zeros((cs, cs, 4))
            ex, ey, _ = project(E, SCALE, cs, cs)
            fire(fr, ex, ey, SCALE * (1.2 + 0.12 * k), rng, intensity=0.8 + 0.1 * k)
            img = over(fr, over(plane, back))
            put(img, 6 + fi // 2, (fi % 2) * 8 + k)
        print(ac.name, "crash", fi, flush=True)
    # WRECK
    wv, wn, wt, wp, wc = [a.copy() for a in ac.build().arrays()]
    cen = wv.mean(1)
    split_x = -ac.L * 0.3
    pieces = []
    rear = cen[:, 0] < split_x
    rwing_out = (cen[:, 1] < -ac.L * 0.45) & ~rear
    lwing_tip = (cen[:, 1] > ac.L * 0.75) & ~rear
    front = ~rear & ~rwing_out & ~lwing_tip
    def rigid(mask, yaw, pitch, roll, t):
        R = rot_model(-yaw * 0 + 0, 0, 0)  # placeholder identity in model frame
        c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        th, ph = math.radians(pitch), math.radians(roll)
        Ry = np.array([[math.cos(th), 0, -math.sin(th)], [0, 1, 0], [math.sin(th), 0, math.cos(th)]])
        Rx = np.array([[1, 0, 0], [0, math.cos(ph), -math.sin(ph)], [0, math.sin(ph), math.cos(ph)]])
        Rr = Rz @ Ry @ Rx
        piv = wv[mask].reshape(-1, 3).mean(0)
        wv[mask] = (wv[mask] - piv) @ Rr.T + piv + np.array(t)
        wn[mask] = wn[mask] @ Rr.T
    rigid(rear, 32, 4, -14, (-ac.L * 0.18, ac.L * 0.12, 0))
    rigid(rwing_out, -38, 0, 12, (-ac.L * 0.08, -ac.L * 0.14, 0))
    rigid(lwing_tip, 15, 0, -14, (-ac.L * 0.03, ac.L * 0.06, 0))
    rigid(front, -6, 1.5, 6, (0, 0, 0))
    wv[..., 2] -= wv[..., 2].min() + 0.6  # sink into ground
    Rw = rot_model(118)
    Ww = wv @ Rw.T
    Ww[..., :2] -= Ww.reshape(-1, 3)[:, :2].mean(0)
    Ww[..., 1] -= ac.L * 0.12  # push slightly down-screen to leave room for smoke
    ctxw = {"char": 0.75, "NW": wn @ Rw.T}
    wreck = shade(ac, (wv, wn, wt, wp, wc), Rw, SCALE, cs, cs, ctxw, world_override=Ww)
    # clip below-ground: pixels already z-sorted; ground scorch & shadow
    scorch = np.zeros((cs, cs, 4))
    rng = np.random.default_rng(5)
    span_px = ac.L * SCALE
    for i in range(40):
        a_ = rng.uniform(0, 6.28); rr = rng.uniform(0, 0.9) * span_px
        blob(scorch, cs / 2 + math.cos(a_) * rr, cs / 2 + math.sin(a_) * rr * 0.5,
             span_px * rng.uniform(0.18, 0.35), [0.10, 0.08, 0.06], 0.45, hard=0.9)
    for i in range(30):  # debris bits
        a_ = rng.uniform(0, 6.28); rr = rng.uniform(0.2, 1.1) * span_px
        g = rng.uniform(0.15, 0.4)
        blob(scorch, cs / 2 + math.cos(a_) * rr, cs / 2 + math.sin(a_) * rr * 0.5, rng.uniform(0.8, 1.8),
             [g, g * 0.95, g * 0.9], 1.0, hard=0.3)
    shd = shadow_layer(Ww, SCALE, cs, cs, light_proj=True, alpha=0.55)
    ground = over(shd, scorch)
    wreck_g = over(wreck, ground)
    # fire anchor points: break points & engines (world)
    anchors_m = [np.array([split_x, 0, 0]), ac.dmg_pt, np.array([ac.dmg_pt[0], -ac.dmg_pt[1], ac.dmg_pt[2]])]
    anchors = []
    for a_m in anchors_m:
        dd = np.linalg.norm(wt.reshape(-1, 3) - a_m, axis=1)
        anchors.append(Ww.reshape(-1, 3)[np.argmin(dd)] + np.array([0, 0, 0.8]))
    for k in range(8):
        rng = np.random.default_rng(300 + k)
        sm = np.zeros((cs, cs, 4)); fr = np.zeros((cs, cs, 4))
        if k <= 6:
            strength = [1, 1, 1, 1, 0.55, 0.5, 0.25][k]
            for ai, A in enumerate(anchors):
                ax, ay, _ = project(A, SCALE, cs, cs)
                for s in range(12):
                    up = s * (cs * 0.045)
                    drift = s * 1.2 + rng.normal(0, 1.2)
                    smoke(sm, ax + drift, ay - up - 4, (2.5 + s * 0.9) * (0.6 + 0.4 * strength), rng,
                          a=0.5 * strength * (1 - s / 13), shade_=0.16 + 0.02 * s)
                if k <= 3:
                    fire(fr, ax, ay, SCALE * (2.6 if ai == 0 else 1.9), rng, 1.4)
                elif k <= 5:
                    for e in range(4):
                        blob(fr, ax + rng.normal(0, 3), ay + rng.normal(0, 1.5), rng.uniform(1, 2),
                             [1.0, 0.45, 0.08], 0.9)
        put(over(fr, over(sm, wreck_g)), 10, k)
    # variants: shadow-only ground decal, wreck without effects, etc.
    put(ground, 10, 8)
    put(wreck_g, 10, 9)
    for k in range(6):
        put(explosion(cs, cs, min(k + 2, 7), seed=40 + k), 10, 10 + k)
    rgb = sheet[..., :3]; a = sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    img = np.concatenate([straight, a], -1)
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(out_path, optimize=True)
    print("saved", out_path, img.shape)

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which in ("tu16", "both"): build_sheet(Tu16(), "/mnt/user-data/outputs/tu16_sheet.png")
    if which in ("b52", "both"): build_sheet(B52(), "/mnt/user-data/outputs/b52_sheet.png")
