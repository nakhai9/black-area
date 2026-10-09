"""
RA2-style ARMOURED RECOVERY VEHICLE sheets (v2: big crane, yellow/black hook block always visible,
rear tow hitch + stowed tow bar, repair = crane lifting a powerpack).
  arv_brem1_russia.png      BREM-1 (T-72 chassis)       Russian 4BO dark green
  arv_m88a2_usa.png         M88A2 Hercules              US CARC tan 686A
  arv_type90ii_china.png    Type 90-II ARV              PLA digital woodland camo
Cell 80x80, 16 columns x 15 rows (1280x1200). Scale 4.0 px/m (same as the tank sheets).
  R0-1    MOVE   32 facings, track phase 0   (blade raised, crane stowed)
  R2-3    MOVE   32 facings, track phase 1
  R4-5    MOVE   32 facings, track phase 2
  R6-7    PARKED 32 facings (blade lowered to the ground, crane stowed, beacon off)
  R8-9    SHADOW 32 facings
  R10-13  REPAIR 8 facings x 8 frames, 2 facings per row (row 10 = facings 0,1 ... row 13 = facings 6,7):
          crane raised, hook swinging, welding sparks in front, amber beacon flashing
  R14     c0-7 destroyed wreck 8 facings | c8-15 explosion 8 frames
Facing 0 = screen-up, clockwise (32 facings = 11.25 deg, 8 facings = 45 deg).
Requires bomber_sprites.py, m1_abrams_sprites.py, tanks_sprites.py, infantry_sprites.py in the same folder.
"""
import math, sys
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import Mesh, shade, shadow_layer, over, blob, rot_model, project, noise3
from m1_abrams_sprites import box, cyl_x, extrude_xz, extrude_xy, HULL, TRACK, SKIRT, DETAIL, RACK, OPTIC, GUN
from tanks_sprites import Tank, slab, ERA, RUBBER, DRUM, turn_z
from infantry_sprites import limb, basis, transform, ellipsoid

SCALE = 4.0
CELL = 80
BOOM, CABLE, HOOK, BLADE, BEACON, SUPER, LOAD, TOW = 160, 161, 162, 163, 164, 165, 166, 167

def beam(m, p0, p1, w, h, part, up=(0, 0, 1)):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0; L = np.linalg.norm(d)
    st = len(m.V)
    box(m, 0, L, -w / 2, w / 2, -h / 2, h / 2, part)
    if abs(d @ np.asarray(up, float)) / L > 0.95: up = (1.0, 0, 0)
    B = basis(d, up)
    for i in range(st, len(m.V)):
        m.T[i] = m.V[i].copy() + np.array([0, 0, 7.0])
        m.V[i] = m.V[i] @ B.T + p0; m.N[i] = m.N[i] @ B.T

