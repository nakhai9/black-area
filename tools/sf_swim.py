"""
Adds water animations to the special-forces sheets (front crawl swim + treading water).
Final SF sheet layout (8 columns x 27 rows, 64px cells -> 512x1728):
  R0       IDLE   8 facings
  R1-8     WALK   row = facing 0..7, 8 frames
  R9       AIM    8 facings (kneeling)
  R10      DIE    8 frames
  R11-18   SWIM   row = facing 0..7, 8 frames (front crawl, rifle slung on back, wake + splashes)
  R19-26   TREAD  row = facing 0..7, 8 frames (treading water / "boi dung", ripples)
Water line is z = 0 at the same screen anchor as the ground point of land frames, so units
don't jump when they walk into water. Submerged body parts are drawn dim and blue-tinted.
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py, sf_sprites.py.
"""
import math, sys, os
import numpy as np
from PIL import Image
import infantry_sprites as inf
import sf_sprites as sf
from infantry_sprites import (body_mesh, tilt, rot_z, nz, transform, stylise, over, blob, project, rot_model,
                              shade, CELL, SCALE, YOFF)

WATER = np.array([0.10, 0.32, 0.40])
FOAM = np.array([0.92, 0.96, 1.0])

# ------------------------------------------------------------------ geometry clip at water plane
def clip_arrays(arr, keep_above, z0=0.0):
    V, N, T, P, C = arr
    d = V[..., 2] - z0
    if not keep_above: d = -d
    inside = d >= 0
    cnt = inside.sum(1)
    full = cnt == 3
    outV, outN, outT, outP, outC = [V[full]], [N[full]], [T[full]], [P[full]], [C[full]]
    nv, nn, nt, np_, nc = [], [], [], [], []
    for t in np.nonzero((cnt > 0) & (cnt < 3))[0]:
        A = np.concatenate([V[t], N[t], T[t]], 1)
        poly = []
        for i in range(3):
            cur, prev = A[i], A[i - 1]
            dc, dp = d[t, i], d[t, i - 1]
            if dc >= 0:
                if dp < 0: poly.append(prev + (cur - prev) * (dp / (dp - dc)))
                poly.append(cur)
            elif dp >= 0:
                poly.append(prev + (cur - prev) * (dp / (dp - dc)))
        for k in range(1, len(poly) - 1):
            tri = np.stack([poly[0], poly[k], poly[k + 1]])
            nv.append(tri[:, 0:3]); nn.append(tri[:, 3:6]); nt.append(tri[:, 6:9]); np_.append(P[t]); nc.append(C[t])
    if nv:
        outV.append(np.stack(nv)); outN.append(np.stack(nn)); outT.append(np.stack(nt))
        outP.append(np.array(np_)); outC.append(np.array(nc))
    return tuple(np.concatenate(x) for x in (outV, outN, outT, outP, outC))

# ------------------------------------------------------------------ 2D water effects
def ring(img, cx, cy, rx, ry, width, a, col=FOAM):
    h, w = img.shape[:2]
    X = np.arange(w)[None] + 0.5; Y = np.arange(h)[:, None] + 0.5
    d = np.sqrt(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2)
    k = (np.exp(-((d - 1) / width) ** 2) * a)[..., None]
    img[:] = np.concatenate([np.asarray(col) * k, k], -1) + img * (1 - k)

def foam(img, x, y, r, a, rng):
    blob(img, x + rng.normal(0, 0.4), y + rng.normal(0, 0.3), r, FOAM * rng.uniform(0.9, 1.0), a, hard=1.0)

def water_disc(img, cx, cy, rx, ry, a=0.22):
    h, w = img.shape[:2]
    X = np.arange(w)[None] + 0.5; Y = np.arange(h)[:, None] + 0.5
    d = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2
    k = (np.clip(1 - d, 0, 1) ** 0.7 * a)[..., None]
    img[:] = np.concatenate([WATER * 0.5 * k, k], -1) + img * (1 - k)

# ------------------------------------------------------------------ poses
def sling_rifle(P, up, fw, side):
    butt = P + up * 0.08 - fw * 0.24 - side * 0.13
    return (butt, nz(up + side * 0.5), -fw)

