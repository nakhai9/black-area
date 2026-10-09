"""
RA2-style ENGINEER walk sheets. Same design for all factions (orange hi-vis jacket with reflective
stripes, dark work trousers, tool belt, toolbox in right hand); only the HARD HAT colour differs:
  Germany (EU) = yellow | Russia = white | USA = blue | China = red
Sheet: 8 columns x 8 rows, 64px cells (512x512), shadow baked in.
  row = facing 0..7 (0 = screen-up, clockwise, 45 deg steps), columns = 8 walk frames.
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py in the same folder.
"""
import math, sys
import numpy as np
from PIL import Image
import infantry_sprites as inf
from infantry_sprites import (Faction, body_mesh, ellipsoid, loft_axis, limb, tilt, rot_z, bump, nz, basis,
                              transform, render, CELL, HEAD, HELM, UNI, SHLD, VEST, POUCH, BELT, BOOT, GLOVE)
from m1_abrams_sprites import box

TOOLBOX, TOOLLID = 90, 91
ORANGE = np.array([1.0, 0.45, 0.08])
REFLECT = np.array([0.86, 0.88, 0.88])
TROUSER = np.array([0.20, 0.22, 0.27])

class Engineer(Faction):
    hat = "engineer"
    glasses = False
    radio = False
    knee_pads = False
    flag = "de"
    boot = np.array([0.36, 0.24, 0.14])
    glove = np.array([0.55, 0.50, 0.40])
    belt = np.array([0.36, 0.25, 0.15])
    hat_col = np.array([1.0, 0.82, 0.10])

    def camo(self, P): return np.tile(TROUSER, (len(P), 1))

    def colorize(self, part, P, ctx):
        n = len(P); x = P[:, 0]
        if part in (UNI, SHLD):
            col = np.tile(TROUSER, (n, 1)) * (1 + 0.06 * inf.noise3(P, 9, 3))[:, None]
            torso = (x >= 3.0) & (x < 3.9)
            arms = ((x >= 9) & (x < 13)) | (part == SHLD)
            jacket = torso | arms
            col[jacket] = ORANGE * (1 + 0.05 * inf.noise3(P[jacket], 9, 4))[:, None]
            h = x - 3.0
            col[torso & (((h > 0.18) & (h < 0.22)) | ((h > 0.30) & (h < 0.34)))] = REFLECT
            col[(x >= 12) & (x < 13) & (x - 12 > 0.10) & (x - 12 < 0.14)] = REFLECT   # forearm band
            return col
        if part == VEST:                       # hi-vis vest over the jacket
            col = np.tile(ORANGE * 1.02, (n, 1))
            h = x - 3.5
            col[((h > 0.10) & (h < 0.14)) | ((h > 0.22) & (h < 0.26))] = REFLECT
            return col
        if part == POUCH: return np.tile([0.38, 0.27, 0.16], (n, 1))      # leather tool pouches / bag
        if part == HELM:
            return np.tile(self.hat_col, (n, 1))
        if part == TOOLBOX: return np.tile([0.70, 0.12, 0.08], (n, 1))    # same red toolbox for all
        if part == TOOLLID: return np.tile([0.25, 0.25, 0.27], (n, 1))
        return super().colorize(part, P, ctx)

    def build_hat(self, m, hc, hup, hfw, hsd):   # construction hard hat with brim and ridge
        loft_axis(m, hc + hup * 0.04, hc + hup * 0.2 * HEAD,
                  lambda t: 0.13 * HEAD * np.sqrt(np.clip(1 - t ** 2.2, 0, 1)),
                  lambda t: 0.145 * HEAD * np.sqrt(np.clip(1 - t ** 2.2, 0, 1)), HELM, fwd=hfw, n=14, ns=9)
        rim = lambda r: (lambda t: r * np.clip(1 - np.abs(2 * t - 1) ** 8, 0, 1) ** 0.15)
        c = hc + hup * 0.045 + hfw * 0.03
        loft_axis(m, c - hup * 0.008, c + hup * 0.008, rim(0.165 * HEAD), rim(0.2 * HEAD), HELM, fwd=hfw,
                  n=16, ns=4)
        loft_axis(m, hc + hup * 0.12 - hfw * 0.13, hc + hup * 0.12 + hfw * 0.14,
                  lambda t: 0.02 * np.clip(1 - np.abs(2 * t - 1) ** 4, 0, 1) ** 0.3,
                  lambda t: 0.1 * np.clip(1 - np.abs(2 * t - 1) ** 4, 0, 1) ** 0.3, HELM, fwd=hup, n=8, ns=8)

