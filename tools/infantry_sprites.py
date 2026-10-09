"""
RA2-style infantry sheets v2 (organic rig): Germany (EU standard), Russia, USA, China.
Cell 64x64, 8 columns x 11 rows (512x704), shadow baked into each frame.
  R0      IDLE  8 facings (standing, rifle held at port arms)
  R1-8    WALK  row = facing 0..7, 8 frames per cycle
  R9      AIM   8 facings (rifle shouldered)
  R10     DIE   8 frames (hit -> knees buckle -> fall backward -> lying), single direction
Facing k = k*45 deg, 0 = screen-up, clockwise.
Requires bomber_sprites.py + m1_abrams_sprites.py in the same folder.
"""
import math, sys
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import Mesh, rot_model, shade, shadow_layer, over, blob, noise3, nz, project
from m1_abrams_sprites import box

bs.SS = 4
SCALE = 22.0
CELL = 64
YOFF = CELL * 0.2
(SKIN, FACE, UNI, VEST, BOOT, GLOVE, HELM, FUR, CAPC, RIFLE, RFUR, POUCH, BADGE, NVG, BRIM,
 BELT, PAD, SHLD) = range(50, 68)

# ------------------------------------------------------------------ primitives
def loft_axis(m, p0, p1, wprof, dprof, part, fwd=(1, 0, 0), n=12, ns=10, tex=(0, 0, 0)):
    """smooth closed body along p0->p1; width (side) & depth (forward) profiles of t in [0,1]"""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    a = p1 - p0; L = np.linalg.norm(a); a = a / L
    f = np.asarray(fwd, float); f = f - a * (f @ a)
    if np.linalg.norm(f) < 1e-4: f = np.array([0, 0, 1.0]) - a * a[2]
    f = nz(f); s = np.cross(f, a)
    tt = np.linspace(0, 1, ns)
    t = np.concatenate([[0], tt, [1]])
    w = np.concatenate([[0], wprof(tt), [0]]); d = np.concatenate([[0], dprof(tt), [0]])
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    along = np.broadcast_to((t * L)[:, None], (len(t), n))
    sd = w[:, None] * np.cos(th)[None]; fr = d[:, None] * np.sin(th)[None]
    G = p0 + along[..., None] * a + sd[..., None] * s + fr[..., None] * f
    Gt = np.stack([along, sd, fr], -1) + np.asarray(tex, float)
    k = len(m.V)
    m.add_grid(G, wrap=True, part=part)
    tmp = Mesh(); tmp.add_grid(Gt, wrap=True, part=part)
    m.T[k:] = tmp.V

def ell_prof(r, p=2.0):
    return lambda t: r * np.clip(1 - np.abs(2 * t - 1) ** p, 0, 1) ** (1 / p)

def ellipsoid(m, c, rf, rs, ru, part, fwd=(1, 0, 0), up=(0, 0, 1), tex=(0, 0, 0), n=12, ns=9, p=2.0):
    c = np.asarray(c, float); u = nz(up)
    loft_axis(m, c - u * ru, c + u * ru, ell_prof(rs, p), ell_prof(rf, p), part, fwd=fwd, n=n, ns=ns, tex=tex)

def limb(m, p0, p1, r0, r1, part, bulge=0.12, bulge_at=0.3, fwd=(1, 0, 0), tex=(0, 0, 0), depth=1.0):
    def pr(t):
        base = r0 + (r1 - r0) * t
        b = 1 + bulge * np.exp(-((t - bulge_at) / 0.25) ** 2)
        cap = np.clip(1 - np.abs(2 * t - 1) ** 10, 0, 1) ** 0.2
        return base * b * cap
    loft_axis(m, p0, p1, pr, lambda t: pr(t) * depth, part, fwd=fwd, n=10, ns=8, tex=tex)

def ik(S, H, a, b, pole):
    S, H = np.asarray(S, float), np.asarray(H, float)
    d = H - S; L = np.linalg.norm(d)
    L2 = min(max(L, abs(a - b) + 1e-3), a + b - 1e-3)
    u = d / L
    x = (L2 * L2 + a * a - b * b) / (2 * L2)
    h = math.sqrt(max(a * a - x * x, 0))
    p = np.asarray(pole, float); p = p - u * (p @ u); p = nz(p)
    return S + u * x + p * h

