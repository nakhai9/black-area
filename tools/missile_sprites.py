"""
RA2-style UNIVERSAL FIGHTER MISSILE sheet (one missile shared by every faction's fighters).
Faction-neutral: white body, grey seeker nose, black + yellow warhead bands, no national markings.
Cell 64x64, 16 columns x 9 rows (1024x576). Missile drawn at 14 px/m (enlarged for readability).
  R0-1  FLY level, 32 facings, flame frame A   (facing 0 = screen-up, clockwise, 11.25 deg steps)
  R2-3  FLY level, 32 facings, flame frame B   (alternate A/B every tick for a flickering motor)
  R4    DIVE 35 deg, 16 facings (every 2nd facing)
  R5    DIVE 70 deg, 16 facings
  R6    SHADOW, 16 facings (top-down silhouette)
  R7    c0-7 smoke-trail puff life cycle (spawn behind the missile every few ticks) | c8-15 AIR BURST (hit on aircraft)
  R8    c0-7 GROUND IMPACT explosion | c8-15 LAUNCH (motor ignition flash + smoke, spawn at the rail)
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py, bombs_sprites.py in the same folder.
"""
import math, sys
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import Mesh, shade, shadow_layer, over, blob, rot_model, noise3, project
from infantry_sprites import loft_axis, stylise
import bombs_sprites as bm
from bombs_sprites import fins

SCALE = 14.0
CELL = 64
L = 3.7
BODY, SEEK, MFIN, TFIN, NOZ = 130, 131, 132, 133, 134

class Missile:
    name = "Universal AAM"
    spec, shininess, sky = 0.35, 20, 0.07
    dmg_pt = np.zeros(3)
    def build(self):
        m = Mesh()
        R = 0.12
        def prof(t):
            r = np.full_like(t, R)
            nn = t > 0.86
            s = (t[nn] - 0.86) / 0.14
            r[nn] = R * np.sqrt(np.clip(1 - s ** 1.6, 0, 1))
            r[t < 0.02] = R * 0.85
            return np.maximum(r, 0.004)
        loft_axis(m, np.array([-L / 2, 0, 0]), np.array([L / 2, 0, 0]), prof, prof, BODY, fwd=(0, 0, 1), n=12, ns=26)
        fins(m, 0.05, 0.55, 0.13, R * 0.9, 0.012, part=MFIN, sweep=0.25)            # mid-body strakes
        fins(m, -L / 2, 0.42, 0.22, R * 0.9, 0.014, part=TFIN, sweep=0.12)          # tail control fins
        loft_axis(m, np.array([-L / 2 - 0.06, 0, 0]), np.array([-L / 2 + 0.02, 0, 0]),
                  lambda t: np.full_like(t, R * 0.8), lambda t: np.full_like(t, R * 0.8), NOZ, fwd=(0, 0, 1),
                  n=12, ns=3)
        return m
    def colorize(self, part, P, ctx):
        n = len(P)
        if part == BODY:
            a = P[:, 0] / L
            col = np.tile([0.92, 0.92, 0.90], (n, 1))
            col[(a > 0.62) & (a < 0.65)] = [0.85, 0.72, 0.10]     # yellow = live warhead
            col[(a > 0.30) & (a < 0.32)] = [0.12, 0.12, 0.12]
            col[(a > 0.66) & (a < 0.67)] = [0.45, 0.30, 0.15]
            col[a > 0.88] = [0.35, 0.37, 0.38]                    # seeker radome
            return col
        if part in (MFIN, TFIN): return np.tile([0.86, 0.86, 0.84], (n, 1))
        if part == NOZ: return np.tile([0.10, 0.10, 0.10], (n, 1))
        return np.tile([0.6, 0.6, 0.6], (n, 1))

def flame(img, R, flicker):
    rng = np.random.default_rng(11 + flicker)
    back = R @ np.array([-1.0, 0, 0])
    tail = R @ np.array([-L / 2 - 0.05, 0, 0])
    length = 1.6 + 0.35 * flicker
    for s in np.linspace(length, 0, 9):                         # outer flame -> core
        p = tail + back * s
        px, py, _ = project(p, SCALE, CELL, CELL)
        f = 1 - s / length
        r = 0.9 + 1.6 * f + rng.uniform(-0.2, 0.2)
        blob(img, px, py, r, [1.0, 0.35 + 0.45 * f, 0.08 + 0.3 * f], 0.85)
    px, py, _ = project(tail + back * 0.15, SCALE, CELL, CELL)
    blob(img, px, py, 1.6, [1.0, 0.97, 0.80], 1.0)
    for s in (2.3 + 0.2 * flicker, 2.9 + 0.2 * flicker):        # fresh smoke right behind the flame
        px, py, _ = project(tail + back * s, SCALE, CELL, CELL)
        bs.smoke(img, px, py, 2.2 + 0.3 * s, rng, a=0.35, shade_=0.78)

