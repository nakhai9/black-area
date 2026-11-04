"""
Wall blocks (1 x 1, flat piece) of every nation: one picture per neighbour mask (N 1 | E 2 | S 4 | W 8) and damage
stage (0 sound .. 3 collapsed stump), named wall-<nation>-<mask>-<damage>. The plan follows createWallArt's slab():
a THICK slab centred in the cell running to every joined side (open ends pulled in by END_INSET), a square post
when alone. Materials use world-space grain so neighbouring blocks join without a seam.
"""
import random

import bpy

import kit
from kit import box, render, rod

N, E, S, W = 1, 2, 4, 8
THICK = 2 / 3
LIP = 0.05
END_INSET = 0.1
STANDING = [1, 1, 0.85, 0.5]
NATIONS = ["usa", "russia", "china", "europe", "islamic"]

# nation: (body, cap, height px, cap px, crenellated, coursed)
LOOK = {
    "usa": ("#a6a49c", "#b8b6ae", 34, 3, False, False),
    "europe": ("#a6a49c", "#bdbbb3", 34, 3, False, False),
    "russia": ("#9a3b31", "#a9473b", 34, 3, True, True),
    "islamic": ("#cbb58a", "#1f8a45", 34, 3, False, True),
}

# China (Great Wall): stone base, brick courses, paved walkway, merlons.
GREAT_WALL = {"height": 30, "base_h": 8, "course_h": 2.5, "walk_h": 1.5, "walk_grow": 0.03, "merlon_h": 4.5,
              "stone": "#8f8a80", "bricks": ["#a49c8e", "#9b9385", "#aaa294"], "pave": "#b8b1a2"}
# Battlements (Russia, China): merlon thickness across the wall, length, grid step / first centre (cells).
MERLON_W, MERLON_LEN, MERLON_STEP, MERLON_FIRST = 0.07, 0.12, 0.2, 0.1
NATION_MERLON_H = 5
COURSE_H = 3.0
PLINTH_H, PLINTH_GROW = 3, 0.015

_wm = {}