class ARV(Tank):
    hx = 0.0
    cell = CELL
    def colorize(self, part, P, ctx):
        n = len(P)
        if part in (BOOM, SUPER):
            col = self.camo(P) * (0.97 if part == BOOM else 1.0)
            col *= (1 + 0.04 * noise3(P, 2.2, 9))[:, None]
            return col
        if part == CABLE: return np.tile([0.12, 0.12, 0.12], (n, 1))
        if part == HOOK:                                                # yellow/black safety stripes
            col = np.tile([0.95, 0.75, 0.08], (n, 1))
            col[np.mod((P[:, 0] + P[:, 1] + P[:, 2]) * 6, 1) < 0.5] = [0.10, 0.10, 0.10]
            return col
        if part == LOAD:
            col = np.tile([0.50, 0.52, 0.50], (n, 1)) * (1 + 0.08 * noise3(P, 3, 5))[:, None]
            col[np.mod(P[:, 0] * 5, 1) < 0.15] *= 0.6                       # cooling fins
            return col
        if part == TOW: return np.tile([0.16, 0.16, 0.16], (n, 1))
        if part == BLADE:
            col = self.camo(P) * 0.95
            col[P[:, 2] < 0.12] = [0.48, 0.47, 0.45]                    # worn steel edge
            return col
        if part == BEACON:
            return np.tile([1.7, 0.85, 0.1] if ctx.get("beacon") else [0.55, 0.38, 0.12], (n, 1))
        col = super().colorize(part, P, ctx)
        if ctx.get("char"):
            k = np.clip(ctx["char"] * (0.6 + 1.1 * noise3(P, 1.0, 7)), 0, 1)
            col = col * (1 - k[:, None]) + np.array([0.09, 0.08, 0.07]) * k[:, None]
        return col

    # hooks implemented per vehicle
    def superstructure(self, m): pass
    def crane(self, m, state, swing=0.0): pass
    def blade_pos(self): return 0.0

    def blade(self, m, lowered):
        f = self.front
        z0 = 0.0 if lowered else 0.55
        w = self.TRACK_Y1 + 0.05
        st = len(m.V)
        box(m, -0.07, 0.07, -w, w, 0, 0.75, BLADE)
        tilt = math.radians(-14)
        R = np.array([[math.cos(tilt), 0, -math.sin(tilt)], [0, 1, 0], [math.sin(tilt), 0, math.cos(tilt)]])
        transform(m, st, R, t=(f + 0.35, 0, z0))
        for i in range(st, len(m.V)): m.T[i] = m.V[i].copy()
        for sd in (1, -1):    # push arms
            beam(m, (f + 0.3, sd * (w - 0.3), z0 + 0.35), (f - 0.6, sd * (w - 0.3), 0.75), 0.12, 0.14, BLADE)

    def hook_block(self, m, tip, drop, swing=0.0, load=False):
        hk = tip + np.array([0.6 * math.sin(swing), 0.3 * math.sin(swing), -drop])
        for dy in (-0.07, 0.07):                                           # twin cable falls
            limb(m, tip + [0, dy, 0], hk + [0, dy, 0.25], 0.03, 0.03, CABLE, bulge=0)
        box(m, hk[0] - 0.27, hk[0] + 0.27, hk[1] - 0.18, hk[1] + 0.18, hk[2] - 0.12, hk[2] + 0.36, HOOK)   # pulley block
        ellipsoid(m, hk - [0, 0, 0.3], 0.2, 0.06, 0.2, HOOK, n=10, ns=6)                     # hook
        ellipsoid(m, hk - [0, 0, 0.2] + [0.1, 0, 0], 0.05, 0.045, 0.1, HOOK, n=8, ns=5)
        if load:                                                            # lifted powerpack
            low = hk - np.array([0, 0, 0.45])
            for dx in (-0.45, 0.45):
                for dy in (-0.35, 0.35):
                    limb(m, hk - [0, 0, 0.3], low + [dx, dy, -0.25], 0.015, 0.015, CABLE, bulge=0)
            box(m, low[0] - 0.75, low[0] + 0.75, low[1] - 0.55, low[1] + 0.55, low[2] - 1.0, low[2] - 0.25, LOAD)
        return hk

    def tow_gear(self, m):
        r = self.rear
        box(m, r - 0.25, r, -0.12, 0.12, 0.65, 0.85, TOW)                  # pintle hitch
        for sd in (1, -1):                                                 # stowed A-frame tow bar
            beam(m, (r - 0.08, sd * 1.0, 0.75), (r - 0.08, sd * 0.15, self.hull_top - 0.05), 0.09, 0.09, TOW)
            box(m, r - 0.2, r, sd * 1.25 - 0.1, sd * 1.25 + 0.1, 0.8, 1.0, TOW)   # tow shackles

    def build(self, mode="move", swing=0.0):
        m = self.build_hull()
        self.superstructure(m)
        self.crane(m, "raised" if mode == "repair" else "stowed", swing)
        self.blade(m, lowered=mode in ("park", "repair"))
        self.tow_gear(m)
        return m

    def work_point(self):
        return np.array([self.front + 1.4, -0.4, 0.7])

