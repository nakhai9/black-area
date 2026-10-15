"""
RA2-style sprite sheet: M1A2 Abrams (desert tan). Reuses renderer from bomber_sprites.py
Cell 64x64, 16 columns x 16 rows (1024x1024). Hull & turret share the same pivot (cell center),
so the engine draws TURRET directly on top of HULL at the same position.
  R0-1   HULL   32 facings, track phase 0
  R2-3   HULL   32 facings, track phase 1
  R4-5   HULL   32 facings, track phase 2
  R6-7   TURRET 32 facings
  R8-9   TURRET firing 32 facings (recoil + muzzle flash)
  R10-11 HULL shadow 32 facings
  R12-13 TURRET shadow 32 facings
  R14    c0-7 WRECK 8 facings | c8-11 burning wreck (facing 4) | c12-15 smoldering
  R15    c0-7 EXPLOSION | c8-11 muzzle smoke puff | c12-15 dust cloud (tracks)
"""
import math
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import (Mesh, rot_model, project, shade, shadow_layer, over, blob, fire, smoke,
                            explosion, noise3, nz)

bs.SS = 4
SCALE = 4.0
HULL, TRACK, SKIRT, TURRET, GUN, OPTIC, RACK, DETAIL, MUZZLE = 30, 31, 32, 33, 34, 35, 36, 37, 38
HX = 0.4  # hull offset forward of turret pivot

# ------------------------------------------------------------------ geometry helpers
def quad(m, a, b, c, d, part):
    G = np.array([[a, d], [b, c]], float)
    m.add_grid(G, part=part)

def fan(m, ring, part):
    ring = np.asarray(ring, float)
    c = ring.mean(0)
    G = np.stack([np.repeat(c[None], len(ring) + 1, 0), np.vstack([ring, ring[:1]])])
    m.add_grid(G, part=part)

def prism(m, bot, top, part, caps=True):
    """bot/top: (n,3) rings, flat faces per edge"""
    n = len(bot)
    for i in range(n):
        j = (i + 1) % n
        quad(m, bot[i], bot[j], top[j], top[i], part)
    if caps:
        fan(m, bot, part); fan(m, top, part)

def extrude_xz(m, poly, y0, y1, part, dx=0.0):
    p = np.asarray(poly, float)
    a = np.stack([p[:, 0] + dx, np.full(len(p), y0), p[:, 1]], 1)
    b = np.stack([p[:, 0] + dx, np.full(len(p), y1), p[:, 1]], 1)
    prism(m, a, b, part)

def extrude_xy(m, poly, z0, z1, part, inset=1.0, dx=0.0):
    p = np.asarray(poly, float)
    c = p.mean(0)
    pt = c + (p - c) * inset
    a = np.stack([p[:, 0] + dx, p[:, 1], np.full(len(p), z0)], 1)
    b = np.stack([pt[:, 0] + dx, pt[:, 1], np.full(len(p), z1)], 1)
    prism(m, a, b, part)

def box(m, x0, x1, y0, y1, z0, z1, part):
    extrude_xy(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, part)

def cyl_x(m, x0, x1, y, z, r, part, n=10):
    bs.body(m, x1, x0, lambda t: np.full_like(t, r), y, z, n=n, ns=2, part=part)

