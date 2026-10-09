"""
RA2-style Mi-28N "HAVOC" attack helicopter (Russia), proportions from 3-view / side references.
Same layout as ah64_apache_usa_sheet.png (cell 80, 16x16, 3.0 px/m):
  R0-3 HOVER (rotor A/B) | R4-7 MOVE (rotor A/B) | R8-9 SHADOW | R10 ROCKETS | R11 GUN (2A42 30 mm)
  R12 ATGM in flight + explosion | R13 CRASH 16 frames | R14 DAMAGED 16 facings | R15 WRECK + explosion
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py, apache_sprites.py.
"""
import math
import numpy as np
import bomber_sprites as bs
from bomber_sprites import Mesh, bomb_mesh, noise3, FUSE, NAC, FIN, STAB
import apache_sprites as ap
from apache_sprites import (beam, ROTOR, GLASS_P, SENSOR, GUNP, GEAR, TROTOR, RADOME, HELL, HYDRA)
from infantry_sprites import ellipsoid, loft_axis, limb, transform
from m1_abrams_sprites import box, extrude_xy

class Mi28N(ap.Apache):
    name = "Mi-28N Havoc"
    MAST = np.array([0.0, 0.0, 2.3])
    R_MAIN = 8.6
    NBLADE = 5
    CHORD = 0.62
    rotor_phase = 36
    L1, L2 = np.array([0.56, 0.63, 0.45]), np.array([0.31, 0.42, 0.27])      # light / dark green camo
    dmg_pt = np.array([-0.5, -1.05, 1.1])
    pods = [(1.9, 1.65, -0.18), (1.9, -1.65, -0.18)]
    gun_muzzle = (7.3, 0.0, -0.95)

    def prof(self, x):
        X = [-8.4, -6.5, -3.5, -1.5, 0.5, 3.0, 5.0, 6.6, 7.3, 7.5]
        RY = [0.18, 0.24, 0.38, 0.75, 0.82, 0.72, 0.62, 0.45, 0.28, 0.0]
        RZ = [0.28, 0.34, 0.50, 1.00, 1.05, 0.98, 0.85, 0.55, 0.32, 0.0]
        ZC = [1.05, 0.95, 0.65, 0.3, 0.25, 0.2, 0.1, -0.05, -0.1, -0.1]
        return np.interp(x, X, ZC), np.interp(x, X, RY), np.interp(x, X, RZ)

    def tail_rotor(self, m, ang):
        c = np.array([-8.6, -0.45, 2.5])
        for base in (0, math.radians(38), math.pi, math.pi + math.radians(38)):   # X-shaped scissor rotor
            a = ang + base
            d = np.array([math.cos(a), 0, math.sin(a)])
            beam(m, c + d * 0.12, c + d * 1.9, 0.28, 0.04, TROTOR, up=(0, 1, 0))

    def build(self, rotor_ang=0.0, slow=1.0, tail_ang=0.0, broken=False):
        m = Mesh()
        xs = np.concatenate([np.linspace(-8.4, 7.3, 42), [7.5]])
        zc, ry, rz = self.prof(xs)
        bs.loft(m, xs, ry, rz, zc, n=18, power=2.6, comp=1)
        # engines on the shoulders + downward exhaust deflectors
        for sd in (1, -1):
            bs.body(m, 1.5, -2.0, lambda t: np.interp(t, [0, 0.1, 0.8, 1], [0.34, 0.44, 0.42, 0.34]),
                    sd * 1.05, 1.15, n=12, ns=8, part=NAC, comp=1)
            st = len(m.V)
            box(m, -0.5, 0.5, -0.2, 0.2, -0.3, 0.3, NAC)
            Rz = np.array([[math.cos(sd * 0.6), -math.sin(sd * 0.6), 0], [math.sin(sd * 0.6), math.cos(sd * 0.6), 0],
                           [0, 0, 1]])
            Ry = np.array([[math.cos(0.5), 0, math.sin(0.5)], [0, 1, 0], [-math.sin(0.5), 0, math.cos(0.5)]])
            transform(m, st, Rz @ Ry, t=(-2.4, sd * 1.25, 0.85))
        # anhedral stub wings: inner B-8V20 rocket pods, outer Ataka ATGM tube pairs
        for sd in (1, -1):
            cp = 2 if sd > 0 else 3
            bs.wing(m, (0.75, 1.6, 1.35, 0.45), (3.1, 1.25, 1.05, 0.45), 0.2, 0.12, side=sd, comp=cp, ns=6, nc=6,
                    dihedral=-9)
            yy = sd * 1.65
            box(m, 0.6, 1.2, yy - 0.06, yy + 0.06, 0.05, 0.4, GEAR)
            bs.body(m, 1.9, -0.2, lambda t: np.interp(t, [0, 0.12, 1], [0.18, 0.3, 0.3]), yy, -0.18, n=12, ns=6,
                    part=HYDRA, comp=cp)
            yy = sd * 2.65
            box(m, 0.6, 1.2, yy - 0.06, yy + 0.06, -0.1, 0.25, GEAR)
            for dy in (-0.12, 0.12):
                for dz in (-0.2, -0.45):
                    bs.body(m, 1.85, 0.05, lambda t: np.full_like(t, 0.1), yy + dy, dz, n=8, ns=2, part=HELL, comp=cp)
        # tail: swept pylon fin, horizontal stabiliser, tail wheel, X tail rotor
        m2 = Mesh()
        bs.wing(m2, (1.0, -7.6, 1.6, 0), (2.9, -8.9, 0.9, 0), 0.25, 0.14, vertical=True, parts=(FIN, FIN),
                comp=4, ns=6, nc=6)
        for sd in (1, -1):
            bs.wing(m2, (0.2, -7.85, 1.0, 1.65), (2.0, -8.1, 0.7, 1.65), 0.1, 0.06, side=sd, parts=(STAB, STAB),
                    comp=4, ns=5, nc=5)
        limb(m2, np.array([-7.9, 0, 0.9]), np.array([-8.0, 0, -0.1]), 0.05, 0.05, GEAR, bulge=0)
        ellipsoid(m2, np.array([-8.0, 0, -0.22]), 0.2, 0.08, 0.2, GEAR, n=8, ns=6)
        self.tail_rotor(m2, tail_ang)
        if broken:
            R = np.array([[math.cos(-0.55), -math.sin(-0.55), 0], [math.sin(-0.55), math.cos(-0.55), 0], [0, 0, 1]])
            transform(m2, 0, R, t=(0.5, -0.8, -0.6), pivot=(-4.8, 0, 0.7))
        m.merge(m2)
        # mast, hub, overhead radar ball (Mi-28N)
        M = self.MAST
        limb(m, np.array([0, 0, 1.2]), M + [0, 0, 0.05], 0.16, 0.14, NAC, bulge=0)
        ellipsoid(m, M, 0.55, 0.55, 0.16, NAC, n=12, ns=6)
        limb(m, M + [0, 0, 0.1], M + [0, 0, 0.45], 0.07, 0.07, NAC, bulge=0)
        ellipsoid(m, M + [0, 0, 0.7], 0.42, 0.42, 0.32, RADOME, n=14, ns=8)
        if not broken:
            self.rotor(m, rotor_ang, slow)
        else:
            for k in range(3):
                a = rotor_ang + k * 2.0
                d = np.array([math.cos(a), math.sin(a), -0.3])
                beam(m, M + d * 0.3, M + d * 2.8, 0.55, 0.06, ROTOR)
        # nose sensor turret, NPPU-28 gun turret with long 2A42 barrel, main gear
        ellipsoid(m, np.array([7.35, 0, -0.15]), 0.36, 0.3, 0.34, SENSOR, n=12, ns=8)
        ellipsoid(m, np.array([4.6, 0, -0.95]), 0.3, 0.3, 0.22, GUNP, n=10, ns=6)
        bs.body(m, 7.3, 4.6, lambda t: np.interp(t, [0, 0.1, 1], [0.045, 0.06, 0.07]), 0, -0.97, n=8, ns=4,
                part=GUNP)
        for sd in (1, -1):
            limb(m, np.array([2.8, sd * 0.75, -0.7]), np.array([2.4, sd * 1.25, -1.45]), 0.06, 0.06, GEAR, bulge=0)
            ellipsoid(m, np.array([2.4, sd * 1.3, -1.5]), 0.38, 0.12, 0.38, GEAR, n=10, ns=6)
        return m

    def colorize(self, part, P, ctx):
        n = len(P); x, y, z = P[:, 0], P[:, 1], P[:, 2]
        if part in (FUSE, NAC, FIN, STAB, bs.WING_U, bs.WING_L, RADOME):
            col = np.tile(self.L1, (n, 1))
            col[noise3(P, 0.45, 101) > 0.08] = self.L2
            col *= (1 + 0.04 * noise3(P, 1.5, 5))[:, None]
            col = bs.panel(col, P, size=1.2, a=0.02)
            if part == FUSE:
                zc, ry, rz = self.prof(x)
                rel = (z - zc) / np.maximum(rz, 1e-3)
                g1 = (x > 4.9) & (x < 6.4) & (rel > 0.2)                  # gunner/navigator canopy
                g2 = (x > 3.1) & (x < 4.6) & (rel > 0.42)                 # pilot canopy (stepped up)
                glass = (g1 | g2) & (np.abs(y) < 0.62)
                frame = np.abs(np.abs(y) - 0.3) < 0.05
                col[glass] = [0.45, 0.62, 0.72]
                col[glass & frame] = self.L2 * 0.8
                side = (np.abs(y) > 0.6 * ry) & (np.abs(z - zc) < 0.25) & (np.abs(x + 5.0) < 0.5)
                if side.any():                                           # red star with white rim
                    u = x[side]; v = z[side]
                    c = col[side]
                    c[bs.in_star(u, v, -5.0, zc[side], 0.42)] = [0.97, 0.97, 0.95]
                    c[bs.in_star(u, v, -5.0, zc[side], 0.34)] = [0.80, 0.08, 0.07]
                    col[side] = c
            if part == NAC:
                col[x > 1.42] = [0.07, 0.07, 0.08]
            if part == RADOME:
                col = np.tile([0.62, 0.66, 0.64], (n, 1))
        elif part == HYDRA:                                              # B-8V20 pod
            col = np.tile([0.62, 0.66, 0.68], (n, 1))
            col[x > 1.8] = [0.10, 0.10, 0.10]
        elif part == HELL:                                               # Ataka launch tubes
            col = np.tile([0.58, 0.62, 0.62], (n, 1)); col[x > 1.8] = [0.12, 0.12, 0.12]
        elif part == ROTOR or part == TROTOR:
            col = np.tile([0.50, 0.52, 0.50], (n, 1))
            col[np.linalg.norm(P[:, :2] - self.MAST[:2], axis=1) > self.R_MAIN - 0.6] = [0.80, 0.12, 0.10]
            if part == TROTOR:
                col[:] = [0.50, 0.52, 0.50]
        else:
            return super().colorize(part, P, ctx)
        if ctx.get("char"):
            k = np.clip(ctx["char"] * (0.6 + 1.1 * noise3(P, 1.0, 7)), 0, 1)
            col = col * (1 - k[:, None]) + np.array([0.09, 0.08, 0.07]) * k[:, None]
        if ctx.get("damage"):
            dd = np.linalg.norm(P - self.dmg_pt, axis=1)
            k = np.clip(np.exp(-(dd / 1.8) ** 2) * ctx["damage"], 0, 0.9)
            col = col * (1 - k[:, None]) + np.array([0.08, 0.07, 0.06]) * k[:, None]
        return col

if __name__ == "__main__":
    ap.build_sheet("/mnt/user-data/outputs/mi28n_havoc_russia_sheet.png", Mi28N())
