"""
RA2-style AH-64E APACHE GUARDIAN sheet (US faction), proportions taken from 3-view / 3D references.
Cell 80x80, 16 columns x 16 rows (1280x1280). Scale 3.0 px/m.
  R0-1    HOVER  32 facings, rotor frame A      R2-3  HOVER 32 facings, rotor frame B
  R4-5    MOVE   32 facings (nose-down), rotor A R6-7  MOVE  32 facings, rotor B
          (alternate A/B every tick -> spinning rotor; disc blur is baked in)
  R8-9    SHADOW 32 facings (body + faint rotor-disc shadow)
  R10     ATTACK ROCKETS 16 facings (Hydra 70 salvo from outboard pods)
  R11     ATTACK GUN     16 facings (M230 30 mm chain gun burst)
  R12     c0-7 AGM-114 Hellfire in flight, 8 facings | c8-15 explosion
  R13     CRASH 16 frames (spinning down, engine burning, rotor slowing)
  R14     DAMAGED hover 16 facings (low health: engine smoking + small fire)
  R15     WRECK c0-3 burning, c4-5 smoldering, c6 smoke, c7 cold | c8-15 explosion
Facing 0 = screen-up, clockwise (32 facings = 11.25 deg, 16 facings = 22.5 deg).
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py in the same folder.
"""
import math
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import (Mesh, shade, shadow_layer, over, blob, rot_model, project, noise3, bomb_mesh,
                            FUSE, NAC, FIN, STAB, POD, BOMB, WING_U, WING_L)
from infantry_sprites import ellipsoid, loft_axis, limb, basis, transform
from m1_abrams_sprites import box, extrude_xy

SCALE = 3.0
CELL = 80
ROTOR, GLASS_P, SENSOR, GUNP, GEAR, TROTOR, RADOME, HELL, HYDRA = range(170, 179)
MAST = np.array([0.0, 0.0, 2.0])
R_MAIN = 7.3

def beam(m, p0, p1, w, h, part, up=(0, 0, 1)):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0; L = np.linalg.norm(d)
    if abs(d @ np.asarray(up, float)) / L > 0.95: up = (1.0, 0, 0)
    st = len(m.V)
    box(m, 0, L, -w / 2, w / 2, -h / 2, h / 2, part)
    B = basis(d, up)
    for i in range(st, len(m.V)):
        m.T[i] = m.V[i].copy()
        m.V[i] = m.V[i] @ B.T + p0; m.N[i] = m.N[i] @ B.T

