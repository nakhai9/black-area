"""
RA2-style sheets: Leopard 2A7 (DE), T-90M Proryv-3 (RU), Type 99A (CN).
Same 16x16 layout / 64px cells / pivot convention as m1_abrams_sheet.png.
Requires bomber_sprites.py + m1_abrams_sprites.py in the same folder.
"""
import math, sys
import numpy as np
import bomber_sprites as bs
from bomber_sprites import Mesh, noise3
from m1_abrams_sprites import (box, cyl_x, extrude_xy, extrude_xz, build_sheet,
                               HULL, TRACK, SKIRT, TURRET, GUN, OPTIC, RACK, DETAIL, MUZZLE)

ERA, SLAT, DRUM, RUBBER = 39, 40, 41, 42

def turn_z(m, start, ang, pivot):
    c, s = math.cos(ang), math.sin(ang)
    Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    for i in range(start, len(m.V)):
        m.V[i] = (m.V[i] - pivot) @ Rz.T + pivot; m.N[i] = m.N[i] @ Rz.T; m.T[i] = m.V[i].copy()

def pitch_y(m, start, deg, pivot):
    th = math.radians(deg)
    Ry = np.array([[math.cos(th), 0, -math.sin(th)], [0, 1, 0], [math.sin(th), 0, math.cos(th)]])
    for i in range(start, len(m.V)):
        m.V[i] = (m.V[i] - pivot) @ Ry.T + pivot; m.N[i] = m.N[i] @ Ry.T

def slab(m, p0, p1, t, y0, y1, part):
    """armour slab lying on a side-view segment p0->p1 (x,z), thickness t outward"""
    p0, p1 = np.array(p0, float), np.array(p1, float)
    d = p1 - p0; n = np.array([d[1], -d[0]]); n /= np.linalg.norm(n)
    if n[1] < 0 and n[0] < 0: n = -n
    extrude_xz(m, [tuple(p0), tuple(p1), tuple(p1 + n * t), tuple(p0 + n * t)], y0, y1, part)