def swim_mesh(fac, phase):
    P = np.array([0, 0, 0.98])
    Rt = np.eye(3); Rp = np.eye(3); Rh = tilt(-1.2)
    up, fw = np.array([0, 0, 1.0]), np.array([1.0, 0, 0]); side = np.cross(up, fw)
    hands = {}
    for s in (1, -1):
        phi = 2 * math.pi * phase + (0 if s == 1 else math.pi)
        S = P + up * 0.47 + side * s * 0.215
        pulling = (phi % (2 * math.pi)) < math.pi
        reach = 0.56 if pulling else 0.42
        d = up * math.cos(phi) + fw * math.sin(phi)
        hands[s] = S + d * reach + side * s * (0.04 if pulling else 0.14)
    legs = {}
    for s, off in ((1, 0.0), (-1, math.pi)):
        ps = 4 * math.pi * phase + off
        legs[s] = (0.16 * math.sin(ps) + 0.02, 0.08 + 0.14 * max(0, math.sin(ps + 1.2)), -1.4, 0.05)
    back_rifle = (P + up * 0.45 - fw * 0.25 - side * 0.08, nz(-up + side * 0.3), -fw)
    m = body_mesh(fac, P, Rt, Rp, Rh, legs, hands, back_rifle)
    roll = -0.32 * math.sin(2 * math.pi * phase)
    R = tilt(math.radians(80)) @ rot_z(roll)
    t = np.array([0, 0, -P[2] - 0.13])
    transform(m, 0, R, t=t, pivot=P)
    f = lambda p: (np.asarray(p) - P) @ R.T + P + t
    V = np.concatenate(m.V)
    cx = (V[..., 0].min() + V[..., 0].max()) / 2
    transform(m, 0, np.eye(3), t=(-cx, 0, 0))
    g = lambda p: f(p) - np.array([cx, 0, 0])
    pts = {"hands": [g(hands[1]), g(hands[-1])], "phis": [(2 * math.pi * phase) % (2 * math.pi),
           (2 * math.pi * phase + math.pi) % (2 * math.pi)],
           "head": g(P + up * 0.75 + fw * 0.05), "feet": g(P - up * 0.95), "xmin": V[..., 0].min() - cx,
           "xmax": V[..., 0].max() - cx}
    return m, pts

def tread_mesh(fac, phase):
    P = np.array([0, 0, 0.98])
    Rt = tilt(0.12); Rp = np.eye(3); Rh = Rt @ tilt(-0.1)
    up = Rt @ np.array([0, 0, 1.0]); fw = Rt @ np.array([1.0, 0, 0]); side = np.cross(up, fw)
    hands = {}
    for s in (1, -1):
        w = math.sin(2 * math.pi * phase + (0 if s == 1 else math.pi))
        hands[s] = P + up * (0.30 + 0.03 * w) + fw * 0.30 + side * s * (0.36 + 0.15 * w)
    legs = {}
    for s, off in ((1, 0.0), (-1, math.pi)):
        ps = 2 * math.pi * phase + off
        legs[s] = (0.75 + 0.18 * math.sin(ps), 1.35 + 0.25 * math.cos(ps), -0.4, 0.38 + 0.15 * math.sin(ps + 1))
    m = body_mesh(fac, P, Rt, Rp, Rh, legs, hands, sling_rifle(P, up, fw, side))
    bob = 0.035 * math.sin(4 * math.pi * phase)
    t = np.array([-0.08, 0, -(P[2] + 0.43) + bob])
    transform(m, 0, np.eye(3), t=t)
    pts = {"hands": [hands[1] + t, hands[-1] + t], "head": P + up * 0.68 + t}
    return m, pts

# ------------------------------------------------------------------ render
def bloom(fac, img):
    acc = fac.accent
    a = img[..., 3:4]
    rgb = np.where(a > 1e-4, img[..., :3] / np.maximum(a, 1e-4), 0)
    an = acc / np.linalg.norm(acc)
    sim = (rgb @ an) / np.maximum(np.linalg.norm(rgb, axis=-1), 1e-4)
    core = ((sim > 0.985) & (rgb.max(-1) > 0.25) & (a[..., 0] > 0.5)).astype(float)
    halo = np.clip(sf._blur(core, 3) * 2.2, 0, 0.75)[..., None]
    return np.concatenate([acc[None, None, :] * halo, halo], -1) + img * (1 - halo)

def render_water(fac, m, facing, fx_fn):
    R = rot_model(facing)
    arr = m.arrays()
    above, below = clip_arrays(arr, True), clip_arrays(arr, False)
    img_a = bloom(fac, stylise(shade(fac, above, R, SCALE, CELL, CELL, off=(0, YOFF)))) if len(above[0]) \
        else np.zeros((CELL, CELL, 4))
    img_b = shade(fac, below, R, SCALE, CELL, CELL, off=(0, YOFF)) if len(below[0]) else np.zeros((CELL, CELL, 4))
    ab = img_b[..., 3:4]
    rgb_b = np.where(ab > 1e-4, img_b[..., :3] / np.maximum(ab, 1e-4), 0) * 0.35 + WATER * 0.65
    ab2 = np.clip((ab - 0.3) / 0.4, 0, 1) * 0.5
    img_b = np.concatenate([rgb_b * ab2, ab2], -1)
    under, surf = np.zeros((CELL, CELL, 4)), np.zeros((CELL, CELL, 4))
    P2 = lambda p: project(R @ np.asarray(p, float), SCALE, CELL, CELL, (0, YOFF))[:2]
    fx_fn(under, surf, P2, R)
    return over(img_a, over(surf, over(img_b, under)))