class Apache:
    name = "AH-64E Apache"
    cell = CELL
    L = 8.0
    OD = np.array([0.30, 0.34, 0.25])          # US Army helicopter olive drab
    spec, shininess, sky = 0.15, 12, 0.05
    dmg_pt = np.array([-0.6, -0.95, 0.75])     # right engine

    def prof(self, x):
        X = [-7.6, -6.5, -3.5, -1.5, 0.5, 2.5, 4.0, 5.6, 6.4, 6.8]
        RY = [0.16, 0.2, 0.32, 0.55, 0.62, 0.55, 0.46, 0.40, 0.30, 0.0]
        RZ = [0.25, 0.3, 0.42, 0.85, 0.95, 0.9, 0.85, 0.62, 0.42, 0.0]
        ZC = [0.65, 0.6, 0.45, 0.2, 0.15, 0.15, 0.15, 0.0, -0.1, -0.1]
        return np.interp(x, X, ZC), np.interp(x, X, RY), np.interp(x, X, RZ)

    # ------------------------------------------------------------------ geometry
    def rotor(self, m, ang, slow=1.0):
        hub = MAST
        for k in range(4):
            a = ang + k * math.pi / 2
            d = np.array([math.cos(a), math.sin(a), -0.02])
            beam(m, hub + d * 0.35, hub + d * R_MAIN * slow, 0.53, 0.06, ROTOR)

    def tail_rotor(self, m, ang):
        c = np.array([-8.25, 0.42, 2.05])
        for k, base in enumerate((0, math.radians(55), math.pi, math.pi + math.radians(55))):
            a = ang + base
            d = np.array([math.cos(a), 0, math.sin(a)])
            beam(m, c + d * 0.1, c + d * 1.4, 0.25, 0.04, TROTOR, up=(0, 1, 0))

    def build(self, rotor_ang=0.0, slow=1.0, tail_ang=0.0, broken=False):
        m = Mesh()
        xs = np.concatenate([np.linspace(-7.6, 6.6, 40), [6.8]])
        zc, ry, rz = self.prof(xs)
        bs.loft(m, xs, ry, rz, zc, n=18, power=2.8, comp=1)
        # avionics sponsons (cheek bays) - the Apache's signature boxy sides
        for sd in (1, -1):
            extrude_xy(m, [(4.6, sd * 0.42), (4.6, sd * 0.85), (-0.4, sd * 1.0), (-1.0, sd * 0.55),
                           (-1.0, sd * 0.42)], -0.7, 0.05, FUSE, inset=0.95)
        # engines + "black hole" exhaust suppressors
        for sd in (1, -1):
            bs.body(m, 1.0, -2.1, lambda t: np.interp(t, [0, 0.1, 0.8, 1], [0.32, 0.4, 0.38, 0.3]),
                    sd * 0.95, 0.85, n=12, ns=8, part=NAC, comp=1)
            st = len(m.V)
            box(m, -2.9, -2.0, -0.18, 0.18, -0.2, 0.2, NAC)
            transform(m, st, np.array([[math.cos(sd * 0.5), -math.sin(sd * 0.5), 0],
                                       [math.sin(sd * 0.5), math.cos(sd * 0.5), 0], [0, 0, 1]]),
                      t=(0, sd * 1.05, 0.9))
        # stub wings + pylons: inboard Hellfire racks, outboard Hydra pods
        for sd in (1, -1):
            cp = 2 if sd > 0 else 3
            bs.wing(m, (0.6, 1.0, 1.25, 0.35), (2.75, 0.75, 1.0, 0.35), 0.18, 0.12, side=sd, comp=cp, ns=5, nc=6,
                    dihedral=-4)
            yy = sd * 1.55
            box(m, 0.2, 0.7, yy - 0.06, yy + 0.06, -0.05, 0.3, GEAR)
            for dy in (-0.14, 0.14):
                for dz in (-0.13, -0.42):
                    bomb_mesh(m, 0.55, yy + dy, dz, 1.6, 0.09, part=HELL, comp=cp)
            yy = sd * 2.45
            box(m, 0.2, 0.7, yy - 0.06, yy + 0.06, -0.05, 0.3, GEAR)
            bs.body(m, 1.3, -0.4, lambda t: np.full_like(t, 0.25), yy, -0.22, n=12, ns=2, part=HYDRA, comp=cp)
        # tail: vertical fin, stabilator, tail wheel
        m2 = Mesh()
        bs.wing(m2, (0.6, -7.2, 1.5, 0), (2.4, -8.1, 0.9, 0), 0.22, 0.12, vertical=True, parts=(FIN, FIN),
                comp=4, ns=6, nc=6)
        bs.wing(m2, (0.15, -7.55, 1.0, 0.35), (1.75, -7.75, 0.8, 0.35), 0.1, 0.06, parts=(STAB, STAB), comp=4,
                ns=5, nc=5)
        bs.wing(m2, (0.15, -7.55, 1.0, 0.35), (1.75, -7.75, 0.8, 0.35), 0.1, 0.06, side=-1, parts=(STAB, STAB),
                comp=4, ns=5, nc=5)
        limb(m2, np.array([-7.4, 0, 0.4]), np.array([-7.5, 0, -0.35]), 0.04, 0.04, GEAR, bulge=0)
        ellipsoid(m2, np.array([-7.5, 0, -0.45]), 0.16, 0.07, 0.16, GEAR, n=8, ns=6)
        self.tail_rotor(m2, tail_ang)
        if broken:   # snapped tail boom for the wreck
            R = np.array([[math.cos(0.5), -math.sin(0.5), 0], [math.sin(0.5), math.cos(0.5), 0], [0, 0, 1]])
            transform(m2, 0, R, t=(0.6, 0.9, -0.2), pivot=(-4.5, 0, 0.5))
        m.merge(m2)
        # mast, rotor hub, Longbow fire-control radar dome
        limb(m, np.array([0, 0, 0.9]), MAST + [0, 0, 0.05], 0.14, 0.12, NAC, bulge=0)
        ellipsoid(m, MAST, 0.45, 0.45, 0.14, NAC, n=12, ns=6)
        loft_axis(m, MAST + [0, 0, 0.15], MAST + [0, 0, 0.6],
                  lambda t: 0.5 * np.clip(1 - np.abs(2 * t - 1) ** 6, 0, 1) ** 0.3,
                  lambda t: 0.5 * np.clip(1 - np.abs(2 * t - 1) ** 6, 0, 1) ** 0.3, RADOME, n=14, ns=6)
        if not broken:
            self.rotor(m, rotor_ang, slow)
        else:
            for k in range(2):   # bent stubs
                a = rotor_ang + k * 2.1
                d = np.array([math.cos(a), math.sin(a), -0.25])
                beam(m, MAST + d * 0.3, MAST + d * 2.6, 0.5, 0.06, ROTOR)
        # nose: TADS/PNVS turret + M230 chain gun + landing gear
        ellipsoid(m, np.array([6.75, 0, -0.15]), 0.32, 0.26, 0.3, SENSOR, n=12, ns=8)
        for sd in (1, -1):
            bs.body(m, 6.95, 6.55, lambda t: np.full_like(t, 0.17), sd * 0.3, -0.18, n=10, ns=2, part=SENSOR)
        ellipsoid(m, np.array([6.3, 0, 0.35]), 0.15, 0.13, 0.13, SENSOR, n=10, ns=6)
        ellipsoid(m, np.array([3.6, 0, -0.85]), 0.22, 0.22, 0.18, GUNP, n=10, ns=6)
        bs.body(m, 5.0, 3.7, lambda t: np.full_like(t, 0.045), 0, -0.88, n=8, ns=2, part=GUNP)
        for sd in (1, -1):
            limb(m, np.array([2.4, sd * 0.6, -0.6]), np.array([2.1, sd * 0.95, -1.35]), 0.05, 0.05, GEAR, bulge=0)
            ellipsoid(m, np.array([2.1, sd * 0.98, -1.4]), 0.3, 0.1, 0.3, GEAR, n=10, ns=6)
        return m

    def rotor_disc(self, R, frac=1.0):
        th = np.linspace(0, 2 * np.pi, 48)
        pts = MAST + np.stack([np.cos(th) * R_MAIN * frac, np.sin(th) * R_MAIN * frac, np.zeros_like(th)], 1)
        return pts @ R.T

    def colorize(self, part, P, ctx):
        n = len(P); x, y, z = P[:, 0], P[:, 1], P[:, 2]
        col = np.tile(self.OD, (n, 1)) * (1 + 0.05 * noise3(P, 1.2, 5))[:, None]
        col = bs.panel(col, P, size=1.2, a=0.02)
        if part == FUSE:
            zc, ry, rz = self.prof(x)
            rel = (z - zc) / np.maximum(rz, 1e-3)
            glass = (x > 2.7) & (x < 6.1) & (rel > 0.25) & (np.abs(y) < 0.5)
            frame = (np.mod((x - 2.7) / 0.85, 1) < 0.12) | (np.abs(np.abs(y) - 0.28) < 0.04)
            col[glass] = [0.16, 0.22, 0.26]
            col[glass & frame] = self.OD * 0.8
        if part == NAC:
            col[x > 0.92] = [0.06, 0.06, 0.07]
        if part in (ROTOR, TROTOR):
            col = np.tile([0.17, 0.18, 0.17], (n, 1))
            col[np.linalg.norm(P[:, :2] - MAST[:2], axis=1) > R_MAIN - 0.5] = [0.65, 0.62, 0.30]   # tip caps
        if part == SENSOR: col = np.tile([0.16, 0.17, 0.16], (n, 1)); col[x > 6.9] = [0.10, 0.18, 0.28]
        if part == GUNP: col = np.tile([0.12, 0.12, 0.12], (n, 1))
        if part == GEAR: col = np.tile([0.14, 0.14, 0.13], (n, 1))
        if part == RADOME: col = self.OD * np.array([1.08, 1.08, 1.08]) + np.zeros((n, 3))
        if part == HELL:
            col = np.tile([0.32, 0.34, 0.24], (n, 1)); col[np.mod(x * 3, 1) < 0.08] = [0.85, 0.72, 0.12]
        if part == HYDRA:
            col = np.tile([0.22, 0.25, 0.18], (n, 1))
            col[x > 1.25] = [0.08, 0.08, 0.08]
        if ctx.get("char"):
            k = np.clip(ctx["char"] * (0.6 + 1.1 * noise3(P, 1.0, 7)), 0, 1)
            col = col * (1 - k[:, None]) + np.array([0.09, 0.08, 0.07]) * k[:, None]
        if ctx.get("damage"):
            dd = np.linalg.norm(P - self.dmg_pt, axis=1)
            k = np.clip(np.exp(-(dd / 1.8) ** 2) * ctx["damage"], 0, 0.9)
            col = col * (1 - k[:, None]) + np.array([0.08, 0.07, 0.06]) * k[:, None]
        return col

