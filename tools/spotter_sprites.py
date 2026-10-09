"""
RA2-style SPOTTER TEAM sheets (2 men side by side: flag bearer with the faction flag + rifleman).
Cell 96x96, 8 columns x 19 rows (768x1824), shadows baked in.
  R0-7    WALK        row = facing 0..7, 8 frames (marching in step, flag streaming)
  R8-15   FIRE        row = facing 0..7, 8 frames (rifleman fires 2 shots/loop, flag bearer holds flag)
  R16     DIE (rifleman)    8 frames, flag bearer keeps standing with flag
  R17     DIE (flag bearer) 8 frames, flag falls, rifleman keeps standing
  R18     DIE (both)        8 frames
Facing k = k*45 deg, 0 = screen-up, clockwise. Death rows use facing 3 (like infantry sheets).
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py in the same folder.
"""
import math, sys
import numpy as np
from PIL import Image
import bomber_sprites as bs
import infantry_sprites as inf
from infantry_sprites import (Mesh, body_mesh, build_soldier, limb, ellipsoid, tilt, rot_z, bump, nz, transform,
                              stylise, ellipse_shadow, shade, shadow_layer, over, blob, project, rot_model,
                              Germany, Russia, USA, China, SCALE, RIFLE, RFUR)

CELL = 96
YOFF = CELL * 0.30
POLE, FLAGC, FINIAL = 100, 101, 102
SLOT_R = np.array([0.0, -0.42, 0.0])     # rifleman (right)
SLOT_F = np.array([-0.12, 0.42, 0.0])    # flag bearer (left)
DEATH_FACING = 135

# ------------------------------------------------------------------ flags
def flag_colour(kind, u, v):
    n = len(u); col = np.zeros((n, 3))
    if kind == "de":
        col[:] = [1.0, 0.80, 0.05]; col[v < 2 / 3] = [0.85, 0.08, 0.08]; col[v < 1 / 3] = [0.08, 0.08, 0.08]
    elif kind == "ru":
        col[:] = [0.85, 0.10, 0.10]; col[v < 2 / 3] = [0.12, 0.25, 0.70]; col[v < 1 / 3] = [0.97, 0.97, 0.97]
    elif kind == "us":
        stripe = (np.floor(v * 13) % 2) == 0
        col[:] = [0.97, 0.97, 0.97]; col[stripe] = [0.80, 0.10, 0.12]
        canton = (u < 0.4) & (v < 7 / 13)
        col[canton] = [0.15, 0.20, 0.55]
        dots = canton & (np.mod(u * 15, 1) < 0.35) & (np.mod(v * 13, 1) < 0.4)
        col[dots] = [0.97, 0.97, 0.97]
    elif kind == "cn":
        col[:] = [0.88, 0.10, 0.08]
        uu, vv = u * 1.5, v          # 3:2 flag aspect
        yellow = [1.0, 0.85, 0.10]
        col[bs.in_star(uu, vv, 0.25, 0.25, 0.15)] = yellow
        for cu, cv in ((0.5, 0.10), (0.6, 0.20), (0.6, 0.35), (0.5, 0.45)):
            col[bs.in_star(uu, vv, cu, cv, 0.05)] = yellow
    return col

def make_fac(base_cls):
    class Team(base_cls):
        def colorize(self, part, P, ctx):
            n = len(P)
            if part == FLAGC:
                col = flag_colour(self.flag, np.clip(P[:, 0], 0, 1), np.clip(P[:, 1], 0, 1))
                return col * (1 + 0.06 * np.sin(P[:, 0] * 18))[:, None]
            if part == POLE: return np.tile([0.42, 0.32, 0.20], (n, 1))
            if part == FINIAL: return np.tile([1.0, 0.82, 0.25], (n, 1))
            return super().colorize(part, P, ctx)
    t = Team(); t.name = base_cls.__name__ + " team"
    return t