# ---------------------------------------------------------------- BREM-1
class BREM1(ARV):
    name = "BREM-1"
    hull_len, hull_top = 6.95, 1.30
    TRACK_Y0, TRACK_Y1 = 1.18, 1.79
    n_wheels = 6; wheel_r = 0.38
    wheel_col = [0.28, 0.34, 0.21]; detail_col = [0.22, 0.27, 0.16]
    GREEN = np.array([0.32, 0.40, 0.22])
    def camo(self, P): return np.tile(self.GREEN, (len(P), 1)) * (1 + 0.05 * noise3(P, 0.5, 44))[:, None]
    def hull_profile(self):
        r, f, h = self.rear, self.front, self.hull_top
        return [(r, 0.4), (f - 0.45, 0.4), (f, 0.78), (f - 1.85, h), (r, h)]
    def skirts(self, m, sd):
        r, f, h = self.rear, self.front, self.hull_top
        ys = sorted([sd * (self.TRACK_Y1 + 0.03), sd * (self.TRACK_Y1 + 0.06)])
        extrude_xz(m, [(r + 0.1, 0.62), (f - 0.3, 0.62), (f - 0.3, h - 0.04), (r + 0.1, h - 0.04)], *ys, RUBBER)
    def superstructure(self, m):
        h = self.hull_top
        extrude_xy(m, [(-0.6, -0.1), (1.5, -0.1), (1.9, 0.3), (1.9, 1.5), (-0.6, 1.5)], h, h + 0.8, SUPER, inset=0.9)
        ellipsoid(m, np.array([0.5, 0.8, h + 0.82]), 0.3, 0.3, 0.13, SUPER, n=12, ns=7)
        cyl_x(m, 0.5, 1.5, 0.8, h + 1.0, 0.035, GUN, n=6)
        box(m, 0.4, 0.55, 0.6, 0.75, h + 0.8, h + 1.0, BEACON)
        box(m, -3.3, -1.0, -1.5, -1.45, h, h + 0.35, RACK)                # rear cargo platform rails
        box(m, -3.3, -1.0, 1.45, 1.5, h, h + 0.35, RACK)
        box(m, -3.0, -2.2, -1.0, 0.2, h, h + 0.4, DETAIL)                 # spare parts crates
        box(m, -2.0, -1.3, 0.3, 1.2, h, h + 0.3, DETAIL)
        for sd in (1, -1):    # rear fuel drums
            st = len(m.V)
            bs.body(m, 0.7, -0.7, lambda t: np.full_like(t, 0.3), 0, h + 0.15, n=12, ns=2, part=DRUM)
            turn_z(m, st, math.pi / 2, np.array([0, 0, 0]))
            for i in range(st, len(m.V)):
                m.V[i] = m.V[i] + np.array([self.rear - 0.25, sd * 0.85, 0]); m.T[i] = m.V[i].copy()
    def crane(self, m, state, swing=0.0):
        h = self.hull_top
        base = np.array([1.4, -0.95, h])
        ellipsoid(m, base + [0, 0, 0.15], 0.35, 0.35, 0.18, BOOM, n=12, ns=6)
        if state == "stowed":
            tip = np.array([-2.7, -0.95, h + 1.25])
            beam(m, base + [0, 0, 0.25], tip, 0.38, 0.42, BOOM)
            beam(m, np.array([-2.5, -0.95, h]), tip - [0, 0, 0.2], 0.16, 0.16, BOOM)       # boom rest
            self.hook_block(m, tip + [-0.15, 0, 0], 0.55)
        else:
            tip = np.array([4.0, -1.7, h + 3.9])
            beam(m, base + [0, 0, 0.25], tip, 0.38, 0.42, BOOM)
            beam(m, base + [0.3, 0, 0.1], base + (tip - base) * 0.45, 0.16, 0.18, BOOM)   # hydraulic ram
            self.hook_block(m, tip, 2.0, swing, load=True)
    def hook(self, m, tip, swing):
        hk = tip + np.array([0.6 * math.sin(swing), 0.3 * math.sin(swing), -2.6])
        limb(m, tip, hk, 0.03, 0.03, CABLE, bulge=0)
        box(m, hk[0] - 0.12, hk[0] + 0.12, hk[1] - 0.08, hk[1] + 0.08, hk[2] - 0.3, hk[2], HOOK)