def wmat(hexstr, rough=0.9, grain=0.18, scale=14.0):
    """Material whose grain is sampled in world space, so joined blocks continue the same stone."""
    key = (hexstr, rough, grain, scale)
    if key in _wm and _wm[key].name in bpy.data.materials:
        return _wm[key]
    m = bpy.data.materials.new(f"w_{hexstr}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    base = kit.srgb(hexstr)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 10
    nt.links.new(geo.outputs["Position"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = tuple(c * (1 - grain) for c in base[:3]) + (1,)
    ramp.color_ramp.elements[1].color = tuple(min(1, c * (1 + grain * 0.6)) for c in base[:3]) + (1,)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    _wm[key] = m
    return m


def slab(mask, grow=0.0, thick=THICK):
    h = thick / 2 + grow
    lo, hi = 0.5 - h, 0.5 + h
    if mask == 0:
        return [(lo, lo, hi, hi)]
    m = mask
    if not (m & (E | W)) and (m & (N | S)) != (N | S):
        m |= N | S
    elif not (m & (N | S)) and (m & (E | W)) != (E | W):
        m |= E | W

    def end(side, inner):
        if mask & side:
            return 0.0 if inner == 0 else 1.0
        return END_INSET - grow if inner == 0 else 1 - END_INSET + grow

    rects = [(lo, lo, hi, hi)]
    if m & N:
        rects.append((lo, end(N, 0), hi, lo))
    if m & S:
        rects.append((lo, hi, hi, end(S, 1)))
    if m & W:
        rects.append((end(W, 0), lo, lo, hi))
    if m & E:
        rects.append((hi, lo, end(E, 1), hi))
    return rects


def rbox(r, z, h, material):
    u0, v0, u1, v1 = r
    box(u0, v0, u1 - u0, v1 - v0, z, h, material)


def merlons(rects, z, h, material, rng, damage):
    """Battlements on a fixed 0.2-cell grid along both long edges of each arm, so they run on across cells."""
    w = MERLON_W
    for u0, v0, u1, v1 in rects:
        along_u = u1 - u0 >= v1 - v0
        a0, a1 = (u0, u1) if along_u else (v0, v1)
        for k in range(5):
            c = 0.1 + 0.2 * k
            if c - 0.06 < a0 - 1e-6 or c + 0.06 > a1 + 1e-6:
                continue
            for side in (0, 1):
                if damage >= 3 or (damage >= 2 and rng.random() < 0.4):
                    continue
                hh = h * (0.55 if damage >= 2 and rng.random() < 0.4 else 1)
                if along_u:
                    vv = v0 if side == 0 else v1 - w
                    box(c - 0.06, vv, 0.12, w, z, hh, material)
                else:
                    uu = u0 if side == 0 else u1 - w
                    box(uu, c - 0.06, w, 0.12, z, hh, material)


def cracks(rects, top, damage, rng):
    """Dark zig-zag cracks on the faces the camera sees (+u and +v), more with damage."""
    if damage <= 0:
        return
    dark = wmat("#1d1814", 1.0, grain=0.1)
    for u0, v0, u1, v1 in rects:
        for face in ("v", "u"):
            for _ in range(damage):
                t = rng.uniform(0.15, 0.85)
                u, v = (u0 + (u1 - u0) * t, v1 + 0.003) if face == "v" else (u1 + 0.003, v0 + (v1 - v0) * t)
                z = top - 0.5
                length = top * (0.35 + 0.15 * damage)
                for s in range(4):
                    nz = max(0.5, z - length / 4)
                    jog = rng.uniform(-0.05, 0.05)
                    nu, nv = (u + jog, v) if face == "v" else (u, v + jog)
                    rod((u, v, kit.zp(z)), (nu, nv, kit.zp(nz)), 0.006 + 0.002 * damage, dark, 4)
                    u, v, z = nu, nv, nz


def rubble(color, damage, rng):
    if damage < 2:
        return
    stone = wmat(color, 0.95, grain=0.25)
    spots = [(0.72, 0.78), (0.28, 0.84), (0.84, 0.3), (0.15, 0.62), (0.6, 0.9)]
    for u, v in spots[: 3 if damage == 2 else 5]:
        for _ in range(3 if damage == 2 else 5):
            s = rng.uniform(0.04, 0.09)
            box(u + rng.uniform(-0.06, 0.06), v + rng.uniform(-0.06, 0.06), s, s * rng.uniform(0.7, 1.3), 0, rng.uniform(1.5, 4), stone)


def broken_top(rects, z, color, rng):
    """Jagged chunks left on a collapsed stump."""
    m = wmat(color, 0.95, grain=0.22)
    for u0, v0, u1, v1 in rects:
        for _ in range(3):
            cu, cv = rng.uniform(u0, u1 - 0.1), rng.uniform(v0, v1 - 0.1)
            box(cu, cv, min(0.15, u1 - cu), min(0.15, v1 - cv), z, rng.uniform(1.5, 4), m)


def nation_wall(f, mask, damage, rng):
    body_c, cap_c, wall_h, cap_h, crenel, coursed = LOOK[f]
    H = round(wall_h * STANDING[damage])
    straight = H - cap_h
    body = slab(mask)
    body_m = wmat(body_c, 0.9, grain=0.2)
    if coursed:
        # Masonry courses: alternate slight insets pick out every course in the light.
        z, k = 0.0, 0
        while z < straight:
            h = min(3.0, straight - z)
            for r in body:
                g = 0.0 if k % 2 == 0 else -0.004
                rbox((r[0] - g, r[1] - g, r[2] + g, r[3] + g), z, h, wmat(body_c, 0.9, grain=0.2 + 0.05 * (k % 3)))
            z += h
            k += 1
    else:
        for r in body:
            rbox(r, 0, straight, body_m)
        # Plinth at the foot.
        for r in slab(mask, 0.015):
            rbox(r, 0, 3, wmat(body_c, 0.95, grain=0.25))
    if damage < 3:
        cap_m = wmat(cap_c, 0.75, grain=0.12)
        caps = slab(mask, LIP)
        for i, r in enumerate(caps):
            if damage >= 2 and i % 2 == 1:
                u0, v0, u1, v1 = r
                r = (u0 + (u1 - u0) / 2, v0, u1, v1) if u1 - u0 >= v1 - v0 else (u0, v0 + (v1 - v0) / 2, u1, v1)
            rbox(r, straight, cap_h, cap_m)
        if crenel:
            arms = caps[1:] if len(caps) > 1 else caps
            merlons(arms, H, NATION_MERLON_H, cap_m, rng, damage)
    else:
        broken_top(body, straight, body_c, rng)
    cracks(body, straight, damage, rng)
    rubble(body_c, damage, rng)


def great_wall(mask, damage, rng):
    H = round(GREAT_WALL["height"] * STANDING[damage])
    body = slab(mask)
    stone = wmat("#8f8a80", 0.95, grain=0.25, scale=10)
    for r in slab(mask, 0.01):
        rbox(r, 0, min(8, H), stone)
    z, k = 8.0, 0
    while z < H:
        h = min(2.5, H - z)
        g = 0.0 if k % 2 == 0 else -0.004
        for r in body:
            rbox((r[0] - g, r[1] - g, r[2] + g, r[3] + g), z, h, wmat(["#a49c8e", "#9b9385", "#aaa294"][k % 3], 0.9, grain=0.2))
        z += h
        k += 1
    top = slab(mask, 0.03)
    if damage < 3:
        for r in top:
            rbox(r, H, 1.5, wmat("#b8b1a2", 0.85, grain=0.15, scale=24))
        merlons(top[1:] if len(top) > 1 else top, H + 1.5, GREAT_WALL["merlon_h"], wmat("#a49c8e", 0.9, grain=0.2), rng, damage)
    else:
        broken_top(body, H, "#a49c8e", rng)
    cracks(body, H, damage, rng)
    rubble("#8f8a80", damage, rng)


def wall(f, mask, damage):
    kit.ZS = 1.0
    try:
        _wm.clear()
        bpy.context.scene.cycles.samples = 24
        rng = random.Random(mask * 31 + damage * 7 + NATIONS.index(f) * 101)
        if f == "china":
            great_wall(mask, damage, rng)
        else:
            nation_wall(f, mask, damage, rng)
        render(f"wall-{f}-{mask}-{damage}", (1, 1), 44)
    finally:
        kit.ZS = 1.35


MODELS = {f"wall-{f}-{m}-{d}": (lambda f=f, m=m, d=d: wall(f, m, d)) for f in NATIONS for m in range(16) for d in range(4)}