# ------------------------------------------------------------------ flag + pole
def pole_and_flag(m, base, pu, adir, phase, wave=1.0, length=2.2, W=0.95, H=0.62):
    top = base + pu * length
    limb(m, base, top, 0.02, 0.018, POLE, bulge=0)
    ellipsoid(m, top + pu * 0.04, 0.035, 0.035, 0.045, FINIAL, n=8, ns=6)
    down = -pu
    nrm = nz(np.cross(adir, down))
    nu, nv = 14, 7
    G = np.zeros((nu, nv, 3)); T = np.zeros((nu, nv, 3))
    for i, u in enumerate(np.linspace(0, 1, nu)):
        for j, v in enumerate(np.linspace(0, 1, nv)):
            w = wave * 0.11 * u * math.sin(2 * math.pi * (1.4 * u - phase) + 0.6 * v)
            G[i, j] = top - pu * 0.06 + adir * u * W + down * (v * H + 0.06 * u * u * (1 - wave * 0.5)) + nrm * w
            T[i, j] = (u, v, 0)
    k = len(m.V)
    m.add_grid(G, part=FLAGC)
    tmp = Mesh(); tmp.add_grid(T, part=FLAGC)
    m.T[k:] = tmp.V

# ------------------------------------------------------------------ flag bearer
def walk_legs(phase):
    legs = {}
    for s, off in ((-1, 0.0), (1, 0.5)):
        p = (phase + off) % 1.0
        th = 0.36 * math.cos(2 * math.pi * p) + 0.04
        k = 0.10 + 0.20 * bump(p, 0.12, 0.08) + 1.05 * bump(p, 0.74, 0.12)
        fp = 0.22 * bump(p, 0.0, 0.07) - 0.55 * bump(p, 0.6, 0.07)
        legs[s] = (th, k, fp, 0.03)
    return legs

def flag_bearer(fac, mode, phase):
    """returns body mesh, flag mesh (both grounded, local coords of the bearer)"""
    P = np.array([0, 0, 0.98])
    if mode == "walk":
        c = math.cos(2 * math.pi * phase)
        legs = walk_legs(phase); Rp = rot_z(-0.12 * c); Rt = rot_z(0.06 * c) @ tilt(0.06)
        sway = 0.05 * math.sin(2 * math.pi * phase)
    else:
        legs = {-1: (0.02, 0.04, 0.0, 0.05), 1: (0.12, 0.20, 0.06, 0.09)}
        Rp = np.eye(3); Rt = tilt(0.03); sway = 0.0
    up = Rt @ np.array([0, 0, 1.0]); fw = Rt @ np.array([1.0, 0, 0]); side = np.cross(up, fw)
    pu = nz(np.array([-0.06, sway, 1.0]))
    base = P + fw * 0.24 - side * 0.06 - up * 0.25
    hands = {-1: base + pu * 0.62, 1: base + pu * 0.30}
    body = body_mesh(fac, P, Rt, Rp, Rt, legs, hands, None)
    flag = Mesh()
    adir = nz(np.array([-1.0, 0.35, 0.0])) if mode == "walk" else nz(np.array([-0.4, 0.9, 0.0]))
    pole_and_flag(flag, base, pu, adir, phase)
    V = np.concatenate(body.V)
    dz = -V[..., 2].min()
    transform(body, 0, np.eye(3), t=(0, 0, dz)); transform(flag, 0, np.eye(3), t=(0, 0, dz))
    return body, flag

def strip_rifle(mesh):
    V, N, T, P, C = mesh.arrays()
    keep = ~np.isin(P, [RIFLE, RFUR])
    m = Mesh(); m.V, m.N, m.T, m.P, m.C = [V[keep]], [N[keep]], [T[keep]], [P[keep]], [C[keep]]
    return m

def fallen_flag(base, d, phase):
    """flag pole falling to the ground; d in 0..1"""
    m = Mesh()
    fdir = nz(np.array([-0.6, 0.8, 0.0]))                 # falls back-left
    k = np.cross(np.array([0, 0, 1.0]), fdir)
    pole_and_flag(m, np.zeros(3), np.array([0, 0, 1.0]), k, phase, wave=max(0.0, 1 - 2.5 * d))
    ang = math.radians(86) * min(max((d - 0.08) / 0.55, 0), 1) ** 1.6
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    R = np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
    lift = 0.73 * (1 - min(d / 0.4, 1.0)) ** 1.5           # starts at hand height, drops to the ground
    transform(m, 0, R, t=base + np.array([0, 0, 0.03 + lift]))
    return m