# ------------------------------------------------------------------ rendering helpers
def disc_overlay(img, ac, R, alpha=0.16, frac=1.0):
    pts = ac.rotor_disc(R, frac)
    sx, sy, _ = project(pts, SCALE, CELL, CELL)
    from PIL import ImageDraw
    lay = Image.new("L", (CELL * 4, CELL * 4), 0)
    ImageDraw.Draw(lay).polygon(list(zip(sx * 4, sy * 4)), fill=255)
    a = np.asarray(lay, float).reshape(CELL, 4, CELL, 4).mean((1, 3)) / 255 * alpha
    disc = np.zeros((CELL, CELL, 4)); disc[..., :3] = np.array([0.18, 0.19, 0.17])[None, None] * a[..., None]
    disc[..., 3] = a
    return over(disc, img) if True else img

def heli(ac, facing, rot_frame, pitch=0.0, roll=0.0, ctx=None, slow=1.0, disc=True):
    R = rot_model(facing, pitch, roll)
    m = ac.build(rotor_ang=math.radians(45 * rot_frame + 10), slow=slow, tail_ang=1.3 * rot_frame).arrays()
    img = shade(ac, m, R, SCALE, CELL, CELL, ctx or {})
    if disc: img = disc_overlay(img, ac, R, 0.16 * slow)
    return img, R