# ---------------------------------------------------------------- M88A2 Hercules
class M88A2(ARV):
    name = "M88A2 Hercules"
    hull_len, hull_top = 8.27, 2.65
    TRACK_Y0, TRACK_Y1 = 1.12, 1.72
    n_wheels = 6; wheel_r = 0.34
    wheel_col = [0.55, 0.48, 0.35]; detail_col = [0.42, 0.40, 0.33]
    TAN = np.array([0.74, 0.65, 0.47])
    def camo(self, P): return np.tile(self.TAN, (len(P), 1)) * (1 + 0.04 * noise3(P, 0.6, 46))[:, None]
    def hull_profile(self):
        r, f, h = self.rear, self.front, self.hull_top
        return [(r, 0.4), (f - 0.55, 0.4), (f, 0.95), (f - 0.9, h), (r, h)]
    def skirts(self, m, sd):
        r, f, h = self.rear, self.front, self.hull_top
        ys = sorted([sd * (self.TRACK_Y1 + 0.04), sd * (self.TRACK_Y1 + 0.09)])
        for x0 in np.arange(r + 0.15, f - 0.6, 1.6):
            extrude_xz(m, [(x0, 0.5), (min(x0 + 1.55, f - 0.6), 0.5), (min(x0 + 1.55, f - 0.6), 1.35),
                           (x0, 1.35)], *ys, SKIRT)
    def superstructure(self, m):
        h = self.hull_top; f = self.front
        ellipsoid(m, np.array([f - 2.2, 0.85, h + 0.12]), 0.38, 0.38, 0.16, SUPER, n=12, ns=7)   # cupola
        cyl_x(m, f - 2.2, f - 0.9, 0.85, h + 0.35, 0.04, GUN, n=6)                              # M2 .50
        box(m, f - 2.3, f - 2.15, 0.7, 0.85, h + 0.28, h + 0.48, BEACON)
        box(m, self.rear + 0.3, self.rear + 2.4, -1.4, 1.4, h, h + 0.08, HULL)                  # engine deck
        box(m, f - 3.2, f - 1.5, -1.5, -0.6, h, h + 0.25, OPTIC)                                # vision block
        for sd in (1, -1):
            box(m, self.rear - 0.15, self.rear + 0.05, sd * 1.0 - 0.3, sd * 1.0 + 0.3, 1.2, 2.2, DETAIL)
    def crane(self, m, state, swing=0.0):
        h = self.hull_top; f = self.front
        piv = {sd: np.array([f - 0.7, sd * 1.25, h - 0.1]) for sd in (1, -1)}
        apex = np.array([self.rear + 1.6, 0, h + 0.35]) if state == "stowed" else np.array([f + 2.6, 0, h + 3.8])
        if state == "stowed":
            apex = np.array([self.rear + 1.4, 0, h + 0.9])
        for sd in (1, -1):
            beam(m, piv[sd], apex, 0.32, 0.36, BOOM)
        ellipsoid(m, apex, 0.26, 0.32, 0.26, BOOM, n=8, ns=6)
        if state == "stowed":
            beam(m, np.array([self.rear + 1.4, 0, h]), apex - [0, 0, 0.2], 0.16, 0.16, BOOM)
            self.hook_block(m, apex + [-0.2, 0, 0], 0.5)
        else:
            for sd in (1, -1):   # support struts
                beam(m, np.array([f - 2.8, sd * 1.1, h]), piv[sd] + (apex - piv[sd]) * 0.55, 0.14, 0.16, BOOM)
            self.hook_block(m, apex, 2.6, swing, load=True)