def missile_frame(arr, heading, pitch, flicker):
    R = rot_model(heading, pitch_deg=-pitch)
    body = stylise(shade(Missile(), arr, R, SCALE, CELL, CELL))
    fx = np.zeros((CELL, CELL, 4))
    flame(fx, R, flicker)
    # flame behind body when the missile points away from the camera
    fwd = R @ np.array([1.0, 0, 0])
    toward_cam = fwd @ np.array([0, -math.sqrt(3) / 2, 0.5])
    return over(fx, body) if toward_cam < 0 else over(body, fx)

def smoke_puff(k):
    img = np.zeros((CELL, CELL, 4)); rng = np.random.default_rng(5)
    t = k / 7
    for i in range(5):
        o = rng.normal(0, 1, 2)
        bs.smoke(img, CELL / 2 + o[0] * (1 + 3 * t), CELL / 2 + o[1] * (1 + 2 * t) - 4 * t, 2.5 + 6 * t, rng,
                 a=0.6 * (1 - t) ** 1.3, shade_=0.78 - 0.1 * t)
    return img

def air_burst(k):
    img = np.zeros((CELL, CELL, 4)); rng = np.random.default_rng(21)
    cx, cy = CELL / 2, CELL / 2; t = k / 7; R = 9
    pts = rng.normal(0, 1, (22, 2)); temp = rng.uniform(0, 1, 22)
    for i in range(22):
        grow = 0.35 + 1.1 * t ** 0.5
        px, py = cx + pts[i, 0] * R * 0.5 * grow, cy + pts[i, 1] * R * 0.4 * grow + R * 0.6 * t * temp[i]
        r = R * (0.25 + 0.3 * temp[i]) * grow
        heat = max(0.0, 1.0 - t * (1.6 + temp[i]))
        if heat > 0.05:
            blob(img, px, py, r, [1.0, 0.45 + 0.5 * heat, 0.1 + 0.6 * heat ** 2], 0.92)
        else:
            g = 0.2 + 0.2 * temp[i]
            blob(img, px, py, r * 1.15, [g, g, g], 0.6 * (1 - t ** 2.5), hard=1.1)
    for i in range(14):                                          # fragments
        if k == 0: break
        a = rng.uniform(0, 2 * np.pi); d = R * 2.2 * rng.uniform(0.5, 1.2) * t ** 0.7
        blob(img, cx + math.cos(a) * d, cy + math.sin(a) * d * 0.7 + 3 * t * t, 0.8, [1.0, 0.75, 0.3] if k < 4
             else [0.2, 0.18, 0.16], 1.0, hard=0.3)
    if k < 2:
        blob(img, cx, cy, R * (0.8 + 0.4 * k), [1, 1, 0.9], 0.97)
    return img

def launch(k):
    img = np.zeros((CELL, CELL, 4)); rng = np.random.default_rng(31)
    cx, cy = CELL / 2, CELL / 2; t = k / 7
    for i in range(6):
        o = rng.normal(0, 1, 2)
        bs.smoke(img, cx + o[0] * (2 + 6 * t) + 6 * t, cy + o[1] * (1.5 + 3 * t) - 2 * t, 2 + 5 * t, rng,
                 a=0.55 * (1 - t) ** 1.2, shade_=0.8)
    if k < 3:
        blob(img, cx, cy, 6 - 1.5 * k, [1.0, 0.65, 0.2], 0.9)
        blob(img, cx, cy, 3 - 0.8 * k, [1.0, 0.97, 0.8], 1.0)
    return img

def build_sheet(path):
    sheet = np.zeros((9 * CELL, 16 * CELL, 4))
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    arr = Missile().build().arrays()
    for f in range(32):
        put(missile_frame(arr, f * 11.25, 0, 0), f // 16, f % 16)
        put(missile_frame(arr, f * 11.25, 0, 1), 2 + f // 16, f % 16)
    for i in range(16):
        put(missile_frame(arr, i * 22.5, 35, i % 2), 4, i)
        put(missile_frame(arr, i * 22.5, 70, i % 2), 5, i)
        R = rot_model(i * 22.5)
        put(shadow_layer(arr[0] @ R.T, SCALE, CELL, CELL, light_proj=False, alpha=0.4), 6, i)
    bm.CELL = CELL
    for k in range(8):
        put(smoke_puff(k), 7, k)
        put(air_burst(k), 7, 8 + k)
        put(bm.impact(k, 0.8, seed=13), 8, k)
        put(launch(k), 8, 8 + k)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    build_sheet("/mnt/user-data/outputs/missile_universal_sheet.png")