class Tank:
    cell = 64
    spec, shininess, sky = 0.08, 10, 0.04
    dmg_pt = np.array([0.0, 0.0, 1.8])
    hx = 0.3
    hull_len, hull_top = 7.7, 1.4
    TRACK_Y0, TRACK_Y1 = 1.25, 1.85
    wheel_z, wheel_r = 0.40, 0.33
    n_wheels = 7
    trunnion = (1.5, 1.95)
    barrel = 6.6
    recoil_len = 0.35

    # -- derived
    @property
    def rear(self): return -self.hull_len / 2 + self.hx
    @property
    def front(self): return self.hull_len / 2 + self.hx
    @property
    def wheels_x(self):
        a, b = self.rear + 0.85, self.front - 1.0
        return np.linspace(a, b, self.n_wheels)
    @property
    def engine_pt(self): return np.array([self.rear + 1.0, 0, self.hull_top + 0.1])
    turret_top_pt = np.array([-0.5, 0, 2.3])

    def hull_profile(self):
        r, f, h = self.rear, self.front, self.hull_top
        return [(r, 0.42), (f - 0.6, 0.42), (f, 0.88), (f - 0.05, 1.05), (f - 1.4, h), (r, h)]

    def build_hull(self):
        m = Mesh()
        r, f, h = self.rear, self.front, self.hull_top
        y0, y1 = self.TRACK_Y0, self.TRACK_Y1
        extrude_xz(m, self.hull_profile(), -y0, y0, HULL)
        for sd in (1, -1):
            a, b = sorted([sd * y0, sd * y1])
            extrude_xz(m, [(r + 0.25, 0.03), (f - 0.5, 0.03), (f + 0.02, 0.48), (f + 0.02, 0.82), (f - 0.2, 0.95),
                           (r + 0.12, 0.95), (r - 0.06, 0.72), (r + 0.0, 0.38)], a, b, TRACK)
            fa, fb = sorted([sd * (y0 - 0.02), sd * (y1 + 0.04)])
            extrude_xz(m, [(r, 0.95), (f - 0.15, 0.95), (f + 0.05, 1.03), (f - 1.4, h), (r, h)], fa, fb, HULL)
            self.skirts(m, sd)
            box(m, f - 0.35, f - 0.1, sd * 1.4 - 0.12, sd * 1.4 + 0.12, 1.02, 1.2, DETAIL)
        box(m, r + 0.2, r + 2.0, -1.1, 1.1, h, h + 0.05, HULL)  # engine deck
        self.hull_extras(m)
        return m

    def skirts(self, m, sd):
        r, f, h = self.rear, self.front, self.hull_top
        ys = sorted([sd * (self.TRACK_Y1 + 0.04), sd * (self.TRACK_Y1 + 0.10)])
        extrude_xz(m, [(0.4 + self.hx, 0.5), (f - 0.45, 0.5), (f - 0.05, 0.95), (f - 0.05, h - 0.04),
                       (0.4 + self.hx, h - 0.04)], *ys, SKIRT)
        extrude_xz(m, [(r + 0.1, 0.56), (0.4 + self.hx, 0.56), (0.4 + self.hx, h - 0.04), (r + 0.1, h - 0.04)],
                   *ys, SKIRT)

    def hull_extras(self, m): pass

    def gun(self, m, recoil, gun_pitch, mantlet):
        start = len(m.V)
        tx, tz = self.trunnion
        x0m, x1m, wm, z0m, z1m = mantlet
        box(m, x0m, x1m, -wm, wm, z0m, z1m, TURRET)
        x0 = x1m - 0.1 - recoil
        L = self.barrel
        for a, b, rad, part in self.barrel_sections(x0, L):
            cyl_x(m, a, b, 0, tz, rad, part, n=12)
        if gun_pitch: pitch_y(m, start, gun_pitch, np.array([tx, 0, tz]))

    def barrel_sections(self, x0, L):
        return [(x0, x0 + L * 0.45, 0.13, GUN), (x0 + L * 0.45, x0 + L * 0.58, 0.17, GUN),
                (x0 + L * 0.58, x0 + L, 0.115, GUN), (x0 + L, x0 + L + 0.05, 0.125, MUZZLE)]

    def muzzle_local(self, recoil=0.0):
        return np.array([self.mantlet[1] - 0.1 - recoil + self.barrel + 0.1, 0, self.trunnion[1]])

    # ---------- colours
    def camo(self, P): raise NotImplementedError

    def colorize(self, part, P, ctx):
        n = len(P); x, y, z = P[:, 0], P[:, 1], P[:, 2]
        col = self.camo(P)
        col *= (1 + 0.04 * noise3(P, 2.2, 9))[:, None]
        ph = ctx.get("phase", 0) * 0.32 / 3
        if part == HULL:
            grille = (z > self.hull_top + 0.02) & (x < self.rear + 2.0) & (x > self.rear + 0.25) & \
                     (np.mod(x * 4, 1) < 0.45)
            col[grille] *= 0.55
            col[z < 0.5] *= 0.8
        elif part == TRACK:
            col[:] = [0.19, 0.18, 0.16]
            col[np.mod(x - ph, 0.32) < 0.13] = [0.31, 0.29, 0.26]
            side = np.abs(np.abs(y) - self.TRACK_Y1) < 0.05
            for cx in self.wheels_x:
                d = np.hypot(x - cx, z - self.wheel_z)
                ang = np.arctan2(z - self.wheel_z, x - cx) + ph * 6
                w = side & (d < self.wheel_r)
                col[w] = self.wheel_col
                col[w & (d > self.wheel_r * 0.83)] = [0.10, 0.10, 0.10]
                col[w & (d < 0.09)] = np.array(self.wheel_col) * 1.3
                col[w & (d > 0.13) & (d < 0.23) & (np.mod(ang * 6 / (2 * np.pi), 1) < 0.35)] *= 0.55
            for cx, cz, rr in ((self.rear + 0.25, 0.62, 0.3), (self.front - 0.3, 0.62, 0.28)):
                d = np.hypot(x - cx, z - cz)
                col[side & (d < rr)] = [0.27, 0.26, 0.22]
                col[side & (d < rr * 0.4)] = [0.14, 0.14, 0.13]
        elif part == SKIRT:
            col[np.mod(x / 0.9, 1) < 0.04] *= 0.8
        elif part == ERA:
            ln = (np.mod(y / 0.42, 1) < 0.08) | (np.mod((x + z) / 0.42, 1) < 0.08)
            col[ln] *= 0.62
        elif part == MUZZLE:
            col[:] = [0.09, 0.09, 0.09]
        elif part == OPTIC:
            col[:] = [0.25, 0.26, 0.25]
            col[(z > self.turret_top_pt[2] + 0.05) & (np.mod(z * 6, 1) < 0.5)] = [0.08, 0.12, 0.17]
        elif part in (RACK, SLAT):
            col[:] = [0.20, 0.20, 0.18]
        elif part == RUBBER:
            col[:] = [0.13, 0.13, 0.12]
        elif part == DRUM:
            col[:] = [0.26, 0.31, 0.18]
            col[np.mod(np.abs(y) * 3.0, 1) < 0.08] *= 0.7
        elif part == DETAIL:
            col[:] = self.detail_col
        return col

