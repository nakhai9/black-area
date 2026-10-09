"""
GREEN FACTION (fictional Islamic-world coalition army, faction colour = green) for the RA2-style set.
Respectful national-army look: desert khaki uniforms, green helmets/vests, green-white shemagh scarves,
green flag with white crescent & star (no religious inscriptions).

  python3 green_faction.py infantry   -> islamic_infantry.png   (same layout as infantry_*.png)
  python3 green_faction.py sf         -> islamic_sf.png         (same layout as sf_*.png, incl. swim rows)
  python3 green_faction.py spotter    -> islamic_spotter.png    (same layout as spotter_*.png)
  python3 green_faction.py engineer   -> islamic_engineer.png   (same layout as engineer_*.png)
  python3 green_faction.py su35       -> islamic_su35_sheet.png (same layout as aircraft sheets)
  python3 green_faction.py t72        -> islamic_t72_sheet.png  (same layout as tank sheets)
Requires bomber_sprites.py, m1_abrams_sprites.py, tanks_sprites.py, infantry_sprites.py, sf_sprites.py,
sf_swim.py, spotter_sprites.py, engineer_sprites.py in the same folder.
"""
import math, sys
import numpy as np
import bomber_sprites as bs
from bomber_sprites import Mesh, wing, body, bomb_mesh, panel, FUSE, WING_U, WING_L, FIN, STAB, NAC, POD, BOMB

OUT = "/mnt/user-data/outputs/"
GREEN = np.array([0.08, 0.55, 0.22])
SCARF = 110

def shemagh(P):
    chk = ((np.floor(P[:, 0] * 45) + np.floor(P[:, 2] * 45) + np.floor(P[:, 1] * 45)) % 2) == 0
    col = np.tile([0.92, 0.92, 0.88], (len(P), 1)); col[chk] = [0.22, 0.45, 0.22]
    return col

# ====================================================================== infantry family
def infantry_classes():
    import infantry_sprites as inf
    from infantry_sprites import Faction, loft_axis, ellipsoid, HEAD, FACE

    class GreenArmy(Faction):
        name = "Green Army"
        PAL = [np.array(c) for c in ([0.68, 0.61, 0.45], [0.56, 0.50, 0.35], [0.47, 0.41, 0.29], [0.76, 0.71, 0.56])]
        hat = "helmet"; rifle_kind = "ak"; flag = "gr"
        glasses = False; knee_pads = False; radio = True
        boot = np.array([0.40, 0.30, 0.19]); belt = np.array([0.10, 0.30, 0.14])
        rfur = np.array([0.30, 0.20, 0.12])
        def camo(self, P): return inf.blobs(P, self.PAL, 5, (51, 52, 53), (0.18, 0.3, 0.38))   # desert camo
        def vest(self, P): return np.tile([0.12, 0.44, 0.20], (len(P), 1))                       # green vest
        def helm(self, P): return np.tile([0.14, 0.47, 0.22], (len(P), 1))                       # green helmet
        def colorize(self, part, P, ctx):
            if part == SCARF: return shemagh(P)
            return super().colorize(part, P, ctx)
        def build_hat(self, m, hc, hup, hfw, hsd):      # shemagh scarf around the neck
            rnd = lambda r: (lambda t: r * np.clip(1 - np.abs(2 * t - 1) ** 4, 0, 1) ** 0.3)
            c = hc - hup * 0.135 * HEAD
            loft_axis(m, c - hup * 0.05, c + hup * 0.05, rnd(0.1 * HEAD), rnd(0.105 * HEAD), SCARF, fwd=hfw,
                      n=14, ns=6, tex=(30, 0, 0))
            ellipsoid(m, c - hfw * 0.1 - hup * 0.08, 0.03, 0.07, 0.09, SCARF, fwd=hfw, up=hup, n=8, ns=6,
                      tex=(31, 0, 0))
    return GreenArmy

