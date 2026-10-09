"""
RA2-style MILITARY TRUCK sheets (3 independent sheets):
  truck_kamaz5350_russia.png  KamAZ-5350 6x6, Russian green, canvas-covered cargo body
  truck_lvsr_usa.png          Oshkosh LVSR MKR18 10x10, US CARC tan, flatbed + 20 ft ISO container
  truck_iveco_eu.png          IVECO Trakker 8x8, NATO 3-tone camo, camo-tarp cargo body
Cell 80x80, 16 columns x 14 rows (1280x1120). Scale 4.0 px/m (same as tanks).
  R0-1   WITH CARGO BODY  32 facings, wheel phase A
  R2-3   WITH CARGO BODY  32 facings, wheel phase B   (alternate A/B while driving)
  R4-5   NO BODY (cab-chassis) 32 facings, wheel phase A
  R6-7   NO BODY 32 facings, wheel phase B
  R8-9   SHADOW with body 32 facings
  R10-11 SHADOW no body 32 facings
  R12    c0-7 DESTROYED with body 8 facings (burning) | c8-15 DESTROYED no body 8 facings
  R13    c0-7 EXPLOSION 8 frames | c8-11 burning wreck loop (facing 3) | c12-15 smoldering wreck
Facing 0 = screen-up, clockwise (32 facings = 11.25 deg, 8 facings = 45 deg).
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py in the same folder.
"""
import math, sys
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import Mesh, shade, shadow_layer, over, blob, rot_model, project, noise3
from infantry_sprites import loft_axis, transform
from m1_abrams_sprites import box, extrude_xy

SCALE = 4.0
CELL = 80
CAB, BED, TARP, FRAME, TIRE, HUB, GLASS, LIGHT, CONT, EXH, GRILLE = range(180, 191)

def wheel(m, c, r, w, side):
    y = np.array([0, 1.0, 0])
    prof = lambda t: r * (0.9 + 0.1 * np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)))
    loft_axis(m, c - y * w / 2, c + y * w / 2, prof, prof, TIRE, fwd=(1, 0, 0), n=16, ns=5)
    hc = c + y * side * (w / 2 + 0.005)
    loft_axis(m, hc - y * 0.02, hc + y * 0.02, lambda t: np.full_like(t, r * 0.55),
              lambda t: np.full_like(t, r * 0.55), HUB, fwd=(1, 0, 0), n=14, ns=2)