# ====================================================================== Leopard 2A7
class Leopard2(Tank):
    name = "Leopard 2A7"
    hx = 0.35
    hull_len, hull_top = 7.72, 1.42
    TRACK_Y0, TRACK_Y1 = 1.28, 1.88
    n_wheels = 7
    trunnion = (1.55, 1.95)
    mantlet = (1.2, 1.95, 0.42, 1.62, 2.22)
    barrel = 6.6
    wheel_col = [0.24, 0.27, 0.19]
    detail_col = [0.20, 0.22, 0.17]
    turret_top_pt = np.array([-0.8, 0, 2.38])
    GREEN, BROWN, BLACK = np.array([0.35, 0.41, 0.27]), np.array([0.44, 0.34, 0.24]), np.array([0.15, 0.15, 0.13])

    def camo(self, P):
        a = noise3(P, 1.2, 21); b = noise3(P, 1.4, 33)
        col = np.tile(self.GREEN, (len(P), 1))
        col[a > 0.22] = self.BROWN
        col[(b > 0.3) & (a <= 0.22)] = self.BLACK
        return col

    def barrel_sections(self, x0, L):  # L55: no muzzle brake, fume extractor ~mid, thermal sleeve
        return [(x0, x0 + L * 0.48, 0.125, GUN), (x0 + L * 0.48, x0 + L * 0.58, 0.16, GUN),
                (x0 + L * 0.58, x0 + L * 0.97, 0.115, GUN), (x0 + L * 0.97, x0 + L, 0.12, GUN),
                (x0 + L, x0 + L + 0.04, 0.12, MUZZLE)]

    def hull_extras(self, m):
        f = self.front
        slab(m, (f - 0.05, 0.98), (f - 1.4, self.hull_top), 0.12, -1.25, 1.25, HULL)   # A7 glacis add-on
        box(m, self.rear - 0.15, self.rear + 0.05, -1.3, 1.3, 0.9, 1.35, RACK)           # rear stowage

    def skirts(self, m, sd):
        r, f, h = self.rear, self.front, self.hull_top
        ys = sorted([sd * (self.TRACK_Y1 + 0.04), sd * (self.TRACK_Y1 + 0.14)])
        extrude_xz(m, [(0.9 + self.hx, 0.45), (f - 0.45, 0.45), (f - 0.02, 0.95), (f - 0.02, h - 0.02),
                       (0.9 + self.hx, h - 0.02)], *ys, SKIRT)
        for i, x0 in enumerate(np.arange(r + 0.1, 0.9 + self.hx - 0.01, 0.75)):
            extrude_xz(m, [(x0, 0.55), (x0 + 0.72, 0.55), (x0 + 0.72, h - 0.04), (x0, h - 0.04)],
                       *sorted([sd * (self.TRACK_Y1 + 0.03), sd * (self.TRACK_Y1 + 0.07)]), SKIRT)

    def build_turret(self, recoil=0.0, gun_pitch=0.0):
        m = Mesh()
        z0, z1 = 1.42, 2.36
        base = [(1.25, 0.45), (1.25, 1.72), (-2.75, 1.72), (-3.05, 1.35), (-3.05, -1.35), (-2.75, -1.72),
                (1.25, -1.72), (1.25, -0.45)]
        extrude_xy(m, base, z0, z1, TURRET, inset=0.985)
        for sd in (1, -1):   # arrowhead spaced-armour wedges
            extrude_xy(m, [(1.2, sd * 0.47), (1.2, sd * 1.72), (2.75, sd * 0.52)], 1.52, z1 - 0.02, TURRET)
            # smoke dischargers (2x4) on turret sides
            for k in range(4):
                cyl_x(m, -0.9 + k * 0.0, -0.55, sd * (1.76 + 0.0), 1.85 + k * 0.1, 0.045, DETAIL, n=6)
        # EMES-15 gunner sight (front right), PERI R17 (left rear), FLW-200 RWS, rear baskets
        box(m, 0.55, 1.15, -1.25, -0.75, z1, z1 + 0.32, OPTIC)
        bs.body(m, 0.0, -0.4, lambda t: np.full_like(t, 0.2), 0.85, z1 + 0.32, n=10, ns=2, part=OPTIC,
                rz_scale=1.6)
        box(m, -0.9, -0.3, -0.9, -0.4, z1, z1 + 0.35, DETAIL)
        cyl_x(m, -0.3, 0.45, -0.65, z1 + 0.28, 0.035, GUN, n=6)
        box(m, -3.5, -3.0, -1.5, 1.5, 1.55, 1.58, RACK)
        for yy in (-1.5, 1.48):
            box(m, -3.5, -3.0, yy, yy + 0.02, 1.55, 2.15, RACK)
        box(m, -3.52, -3.48, -1.5, 1.5, 1.55, 2.15, RACK)
        box(m, -3.42, -3.08, -1.35, 1.35, 1.58, 1.95, DETAIL)
        self.gun(m, recoil, gun_pitch, self.mantlet)
        return m