def sf_class():
    import sf_sprites as sf
    from infantry_sprites import FACE
    GreenArmy = infantry_classes()

    class GreenSF(sf.SFMixin, GreenArmy):
        name = "Green SF"
        gear_col = np.array([0.14, 0.26, 0.16])
        helm_col = np.array([0.20, 0.30, 0.20])
        glow_min = 0.3
        accent = np.array([0.25, 1.0, 0.35])     # green glow
        mask = "none"
        uni_dark = 0.82
        def colorize(self, part, P, ctx):
            if part == FACE:                      # shemagh face wrap, eyes open
                col = GreenArmy.colorize(self, part, P, ctx)
                h, fr = P[:, 0], P[:, 2]
                eyes = (h > 0.13) & (h < 0.17) & (fr > 0.05)
                wrap = shemagh(P * 1.0)
                col[~eyes] = wrap[~eyes] * 0.85
                return col
            if part == SCARF: return shemagh(P) * 0.85
            return super().colorize(part, P, ctx)
        def build_hat(self, m, hc, hup, hfw, hsd):
            self.high_cut(m, hc, hup, hfw, hsd); self.quad_nvg(m, hc, hup, hfw, hsd)
            GreenArmy.build_hat(self, m, hc, hup, hfw, hsd)
    return GreenSF

def patch_spotter_flag():
    import spotter_sprites as sp
    base = sp.flag_colour
    def flag_colour(kind, u, v):
        if kind != "gr": return base(kind, u, v)
        col = np.tile([0.04, 0.48, 0.18], (len(u), 1))
        uu = u * 1.5
        d1 = np.hypot(uu - 0.62, v - 0.5); d2 = np.hypot(uu - 0.70, v - 0.5)
        white = [0.97, 0.97, 0.95]
        col[(d1 < 0.24) & (d2 > 0.21)] = white                       # crescent
        col[bs.in_star(uu, v, 0.88, 0.5, 0.09)] = white              # star
        return col
    sp.flag_colour = flag_colour
    return sp

def eng_class():
    import engineer_sprites as eng
    class EngGreen(eng.Engineer):
        name = "Engineer Green"; hat_col = np.array([0.08, 0.62, 0.24])
    return EngGreen