def swim_frame(fac, facing, k):
    phase = k / 8
    m, pts = swim_mesh(fac, phase)
    rng = np.random.default_rng(1000 + k)
    def fx(under, surf, P2, R):
        cx, cy = P2((0, 0, 0))
        water_disc(under, cx, cy, 1.25 * SCALE * 0.6, 0.65 * SCALE * 0.6)
        tail = pts["xmin"]
        for i in range(12):                                   # V-shaped wake behind the swimmer
            x = tail + 0.25 - i * 0.14 - (phase * 0.14)
            spread = 0.18 + i * 0.07
            a = 0.55 * (1 - i / 12)
            for sgn in (1, -1):
                foam(surf, *P2((x, sgn * spread, 0)), 1.1 + i * 0.12, a, rng)
        for i in range(6):                                    # kick churn at the feet
            fx_, fy_ = P2((tail + 0.15 + rng.normal(0, 0.1), rng.normal(0, 0.12), 0))
            foam(surf, fx_, fy_, rng.uniform(0.8, 1.6), 0.7, rng)
        hx = pts["xmax"]                                      # bow wave at the head
        for sgn in (1, -1):
            foam(surf, *P2((hx - 0.15, sgn * 0.2, 0)), 1.3, 0.55, rng)
        for H, phi in zip(pts["hands"], pts["phis"]):          # splash on hand entry / exit
            near_entry = math.exp(-((phi - 0.15) / 0.5) ** 2) + math.exp(-((phi - 2 * math.pi) / 0.4) ** 2)
            near_exit = math.exp(-((phi - math.pi * 1.05) / 0.45) ** 2)
            s_amt = max(near_entry, near_exit)
            if s_amt > 0.15:
                hx_, hy_ = P2((H[0], H[1], 0))
                for j in range(int(4 * s_amt) + 2):
                    foam(surf, hx_ + rng.normal(0, 1.2), hy_ + rng.normal(0, 0.6) - rng.uniform(0, 2.5 * s_amt),
                         rng.uniform(0.7, 1.4), 0.85, rng)
        for i in range(5):                                    # waterline foam around the body
            foam(surf, *P2((rng.uniform(tail + 0.3, hx - 0.2), rng.choice([-1, 1]) * 0.24, 0)), 1.0, 0.45, rng)
    return render_water(fac, m, facing, fx)

def tread_frame(fac, facing, k):
    phase = k / 8
    m, pts = tread_mesh(fac, phase)
    rng = np.random.default_rng(2000 + k)
    def fx(under, surf, P2, R):
        cx, cy = P2((0, 0, 0))
        water_disc(under, cx, cy, 0.85 * SCALE, 0.45 * SCALE)
        for j in range(3):                                    # expanding ripple rings
            t = (phase + j / 3) % 1.0
            r = (0.35 + 0.75 * t) * SCALE
            ring(surf, cx, cy, r, r * 0.5, 0.09, 0.5 * (1 - t) ** 1.2)
        ring(surf, cx, cy, 0.3 * SCALE, 0.15 * SCALE, 0.25, 0.55)   # foam collar at the shoulders
        for H in pts["hands"]:
            hx_, hy_ = P2((H[0], H[1], 0))
            for j in range(2):
                foam(surf, hx_ + rng.normal(0, 0.8), hy_ + rng.normal(0, 0.4), rng.uniform(0.7, 1.2), 0.6, rng)
    return render_water(fac, m, facing, fx)

# ------------------------------------------------------------------ sheet
def build_full_sheet(fac, path):
    tmp = path + ".land.png"
    inf.build_sheet(fac, tmp)
    land = np.asarray(Image.open(tmp), float) / 255.0
    os.remove(tmp)
    land = np.concatenate([land[..., :3] * land[..., 3:4], land[..., 3:4]], -1)
    sheet = np.zeros((27 * CELL, 8 * CELL, 4))
    sheet[:11 * CELL] = land
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    for f in range(8):
        for k in range(8):
            put(swim_frame(fac, f * 45, k), 11 + f, k)
            put(tread_frame(fac, f * 45, k), 19 + f, k)
        print(fac.name, "water facing", f, flush=True)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    sel = sys.argv[1:] or ["de", "ru", "us", "cn"]
    table = {"de": (sf.GermanySF, "sf_germany_ksk.png"), "ru": (sf.RussiaSF, "sf_russia_spetsnaz.png"),
             "us": (sf.USASF, "sf_usa_sof.png"), "cn": (sf.ChinaSF, "sf_china_pla_sof.png")}
    for k in sel:
        cls, fn = table[k]
        build_full_sheet(cls(), out + fn)