class Truck:
    spec, shininess, sky = 0.10, 10, 0.04
    dmg_pt = np.zeros(3)
    def colorize(self, part, P, ctx):
        n = len(P); x, y, z = P[:, 0], P[:, 1], P[:, 2]
        ph = ctx.get("phase", 0)
        if part == TIRE:
            ang = np.arctan2(P[:, 2], P[:, 1])
            col = np.tile([0.13, 0.13, 0.13], (n, 1))
            lug = np.mod(ang * 14 / (2 * np.pi) + 0.5 * ph, 1) < 0.45
            col[lug] = [0.20, 0.20, 0.19]
            return col
        if part == HUB:
            ang = np.arctan2(P[:, 2], P[:, 1]); rr = np.hypot(P[:, 1], P[:, 2])
            col = self.paint(P) * 0.9
            col[np.mod(ang * 8 / (2 * np.pi) + 0.25 * ph, 1) < 0.2] *= 0.55
            col[rr < 0.08] = [0.25, 0.25, 0.25]
            return col
        if part == FRAME: return np.tile([0.14, 0.14, 0.13], (n, 1))
        if part == EXH: return np.tile([0.22, 0.21, 0.20], (n, 1))
        if part == GLASS: return np.tile([0.12, 0.18, 0.24], (n, 1))
        if part == LIGHT: return np.tile([0.95, 0.92, 0.75], (n, 1))
        if part == GRILLE:
            col = np.tile([0.12, 0.12, 0.12], (n, 1)); col[np.mod(z * 12, 1) < 0.5] = [0.24, 0.24, 0.23]; return col
        if part == TARP:
            col = self.tarp(P)
            col[np.mod(x / 0.95, 1) < 0.05] *= 0.75                              # canvas bows / straps
            return col
        if part == CONT:
            col = self.container(P)
            col[np.mod((x + y) * 7, 1) < 0.35] *= 0.88                           # corrugation
            return col
        col = self.paint(P)
        if part == CAB:
            fr = self.cab[1]
            win_f = (x > fr - 0.08) & (z > self.win[0]) & (z < self.win[1]) & (np.abs(y) < self.cab_w - 0.15)
            win_s = (np.abs(y) > self.cab_w - 0.1) & (z > self.win[0]) & (z < self.win[1]) & (x > fr - 0.9) & (x < fr - 0.15)
            col[win_f | win_s] = [0.12, 0.18, 0.24]
            col[win_f & (np.abs(y) < 0.05)] = self.paint(P[win_f & (np.abs(y) < 0.05)]) * 0.8
        return col
    def apply_char(self, col, P, ctx):
        return col

    def build(self, with_body=True, wreck=False):
        m = Mesh()
        L0, L1 = self.frame_x
        for sd in (1, -1):                                                     # chassis rails
            box(m, L0, L1, sd * 0.45 - 0.07, sd * 0.45 + 0.07, self.frame_z - 0.12, self.frame_z + 0.12, FRAME)
        for ax in self.axles:
            box(m, ax - 0.1, ax + 0.1, -self.track, self.track, self.wheel_r - 0.08, self.wheel_r + 0.08, FRAME)
            for sd in (1, -1):
                wheel(m, np.array([ax, sd * self.track, self.wheel_r]), self.wheel_r, 0.42, sd)
        self.build_cab(m)
        for sd in (1, -1):                                                     # fuel tank / battery box
            box(m, self.tank_x[0], self.tank_x[1], sd * 1.0, sd * 1.22 if sd > 0 else -1.22, 0.75, 1.15, FRAME)
        box(m, self.cab[0] - 0.35, self.cab[0] - 0.2, -0.85, -0.75, self.frame_z, self.cab_top + 0.35, EXH)   # stack
        if with_body: self.build_body(m)
        else: self.build_chassis_top(m)
        if wreck:
            V = np.concatenate(m.V)
            R = np.array([[1, 0, 0], [0, math.cos(0.09), -math.sin(0.09)], [0, math.sin(0.09), math.cos(0.09)]])
            transform(m, 0, R, t=(0, 0, -0.25))                                 # flat tyres, listing to one side
        return m

    def build_chassis_top(self, m):
        x0, x1 = self.body_x
        box(m, x1 - 0.5, x1 - 0.3, -1.1, 1.1, self.frame_z, self.frame_z + 0.9, FRAME)   # headboard frame
        box(m, x0, x0 + 0.25, -1.1, 1.1, self.frame_z - 0.4, self.frame_z - 0.2, FRAME)  # rear bumper