# ====================================================================== T-72B
def t72_class():
    import tanks_sprites as tk
    from tanks_sprites import Tank, slab, ERA, RUBBER, DRUM, turn_z
    from m1_abrams_sprites import box, cyl_x, extrude_xz, TURRET, OPTIC, DETAIL, GUN
    import infantry_sprites as inf

    class T72B(Tank):
        name = "T-72B"
        hx = 0.25
        hull_len, hull_top = 6.95, 1.30
        TRACK_Y0, TRACK_Y1 = 1.18, 1.79
        n_wheels = 6
        wheel_r = 0.38
        trunnion = (1.05, 1.76)
        mantlet = (0.95, 1.45, 0.34, 1.52, 1.98)
        barrel = 6.0
        wheel_col = [0.27, 0.33, 0.20]
        detail_col = [0.20, 0.26, 0.15]
        turret_top_pt = np.array([-0.3, 0, 2.08])
        OLIVE, SAND, BROWN = np.array([0.30, 0.42, 0.22]), np.array([0.64, 0.57, 0.40]), np.array([0.26, 0.21, 0.14])

        def camo(self, P):
            a = bs.noise3(P, 1.1, 71); b = bs.noise3(P, 1.3, 72)
            col = np.tile(self.OLIVE, (len(P), 1))
            col[a > 0.22] = self.SAND
            col[(b > 0.32) & (a <= 0.22)] = self.BROWN
            return col

        def hull_profile(self):
            r, f, h = self.rear, self.front, self.hull_top
            return [(r, 0.4), (f - 0.45, 0.4), (f, 0.78), (f - 1.85, h), (r, h)]

        def hull_extras(self, m):
            f, h, r = self.front, self.hull_top, self.rear
            slab(m, (f - 0.02, 0.82), (f - 1.8, h + 0.02), 0.14, -1.45, 1.45, ERA)          # Kontakt-1 glacis
            extrude_xz(m, [(f - 0.4, 0.42), (f + 0.05, 0.42), (f + 0.05, 0.7), (f - 0.4, 0.7)], -1.6, 1.6, RUBBER)
            for sd in (1, -1):    # rear fuel drums
                st = len(m.V)
                bs.body(m, 0.7, -0.7, lambda t: np.full_like(t, 0.3), 0, h + 0.15, n=12, ns=2, part=DRUM)
                turn_z(m, st, math.pi / 2, np.array([0, 0, 0]))
                for i in range(st, len(m.V)):
                    m.V[i] = m.V[i] + np.array([r - 0.25, sd * 0.85, 0]); m.T[i] = m.V[i].copy()
            st = len(m.V)                                                              # unditching log
            bs.body(m, 1.55, -1.55, lambda t: np.full_like(t, 0.13), 0, 0, n=10, ns=2, part=DETAIL)
            turn_z(m, st, math.pi / 2, np.array([0, 0, 0]))
            for i in range(st, len(m.V)):
                m.V[i] = m.V[i] + np.array([r - 0.05, 0, h - 0.25]); m.T[i] = m.V[i].copy()

        def skirts(self, m, sd):
            r, f, h = self.rear, self.front, self.hull_top
            ys = sorted([sd * (self.TRACK_Y1 + 0.03), sd * (self.TRACK_Y1 + 0.06)])
            extrude_xz(m, [(r + 0.1, 0.62), (f - 0.3, 0.62), (f - 0.3, h - 0.04), (r + 0.1, h - 0.04)], *ys, RUBBER)
            ys2 = sorted([sd * (self.TRACK_Y1 + 0.06), sd * (self.TRACK_Y1 + 0.18)])
            extrude_xz(m, [(f - 1.6, 0.66), (f - 0.35, 0.66), (f - 0.35, h - 0.06), (f - 1.6, h - 0.06)], *ys2, ERA)

        def build_turret(self, recoil=0.0, gun_pitch=0.0):
            m = Mesh()
            inf.ellipsoid(m, np.array([0.05, 0, 1.30]), 1.55, 1.45, 0.78, TURRET, n=24, ns=14, p=2.2)
            for sd in (1, -1):        # Kontakt-1 bricks on turret front ("Dolly Parton" V)
                for row, zz in enumerate((1.68, 1.90)):
                    for a in np.radians(np.linspace(14, 62, 5)):
                        st = len(m.V)
                        box(m, -0.12, 0.12, -0.22, 0.22, -0.1, 0.1, ERA)
                        ang = sd * a
                        R = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
                        pos = np.array([1.38 * math.cos(a) + 0.12 - 0.1 * row, sd * 1.3 * math.sin(a), zz])
                        for i in range(st, len(m.V)):
                            m.V[i] = m.V[i] @ R.T + pos; m.N[i] = m.N[i] @ R.T; m.T[i] = m.V[i].copy()
                for k in range(4):    # smoke grenade launchers
                    cyl_x(m, 0.2, 0.5, sd * (1.2 + 0.08 * k), 1.75 + 0.03 * k, 0.045, DETAIL, n=6)
            # commander cupola + NSVT 12.7 mm, gunner sight, Luna IR light, snorkel
            inf.ellipsoid(m, np.array([-0.35, -0.55, 2.05]), 0.33, 0.33, 0.14, TURRET, n=12, ns=7)
            cyl_x(m, -0.35, 0.75, -0.55, 2.28, 0.035, GUN, n=6)
            box(m, -0.5, -0.15, -0.65, -0.45, 2.1, 2.3, DETAIL)
            box(m, 0.25, 0.65, 0.45, 0.75, 1.95, 2.18, OPTIC)
            cyl_x(m, 1.0, 1.25, -0.62, 1.95, 0.14, OPTIC, n=10)
            cyl_x(m, -1.4, -0.2, 0.95, 1.75, 0.08, DETAIL, n=8)
            self.gun(m, recoil, gun_pitch, self.mantlet)
            return m
    return T72B

# ====================================================================== Su-35
def green_roundel(col, u, v, cu, cv, R):
    d = np.hypot(u - cu, v - cv)
    col[d < R] = [0.97, 0.97, 0.95]
    col[d < R * 0.84] = GREEN
    d1 = np.hypot(u - cu, v - (cv - 0.05 * R)); d2 = np.hypot(u - cu, v - (cv + 0.12 * R))
    col[(d1 < R * 0.5) & (d2 > R * 0.43)] = [0.97, 0.97, 0.95]
    return col