# ------------------------------------------------------------------ composition & render
def shifted(mesh, off):
    transform(mesh, 0, np.eye(3), t=off); return mesh

def merge(*meshes):
    m = Mesh()
    for x in meshes:
        if x is not None: m.merge(x)
    return m

def muzzle_of(mesh):
    V, N, T, P, C = mesh.arrays()
    sel = V[np.isin(P, [RIFLE])].reshape(-1, 3)
    return sel[np.argmax(sel[:, 0])]

def render_group(fac, standing, lying, flags, facing, fx=None, blood_at=()):
    """standing: list of (mesh, foot_pos); lying: list of meshes; flags: list of meshes"""
    R = rot_model(facing)
    allm = merge(*[s[0] for s in standing], *lying, *flags)
    img = stylise(shade(fac, allm.arrays(), R, SCALE, CELL, CELL, off=(0, YOFF)))
    shd = np.zeros((CELL, CELL, 4))
    for _, foot in standing:
        fx_, fy_, _ = project(R @ foot, SCALE, CELL, CELL, (0, YOFF))
        shd = over(ellipse_shadow(CELL, CELL, fx_ + 1, fy_ + 0.5, 0.36 * SCALE, 0.19 * SCALE), shd)
    for lm in lying:
        shd = over(shadow_layer(lm.arrays()[0] @ R.T, SCALE, CELL, CELL, False, 0.36, (0, YOFF)), shd)
    for fm in flags:   # short, RA2-style cast shadow for pole + flag
        W = fm.arrays()[0] @ R.T
        W = W - bs.LIGHT[None, None, :] * (W[..., 2:3] / bs.LIGHT[2]) * 0.4
        shd = over(shadow_layer(W, SCALE, CELL, CELL, False, 0.28, (0, YOFF)), shd)
    shd[..., 3:] = np.minimum(shd[..., 3:], 0.5); shd[..., :3] = 0
    for pos, amt in blood_at:
        rng = np.random.default_rng(3)
        bx, by, _ = project(R @ pos, SCALE, CELL, CELL, (0, YOFF))
        for i in range(6):
            blob(shd, bx + rng.normal(0, 2.5), by + rng.normal(0, 1.2), (2.5 + rng.uniform(0, 2.5)) * amt,
                 [0.42, 0.04, 0.03], 0.9, hard=0.5)
    out = over(img, shd)
    if fx is not None:
        out = fx(out, R)
    return out

def flash_fx(muzzle, k):
    def fx(img, R):
        fwd = R @ np.array([1.0, 0, 0])
        M = R @ muzzle
        layer = np.zeros_like(img)
        rng = np.random.default_rng(50 + k)
        if k % 4 == 0:      # muzzle flash
            for s, r in ((0.08, 3.0), (0.3, 2.2), (0.5, 1.4)):
                px, py, _ = project(M + fwd * s, SCALE, CELL, CELL, (0, YOFF))
                blob(layer, px, py, r, [1.0, 0.70, 0.18], 0.95)
                blob(layer, px, py, r * 0.5, [1.0, 0.97, 0.75], 1.0)
        if k % 4 in (1, 2):  # smoke puff + ejected case
            t = (k % 4)
            px, py, _ = project(M + fwd * (0.15 * t) + np.array([0, 0, 0.05 * t]), SCALE, CELL, CELL, (0, YOFF))
            blob(layer, px, py, 1.6 + 1.2 * t, [0.8, 0.8, 0.78], 0.45 / t, hard=1.2)
            ex, ey, _ = project(M - fwd * 0.75 + R @ np.array([0, -0.15 * t, 0.12 - 0.08 * t]), SCALE, CELL, CELL,
                                (0, YOFF))
            blob(layer, ex, ey, 0.8, [1.0, 0.85, 0.3], 0.9)
        return over(layer, img)
    return fx