# ---------------------------------------------------------------- Type 90-II ARV
class Type90ARV(ARV):
    name = "Type 90-II ARV"
    hull_len, hull_top = 6.9, 1.35
    TRACK_Y0, TRACK_Y1 = 1.15, 1.74
    n_wheels = 6; wheel_r = 0.36
    wheel_col = [0.28, 0.32, 0.22]; detail_col = [0.22, 0.25, 0.18]
    PIX = [np.array(c) * 1.1 for c in ([0.35, 0.40, 0.25], [0.50, 0.50, 0.34], [0.20, 0.22, 0.16], [0.42, 0.36, 0.26])]
    def camo(self, P):
        Q = np.floor(P / 0.28) * 0.28
        a = noise3(Q, 0.7, 61); b = noise3(Q, 0.9, 77)
        idx = np.where(a > 0.15, 2, np.where(a < -0.2, 1, 0))
        idx = np.where((b > 0.25) & (idx == 0), 3, idx)
        return np.stack(self.PIX)[idx]
    def hull_profile(self):
        r, f, h = self.rear, self.front, self.hull_top
        return [(r, 0.42), (f - 0.5, 0.42), (f, 0.85), (f - 1.6, h), (r, h)]
    def skirts(self, m, sd):
        r, f, h = self.rear, self.front, self.hull_top
        ys = sorted([sd * (self.TRACK_Y1 + 0.03), sd * (self.TRACK_Y1 + 0.08)])
        extrude_xz(m, [(r + 0.1, 0.55), (f - 0.4, 0.55), (f - 0.1, 0.92), (f - 0.1, h - 0.03), (r + 0.1, h - 0.03)],
                   *ys, SKIRT)
    def superstructure(self, m):
        h = self.hull_top
        extrude_xy(m, [(-0.4, -0.5), (1.6, -0.5), (2.2, 0.0), (2.2, 1.45), (-0.4, 1.45)], h, h + 0.95, SUPER,
                   inset=0.9)
        ellipsoid(m, np.array([0.4, 0.75, h + 0.97]), 0.3, 0.3, 0.13, SUPER, n=12, ns=7)
        cyl_x(m, 0.4, 1.35, 0.75, h + 1.15, 0.035, GUN, n=6)
        box(m, 1.0, 1.15, 1.0, 1.15, h + 0.95, h + 1.15, BEACON)
        for yy in (-0.6, 0.6):    # spare road wheels stacked on the rear deck
            st = len(m.V)
            bs.body(m, 0.1, -0.1, lambda t: np.full_like(t, 0.36), 0, 0, n=12, ns=2, part=DETAIL)
            Ry = np.array([[0, 0, -1.0], [0, 1, 0], [1.0, 0, 0]])
            transform(m, st, Ry, t=(self.rear + 0.7, yy, h + 0.12))
        box(m, -3.2, -1.6, -1.4, 1.4, h, h + 0.3, RACK)
        box(m, -2.9, -2.0, 0.2, 1.1, h + 0.3, h + 0.6, DETAIL)
    def crane(self, m, state, swing=0.0):
        h = self.hull_top
        base = np.array([-2.3, -1.0, h])
        ellipsoid(m, base + [0, 0, 0.2], 0.4, 0.4, 0.22, BOOM, n=12, ns=6)
        if state == "stowed":
            tip = np.array([3.0, -1.05, h + 1.45])
            beam(m, base + [0, 0, 0.35], tip, 0.38, 0.40, BOOM)
            self.hook_block(m, tip + [-0.15, 0, 0], 0.5)
        else:
            tip = np.array([3.6, -2.0, h + 4.4])
            beam(m, base + [0, 0, 0.35], tip, 0.38, 0.40, BOOM)
            beam(m, base + [0.4, 0, 0.1], base + (tip - base) * 0.4, 0.16, 0.18, BOOM)
            self.hook_block(m, tip, 2.3, swing, load=True)

