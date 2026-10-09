"""
RA2-style UNIVERSAL TANK SHELL sheet (one round shared by every faction's tanks).
Faction-neutral steel shell with copper driving band and a bright tracer streak.
Cell 64x64, 16 columns x 7 rows (1024x448). Shell drawn at 18 px/m (enlarged for readability).
  R0-1  FLY, 32 facings, tracer frame A   (facing 0 = screen-up, clockwise, 11.25 deg steps;
                                          matches the 32 turret facings of the tank sheets)
  R2-3  FLY, 32 facings, tracer frame B   (alternate A/B every tick)
  R4    SHADOW, 16 facings
  R5    c0-7 GROUND HIT (dirt burst) | c8-15 ARMOUR HIT (flash, sparks, molten fragments)
  R6    c0-7 RICOCHET / near miss (spark spray + dust) | c8-11 impact-mark decals | c12-15 hot-metal glow fading
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py, bombs_sprites.py in the same folder.
"""
import math
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import Mesh, shade, shadow_layer, over, blob, rot_model, project
from infantry_sprites import loft_axis, stylise
import bombs_sprites as bm

SCALE = 18.0
CELL = 64
L = 0.9
BODY = 140

class Shell:
    name = "Universal tank shell"
    spec, shininess, sky = 0.45, 24, 0.06
    dmg_pt = np.zeros(3)
    def build(self):
        m = Mesh(); R = 0.085
        def prof(t):
            r = np.full_like(t, R)
            nn = t > 0.55
            s = (t[nn] - 0.55) / 0.45
            r[nn] = R * np.sqrt(np.clip(1 - s ** 1.8, 0, 1))
            r[t < 0.04] = R * 0.9
            return np.maximum(r, 0.004)
        loft_axis(m, np.array([-L / 2, 0, 0]), np.array([L / 2, 0, 0]), prof, prof, BODY, fwd=(0, 0, 1), n=12, ns=20)
        return m
    def colorize(self, part, P, ctx):
        a = P[:, 0] / L
        col = np.tile([0.36, 0.37, 0.40], (len(P), 1))
        col[(a > 0.12) & (a < 0.22)] = [0.80, 0.48, 0.24]      # copper driving band
        col[(a > 0.62) & (a < 0.66)] = [0.85, 0.72, 0.12]
        col[a > 0.93] = [0.55, 0.55, 0.57]
        return col

def streak(img, p0, p1, r0, r1, col0, col1, a0, a1, n=14):
    for i in range(n):
        f = i / (n - 1)
        x = p0[0] + (p1[0] - p0[0]) * f; y = p0[1] + (p1[1] - p0[1]) * f
        c = np.array(col0) * (1 - f) + np.array(col1) * f
        blob(img, x, y, r0 + (r1 - r0) * f, c, a0 + (a1 - a0) * f)

def tracer(img, R, flick):
    back = R @ np.array([-1.0, 0, 0])
    tail = R @ np.array([-L / 2, 0, 0])
    length = 1.4 + 0.3 * flick
    p0 = project(tail, SCALE, CELL, CELL)[:2]
    p1 = project(tail + back * length, SCALE, CELL, CELL)[:2]
    streak(img, p1, p0, 0.6, 1.6, [1.0, 0.35, 0.08], [1.0, 0.85, 0.35], 0.35, 0.95)
    blob(img, p0[0], p0[1], 1.4, [1.0, 1.0, 0.85], 1.0)
    glow = np.zeros_like(img)
    blob(glow, p0[0], p0[1], 4.5, [1.0, 0.75, 0.3], 0.35, hard=1.2)
    img[:] = over(img, glow)

def shell_frame(arr, heading, flick):
    R = rot_model(heading)
    body = stylise(shade(Shell(), arr, R, SCALE, CELL, CELL))
    fx = np.zeros((CELL, CELL, 4)); tracer(fx, R, flick)
    fwd = R @ np.array([1.0, 0, 0])
    toward_cam = fwd @ np.array([0, -math.sqrt(3) / 2, 0.5])
    return over(fx, body) if toward_cam < 0 else over(body, fx)