# ------------------------------------------------------------------ KamAZ-5350
class KamAZ(Truck):
    name = "KamAZ-5350"
    axles = [2.75, -1.05, -2.45]; wheel_r = 0.58; track = 1.0
    frame_x = (-4.0, 3.6); frame_z = 1.1
    cab = (2.1, 4.0); cab_w = 1.25; cab_top = 3.0; win = (2.15, 2.75)
    tank_x = (0.6, 1.8)
    body_x = (-4.1, 1.75)
    GREEN = np.array([0.33, 0.41, 0.23])
    def paint(self, P): return np.tile(self.GREEN, (len(P), 1)) * (1 + 0.05 * noise3(P, 0.6, 3))[:, None]
    def tarp(self, P): return np.tile([0.36, 0.40, 0.26], (len(P), 1)) * (1 + 0.06 * noise3(P, 1.5, 4))[:, None]
    def build_cab(self, m):
        c0, c1 = self.cab
        extrude_xy(m, [(c0, -self.cab_w), (c1, -self.cab_w), (c1, self.cab_w), (c0, self.cab_w)], 1.25, self.cab_top,
                   CAB, inset=0.94)
        box(m, c1 - 0.05, c1 + 0.08, -1.0, 1.0, 1.35, 1.95, GRILLE)
        box(m, c1, c1 + 0.25, -1.27, 1.27, 0.85, 1.25, CAB)                   # bumper
        for sd in (1, -1):
            box(m, c1 + 0.08, c1 + 0.14, sd * 1.0 - 0.13, sd * 1.0 + 0.13, 1.0, 1.15, LIGHT)
            box(m, c1 - 0.6, c1 - 0.25, sd * 1.3 - 0.04, sd * 1.3 + 0.04 if sd > 0 else -1.26, 2.1, 2.5, FRAME)  # mirrors
        box(m, c0 - 0.15, c0 - 0.05, -0.6, 0.6, 1.3, 2.5, FRAME)                 # spare-wheel carrier
    def build_body(self, m):
        x0, x1 = self.body_x
        box(m, x0, x1, -1.25, 1.25, self.frame_z + 0.1, self.frame_z + 0.25, BED)
        for sd in (1, -1):
            box(m, x0, x1, sd * 1.25 - 0.05 if sd > 0 else -1.25, sd * 1.25 if sd > 0 else -1.2,
                self.frame_z + 0.25, self.frame_z + 0.85, BED)
        extrude_xy(m, [(x0 + 0.05, -1.2), (x1 - 0.05, -1.2), (x1 - 0.05, 1.2), (x0 + 0.05, 1.2)],
                   self.frame_z + 0.6, 3.05, TARP, inset=0.93)

# ------------------------------------------------------------------ Oshkosh LVSR MKR18
class LVSR(Truck):
    name = "Oshkosh LVSR"
    axles = [4.7, 3.15, -0.9, -2.35, -3.8]; wheel_r = 0.62; track = 1.02
    frame_x = (-5.6, 5.4); frame_z = 1.3
    cab = (2.95, 5.15); cab_w = 1.25; cab_top = 3.25; win = (2.45, 2.95)
    tank_x = (1.2, 2.6)
    body_x = (-5.6, 2.6)
    TAN = np.array([0.74, 0.65, 0.47])
    def paint(self, P): return np.tile(self.TAN, (len(P), 1)) * (1 + 0.04 * noise3(P, 0.6, 3))[:, None]
    def tarp(self, P): return self.paint(P)
    def container(self, P): return np.tile([0.62, 0.58, 0.44], (len(P), 1))
    def build_cab(self, m):
        c0, c1 = self.cab
        extrude_xy(m, [(c0, -self.cab_w), (c1 - 0.3, -self.cab_w), (c1, -1.0), (c1, 1.0), (c1 - 0.3, self.cab_w),
                       (c0, self.cab_w)], 1.35, self.cab_top, CAB, inset=0.92)   # armoured cab
        extrude_xy(m, [(c1 - 0.1, -1.1), (c1 + 0.55, -1.0), (c1 + 0.55, 1.0), (c1 - 0.1, 1.1)], 1.0, 2.0, CAB,
                   inset=0.95)                                                 # short nose
        box(m, c1 + 0.5, c1 + 0.6, -0.8, 0.8, 1.2, 1.85, GRILLE)
        box(m, c1 + 0.5, c1 + 0.8, -1.25, 1.25, 0.75, 1.1, CAB)
        for sd in (1, -1):
            box(m, c1 + 0.6, c1 + 0.66, sd * 1.0 - 0.12, sd * 1.0 + 0.12, 1.15, 1.3, LIGHT)
        box(m, c0 + 0.6, c0 + 1.2, -0.3, 0.3, self.cab_top, self.cab_top + 0.25, FRAME)   # roof hatch / ring
    def build_body(self, m):
        x0, x1 = self.body_x
        box(m, x0, x1, -1.25, 1.25, self.frame_z + 0.12, self.frame_z + 0.3, CAB)       # flatbed
        for sd in (1, -1):
            box(m, x0, x1, sd * 1.25 - 0.05 if sd > 0 else -1.25, sd * 1.25 if sd > 0 else -1.2,
                self.frame_z + 0.3, self.frame_z + 0.6, CAB)
        box(m, x0 + 0.1, x0 + 6.15, -1.22, 1.22, self.frame_z + 0.3, self.frame_z + 2.89, CONT)   # 20 ft ISO
        box(m, x0 + 6.4, x1 - 0.1, -1.0, 1.0, self.frame_z + 0.3, self.frame_z + 1.3, TARP)       # palletised load