class EngGermany(Engineer):
    name = "Engineer DE"; hat_col = np.array([1.0, 0.82, 0.10])
class EngRussia(Engineer):
    name = "Engineer RU"; hat_col = np.array([0.95, 0.95, 0.93])
class EngUSA(Engineer):
    name = "Engineer US"; hat_col = np.array([0.12, 0.35, 0.85])
class EngChina(Engineer):
    name = "Engineer CN"; hat_col = np.array([0.85, 0.08, 0.06])

def engineer_mesh(fac, phase):
    legs = {}
    for s, off in ((-1, 0.0), (1, 0.5)):
        p = (phase + off) % 1.0
        th = 0.36 * math.cos(2 * math.pi * p) + 0.04
        k = 0.10 + 0.20 * bump(p, 0.12, 0.08) + 1.05 * bump(p, 0.74, 0.12)
        fp = 0.22 * bump(p, 0.0, 0.07) - 0.55 * bump(p, 0.6, 0.07)
        legs[s] = (th, k, fp, 0.03)
    c = math.cos(2 * math.pi * phase)
    Rp = rot_z(-0.12 * c)
    Rt = rot_z(0.08 * c) @ tilt(0.07)
    Rh = Rt @ tilt(-0.02)
    P = np.array([0, 0, 0.98])
    up = Rt @ np.array([0, 0, 1.0]); fw = Rt @ np.array([1.0, 0, 0]); side = np.cross(up, fw)
    S = {s: P + up * 0.47 + side * s * 0.215 for s in (1, -1)}
    aL = 0.45 * c                                   # left arm swings with the right leg
    hands = {1: S[1] + Rt @ np.array([0.5 * math.sin(aL) + 0.06, 0.05, -0.49 * math.cos(aL)]),
             -1: S[-1] + Rt @ np.array([0.04 - 0.12 * c, -0.07, -0.54])}   # right hand carries toolbox
    m = body_mesh(fac, P, Rt, np.eye(3) @ Rp, Rh, legs, hands, None)
    # toolbox hanging from the right hand
    st = len(m.V)
    box(m, -0.20, 0.20, -0.08, 0.08, -0.24, -0.06, TOOLBOX)
    box(m, -0.21, 0.21, -0.085, 0.085, -0.08, -0.05, TOOLLID)
    box(m, -0.08, 0.08, -0.015, 0.015, -0.06, -0.01, TOOLLID)
    sway = 0.15 * c
    transform(m, st, basis(fw, np.array([math.sin(sway) * 0.3, 0, 1.0])), t=hands[-1] + up * 0.02)
    V = np.concatenate(m.V)
    transform(m, 0, np.eye(3), t=(0, 0, -V[..., 2].min()))
    return m

def build_sheet(fac, path):
    sheet = np.zeros((8 * CELL, 8 * CELL, 4))
    frames = [engineer_mesh(fac, k / 8) for k in range(8)]
    for f in range(8):
        for k in range(8):
            sheet[f * CELL:(f + 1) * CELL, k * CELL:(k + 1) * CELL] = render(fac, frames[k], f * 45)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    sel = sys.argv[1:] or ["de", "ru", "us", "cn"]
    table = {"de": (EngGermany, "engineer_germany_eu.png"), "ru": (EngRussia, "engineer_russia.png"),
             "us": (EngUSA, "engineer_usa.png"), "cn": (EngChina, "engineer_china.png")}
    for k in sel:
        cls, fn = table[k]
        build_sheet(cls(), out + fn)