# ------------------------------------------------------------------ Abrams
class Abrams:
    name = "M1A2 Abrams"
    cell = 64
    TAN = np.array([0.74, 0.64, 0.46])
    spec, shininess, sky = 0.10, 10, 0.04
    dmg_pt = np.array([0.0, 0.0, 1.8])
    TRACK_Y0, TRACK_Y1 = 1.18, 1.80

    def build_hull(self):
        m = Mesh()
        extrude_xz(m, [(-3.9, 0.42), (3.35, 0.42), (3.95, 0.85), (3.95, 1.05), (2.3, 1.42), (-3.9, 1.42)],
                   -1.2, 1.2, HULL, dx=HX)
        for sd in (1, -1):
            y0, y1 = sd * self.TRACK_Y0, sd * self.TRACK_Y1
            extrude_xz(m, [(-3.6, 0.03), (3.3, 0.03), (3.82, 0.48), (3.85, 0.82), (3.6, 0.95),
                           (-3.72, 0.95), (-3.92, 0.72), (-3.85, 0.38)], min(y0, y1), max(y0, y1), TRACK, dx=HX)
            # fender / sponson over tracks
            extrude_xz(m, [(-3.95, 0.95), (3.75, 0.95), (3.95, 1.06), (2.3, 1.42), (-3.95, 1.42)],
                       min(sd * 1.18, sd * 1.84), max(sd * 1.18, sd * 1.84), HULL, dx=HX)
            # side skirt (heavy front section + rear section)
            ys = sorted([sd * 1.84, sd * 1.90])
            extrude_xz(m, [(0.9, 0.48), (3.45, 0.48), (3.85, 0.95), (3.85, 1.38), (0.9, 1.38)], *ys, SKIRT, dx=HX)
            extrude_xz(m, [(-3.75, 0.55), (0.9, 0.55), (0.9, 1.38), (-3.75, 1.38)], *ys, HULL, dx=HX)
            # headlight / tail light boxes, tow points
            box(m, 3.55 + HX, 3.8 + HX, sd * 1.35 - 0.12, sd * 1.35 + 0.12, 1.1, 1.3, DETAIL)
        # engine deck grille raised, driver hatch
        box(m, -3.7 + HX, -1.9 + HX, -1.05, 1.05, 1.42, 1.47, HULL)
        box(m, 2.0 + HX, 2.55 + HX, -0.35, 0.35, 1.42, 1.5, DETAIL)
        return m

    def build_turret(self, recoil=0.0, gun_pitch=0.0):
        m = Mesh()
        z0, z1 = 1.42, 2.28
        poly = [(2.05, 0.62), (1.25, 1.72), (-1.55, 1.75), (-2.05, 1.45), (-2.05, -1.45),
                (-1.55, -1.75), (1.25, -1.72), (2.05, -0.62)]
        extrude_xy(m, poly, z0, z1, TURRET, inset=0.94)
        # bustle rack
        box(m, -3.05, -2.05, -1.55, 1.55, 1.62, 1.66, RACK)
        for yy in (-1.55, 1.53):
            box(m, -3.05, -2.05, yy, yy + 0.02, 1.62, 2.12, RACK)
        box(m, -3.07, -3.03, -1.55, 1.55, 1.62, 2.12, RACK)
        box(m, -2.95, -2.15, -1.4, 1.4, 1.66, 1.98, DETAIL)   # stowage bags
        # sights / cupola / CITV / loader's MG
        box(m, 0.9, 1.45, -1.05, -0.6, z1 - 0.02, z1 + 0.3, OPTIC)
        bs.body(m, 0.6, -0.6, lambda t: np.full_like(t, 0.32), -0.75, z1 + 0.12, n=10, ns=2,
                part=TURRET, rz_scale=0.4)
        box(m, -0.25, 0.35, -1.0, -0.5, z1 + 0.22, z1 + 0.5, DETAIL)    # CROWS
        cyl_x(m, 0.35, 1.25, -0.75, z1 + 0.38, 0.04, GUN, n=6)
        bs.body(m, 0.5, -0.1, lambda t: np.full_like(t, 0.24), 0.75, z1 + 0.15, n=10, ns=2, part=OPTIC,
                rz_scale=1.3)  # CITV
        box(m, -0.6, 0.0, 0.55, 1.05, z1 - 0.02, z1 + 0.08, TURRET)       # loader hatch
        cyl_x(m, 0.0, 0.9, 0.85, z1 + 0.25, 0.035, GUN, n=6)
        box(m, -1.5, -1.4, 1.2, 1.25, z1, z1 + 0.8, DETAIL)               # wind sensor mast
        for sd in (1, -1):                                                # smoke launchers
            box(m, 1.15, 1.45, sd * 1.55 - 0.15, sd * 1.55 + 0.15, 1.95, 2.12, DETAIL)
        # gun: mantlet + barrel (pivot at trunnion x=1.9, z=1.85)
        g = Mesh()
        box(g, 1.8, 2.45, -0.42, 0.42, 1.58, 2.08, TURRET)
        x0 = 2.4 - recoil
        cyl_x(g, x0, x0 + 3.0, 0, 1.84, 0.135, GUN, n=12)                 # thermal sleeve
        cyl_x(g, x0 + 3.0, x0 + 3.7, 0, 1.84, 0.175, GUN, n=12)           # bore evacuator
        cyl_x(g, x0 + 3.7, x0 + 5.25, 0, 1.84, 0.115, GUN, n=12)
        cyl_x(g, x0 + 5.25, x0 + 5.3, 0, 1.84, 0.13, MUZZLE, n=12)
        if gun_pitch:
            th = math.radians(gun_pitch)
            Ry = np.array([[math.cos(th), 0, -math.sin(th)], [0, 1, 0], [math.sin(th), 0, math.cos(th)]])
            piv = np.array([1.9, 0, 1.84])
            for i in range(len(g.V)):
                g.V[i] = (g.V[i] - piv) @ Ry.T + piv; g.N[i] = g.N[i] @ Ry.T
        m.merge(g)
        return m

    def muzzle_local(self, recoil=0.0):
        return np.array([2.4 - recoil + 5.35, 0, 1.84])

    def colorize(self, part, P, ctx):
        n = len(P)
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        col = np.tile(self.TAN, (n, 1))
        col *= (1 + 0.03 * noise3(P, 2.0, 9))[:, None]   # weathering
        ph = ctx.get("phase", 0) * 0.32 / 3
        if part == HULL:
            grille = (z > 1.44) & (x < -1.95 + HX) & (x > -3.65 + HX) & (np.mod((x - HX) * 4, 1) < 0.45)
            col[grille] *= 0.55
            col[(z < 1.0) & (np.abs(y) < 1.2) & (x > 3.0 + HX)] *= 0.85
            col[(z < 0.5)] *= 0.8
        elif part == TRACK:
            col[:] = [0.20, 0.19, 0.17]
            link = np.mod(x - ph, 0.32) < 0.13
            col[link] = [0.32, 0.30, 0.27]
            side = np.abs(np.abs(y) - self.TRACK_Y1) < 0.05
            # road wheels, sprocket (rear), idler (front)
            wx = np.array([-2.85, -2.05, -1.25, -0.45, 0.35, 1.15, 1.95, 2.75]) + HX
            for i, cx in enumerate(wx):
                d = np.hypot(x - cx, z - 0.40)
                ang = np.arctan2(z - 0.40, x - cx) + ph * 6
                w = side & (d < 0.34)
                col[w] = [0.30, 0.28, 0.24]
                col[w & (d > 0.28)] = [0.10, 0.10, 0.10]
                col[w & (d < 0.10)] = [0.45, 0.40, 0.30]
                col[w & (d > 0.14) & (d < 0.24) & (np.mod(ang * 6 / (2 * np.pi), 1) < 0.35)] *= 0.5
            for cx, cz, r in ((-3.55 + HX, 0.62, 0.32), (3.5 + HX, 0.62, 0.3)):
                d = np.hypot(x - cx, z - cz)
                col[side & (d < r)] = [0.28, 0.26, 0.22]
                col[side & (d < r * 0.4)] = [0.15, 0.15, 0.14]
        elif part == SKIRT:
            col *= 0.96
            col[np.mod((x - HX) / 0.85, 1) < 0.04] *= 0.8
        elif part == TURRET:
            col[np.abs(z - 2.28) < 0.02] *= 0.9
        elif part == GUN:
            col *= 0.97
        elif part == MUZZLE:
            col[:] = [0.10, 0.10, 0.10]
        elif part == OPTIC:
            col[:] = [0.30, 0.31, 0.29]
            col[(x > 1.4) & (z > 2.3)] = [0.08, 0.12, 0.16]
        elif part == RACK:
            col[:] = [0.22, 0.22, 0.20]
        elif part == DETAIL:
            col[:] = [0.42, 0.42, 0.30] if True else col
            bag = (x < -2.0) & (z > 1.6)
            col[bag] = [0.40, 0.40, 0.27]
            col[bag & (np.mod(y * 1.6, 1) < 0.08)] *= 0.6
        return col