# ---------------------------------------------------------------- render
def sparks(img, R, wp, k):
    rng = np.random.default_rng(400 + k)
    px, py, _ = project(R @ wp, SCALE, CELL, CELL)
    layer = np.zeros_like(img)
    if k % 2 == 0:
        blob(layer, px, py, 3.5, [0.75, 0.85, 1.0], 0.9)        # welding arc flash
        blob(layer, px, py, 1.6, [1.0, 1.0, 1.0], 1.0)
    for i in range(9):
        a = rng.uniform(-math.pi, 0); d = rng.uniform(2, 9)
        blob(layer, px + math.cos(a) * d, py + math.sin(a) * d * 0.6 + d * 0.3, 0.6,
             [1.0, rng.uniform(0.6, 0.95), 0.2], 1.0, hard=0.3)
    bs.smoke(layer, px + 2, py - 5 - k % 4, 2.5, rng, a=0.3, shade_=0.7)
    return over(layer, img)

def beacon_glow(img, ac, R, m_arr, on):
    if not on: return img
    V, N, T, P, C = m_arr
    pts = V[P == BEACON].reshape(-1, 3)
    if len(pts) == 0: return img
    px, py, _ = project(R @ pts.mean(0), SCALE, CELL, CELL)
    g = np.zeros_like(img); blob(g, px, py, 4.0, [1.0, 0.7, 0.1], 0.55, hard=1.2)
    return over(img, g)

def frame(ac, arr, facing, ctx=None, shadow=True):
    R = rot_model(facing)
    img = shade(ac, arr, R, SCALE, CELL, CELL, ctx or {})
    if shadow:
        img = over(img, shadow_layer(arr[0] @ R.T, SCALE, CELL, CELL, light_proj=True, alpha=0.5))
    return img

def build_sheet(ac, path):
    sheet = np.zeros((15 * CELL, 16 * CELL, 4))
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    mv = ac.build("move").arrays()
    pk = ac.build("park").arrays()
    for f in range(32):
        r, c = divmod(f, 16)
        for p in range(3):
            put(frame(ac, mv, f * 11.25, {"phase": p}, shadow=False), r + 2 * p, c)
        put(frame(ac, pk, f * 11.25, {}, shadow=False), 6 + r, c)
        R = rot_model(f * 11.25)
        put(shadow_layer(mv[0] @ R.T, SCALE, CELL, CELL, light_proj=True, alpha=0.5), 8 + r, c)
    for k in range(8):
        rep = ac.build("repair", swing=0.35 * math.sin(2 * math.pi * k / 8)).arrays()
        for f in range(8):
            R = rot_model(f * 45)
            on = k % 2 == 0
            img = frame(ac, rep, f * 45, {"beacon": on})
            img = beacon_glow(img, ac, R, rep, on)
            img = sparks(img, R, ac.work_point(), k)
            put(img, 10 + f // 2, (f % 2) * 8 + k)
        print(ac.name, "repair frame", k, flush=True)
    for f in range(8):
        R = rot_model(f * 45)
        img = frame(ac, pk, f * 45, {"char": 0.8})
        rng = np.random.default_rng(f)
        sm = np.zeros_like(img)
        cx, cy, _ = project(np.array([0, 0, ac.hull_top + 0.3]), SCALE, CELL, CELL)
        for s in range(7):
            bs.smoke(sm, cx + s * 0.8, cy - 3 - s * 3, 2.5 + s * 0.8, rng, a=0.45 * (1 - s / 8), shade_=0.18 + 0.03 * s)
        put(over(sm, img), 14, f)
        put(bs.explosion(CELL, CELL, f, seed=33), 14, 8 + f)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    sel = sys.argv[1:] or ["ru", "us", "cn"]
    table = {"ru": (BREM1, "arv_brem1_russia.png"), "us": (M88A2, "arv_m88a2_usa.png"),
             "cn": (Type90ARV, "arv_type90ii_china.png")}
    for k in sel:
        cls, fn = table[k]
        build_sheet(cls(), out + fn)