# ------------------------------------------------------------------ frames
def walk_frame(fac, facing, k):
    ph = k / 8
    rifle = shifted(build_soldier(fac, "walk", phase=ph), SLOT_R)
    body, flag = flag_bearer(fac, "walk", ph)
    shifted(body, SLOT_F); shifted(flag, SLOT_F)
    return render_group(fac, [(rifle, SLOT_R), (body, SLOT_F)], [], [flag], facing)

def fire_frame(fac, facing, k):
    rec = -0.03 if k % 4 == 0 else (-0.015 if k % 4 == 1 else 0.0)
    rifle = shifted(build_soldier(fac, "aim"), SLOT_R + np.array([rec, 0, 0]))
    body, flag = flag_bearer(fac, "stand", k / 8)
    shifted(body, SLOT_F); shifted(flag, SLOT_F)
    return render_group(fac, [(rifle, SLOT_R), (body, SLOT_F)], [], [flag], facing,
                        fx=flash_fx(muzzle_of(rifle), k))

DS = [0.0, 0.12, 0.3, 0.48, 0.64, 0.8, 0.93, 1.0]

def death_rifleman(fac, k):
    d = DS[k]
    corpse = shifted(build_soldier(fac, "die", die=d), SLOT_R)
    body, flag = flag_bearer(fac, "stand", k / 8)
    shifted(body, SLOT_F); shifted(flag, SLOT_F)
    lying = [corpse] if d > 0.85 else []
    standing = [(body, SLOT_F)] + ([] if lying else [(corpse, SLOT_R)])
    return render_group(fac, standing, lying, [flag], DEATH_FACING,
                        blood_at=[(SLOT_R, max(0, (k - 4) / 3))] if k > 4 else [])

def death_bearer(fac, k):
    d = DS[k]
    corpse = shifted(strip_rifle(build_soldier(fac, "die", die=d)), SLOT_F)
    rifle = shifted(build_soldier(fac, "idle"), SLOT_R)
    flag = fallen_flag(SLOT_F + np.array([0.22, -0.06, 0]), d, k / 8)
    lying = [corpse] if d > 0.85 else []
    standing = [(rifle, SLOT_R)] + ([] if lying else [(corpse, SLOT_F)])
    return render_group(fac, standing, lying, [flag], DEATH_FACING,
                        blood_at=[(SLOT_F, max(0, (k - 4) / 3))] if k > 4 else [])

def death_both(fac, k):
    d = DS[k]; d2 = DS[max(k - 1, 0)] if k < 7 else 1.0
    c1 = shifted(build_soldier(fac, "die", die=d), SLOT_R)
    c2 = shifted(strip_rifle(build_soldier(fac, "die", die=d2)), SLOT_F)
    flag = fallen_flag(SLOT_F + np.array([0.22, -0.06, 0]), d2, k / 8)
    standing, lying = [], []
    for c, slot, dd in ((c1, SLOT_R, d), (c2, SLOT_F, d2)):
        (lying.append(c) if dd > 0.85 else standing.append((c, slot)))
    blood = [(SLOT_R, max(0, (k - 4) / 3)), (SLOT_F, max(0, (k - 5) / 2))] if k > 4 else []
    return render_group(fac, standing, lying, [flag], DEATH_FACING, blood_at=blood)

def build_sheet(fac, path):
    sheet = np.zeros((19 * CELL, 8 * CELL, 4))
    def put(img, r, c): sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    for f in range(8):
        for k in range(8):
            put(walk_frame(fac, f * 45, k), f, k)
            put(fire_frame(fac, f * 45, k), 8 + f, k)
        print(fac.name, "facing", f, flush=True)
    for k in range(8):
        put(death_rifleman(fac, k), 16, k)
        put(death_bearer(fac, k), 17, k)
        put(death_both(fac, k), 18, k)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    sel = sys.argv[1:] or ["de", "ru", "us", "cn"]
    table = {"de": (Germany, "spotter_germany_eu.png"), "ru": (Russia, "spotter_russia.png"),
             "us": (USA, "spotter_usa.png"), "cn": (China, "spotter_china.png")}
    for k in sel:
        cls, fn = table[k]
        build_sheet(make_fac(cls), out + fn)