# ------------------------------------------------------------------ sheet
def build_sheet(out_path):
    ac = Abrams()
    cs = ac.cell
    sheet = np.zeros((16 * cs, 16 * cs, 4))
    def put(img, r, c): sheet[r * cs:(r + 1) * cs, c * cs:(c + 1) * cs] = img
    hull = ac.build_hull().arrays()
    tur = ac.build_turret().arrays()
    tur_fire = ac.build_turret(recoil=0.35).arrays()
    for f in range(32):
        R = rot_model(f * 11.25)
        r, c = divmod(f, 16)
        for p in range(3):
            put(shade(ac, hull, R, SCALE, cs, cs, {"phase": p}), r + 2 * p, c)
        put(shade(ac, tur, R, SCALE, cs, cs), 6 + r, c)
        img = shade(ac, tur_fire, R, SCALE, cs, cs)
        rng = np.random.default_rng(f)
        M = R @ ac.muzzle_local(0.35)
        fwd = R @ np.array([1.0, 0, 0])
        fx = np.zeros((cs, cs, 4))
        for s, rr in ((0.2, 3.2), (0.9, 2.6), (1.6, 1.8)):
            px, py, _ = project(M + fwd * s, SCALE, cs, cs)
            blob(fx, px, py, rr, [1.0, 0.65, 0.15], 0.9)
            blob(fx, px, py, rr * 0.55, [1.0, 0.97, 0.75], 0.95)
        for side in (-1, 1):   # side blast
            lat = R @ np.array([0, side * 1.0, 0])
            px, py, _ = project(M + fwd * 0.3 + lat * 0.8, SCALE, cs, cs)
            blob(fx, px, py, 1.8, [1.0, 0.7, 0.25], 0.8)
        sm = np.zeros((cs, cs, 4))
        for i in range(5):
            px, py, _ = project(M + fwd * rng.uniform(0.5, 2.5) + rng.normal(0, 0.4, 3), SCALE, cs, cs)
            smoke(sm, px, py, rng.uniform(2, 3.5), rng, a=0.35, shade_=0.7)
        put(over(fx, over(img, sm)), 8 + r, c)
        put(shadow_layer(hull[0] @ R.T, SCALE, cs, cs, light_proj=True, alpha=0.5), 10 + r, c)
        put(shadow_layer(tur[0] @ R.T, SCALE, cs, cs, light_proj=True, alpha=0.5), 12 + r, c)
        print("facing", f, flush=True)
    # wreck: charred hull, turret knocked askew, gun drooping
    tur_w = ac.build_turret(gun_pitch=9)
    tv, tn, tt, tp, tc = tur_w.arrays()
    yaw, roll = math.radians(28), math.radians(7)
    Rz = np.array([[math.cos(yaw), -math.sin(yaw), 0], [math.sin(yaw), math.cos(yaw), 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, math.cos(roll), -math.sin(roll)], [0, math.sin(roll), math.cos(roll)]])
    Rr = Rz @ Rx
    tv = tv @ Rr.T + np.array([-0.3, 0.35, 0.05]); tn = tn @ Rr.T
    hv, hn, ht, hp, hc = hull
    wreck_m = (np.concatenate([hv, tv]), np.concatenate([hn, tn]), np.concatenate([ht, tt]),
               np.concatenate([hp, tp]), np.concatenate([hc, tc]))
    def wreck_img(fi, k_fx=None, strength=1.0, seed=0):
        R = rot_model(fi * 45)
        base = shade(ac, wreck_m, R, SCALE, cs, cs, {"char": 0.8})
        g = np.zeros((cs, cs, 4)); rng = np.random.default_rng(50 + fi)
        for i in range(14):
            a = rng.uniform(0, 6.28); rr = rng.uniform(0, 1) * cs * 0.3
            blob(g, cs / 2 + math.cos(a) * rr, cs / 2 + math.sin(a) * rr * 0.5, cs * rng.uniform(0.08, 0.16),
                 [0.10, 0.08, 0.06], 0.4, hard=0.9)
        shd = shadow_layer(wreck_m[0] @ R.T, SCALE, cs, cs, light_proj=True, alpha=0.5)
        img = over(base, over(shd, g))
        if k_fx is None: return img
        rng = np.random.default_rng(700 + seed)
        A = R @ np.array([-0.5, 0, 2.3])
        ax, ay, _ = project(A, SCALE, cs, cs)
        sm = np.zeros((cs, cs, 4)); fr = np.zeros((cs, cs, 4))
        for s in range(9):
            smoke(sm, ax + s * 0.9 + rng.normal(0, 0.8), ay - s * 3.0 - 2, (2.2 + s * 0.7), rng,
                  a=0.55 * strength * (1 - s / 10), shade_=0.15 + 0.03 * s)
        if k_fx == "fire":
            fire(fr, ax, ay, 3.2, rng, 1.0)
            ex, ey, _ = project(R @ np.array([-3.0 + HX, 0, 1.5]), SCALE, cs, cs)
            fire(fr, ex, ey, 2.4, rng, 0.8)
        else:
            for e in range(3):
                blob(fr, ax + rng.normal(0, 2), ay + rng.normal(0, 1), rng.uniform(0.8, 1.4), [1, 0.45, 0.1], 0.9)
        return over(fr, over(sm, img))
    for fi in range(8):
        put(wreck_img(fi), 14, fi)
    for k in range(4):
        put(wreck_img(4, "fire", 1.0, k), 14, 8 + k)
        put(wreck_img(4, "smolder", 0.6 - 0.12 * k, 10 + k), 14, 12 + k)
    for k in range(8):
        put(explosion(cs, cs, k, seed=21), 15, k)
    for k in range(4):   # muzzle smoke puff
        img = np.zeros((cs, cs, 4)); rng = np.random.default_rng(90)
        for i in range(7):
            o = rng.normal(0, 1, 2)
            smoke(img, cs / 2 + o[0] * (3 + 3 * k), cs / 2 + o[1] * (2 + 1.5 * k) - k * 2, 3 + 2.2 * k,
                  rng, a=0.55 * (1 - k / 4.5), shade_=0.72)
        put(img, 15, 8 + k)
    for k in range(4):   # dust cloud
        img = np.zeros((cs, cs, 4)); rng = np.random.default_rng(130)
        for i in range(9):
            o = rng.normal(0, 1, 2)
            g = 0.62 + rng.uniform(-0.05, 0.05)
            blob(img, cs / 2 + o[0] * (4 + 3 * k), cs / 2 + 6 + o[1] * (1.5 + k) - k, 3 + 2.0 * k,
                 [g, g * 0.88, g * 0.68], 0.5 * (1 - k / 4.5), hard=1.2)
        put(img, 15, 12 + k)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(out_path, optimize=True)
    print("saved", out_path)

if __name__ == "__main__":
    build_sheet("/mnt/user-data/outputs/m1_abrams_sheet.png")