def transform(m, start, R, t=(0, 0, 0), pivot=(0, 0, 0)):
    pv = np.asarray(pivot, float)
    for i in range(start, len(m.V)):
        m.V[i] = (m.V[i] - pv) @ R.T + pv + np.asarray(t, float)
        m.N[i] = m.N[i] @ R.T

def basis(fwd, up=(0, 0, 1)):
    x = nz(fwd); z = np.asarray(up, float); z = nz(z - x * (z @ x)); y = np.cross(z, x)
    return np.stack([x, y, z], 1)

def rot_y(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])

def rot_z(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def bump(p, c, w):
    d = (p - c + 0.5) % 1.0 - 0.5
    return math.exp(-(d / w) ** 2)

# ------------------------------------------------------------------ factions
class Faction:
    spec, shininess, sky = 0.06, 8, 0.03
    dmg_pt = np.zeros(3)
    skin = np.array([0.90, 0.70, 0.56])
    boot = np.array([0.16, 0.14, 0.12])
    glove = np.array([0.18, 0.17, 0.15])
    rifle = np.array([0.16, 0.16, 0.17])
    rfur = np.array([0.16, 0.16, 0.17])
    belt = np.array([0.20, 0.19, 0.15])
    hat = "helmet"
    rifle_kind = "ar"
    knee_pads = True
    radio = True
    glasses = True
    flag = 'de'
    def camo(self, P): raise NotImplementedError
    def vest(self, P): return self.camo(P) * 0.95
    def helm(self, P): return self.camo(P + 7)
    def colorize(self, part, P, ctx):
        n = len(P)
        if part == SKIN: return np.tile(self.skin, (n, 1))
        if part == FACE:
            col = np.tile(self.skin, (n, 1))
            h = P[:, 0]; fr = P[:, 2]
            col[(h > 0.135) & (h < 0.165) & (fr > 0.06)] = self.skin * 0.55     # eyes / brow shadow
            col[(h > 0.075) & (h < 0.095) & (fr > 0.08)] = self.skin * 0.8     # mouth line
            return col
        if part == UNI:
            fold = 1 + 0.07 * noise3(P, 9, 3)
            return self.camo(P) * fold[:, None]
        if part == SHLD:
            col = self.camo(P) * (1 + 0.07 * noise3(P, 9, 3))[:, None]
            sgn = np.sign(P[:, 0] - 20)                 # +1 left shoulder, -1 right shoulder
            h = P[:, 0] - (20 + sgn); sd = P[:, 1]
            outer = (sd * -sgn) > 0.04
            patch = outer & (h > 0.06) & (h < 0.14) & (np.abs(P[:, 2]) < 0.05)
            stripes = FLAGS[self.flag]
            idx = np.clip(((0.14 - h) / 0.08 * len(stripes)).astype(int), 0, len(stripes) - 1)
            col[patch] = np.array(stripes)[idx[patch]]
            return col
        if part == VEST: return self.vest(P)
        if part == POUCH: return self.vest(P + 3) * 0.9
        if part == BOOT: return np.tile(self.boot, (n, 1))
        if part == GLOVE: return np.tile(self.glove, (n, 1))
        if part == BELT: return np.tile(self.belt, (n, 1))
        if part == PAD: return np.tile(self.belt * 1.1, (n, 1))
        if part in (HELM, BRIM, CAPC): return self.helm(P)
        if part == FUR: return np.tile(self.fur, (n, 1)) * (1 + 0.10 * noise3(P, 30, 5))[:, None]
        if part == RIFLE: return np.tile(self.rifle, (n, 1))
        if part == RFUR: return np.tile(self.rfur, (n, 1))
        if part == BADGE: return np.tile([0.92, 0.15, 0.08], (n, 1))
        if part == NVG: return np.tile([0.12, 0.12, 0.12], (n, 1))
        return np.tile([0.5, 0.5, 0.5], (n, 1))

FLAGS = {"de": [[0.08, 0.08, 0.08], [0.85, 0.08, 0.08], [1.0, 0.80, 0.05]],
         "us": [[0.15, 0.20, 0.55], [0.95, 0.95, 0.95], [0.80, 0.10, 0.12]],
         "ru": [[0.97, 0.97, 0.97], [0.12, 0.25, 0.70], [0.85, 0.10, 0.10]],
         "cn": [[0.88, 0.10, 0.08], [1.0, 0.85, 0.1], [0.88, 0.10, 0.08]]}

def blobs(P, pal, f, seeds, th):
    col = np.tile(pal[0], (len(P), 1))
    for c, s, t in zip(pal[1:], seeds, th):
        col[noise3(P, f, s) > t] = c
    return col

class Germany(Faction):          # dark forest Flecktarn, black boots, DE flag
    name = "Bundeswehr (EU)"
    PAL = [np.array(c) for c in ([0.36, 0.43, 0.27], [0.22, 0.30, 0.17], [0.44, 0.32, 0.21], [0.12, 0.13, 0.10])]
    belt = np.array([0.15, 0.16, 0.13])
    flag = "de"
    def camo(self, P): return blobs(P, self.PAL, 7, (11, 12, 13), (0.12, 0.25, 0.40))
    def vest(self, P): return blobs(P + 2, self.PAL, 7, (11, 12, 13), (0.12, 0.25, 0.40)) * 0.93

class Russia(Faction):           # slate-grey Ratnik digital, grey fur ushanka, RU flag
    name = "VS RF"
    PAL = [np.array(c) for c in ([0.47, 0.49, 0.45], [0.35, 0.37, 0.34], [0.57, 0.58, 0.54], [0.24, 0.25, 0.24])]
    hat = "ushanka"
    rifle_kind = "ak"
    glasses = False
    flag = "ru"
    fur = np.array([0.56, 0.54, 0.51])
    rfur = np.array([0.22, 0.18, 0.14])
    belt = np.array([0.20, 0.21, 0.20])
    def camo(self, P): return blobs(np.floor(P / 0.05) * 0.05, self.PAL, 5, (21, 22, 23), (0.12, 0.28, 0.4))
    def vest(self, P): return np.tile([0.30, 0.32, 0.30], (len(P), 1))
    def helm(self, P): return np.tile(self.fur * 0.9, (len(P), 1)) * (1 + 0.08 * noise3(P, 30, 6))[:, None]

class USA(Faction):              # desert tan OCP, coyote gear, US flag
    name = "US Army"
    PAL = [np.array(c) for c in ([0.74, 0.67, 0.50], [0.58, 0.56, 0.38], [0.60, 0.47, 0.32], [0.82, 0.77, 0.61])]
    boot = np.array([0.62, 0.51, 0.36])
    glove = np.array([0.56, 0.48, 0.35])
    belt = np.array([0.52, 0.44, 0.31])
    flag = "us"
    def camo(self, P): return blobs(P, self.PAL, 5, (31, 32, 33), (0.2, 0.3, 0.35))
    def vest(self, P): return np.tile([0.62, 0.53, 0.37], (len(P), 1))
    def helm(self, P): return np.tile([0.60, 0.52, 0.37], (len(P), 1))

class China(Faction):            # bright jungle-green Type 07 digital, red-star cap, CN flag
    name = "PLA"
    PAL = [np.array(c) for c in ([0.36, 0.52, 0.27], [0.22, 0.37, 0.18], [0.55, 0.64, 0.36], [0.33, 0.30, 0.19])]
    hat = "cap"
    rifle_kind = "qbz"
    knee_pads = False
    glasses = False
    radio = False
    flag = "cn"
    belt = np.array([0.24, 0.30, 0.18])
    def camo(self, P): return blobs(np.floor(P / 0.05) * 0.05, self.PAL, 5, (41, 42, 43), (0.12, 0.3, 0.35))
    def vest(self, P): return np.tile([0.30, 0.42, 0.22], (len(P), 1))

# ------------------------------------------------------------------ rifle
def build_rifle(m, kind, butt, fwd, up=(0, 0, 1)):
    st = len(m.V)
    r = Mesh()
    if kind == "qbz":   # QBZ-191 style
        box(r, 0.0, 0.24, -0.022, 0.022, -0.07, 0.03, RIFLE)
        box(r, 0.22, 0.56, -0.025, 0.025, -0.03, 0.05, RIFLE)
        box(r, 0.30, 0.34, -0.018, 0.018, -0.14, -0.02, RIFLE)
        box(r, 0.38, 0.45, -0.016, 0.016, -0.20, -0.02, RIFLE)
        box(r, 0.55, 0.76, -0.028, 0.028, -0.025, 0.04, RFUR)
        box(r, 0.76, 0.92, -0.01, 0.01, 0.0, 0.02, RIFLE)
        box(r, 0.38, 0.50, -0.02, 0.02, 0.05, 0.10, RIFLE)
    elif kind == "ak":  # AK-12 style, curved magazine
        box(r, 0.0, 0.25, -0.022, 0.022, -0.07, 0.03, RIFLE)
        box(r, 0.24, 0.56, -0.025, 0.025, -0.03, 0.05, RIFLE)
        box(r, 0.29, 0.33, -0.018, 0.018, -0.14, -0.02, RIFLE)
        for k in range(3):
            box(r, 0.38 + k * 0.03, 0.44 + k * 0.035, -0.017, 0.017, -0.07 - k * 0.06, -0.01 - k * 0.06, RFUR)
        box(r, 0.56, 0.74, -0.026, 0.026, -0.03, 0.035, RIFLE)
        box(r, 0.74, 0.94, -0.011, 0.011, -0.002, 0.02, RIFLE)
        box(r, 0.36, 0.48, -0.02, 0.02, 0.05, 0.09, RIFLE)
    else:               # AR (M4 / HK416 / G36-class)
        box(r, 0.0, 0.24, -0.022, 0.022, -0.07, 0.03, RFUR)
        box(r, 0.22, 0.54, -0.025, 0.025, -0.03, 0.05, RIFLE)
        box(r, 0.30, 0.34, -0.018, 0.018, -0.14, -0.02, RIFLE)
        box(r, 0.39, 0.45, -0.016, 0.016, -0.19, -0.02, RFUR)
        box(r, 0.54, 0.76, -0.03, 0.03, -0.03, 0.045, RIFLE)
        box(r, 0.76, 0.92, -0.01, 0.01, 0.0, 0.02, RIFLE)
        box(r, 0.36, 0.50, -0.022, 0.022, 0.05, 0.11, RIFLE)
    B = basis(fwd, up)
    for i in range(len(r.V)):
        r.T[i] = r.V[i].copy()
        r.V[i] = (r.V[i] * 1.1) @ B.T + np.asarray(butt, float)
        r.N[i] = r.N[i] @ B.T
    m.merge(r)


# ------------------------------------------------------------------ soldier rig
HEAD = 1.18   # RA2-style slightly oversized head

def tilt(a): return rot_y(-a)   # forward lean (+a tips the top toward +x)

def interp(xs, ys):
    return lambda t: np.interp(t, xs, ys)

def body_mesh(fac, P, Rt, Rp, Rh, legs, hands, rifle=None):
    m = Mesh()
    up = Rt @ np.array([0, 0, 1.0]); fw = Rt @ np.array([1.0, 0, 0])
    pf = Rp @ np.array([1.0, 0, 0]); ps = Rp @ np.array([0, 1.0, 0])
    side = np.cross(up, fw)
    # ---- legs (bulky trousers, knee pads, boots, thigh pouch)
    for s, (th, k, fp, ab) in legs.items():
        hip = P + Rp @ np.array([0, s * 0.105, -0.03])
        knee = hip + Rp @ (0.44 * np.array([math.sin(th), s * math.sin(ab), -math.cos(th)]))
        ank = knee + Rp @ (0.43 * np.array([math.sin(th - k), s * math.sin(ab) * 0.4, -math.cos(th - k)]))
        tx = (0, s * 3, 0)
        limb(m, hip, knee, 0.108, 0.08, UNI, bulge=0.12, bulge_at=0.35, fwd=pf, tex=tx)
        kd = nz(knee - hip)
        ellipsoid(m, knee + pf * 0.03, 0.06, 0.075, 0.07, PAD if fac.knee_pads else UNI, fwd=pf,
                  tex=(4, s * 3, 0), n=10, ns=7)
        limb(m, knee, ank, 0.078, 0.06, UNI, bulge=0.16, bulge_at=0.25, fwd=pf, tex=(1, s * 3, 0))
        limb(m, ank - np.array([0, 0, 0.03]), ank + np.array([0, 0, 0.15]), 0.068, 0.07, BOOT, bulge=0, fwd=pf)
        fd = Rp @ np.array([math.cos(fp), 0, math.sin(fp)])
        fu = Rp @ np.array([-math.sin(fp), 0, math.cos(fp)])
        ellipsoid(m, ank + fd * 0.075 - fu * 0.045, 0.15, 0.066, 0.058, BOOT, fwd=fu, up=fd, n=10, ns=8, p=2.6)
        if s == -1:   # drop-leg / thigh pouch on the right
            c = hip + kd * 0.2 - ps * 0.11
            ellipsoid(m, c, 0.06, 0.04, 0.08, POUCH, fwd=pf, up=kd, n=8, ns=6, p=2.5)
    # ---- hips, belt, torso
    ellipsoid(m, P - up * 0.02, 0.13, 0.19, 0.12, UNI, fwd=pf, tex=(2, 0, 0))
    ellipsoid(m, P + up * 0.075, 0.14, 0.195, 0.045, BELT, fwd=fw, n=12, ns=6)
    for yy in (-0.13, 0.13):   # belt pouches
        ellipsoid(m, P + up * 0.07 + fw * 0.06 + side * yy, 0.04, 0.045, 0.055, POUCH, fwd=fw, up=up, n=8, ns=6)
    loft_axis(m, P + up * 0.02, P + up * 0.57,
              interp([0, .3, .62, .82, .93, 1], [.17, .175, .205, .22, .17, .08]),
              interp([0, .3, .62, .82, .93, 1], [.115, .118, .135, .128, .095, .055]), UNI, fwd=fw, n=14, ns=12,
              tex=(3, 0, 0))
    # ---- plate carrier: front/back plates, cummerbund, shoulder straps, pouches
    cap = lambda f: (lambda t: f(t) * np.clip(1 - np.abs(2 * t - 1) ** 6, 0, 1) ** 0.25)
    loft_axis(m, P + up * 0.13, P + up * 0.5, cap(interp([0, .5, 1], [.205, .232, .225])),
              cap(interp([0, .5, 1], [.16, .175, .16])), VEST, fwd=fw, n=16, ns=8, tex=(3.5, 0, 0), )
    for yy in (-0.10, 0.10):
        ellipsoid(m, P + up * 0.47 + side * yy, 0.11, 0.05, 0.05, VEST, fwd=fw, up=up, n=8, ns=6)
    for yy in (-0.105, -0.035, 0.035, 0.105):   # magazine pouches
        ellipsoid(m, P + up * 0.24 + fw * 0.17 + side * yy, 0.04, 0.034, 0.07, POUCH, fwd=fw, up=up, n=8, ns=6,
                  p=2.5)
    ellipsoid(m, P + up * 0.37 + fw * 0.17, 0.035, 0.09, 0.045, POUCH, fwd=fw, up=up, n=8, ns=6, p=2.5)  # admin
    ellipsoid(m, P + up * 0.31 - fw * 0.2, 0.085, 0.15, 0.16, POUCH, fwd=fw, up=up, n=10, ns=7, p=2.6)  # pack
    if fac.radio:
        rb = P + up * 0.38 - fw * 0.2 + side * 0.11
        ellipsoid(m, rb, 0.05, 0.035, 0.06, NVG, fwd=fw, up=up, n=8, ns=6)
        limb(m, rb, rb + up * 0.42 - fw * 0.08, 0.008, 0.006, NVG, bulge=0)
    # ---- head & hat
    neck = P + up * 0.55
    hup = Rh @ np.array([0, 0, 1.0]); hfw = Rh @ np.array([1.0, 0, 0]); hsd = np.cross(hup, hfw)
    hc = neck + hup * 0.125 * HEAD + hfw * 0.015
    limb(m, neck - up * 0.03, hc - hup * 0.05, 0.062, 0.058, SKIN, bulge=0)
    rf, rs, ru = 0.105 * HEAD, 0.096 * HEAD, 0.125 * HEAD
    loft_axis(m, hc - hup * ru, hc + hup * ru, ell_prof(rs), ell_prof(rf), FACE, fwd=hfw, n=12, ns=10)
    if fac.glasses:
        ellipsoid(m, hc + hfw * 0.085 * HEAD + hup * 0.025, 0.03, 0.085, 0.022, NVG, fwd=hfw, up=hup, n=10, ns=5)
    if fac.hat == "helmet":   # modern high-cut helmet + headset + NVG mount
        top = 0.17 * HEAD
        loft_axis(m, hc + hup * 0.03 + hfw * -0.01, hc + hup * top,
                  lambda t: 0.138 * HEAD * np.sqrt(np.clip(1 - t ** 2, 0, 1)) * (1 + 0.05 * (t < 0.12)),
                  lambda t: 0.152 * HEAD * np.sqrt(np.clip(1 - t ** 2, 0, 1)) * (1 + 0.04 * (t < 0.12)),
                  HELM, fwd=hfw, n=14, ns=9, tex=(5, 0, 0))
        for s in (1, -1):
            ellipsoid(m, hc + hsd * s * 0.11 * HEAD - hup * 0.005, 0.05, 0.035, 0.055, NVG, fwd=hfw, up=hup,
                      n=8, ns=6)   # ear-pro headset
            ellipsoid(m, hc + hsd * s * 0.135 * HEAD + hup * 0.07, 0.07, 0.012, 0.016, NVG, fwd=hfw, up=hup,
                      n=6, ns=5)   # side rails
        ellipsoid(m, hc + hfw * 0.15 * HEAD + hup * 0.075, 0.022, 0.035, 0.03, NVG, fwd=hfw, up=hup, n=8, ns=6)
    elif fac.hat == "ushanka":
        loft_axis(m, hc + hup * 0.03, hc + hup * 0.23 * HEAD,
                  lambda t: 0.155 * HEAD * np.clip(1 - t ** 5, 0, 1) ** 0.3,
                  lambda t: 0.162 * HEAD * np.clip(1 - t ** 5, 0, 1) ** 0.3, CAPC, fwd=hfw, n=14, ns=8, tex=(6, 0, 0))
        rnd = lambda r: (lambda t: r * np.clip(1 - np.abs(2 * t - 1) ** 6, 0, 1) ** 0.2)
        loft_axis(m, hc - hup * 0.005, hc + hup * 0.12 * HEAD, rnd(0.178 * HEAD), rnd(0.186 * HEAD), FUR,
                  fwd=hfw, n=14, ns=6, tex=(7, 0, 0))
        for s in (1, -1):
            ellipsoid(m, hc + hup * 0.17 * HEAD + hsd * s * 0.1 * HEAD, 0.075, 0.035, 0.05, FUR, fwd=hfw,
                      up=hup + hsd * s * 0.6, n=8, ns=6)
        ellipsoid(m, hc + hfw * 0.185 * HEAD + hup * 0.065 * HEAD, 0.012, 0.026, 0.026, BADGE, fwd=hfw, up=hup,
                  n=8, ns=5)
    elif fac.hat == "cap":
        loft_axis(m, hc + hup * 0.02, hc + hup * 0.13 * HEAD,
                  lambda t: 0.122 * HEAD * np.clip(1 - t ** 8, 0, 1) ** 0.2,
                  lambda t: 0.13 * HEAD * np.clip(1 - t ** 8, 0, 1) ** 0.2, CAPC, fwd=hfw, n=14, ns=7, tex=(8, 0, 0))
        bd = nz(hfw - hup * 0.18)
        ellipsoid(m, hc + hfw * 0.15 * HEAD + hup * 0.035, 0.11, 0.1, 0.014, BRIM, fwd=bd,
                  up=np.cross(bd, hsd) * -1, n=10, ns=5)
        ellipsoid(m, hc + hfw * 0.128 * HEAD + hup * 0.095 * HEAD, 0.01, 0.022, 0.022, BADGE, fwd=hfw, up=hup,
                  n=8, ns=5)
    # ---- arms (bulky sleeves, shoulder flag patch)
    for s in (1, -1):
        S = P + up * 0.47 + side * s * 0.215
        H = hands[s]
        ellipsoid(m, S, 0.085, 0.082, 0.085, SHLD, fwd=fw, up=up, tex=(20 + s, 0, 0), n=12, ns=8)
        el = ik(S, H, 0.29, 0.27, Rt @ np.array([-0.45, s * 0.9, -0.6]))
        limb(m, S, el, 0.072, 0.058, UNI, bulge=0.12, bulge_at=0.35, tex=(10, s * 3, 0))
        ellipsoid(m, el, 0.058, 0.058, 0.058, UNI, n=8, ns=6, tex=(11, s * 3, 0))
        limb(m, el, H, 0.058, 0.044, UNI, bulge=0.12, bulge_at=0.25, tex=(12, s * 3, 0))
        hd = nz(H - el)
        ellipsoid(m, H + hd * 0.02, 0.042, 0.05, 0.06, GLOVE, fwd=np.cross(hd, side) if abs(hd @ side) < .9 else fw,
                  up=hd, n=8, ns=6)
    if rifle is not None:
        build_rifle(m, fac.rifle_kind, rifle[0], rifle[1], rifle[2])
    return m

def rifle_hands(butt, rdir, rup):
    return butt + rdir * 0.34 - rup * 0.11, butt + rdir * 0.66 - rup * 0.045

def build_soldier(fac, mode="idle", phase=0.0, die=0.0):
    Rp = np.eye(3); head_tilt = 0.0
    if mode == "walk":
        legs = {}
        for s, off in ((-1, 0.0), (1, 0.5)):
            p = (phase + off) % 1.0
            th = 0.36 * math.cos(2 * math.pi * p) + 0.04
            k = 0.10 + 0.20 * bump(p, 0.12, 0.08) + 1.05 * bump(p, 0.74, 0.12)
            fp = 0.22 * bump(p, 0.0, 0.07) - 0.55 * bump(p, 0.6, 0.07)
            legs[s] = (th, k, fp, 0.03)
        lean, twist = 0.13, 0.10 * math.cos(2 * math.pi * phase)
        Rp = rot_z(-0.12 * math.cos(2 * math.pi * phase))
        Rt = rot_z(twist) @ tilt(lean)
        bob = 0.012 * math.sin(4 * math.pi * phase)
        butt_l = np.array([0.17, -0.13, 0.27 + bob]); rdir_l = nz([0.85, 0.40, 0.42])
    elif mode == "aim":
        legs = {1: (0.30, 0.25, 0.0, 0.08), -1: (-0.20, 0.14, -0.12, 0.10)}
        Rt = rot_z(-0.10) @ tilt(0.12); head_tilt = 0.18
    else:
        legs = {-1: (0.02, 0.04, 0.0, 0.05), 1: (0.12, 0.20, 0.06, 0.09)}
        Rt = rot_z(0.12) @ tilt(0.04)
        butt_l = np.array([0.13, -0.12, 0.17]); rdir_l = nz([0.35, 0.55, 0.78])
    if mode == "die":
        d = die
        buck = math.sin(math.pi * min(d / 0.75, 1.0)) * (1 if d < 0.75 else 0) + 0.35 * (d >= 0.75)
        legs = {1: (0.15 + 0.55 * buck, 1.25 * buck, 0.0, 0.10 + 0.1 * d),
                -1: (0.05 + 0.40 * buck, 0.95 * buck, 0.0, 0.12 + 0.12 * d)}
        Rt = rot_z(0.3 * d) @ tilt(-0.35 * min(d / 0.2, 1.0))
        head_tilt = -0.5 * min(d / 0.2, 1.0)
    P = np.array([0, 0, 0.98])
    Rh = Rt @ tilt(head_tilt)
    up = Rt @ np.array([0, 0, 1.0]); fw = Rt @ np.array([1.0, 0, 0]); side = np.cross(up, fw)
    rifle = None
    if mode == "aim":
        sh_r = P + up * 0.475 - side * 0.195
        butt = sh_r + np.array([0.06, 0.07, -0.04]); rdir = nz([1, 0.0, -0.02])
        rup = basis(rdir)[:, 2]
        hr, hl = rifle_hands(butt, rdir, rup)
        rifle = (butt, rdir, (0, 0, 1))
    elif mode == "die":
        f = min(d / 0.2, 1.0)
        hr = P + Rt @ np.array([0.05 - 0.15 * f, -0.30 - 0.2 * f, 0.55 + 0.3 * f - 0.6 * max(d - 0.6, 0)])
        hl = P + Rt @ np.array([0.10 - 0.15 * f, 0.30 + 0.25 * f, 0.50 + 0.35 * f - 0.6 * max(d - 0.6, 0)])
        if d < 0.1:
            butt = P + Rt @ np.array([0.13, -0.12, 0.17]); rdir = Rt @ nz([0.35, 0.55, 0.78])
            rup = basis(rdir)[:, 2]; hr, hl = rifle_hands(butt, rdir, rup); rifle = (butt, rdir, (0, 0, 1))
    else:
        butt = P + Rt @ butt_l; rdir = Rt @ rdir_l
        rup = basis(rdir)[:, 2]
        hr, hl = rifle_hands(butt, rdir, rup)
        rifle = (butt, rdir, (0, 0, 1))
    m = body_mesh(fac, P, Rt, Rp, Rh, legs, {-1: hr, 1: hl}, rifle)
    if mode == "die":
        ang = math.radians(86) * (max(0.0, (d - 0.35) / 0.65) ** 1.4)
        transform(m, 0, rot_y(ang))   # fall backward (top toward -x)
        V = np.concatenate(m.V)
        transform(m, 0, np.eye(3), t=(0, 0, -V[..., 2].min()))
        V = np.concatenate(m.V)
        cx = (V[..., 0].min() + V[..., 0].max()) / 2; cy = (V[..., 1].min() + V[..., 1].max()) / 2
        transform(m, 0, np.eye(3), t=(-cx * 0.8, -cy * 0.8, 0))
        if d >= 0.1:   # dropped rifle
            fall = min((d - 0.1) / 0.3, 1.0)
            a = 0.7 + 1.0 * fall
            build_rifle(m, fac.rifle_kind, np.array([0.25 - 0.3 * fall, -0.42, 0.04 + 0.7 * (1 - fall) ** 2]),
                        nz([math.cos(a), math.sin(a), -0.6 * (1 - fall)]), (0, 0, 1))
    else:
        V = np.concatenate(m.V)
        transform(m, 0, np.eye(3), t=(0, 0, -V[..., 2].min()))
    return m

# ------------------------------------------------------------------ render & stylise
def ellipse_shadow(cw, ch, cx, cy, rx, ry, a=0.45):
    X = np.arange(cw)[None] + 0.5; Y = np.arange(ch)[:, None] + 0.5
    d = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2
    out = np.zeros((ch, cw, 4)); out[..., 3] = np.clip(1.4 * (1 - d), 0, 1) ** 0.8 * a
    return out

def stylise(img):
    a = img[..., 3]
    rgb = np.where(a[..., None] > 1e-4, img[..., :3] / np.maximum(a[..., None], 1e-4), 0)
    a2 = np.clip((a - 0.3) / 0.4, 0, 1)
    lum = rgb.mean(-1, keepdims=True)
    rgb = np.clip(lum + (rgb - lum) * 1.25, 0, 1)                 # saturation
    rgb = np.clip(0.5 + (rgb - 0.5) * 1.12, 0, 1)                 # contrast
    inside = a2 > 0.5
    er = inside.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        er &= np.roll(np.roll(inside, dy, 0), dx, 1)
    edge = inside & ~er
    rgb[edge] *= 0.6                                              # dark rim like hand-pixelled sprites
    return np.concatenate([rgb * a2[..., None], a2[..., None]], -1)

def render(fac, mesh, facing_deg, lying=False, blood=0.0):
    R = rot_model(facing_deg)
    arr = mesh.arrays()
    img = stylise(shade(fac, arr, R, SCALE, CELL, CELL, off=(0, YOFF)))
    ox, oy, _ = project(np.zeros(3), SCALE, CELL, CELL, (0, YOFF))
    if lying:
        shd = shadow_layer(arr[0] @ R.T, SCALE, CELL, CELL, light_proj=False, alpha=0.38, off=(0, YOFF))
    else:
        shd = ellipse_shadow(CELL, CELL, ox + 1, oy + 0.5, 0.36 * SCALE, 0.19 * SCALE)
    if blood > 0:
        g = np.zeros((CELL, CELL, 4)); rng = np.random.default_rng(3)
        V = arr[0] @ R.T
        bx, by, _ = project(V.reshape(-1, 3).mean(0) * np.array([1, 1, 0]), SCALE, CELL, CELL, (0, YOFF))
        for i in range(6):
            blob(g, bx + rng.normal(0, 2.5), by + rng.normal(0, 1.2), (2.5 + rng.uniform(0, 2.5)) * blood,
                 [0.42, 0.04, 0.03], 0.9, hard=0.5)
        shd = over(g, shd)
    return over(img, shd)

def build_sheet(fac, path):
    sheet = np.zeros((11 * CELL, 8 * CELL, 4))
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    idle = build_soldier(fac, "idle")
    aim = build_soldier(fac, "aim")
    walks = [build_soldier(fac, "walk", phase=k / 8) for k in range(8)]
    for f in range(8):
        put(render(fac, idle, f * 45), 0, f)
        put(render(fac, aim, f * 45), 9, f)
        for k in range(8):
            put(render(fac, walks[k], f * 45), 1 + f, k)
    for k in range(8):
        d = [0.0, 0.12, 0.3, 0.48, 0.64, 0.8, 0.93, 1.0][k]
        put(render(fac, build_soldier(fac, "die", die=d), 3 * 45, lying=d > 0.85,
                   blood=max(0, (k - 4) / 3)), 10, k)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    sel = sys.argv[1:] or ["de", "ru", "us", "cn"]
    table = {"de": (Germany, "infantry_germany_eu.png"), "ru": (Russia, "infantry_russia.png"),
             "us": (USA, "infantry_usa.png"), "cn": (China, "infantry_china.png")}
    for k in sel:
        cls, fn = table[k]
        build_sheet(cls(), out + fn)