def armour_hit(k):
    img = np.zeros((CELL, CELL, 4)); rng = np.random.default_rng(41)
    cx, cy = CELL / 2, CELL / 2 + 4; t = k / 7
    rays = rng.uniform(0, 2 * np.pi, 16); spd = rng.uniform(0.5, 1.0, 16)
    for a, v in zip(rays, spd):                               # spark streaks
        if k == 0 or t > 0.85: continue
        d1 = 26 * v * t ** 0.6; d0 = max(0, d1 - 6 * v)
        g = 6 * t * t
        p0 = (cx + math.cos(a) * d0, cy + math.sin(a) * d0 * 0.6 + g * 0.5)
        p1 = (cx + math.cos(a) * d1, cy + math.sin(a) * d1 * 0.6 + g)
        streak(img, p0, p1, 0.5, 0.8, [1.0, 0.7, 0.2], [1.0, 0.95, 0.6], 0.6, 1.0, n=6)
    for i in range(10):                                       # molten drops falling
        if k < 2: break
        a = rng.uniform(0, 2 * np.pi); d = rng.uniform(4, 14) * t
        blob(img, cx + math.cos(a) * d, cy + math.sin(a) * d * 0.5 + 10 * t * t, 0.7,
             [1.0, 0.5 + 0.3 * (1 - t), 0.1], 1.0 - 0.6 * t, hard=0.3)
    if k >= 2:
        for i in range(4):
            bs.smoke(img, cx + rng.normal(0, 2), cy - 3 - 6 * t + rng.normal(0, 1.5), 2 + 5 * t, rng,
                     a=0.5 * (1 - t), shade_=0.3)
    if k < 3:
        blob(img, cx, cy, 9 - 2.5 * k, [1.0, 0.85, 0.5], 0.85)
        blob(img, cx, cy, 4.5 - 1.2 * k, [0.9, 0.95, 1.0], 1.0)
    return img

def ricochet(k):
    img = np.zeros((CELL, CELL, 4)); rng = np.random.default_rng(51)
    cx, cy = CELL / 2 - 8, CELL / 2 + 8; t = k / 7
    blob(img, cx, cy, 4 + 8 * t, [0.62, 0.55, 0.42], 0.55 * (1 - t), hard=1.0)   # dust kick
    for i in range(10):
        if k == 0 or t > 0.85: continue
        a = rng.uniform(-0.9, -0.2); v = rng.uniform(0.6, 1.0)
        d1 = 30 * v * t ** 0.7; d0 = max(0, d1 - 7)
        p0 = (cx + math.cos(a) * d0, cy + math.sin(a) * d0 * 0.8)
        p1 = (cx + math.cos(a) * d1, cy + math.sin(a) * d1 * 0.8)
        streak(img, p0, p1, 0.4, 0.7, [1.0, 0.6, 0.15], [1.0, 0.95, 0.6], 0.5, 1.0, n=6)
    if k < 2: blob(img, cx, cy, 4 - k, [1, 0.95, 0.7], 1.0)
    return img

def impact_mark(v):
    img = np.zeros((CELL, CELL, 4)); rng = np.random.default_rng(70 + v)
    cx, cy = CELL / 2, CELL / 2 + 6
    for i in range(6):
        a = rng.uniform(0, 2 * np.pi); r = rng.uniform(0, 4)
        blob(img, cx + math.cos(a) * r, cy + math.sin(a) * r * 0.5, rng.uniform(4, 7), [0.12, 0.10, 0.08], 0.5,
             hard=0.8)
    blob(img, cx, cy, 2.5, [0.05, 0.05, 0.05], 0.9, hard=0.6)
    for i in range(8):
        a = rng.uniform(0, 2 * np.pi); r = rng.uniform(5, 11); g = rng.uniform(0.2, 0.4)
        blob(img, cx + math.cos(a) * r, cy + math.sin(a) * r * 0.5, 0.8, [g, g * 0.9, g * 0.8], 1.0, hard=0.3)
    return img

def hot_metal(k):
    img = impact_mark(0)
    cx, cy = CELL / 2, CELL / 2 + 6; f = 1 - k / 4
    g = np.zeros_like(img)
    blob(g, cx, cy, 5 * f + 1.5, [1.0, 0.45, 0.08], 0.8 * f, hard=1.0)
    blob(g, cx, cy, 2 * f + 0.5, [1.0, 0.85, 0.4], f, hard=0.8)
    rng = np.random.default_rng(80 + k)
    bs.smoke(g, cx + 1, cy - 4 - 2 * k, 2 + k, rng, a=0.35 * f + 0.1, shade_=0.35)
    return over(g, img)

def build_sheet(path):
    sheet = np.zeros((7 * CELL, 16 * CELL, 4))
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    arr = Shell().build().arrays()
    for f in range(32):
        put(shell_frame(arr, f * 11.25, 0), f // 16, f % 16)
        put(shell_frame(arr, f * 11.25, 1), 2 + f // 16, f % 16)
    for i in range(16):
        R = rot_model(i * 22.5)
        put(shadow_layer(arr[0] @ R.T, SCALE, CELL, CELL, light_proj=False, alpha=0.4), 4, i)
    bm.CELL = CELL
    for k in range(8):
        put(bm.impact(k, 0.6, seed=17), 5, k)
        put(armour_hit(k), 5, 8 + k)
        put(ricochet(k), 6, k)
    for v in range(4):
        put(impact_mark(v), 6, 8 + v)
        put(hot_metal(v), 6, 12 + v)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    build_sheet("/mnt/user-data/outputs/tank_shell_universal_sheet.png")