def salvo(img, R, k_side, kind):
    fx = np.zeros_like(img); rng = np.random.default_rng(7 + k_side)
    fwd = R @ np.array([1.0, 0, 0])
    if kind == "rockets":
        for sd in (1, -1):
            p = R @ np.array([1.35, sd * 2.45, -0.22])
            for s in range(6):                           # rocket motor flames streaking forward
                q = p + fwd * (0.5 + s * 0.9)
                px, py, _ = project(q, SCALE, CELL, CELL)
                blob(fx, px, py, 1.6 - 0.15 * s, [1.0, 0.75 - 0.05 * s, 0.25], 0.9 - 0.1 * s)
            px, py, _ = project(p, SCALE, CELL, CELL)
            for s in range(4):
                bs.smoke(fx, px + rng.normal(0, 1.5), py + rng.normal(0, 1), 2.5 + s, rng, a=0.4, shade_=0.72)
            blob(fx, px, py, 2.4, [1.0, 0.95, 0.7], 1.0)
    else:
        p = R @ np.array([5.1, 0, -0.88])
        px, py, _ = project(p + fwd * 0.3, SCALE, CELL, CELL)
        blob(fx, px, py, 3.0, [1.0, 0.7, 0.2], 0.95); blob(fx, px, py, 1.4, [1.0, 1.0, 0.8], 1.0)
        for s in range(3):                               # tracer burst
            q = p + fwd * (2.0 + 2.2 * s)
            qx, qy, _ = project(q, SCALE, CELL, CELL)
            blob(fx, qx, qy, 0.9, [1.0, 0.85, 0.35], 1.0)
        cx, cy, _ = project(R @ np.array([3.6, 0.3, -0.95]), SCALE, CELL, CELL)
        blob(fx, cx, cy + 2, 0.7, [1.0, 0.8, 0.3], 1.0)  # ejected links/cases
    return over(fx, img)