# ------------------------------------------------------------------ IVECO Trakker 8x8
class Iveco(Truck):
    name = "IVECO Trakker"
    axles = [3.95, 2.45, -1.75, -3.15]; wheel_r = 0.58; track = 1.0
    frame_x = (-4.8, 4.6); frame_z = 1.15
    cab = (3.0, 4.95); cab_w = 1.25; cab_top = 3.15; win = (2.25, 2.85)
    tank_x = (1.0, 2.4)
    body_x = (-4.9, 2.65)
    PAL = [np.array(c) for c in ([0.35, 0.41, 0.27], [0.44, 0.34, 0.24], [0.15, 0.15, 0.13])]
    def paint(self, P):
        a = noise3(P, 0.9, 121); b = noise3(P, 1.1, 122)
        col = np.tile(self.PAL[0], (len(P), 1))
        col[a > 0.2] = self.PAL[1]; col[(b > 0.3) & (a <= 0.2)] = self.PAL[2]
        return col
    def tarp(self, P): return self.paint(P + 5) * 0.95
    def build_cab(self, m):
        c0, c1 = self.cab
        extrude_xy(m, [(c0, -self.cab_w), (c1, -self.cab_w), (c1 + 0.1, -1.0), (c1 + 0.1, 1.0), (c1, self.cab_w),
                       (c0, self.cab_w)], 1.3, self.cab_top, CAB, inset=0.93)
        box(m, c1 + 0.05, c1 + 0.15, -0.9, 0.9, 1.4, 2.0, GRILLE)
        box(m, c1, c1 + 0.3, -1.27, 1.27, 0.85, 1.3, CAB)
        for sd in (1, -1):
            box(m, c1 + 0.14, c1 + 0.2, sd * 1.0 - 0.13, sd * 1.0 + 0.13, 1.05, 1.2, LIGHT)
        box(m, c0 + 0.3, c1 - 0.3, -1.1, 1.1, self.cab_top, self.cab_top + 0.15, CAB)   # roof spoiler
    def build_body(self, m):
        x0, x1 = self.body_x
        box(m, x0, x1, -1.25, 1.25, self.frame_z + 0.1, self.frame_z + 0.25, BED)
        for sd in (1, -1):
            box(m, x0, x1, sd * 1.25 - 0.05 if sd > 0 else -1.25, sd * 1.25 if sd > 0 else -1.2,
                self.frame_z + 0.25, self.frame_z + 0.8, BED)
        extrude_xy(m, [(x0 + 0.05, -1.2), (x1 - 0.05, -1.2), (x1 - 0.05, 1.2), (x0 + 0.05, 1.2)],
                   self.frame_z + 0.6, 3.15, TARP, inset=0.94)

# ------------------------------------------------------------------ render
class Charred:
    def __init__(self, base): self.b = base; self.spec, self.shininess, self.sky, self.dmg_pt = 0.03, 8, 0.0, base.dmg_pt
    def colorize(self, part, P, ctx):
        col = self.b.colorize(part, P, ctx)
        k = np.clip(0.85 * (0.6 + 1.1 * noise3(P, 1.0, 7)), 0, 1)
        if part in (TARP,):
            k = np.clip(k + 0.3, 0, 1)
        return col * (1 - k[:, None]) + np.array([0.08, 0.07, 0.06]) * k[:, None]