class Su35:
    name = "Su-35"
    cell = 80
    L = 11.0
    SAND = np.array([0.72, 0.64, 0.47])
    OLIVE = np.array([0.40, 0.46, 0.28])
    BELLY = np.array([0.68, 0.72, 0.74])
    GLASS = np.array([0.15, 0.24, 0.32])
    spec, shininess, sky = 0.25, 16, 0.06
    dmg_pt = np.array([-5.0, -1.05, -0.4])
    bay = (-1, 1, 0.5)

    def prof(self, x):
        X = [-10.6, -10.2, -8, -4, 0, 4, 6.5, 8, 9.8, 10.8, 11.0]
        RY = [0.0, 0.25, 0.6, 1.75, 1.6, 1.05, 0.72, 0.58, 0.38, 0.12, 0.0]
        RZ = [0.0, 0.25, 0.4, 0.52, 0.6, 0.78, 0.74, 0.58, 0.38, 0.12, 0.0]
        zc = np.interp(x, [-10.6, -4, 4, 8, 11], [0.0, -0.05, 0.1, 0.05, -0.05])
        return zc, np.interp(x, X, RY), np.interp(x, X, RZ)

    def wing_le(self, y): return 1.8 + (-2.6 - 1.8) * (abs(y) - 2.4) / (7.65 - 2.4)
    def wing_ch(self, y): return 5.0 + (1.6 - 5.0) * (abs(y) - 2.4) / (7.65 - 2.4)

    def missile(self, m, x, y, z, L=3.6, r=0.1):
        bomb_mesh(m, x, y, z, L, r, comp=2 if y > 0 else 3)

    def build(self, bay_open=False):
        m = Mesh()
        xs = self.L * np.sin(np.linspace(-np.pi / 2, np.pi / 2, 50))
        zc, ry, rz = self.prof(xs)
        bs.loft(m, xs, ry, rz, zc, n=20, power=2.4, comp=1)
        for sd in (1, -1):
            cp = 2 if sd > 0 else 3
            wing(m, (0.9, 6.6, 9.0, 0.0), (2.6, 1.6, 5.4, 0.0), 0.35, 0.3, side=sd, comp=cp, ns=6, nc=8)   # LERX
            wing(m, (2.4, 1.8, 5.0, 0.0), (7.65, -2.6, 1.6, 0.0), 0.4, 0.12, side=sd, comp=cp, ns=12, nc=8,
                 dihedral=-2.0)
            body(m, self.wing_le(7.65) + 0.6, self.wing_le(7.65) - 2.4,
                 lambda t: 0.16 * np.sin(np.pi * np.clip(t, 0.03, 0.97)) ** 0.4, sd * 7.75, -0.18,
                 n=8, ns=8, part=POD, comp=cp)                                     # wing-tip EW pods
            nprof = lambda t: np.interp(t, [0, 0.05, 0.6, 0.92, 1], [0.6, 0.66, 0.68, 0.6, 0.55])
            body(m, 2.6, -9.6, nprof, sd * 1.05, -0.42, n=14, ns=14, part=NAC, comp=1, rz_scale=0.95)
            wing(m, (1.6, -7.3, 2.9, -0.3), (4.3, -9.1, 1.1, -0.3), 0.18, 0.08, side=sd,
                 parts=(STAB, STAB), comp=4, ns=6, nc=6)
            fm = Mesh()                                                                # twin fins
            wing(fm, (0.35, -5.4, 3.3, 0), (3.5, -8.7, 1.4, 0), 0.22, 0.1, vertical=True,
                 parts=(FIN, FIN), comp=4, ns=8, nc=8)
            cant = math.radians(-sd * 6)
            Rx = np.array([[1, 0, 0], [0, math.cos(cant), -math.sin(cant)], [0, math.sin(cant), math.cos(cant)]])
            for i in range(len(fm.V)):
                fm.V[i] = fm.V[i] @ Rx.T + np.array([0, sd * 1.55, 0])
                fm.N[i] = fm.N[i] @ Rx.T
                fm.T[i] = fm.T[i] + np.array([0, sd * 1.55, 0])
            m.merge(fm)
            # missiles: R-73 / R-77 under wings, one fired when attacking
            for k, yy in enumerate((3.6, 5.1, 6.5)):
                if bay_open and sd > 0 and k == 1: continue
                self.missile(m, self.wing_le(yy) - self.wing_ch(yy) * 0.45, sd * yy, -0.42, L=3.4 - 0.4 * k,
                             r=0.1 - 0.012 * k)
        self.missile(m, -1.0, 0, -0.95, L=3.6, r=0.1)
        return m

    def projectile(self, bm):
        bomb_mesh(bm, 0, 0, 0, 3.6, 0.1)

    def colorize(self, part, P, ctx):
        n = len(P); x, y, z = P[:, 0], P[:, 1], P[:, 2]
        col = np.tile(self.SAND, (n, 1))
        col[bs.noise3(P, 0.35, 81) > 0.12] = self.OLIVE
        col = panel(col, P, a=0.02)
        if part == FUSE:
            zc, ry, rz = self.prof(x)
            rel = (z - zc) / np.maximum(rz, 1e-3)
            col[rel < -0.15] = self.BELLY
            col[x > 8.4] = [0.42, 0.44, 0.44]                          # radome
            can = (x > 4.6) & (x < 7.7) & (rel > 0.35)
            col[can] = self.GLASS
            col[can & (np.abs(x - 6.6) < 0.06)] = self.SAND * 0.8
            side = (np.abs(y) > 0.6 * ry) & (x > 2) & (x < 4) & (np.abs(z - zc) < 0.3)
            col[side & (np.mod(x * 3, 1) < 0.5)] = [0.95, 0.95, 0.95]   # bort number hint
        elif part == WING_L:
            col[:] = self.BELLY
            yc = 5.4 * np.sign(y); xc = self.wing_le(5.4) - self.wing_ch(5.4) * 0.45
            col = green_roundel(col, y, x, yc, xc, 0.75)
        elif part == WING_U:
            yc = 5.4 * np.sign(y); xc = self.wing_le(5.4) - self.wing_ch(5.4) * 0.45
            col = green_roundel(col, y, x, yc, xc, 0.75)
        elif part == FIN:
            flash = (z > 2.2) & (z < 3.1)
            col[flash] = GREEN
            col[flash & (z > 2.5) & (z < 2.8)] = [0.97, 0.97, 0.95]
        elif part == NAC:
            col[z < -0.45] = self.BELLY
            col[x > 2.45] = [0.08, 0.08, 0.09]                         # intakes
            noz = x < -9.0
            col[noz] = [0.30, 0.28, 0.27]
            col[x < -9.5] = [1.0, 0.55, 0.15] if ctx.get("bay") else [0.12, 0.11, 0.10]   # afterburner
        elif part == POD:
            col[:] = self.BELLY * 0.9
        elif part == BOMB:
            col[:] = [0.88, 0.88, 0.86]
            col[np.mod(x * 1.2, 1) < 0.06] = [0.85, 0.75, 0.15]
        return col

# ====================================================================== CLI
def main(what):
    if what == "infantry":
        import infantry_sprites as inf
        inf.build_sheet(infantry_classes()(), OUT + "islamic_infantry.png")
    elif what == "sf":
        import sf_swim
        sf_swim.build_full_sheet(sf_class()(), OUT + "islamic_sf.png")
    elif what == "spotter":
        sp = patch_spotter_flag()
        sp.build_sheet(sp.make_fac(infantry_classes()), OUT + "islamic_spotter.png")
    elif what == "engineer":
        import engineer_sprites as eng
        eng.build_sheet(eng_class()(), OUT + "islamic_engineer.png")
    elif what == "su35":
        bs.build_sheet(Su35(), OUT + "islamic_su35_sheet.png")
    elif what == "t72":
        import m1_abrams_sprites as m1
        m1.build_sheet(OUT + "islamic_t72_sheet.png", t72_class()())

if __name__ == "__main__":
    for w in sys.argv[1:] or ["infantry", "engineer", "t72", "su35", "spotter", "sf"]:
        main(w)