def hellfire(facing):
    m = Mesh(); bomb_mesh(m, 0, 0, 0, 1.63, 0.09, part=HELL)
    R = rot_model(facing)
    ac = Apache()
    img = shade(ac, m.arrays(), R, SCALE * 4, CELL, CELL)
    fx = np.zeros_like(img)
    back = R @ np.array([-1.0, 0, 0]); tail = R @ np.array([-0.85, 0, 0])
    for s in range(6):
        px, py, _ = project(tail + back * s * 0.15, SCALE * 4, CELL, CELL)
        blob(fx, px, py, 2.4 - 0.3 * s, [1.0, 0.6 + 0.05 * s, 0.2], 0.9 - 0.1 * s)
    for s in range(3):
        px, py, _ = project(tail + back * (1.1 + 0.35 * s), SCALE * 4, CELL, CELL)
        bs.smoke(fx, px, py, 2.5 + s, np.random.default_rng(s), a=0.35, shade_=0.8)
    return over(img, fx)

def build_sheet(path):
    ac = Apache()
    sheet = np.zeros((16 * CELL, 16 * CELL, 4))
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    for f in range(32):
        hd = f * 11.25; r, c = divmod(f, 16)
        for fr in (0, 1):
            put(heli(ac, hd, fr)[0], r + 2 * fr, c)
            put(heli(ac, hd, fr, pitch=-10)[0], 4 + r + 2 * fr, c)
        R = rot_model(hd)
        arr = ac.build(rotor_ang=math.radians(10)).arrays()
        shd = shadow_layer(arr[0] @ R.T, SCALE, CELL, CELL, alpha=0.5)
        put(disc_overlay(shd, ac, R, 0.12) * np.array([0, 0, 0, 1.0]) + np.array([0, 0, 0, 0]), 8 + r, c)
        if f % 8 == 7: print("facing", f, flush=True)
    for i in range(16):
        img, R = heli(ac, i * 22.5, i % 2, pitch=-6)
        put(salvo(img, R, i, "rockets"), 10, i)
        img, R = heli(ac, i * 22.5, i % 2, pitch=-6)
        put(salvo(img, R, i, "gun"), 11, i)
    for c in range(8):
        put(hellfire(c * 45), 12, c)
        put(bs.explosion(CELL, CELL, c, seed=51), 12, 8 + c)
    for k in range(16):                                   # crash: spin + nose down + smoke
        t = k / 15
        hd = 135 + 360 * 1.6 * t ** 1.3
        slow = max(0.35, 1 - 0.6 * t)
        img, R = heli(ac, hd, k % 2, pitch=-8 - 22 * t, roll=12 * math.sin(k), ctx={"damage": 0.4 + 0.5 * t},
                      slow=slow, disc=k < 9)
        rng = np.random.default_rng(600 + k)
        E = R @ ac.dmg_pt
        ex, ey, _ = project(E, SCALE, CELL, CELL)
        sm = np.zeros_like(img)
        for s in range(10):
            a = rng.uniform(0, 2 * np.pi)
            bs.smoke(sm, ex + math.cos(a) * s * 1.2, ey - s * 2.6, 1.8 + 0.5 * s, rng, a=0.55 * (1 - s / 11),
                     shade_=0.16 + 0.03 * s)
        fr = np.zeros_like(img); bs.fire(fr, ex, ey, 2.4 + 1.2 * t, rng, 1.0)
        put(over(fr, over(img, sm)), 13, k)
    for i in range(16):                                   # damaged hover (low health), smoking engine
        img, R = heli(ac, i * 22.5, i % 2, ctx={"damage": 0.5})
        rng = np.random.default_rng(800 + i)
        ex, ey, _ = project(R @ ac.dmg_pt, SCALE, CELL, CELL)
        sm = np.zeros_like(img)
        for s_ in range(8):
            bs.smoke(sm, ex + s_ * 0.8, ey - s_ * 2.6, 1.6 + 0.5 * s_, rng, a=0.5 * (1 - s_ / 9), shade_=0.2 + 0.03 * s_)
        fr = np.zeros_like(img); bs.fire(fr, ex, ey, 1.6, rng, 0.6)
        put(over(fr, over(img, sm)), 14, i)
    # WRECK
    wm = ac.build(rotor_ang=0.7, broken=True)
    V = np.concatenate(wm.V); transform(wm, 0, np.eye(3), t=(0, 0, -V[..., 2].min() - 0.25))
    for k in range(8):
        R = rot_model(120)
        arr = wm.arrays()
        img = shade(ac, arr, R, SCALE, CELL, CELL, {"char": 0.75})
        shd = shadow_layer(arr[0] @ R.T, SCALE, CELL, CELL, light_proj=True, alpha=0.5)
        g = np.zeros_like(img); rng = np.random.default_rng(5)
        for i in range(18):
            a = rng.uniform(0, 2 * np.pi); rr = rng.uniform(0, 1) * 20
            blob(g, CELL / 2 + math.cos(a) * rr, CELL / 2 + math.sin(a) * rr * 0.5, rng.uniform(4, 8),
                 [0.10, 0.08, 0.06], 0.4, hard=0.9)
        base = over(img, over(shd, g))
        rng = np.random.default_rng(700 + k)
        ax, ay, _ = project(R @ np.array([-0.5, 0, 1.0]), SCALE, CELL, CELL)
        sm = np.zeros_like(img); fr = np.zeros_like(img)
        strength = [1, 1, 1, 1, 0.55, 0.5, 0.25, 0][k]
        if strength > 0:
            for s in range(10):
                bs.smoke(sm, ax + s * 0.9 + rng.normal(0, 1), ay - s * 3.2 - 2, 2.2 + s * 0.8, rng,
                         a=0.5 * strength * (1 - s / 11), shade_=0.16 + 0.03 * s)
        if k <= 3:
            bs.fire(fr, ax, ay, 3.5, rng, 1.2)
            bx, by, _ = project(R @ np.array([1.5, 0.9, 0.3]), SCALE, CELL, CELL)
            bs.fire(fr, bx, by, 2.4, rng, 0.8)
        elif k <= 5:
            for e in range(4):
                blob(fr, ax + rng.normal(0, 3), ay + rng.normal(0, 1.5), rng.uniform(0.8, 1.6), [1, 0.45, 0.1], 0.9)
        put(over(fr, over(sm, base)), 15, k)
        put(bs.explosion(CELL, CELL, k, seed=52), 15, 8 + k)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    build_sheet("/mnt/user-data/outputs/ah64_apache_usa_sheet.png")