def drive(ac, arr, facing, phase):
    return shade(ac, arr, rot_model(facing), SCALE, CELL, CELL, {"phase": phase})

def wreck_frame(ac, arr, facing, fx_level, seed):
    R = rot_model(facing)
    img = shade(Charred(ac), arr, R, SCALE, CELL, CELL, {})
    shd = shadow_layer(arr[0] @ R.T, SCALE, CELL, CELL, light_proj=True, alpha=0.5)
    g = np.zeros_like(img); rng = np.random.default_rng(seed)
    for i in range(14):
        a = rng.uniform(0, 2 * np.pi); rr = rng.uniform(0, 1) * 18
        blob(g, CELL / 2 + math.cos(a) * rr, CELL / 2 + math.sin(a) * rr * 0.5, rng.uniform(4, 8),
             [0.10, 0.08, 0.06], 0.4, hard=0.9)
    img = over(img, over(shd, g))
    if fx_level <= 0: return img
    rng = np.random.default_rng(900 + seed)
    pts = [np.array([ac.cab[0] + 0.8, 0, ac.cab_top]), np.array([(ac.body_x[0] + ac.body_x[1]) / 2, 0, 2.2])]
    sm = np.zeros_like(img); fr = np.zeros_like(img)
    for i, p in enumerate(pts):
        px, py, _ = project(R @ p, SCALE, CELL, CELL)
        for s in range(9):
            bs.smoke(sm, px + s * 0.8 + rng.normal(0, 1), py - s * 3 - 2, 2 + s * 0.8, rng,
                     a=0.5 * fx_level * (1 - s / 10), shade_=0.15 + 0.03 * s)
        if fx_level >= 1:
            bs.fire(fr, px, py, 3.0 if i == 0 else 2.6, rng, 1.0)
        else:
            for e in range(3):
                blob(fr, px + rng.normal(0, 2.5), py + rng.normal(0, 1), rng.uniform(0.8, 1.5), [1, 0.45, 0.1], 0.9)
    return over(fr, over(sm, img))

def build_sheet(ac, path):
    sheet = np.zeros((14 * CELL, 16 * CELL, 4))
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    full, bare = ac.build(True).arrays(), ac.build(False).arrays()
    for f in range(32):
        hd = f * 11.25; r, c = divmod(f, 16)
        for p in (0, 1):
            put(drive(ac, full, hd, p), r + 2 * p, c)
            put(drive(ac, bare, hd, p), 4 + r + 2 * p, c)
        R = rot_model(hd)
        put(shadow_layer(full[0] @ R.T, SCALE, CELL, CELL, light_proj=True, alpha=0.5), 8 + r, c)
        put(shadow_layer(bare[0] @ R.T, SCALE, CELL, CELL, light_proj=True, alpha=0.5), 10 + r, c)
    wf, wb = ac.build(True, wreck=True).arrays(), ac.build(False, wreck=True).arrays()
    for f in range(8):
        put(wreck_frame(ac, wf, f * 45, 1, f), 12, f)
        put(wreck_frame(ac, wb, f * 45, 1, 20 + f), 12, 8 + f)
        put(bs.explosion(CELL, CELL, f, seed=61), 13, f)
    for k in range(4):
        put(wreck_frame(ac, wf, 135, 1, 40 + k), 13, 8 + k)
        put(wreck_frame(ac, wf, 135, [0.6, 0.45, 0.3, 0.0][k], 50 + k), 13, 12 + k)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    sel = sys.argv[1:] or ["kamaz", "lvsr", "iveco"]
    table = {"kamaz": (KamAZ, "truck_kamaz5350_russia.png"), "lvsr": (LVSR, "truck_lvsr_usa.png"),
             "iveco": (Iveco, "truck_iveco_eu.png")}
    for k in sel:
        cls, fn = table[k]
        build_sheet(cls(), out + fn)