# ====================================================================== T-90M Proryv-3
class T90M(Tank):
    name = "T-90M Proryv-3"
    hx = 0.25
    hull_len, hull_top = 6.86, 1.32
    TRACK_Y0, TRACK_Y1 = 1.25, 1.86
    n_wheels = 6
    wheel_r = 0.36
    trunnion = (1.15, 1.78)
    mantlet = (1.0, 1.55, 0.38, 1.55, 2.0)
    barrel = 6.0
    wheel_col = [0.24, 0.29, 0.17]
    detail_col = [0.18, 0.21, 0.13]
    turret_top_pt = np.array([-0.4, 0, 2.2])
    GREEN = np.array([0.36, 0.42, 0.24])

    def camo(self, P):
        col = np.tile(self.GREEN, (len(P), 1))
        col *= (1 + 0.07 * noise3(P, 0.5, 44))[:, None]   # faded patches
        return col

    def hull_profile(self):
        r, f, h = self.rear, self.front, self.hull_top
        return [(r, 0.4), (f - 0.45, 0.4), (f, 0.78), (f - 1.9, h), (r, h)]

    def hull_extras(self, m):
        f, h, r = self.front, self.hull_top, self.rear
        slab(m, (f - 0.02, 0.82), (f - 1.85, h + 0.02), 0.2, -1.55, 1.55, ERA)     # Relikt on glacis
        extrude_xz(m, [(f - 0.4, 0.42), (f + 0.05, 0.42), (f + 0.05, 0.7), (f - 0.4, 0.7)], -1.6, 1.6, RUBBER)
        for sd in (1, -1):   # rear fuel drums (axis across hull)
            st = len(m.V)
            bs.body(m, 0.75, -0.75, lambda t: np.full_like(t, 0.3), 0, h + 0.15, n=12, ns=2, part=DRUM)
            turn_z(m, st, math.pi / 2, np.array([0, 0, 0]))
            for i in range(st, len(m.V)):
                m.V[i] = m.V[i] + np.array([r - 0.25, sd * 0.85, 0]); m.T[i] = m.V[i].copy()
        box(m, r + 0.5, r + 1.6, 1.0, 1.9, h, h + 0.06, SLAT)   # exhaust/side grille cover

    def skirts(self, m, sd):
        r, f, h = self.rear, self.front, self.hull_top
        ys = sorted([sd * (self.TRACK_Y1 + 0.04), sd * (self.TRACK_Y1 + 0.18)])
        extrude_xz(m, [(-0.2 + self.hx, 0.5), (f - 0.5, 0.5), (f - 0.15, 0.9), (f - 0.15, h - 0.02),
                       (-0.2 + self.hx, h - 0.02)], *ys, ERA)
        ys2 = sorted([sd * (self.TRACK_Y1 + 0.03), sd * (self.TRACK_Y1 + 0.06)])
        extrude_xz(m, [(r + 0.1, 0.62), (-0.2 + self.hx, 0.62), (-0.2 + self.hx, h - 0.04), (r + 0.1, h - 0.04)],
                   *ys2, RUBBER)

    def build_turret(self, recoil=0.0, gun_pitch=0.0):
        m = Mesh()
        z0, z1 = 1.32, 2.12
        base = [(1.0, 0.42), (0.9, 1.55), (-1.3, 1.6), (-1.75, 1.3), (-1.75, -1.3), (-1.3, -1.6),
                (0.9, -1.55), (1.0, -0.42)]
        extrude_xy(m, base, z0, z1, TURRET, inset=0.86)
        for sd in (1, -1):   # Relikt front modules forming a blunt V
            extrude_xy(m, [(0.95, sd * 0.44), (0.85, sd * 1.6), (1.95, sd * 0.48)], 1.45, 2.08, ERA, inset=0.97)
            extrude_xy(m, [(0.3, sd * 1.5), (0.85, sd * 1.6), (0.75, sd * 1.15), (0.3, sd * 1.1)], 2.08, 2.2,
                       ERA)   # roof ERA
            for k in range(4):
                cyl_x(m, 0.15, 0.5, sd * (1.62 - k * 0.12), 1.95, 0.045, DETAIL, n=6)
        # welded ammo bustle + slat cage
        box(m, -2.7, -1.6, -1.3, 1.3, 1.42, 2.02, TURRET)
        for yy in np.linspace(-1.35, 1.35, 13):
            box(m, -2.9, -2.86, yy - 0.02, yy + 0.02, 1.4, 2.05, SLAT)
        for zz in (1.42, 2.03):
            box(m, -2.9, -2.86, -1.38, 1.38, zz - 0.02, zz + 0.02, SLAT)
        for sd in (1, -1):
            for xx in np.linspace(-2.86, -1.75, 6):
                box(m, xx - 0.02, xx + 0.02, sd * 1.36 - 0.02, sd * 1.36 + 0.02, 1.4, 2.05, SLAT)
            box(m, -2.9, -1.75, sd * 1.36 - 0.02, sd * 1.36 + 0.02, 2.01, 2.05, SLAT)
        # Sosna-U gunner sight, commander PK-PAN + RWS, snorkel/stowage
        box(m, 0.35, 0.85, -1.1, -0.7, z1, z1 + 0.3, OPTIC)
        bs.body(m, 0.0, -0.45, lambda t: np.full_like(t, 0.22), -0.55, z1 + 0.38, n=10, ns=2, part=OPTIC,
                rz_scale=1.5)
        box(m, -0.55, -0.05, 0.4, 0.9, z1, z1 + 0.3, DETAIL)
        cyl_x(m, -0.05, 0.75, 0.65, z1 + 0.22, 0.04, GUN, n=6)
        cyl_x(m, -1.6, -0.2, 1.25, z1 + 0.05, 0.09, DETAIL, n=8)
        self.gun(m, recoil, gun_pitch, self.mantlet)
        return m

# ====================================================================== Type 99A
class Type99(Tank):
    name = "Type 99A"
    hx = 0.3
    hull_len, hull_top = 7.3, 1.42
    TRACK_Y0, TRACK_Y1 = 1.15, 1.74
    n_wheels = 6
    wheel_r = 0.36
    trunnion = (1.45, 1.92)
    mantlet = (1.1, 1.85, 0.4, 1.62, 2.18)
    barrel = 6.3
    wheel_col = [0.26, 0.29, 0.20]
    detail_col = [0.22, 0.24, 0.17]
    turret_top_pt = np.array([-0.6, 0, 2.35])
    PIX = [np.array(c) * 1.12 for c in ([0.35, 0.40, 0.25], [0.50, 0.50, 0.34], [0.20, 0.22, 0.16], [0.42, 0.36, 0.26])]

    def camo(self, P):   # PLA digital pattern, 0.28 m pixels
        Q = np.floor(P / 0.28) * 0.28
        a = noise3(Q, 0.7, 61); b = noise3(Q, 0.9, 77)
        idx = np.where(a > 0.15, 2, np.where(a < -0.2, 1, 0))
        idx = np.where((b > 0.25) & (idx == 0), 3, idx)
        return np.stack([self.PIX[i] for i in range(4)])[idx]

    def barrel_sections(self, x0, L):
        return [(x0, x0 + L * 0.4, 0.13, GUN), (x0 + L * 0.4, x0 + L * 0.52, 0.17, GUN),
                (x0 + L * 0.52, x0 + L * 0.9, 0.115, GUN), (x0 + L * 0.9, x0 + L * 0.93, 0.13, GUN),
                (x0 + L * 0.93, x0 + L, 0.112, GUN), (x0 + L, x0 + L + 0.04, 0.12, MUZZLE)]

    def hull_profile(self):
        r, f, h = self.rear, self.front, self.hull_top
        return [(r, 0.42), (f - 0.5, 0.42), (f, 0.85), (f - 1.6, h), (r, h)]

    def hull_extras(self, m):
        f, h, r = self.front, self.hull_top, self.rear
        slab(m, (f - 0.02, 0.88), (f - 1.55, h + 0.02), 0.16, -1.4, 1.4, ERA)
        box(m, r - 0.1, r + 0.1, -1.2, 1.2, 1.0, 1.38, RACK)

    def skirts(self, m, sd):
        r, f, h = self.rear, self.front, self.hull_top
        ys = sorted([sd * (self.TRACK_Y1 + 0.04), sd * (self.TRACK_Y1 + 0.16)])
        extrude_xz(m, [(0.0 + self.hx, 0.5), (f - 0.45, 0.5), (f - 0.1, 0.92), (f - 0.1, h - 0.02),
                       (0.0 + self.hx, h - 0.02)], *ys, ERA)
        ys2 = sorted([sd * (self.TRACK_Y1 + 0.03), sd * (self.TRACK_Y1 + 0.07)])
        extrude_xz(m, [(r + 0.1, 0.56), (0.0 + self.hx, 0.56), (0.0 + self.hx, h - 0.04), (r + 0.1, h - 0.04)],
                   *ys2, SKIRT)

    def build_turret(self, recoil=0.0, gun_pitch=0.0):
        m = Mesh()
        z0, z1 = 1.42, 2.32
        base = [(1.15, 0.45), (1.0, 1.62), (-1.9, 1.66), (-2.75, 1.3), (-2.75, -1.3), (-1.9, -1.66),
                (1.0, -1.62), (1.15, -0.45)]
        extrude_xy(m, base, z0, z1, TURRET, inset=0.93)
        for sd in (1, -1):   # arrowhead ERA wedges
            extrude_xy(m, [(1.1, sd * 0.46), (1.0, sd * 1.64), (2.55, sd * 0.5)], 1.52, z1 - 0.03, ERA,
                       inset=0.96)
            for k in range(5):   # smoke grenade launchers on cheeks
                cyl_x(m, 0.55, 0.9, sd * (1.6 - 0.0), 1.7 + k * 0.08, 0.045, DETAIL, n=6)
        # commander panoramic sight, JD-3 laser device, 12.7mm HMG, bustle stowage
        bs.body(m, 0.1, -0.35, lambda t: np.full_like(t, 0.22), -0.7, z1 + 0.35, n=10, ns=2, part=OPTIC,
                rz_scale=1.5)
        box(m, 0.4, 0.95, -1.15, -0.75, z1, z1 + 0.28, OPTIC)
        box(m, -0.35, 0.25, 0.75, 1.2, z1, z1 + 0.42, OPTIC)              # JD-3 laser box
        box(m, -0.9, -0.35, 0.2, 0.6, z1, z1 + 0.2, DETAIL)
        cyl_x(m, -0.35, 0.7, 0.4, z1 + 0.18, 0.05, GUN, n=6)
        box(m, -3.15, -2.7, -1.35, 1.35, 1.6, 1.64, RACK)
        box(m, -3.1, -2.72, -1.25, 1.25, 1.64, 2.0, DETAIL)
        self.gun(m, recoil, gun_pitch, self.mantlet)
        return m

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    which = sys.argv[1:] or ["leo", "t90", "t99"]
    if "leo" in which: build_sheet(out + "leopard2a7_sheet.png", Leopard2())
    if "t90" in which: build_sheet(out + "t90m_proryv3_sheet.png", T90M())
    if "t99" in which: build_sheet(out + "type99a_sheet.png", Type99())
