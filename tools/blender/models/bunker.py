"""Bunkers (1 x 1): every nation's bunker (same designs as the old code mesh) rendered into one sheet per nation,
ui/public/sprites/bunker-<nation>.png: 8 columns (gun facing r * 45 deg, from +u towards +v) x 5 rows (damage stage:
intact, light, heavy, burning, ruin). Each cell is CELL * RES px, the ground centre at ANCHOR (cell px) — the
BunkerSheet.ts contract (BUNKER_CELL, BUNKER_ANCHOR). Models are built in the old mesh units (x = forward along the
main embrasure, y = side, z = up): one unit is K iso px along u / v and KZ px up, like the code renderer."""
import math
import os
import random
import tempfile

import bmesh
import bpy
import numpy as np

import kit
from kit import OUT, PX_PER_BU, Z_PX_PER_BU, TEAM, mat

CELL, RES = 80, 3
ANCHOR = (40, 54)
K, KZ = 0.6, 0.75
S = K / 32  # BU per mesh unit across
ZB = KZ / Z_PX_PER_BU  # BU per mesh unit up
SAMPLES = int(os.environ.get("BUNKER_SAMPLES", 28))
STAGES = 5
FACINGS = 8

# ---------------------------------------------------------------- materials

_dm = {}


def soot(hexstr, stage):
    """The colour darkened with the damage stage (as the code model did)."""
    h = hexstr.lstrip("#")
    f = 1 - stage * 0.12
    return "#" + "".join(f"{round(int(h[i:i + 2], 16) * f):02x}" for i in (0, 2, 4))


def _mix(nt, fac, a, b):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    nt.links.new(fac, m.inputs[0])
    if isinstance(a, tuple):
        m.inputs[6].default_value = a
    else:
        nt.links.new(a, m.inputs[6])
    if isinstance(b, tuple):
        m.inputs[7].default_value = b
    else:
        nt.links.new(b, m.inputs[7])
    return m.outputs[2]


def _range(nt, v, a, b, c=0.0, d=1.0):
    r = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(v, r.inputs["Value"])
    r.inputs["From Min"].default_value = a
    r.inputs["From Max"].default_value = b
    r.inputs["To Min"].default_value = c
    r.inputs["To Max"].default_value = d
    return r.outputs["Result"]


def dmat(hexstr, stage=0, rough=0.92, grain=0.22, scale=70.0, cracks=True, cloth=False, metal=0.0):
    """Weathered surface in world space: grain, (cloth weave), cracks and soot growing with the damage stage."""
    key = (hexstr, stage, rough, grain, scale, cracks, cloth, metal)
    if key in _dm:
        return _dm[key]
    m = bpy.data.materials.new(f"d{len(_dm)}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    pos = nt.nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    base = kit.srgb(soot(hexstr, stage))
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 10
    nt.links.new(pos, noise.inputs["Vector"])
    lo = tuple(c * (1 - grain) for c in base[:3]) + (1,)
    hi = tuple(min(1, c * (1 + grain * 0.7)) for c in base[:3]) + (1,)
    col = _mix(nt, noise.outputs["Fac"], lo, hi)
    height = noise.outputs["Fac"]
    if cloth:
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.inputs["Scale"].default_value = 260
        nt.links.new(pos, wave.inputs["Vector"])
        col = _mix(nt, _range(nt, wave.outputs["Fac"], 0, 1, 0, 0.18), col, tuple(c * 0.7 for c in base[:3]) + (1,))
    if cracks and stage >= 1:
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "DISTANCE_TO_EDGE"
        vor.inputs["Scale"].default_value = 18 + stage * 4
        nt.links.new(pos, vor.inputs["Vector"])
        line = _range(nt, vor.outputs["Distance"], 0.0, 0.025 + stage * 0.006, 1, 0)
        mask_n = nt.nodes.new("ShaderNodeTexNoise")
        mask_n.inputs["Scale"].default_value = 9
        nt.links.new(pos, mask_n.inputs["Vector"])
        mask = _range(nt, mask_n.outputs["Fac"], 0.62 - stage * 0.07, 0.68 - stage * 0.07)
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(line, mul.inputs[0])
        nt.links.new(mask, mul.inputs[1])
        col = _mix(nt, mul.outputs[0], col, (0.02, 0.018, 0.015, 1))
        height = mul.outputs[0]
    if stage >= 2:
        sn = nt.nodes.new("ShaderNodeTexNoise")
        sn.inputs["Scale"].default_value = 6
        sn.inputs["Detail"].default_value = 6
        nt.links.new(pos, sn.inputs["Vector"])
        sfac = _range(nt, sn.outputs["Fac"], 0.62 - stage * 0.06, 0.75 - stage * 0.05, 0, 0.9)
        col = _mix(nt, sfac, col, (0.012, 0.01, 0.009, 1))
    nt.links.new(col, bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35 if cloth else 0.25
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(height, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    _dm[key] = m
    return m


def flat(hexstr, rough=0.6):
    """Paint (team colour, insignia): flat so the capture recolour finds it."""
    return mat(hexstr, rough, grain=0)


def fire():
    if "fire" in _dm:
        return _dm["fire"]
    m = bpy.data.materials.new("fire")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (1, 0.35, 0.05, 1)
    b.inputs["Emission Color"].default_value = (1, 0.45, 0.08, 1)
    b.inputs["Emission Strength"].default_value = 9
    _dm["fire"] = m
    return m


DARK = None  # set per scene


def dark():
    return mat("#0c0c0b", 0.95, grain=0)


def gun():
    return mat("#1d1d1c", 0.45, metal=0.6, grain=0)


# ---------------------------------------------------------------- geometry (mesh units)


def _ob(bm, material, smooth=False, bevel=0.0, segs=2):
    for v in bm.verts:
        x, y, z = v.co
        v.co = (y * S, x * S, z * ZB)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("m")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("m", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(material)
    if smooth:
        for f in me.polygons:
            f.use_smooth = True
    if bevel > 0:
        mod = ob.modifiers.new("b", "BEVEL")
        mod.width = bevel * S
        mod.segments = segs
        mod.limit_method = "ANGLE"
    return ob


def hull(points, material, smooth=False, bevel=0.0, segs=2):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in points]
    res = bmesh.ops.convex_hull(bm, input=vs)
    bad = list({g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)})
    if bad:
        bmesh.ops.delete(bm, geom=bad, context="VERTS")
    return _ob(bm, material, smooth, bevel, segs)


def disc(r, n, rot=0.0):
    return [(r * math.cos(rot + 2 * math.pi * i / n), r * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]


def vprism(poly, z0, z1, material, bevel=0.0, cx=0.0, cy=0.0):
    return hull([(cx + x, cy + y, z) for x, y in poly for z in (z0, z1)], material, bevel=bevel)


def cbox(x0, x1, y0, y1, z0, z1, material, bevel=0.0):
    return vprism([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, material, bevel)


def obox(cx, cy, a, L, W, z0, z1, material, bevel=0.0, segs=2):
    c, s = math.cos(a), math.sin(a)
    pts = [(cx + c * l - s * w, cy + s * l + c * w) for l in (-L / 2, L / 2) for w in (-W / 2, W / 2)]
    return hull([(x, y, z) for x, y in pts for z in (z0, z1)], material, bevel=bevel, segs=segs)


def cyl(p0, p1, r, material, n=10, smooth=True):
    ax = np.array(p1, float) - np.array(p0, float)
    ln = np.linalg.norm(ax)
    ax /= ln
    t = np.cross(ax, [0, 0, 1] if abs(ax[2]) < 0.9 else [1, 0, 0])
    t /= np.linalg.norm(t)
    b = np.cross(ax, t)
    pts = []
    for p in (p0, p1):
        for i in range(n):
            a = 2 * math.pi * i / n
            pts.append(tuple(np.array(p) + r * (math.cos(a) * t + math.sin(a) * b)))
    return hull(pts, material, smooth=smooth)


def dome(cx, cy, r, z0, h, material, rings=6, n=20):
    pts = []
    for i in range(rings + 1):
        t = i / rings * math.pi / 2
        rr = max(r * math.cos(t), 0.01)
        for x, y in disc(rr, n):
            pts.append((cx + x, cy + y, z0 + h * math.sin(t)))
    return hull(pts, material, smooth=True)


def chunk(rng, x, y, z, size, material):
    pts = [(x + rng.uniform(-1, 1) * size, y + rng.uniform(-1, 1) * size, max(0.0, z + rng.uniform(0, 1.3) * size * 0.8)) for _ in range(9)]
    return hull(pts, material)


def rubble(rng, n, r0, r1, material, size=(0.6, 1.8), z=1.0, arc=(0, 2 * math.pi)):
    for _ in range(n):
        a = rng.uniform(*arc)
        r = rng.uniform(r0, r1)
        chunk(rng, r * math.cos(a), r * math.sin(a), z, rng.uniform(*size), material)


def flames(rng, spots):
    """Emissive tongues of fire at (x, y, z, size)."""
    for x, y, z, s in spots:
        for _ in range(3):
            dx, dy = rng.uniform(-s, s) * 0.6, rng.uniform(-s, s) * 0.6
            h = s * rng.uniform(1.6, 2.6)
            pts = [(x + dx + s * 0.5 * math.cos(a), y + dy + s * 0.5 * math.sin(a), z) for a in np.linspace(0, 2 * math.pi, 7)[:-1]]
            pts.append((x + dx + rng.uniform(-0.3, 0.3) * s, y + dy, z + h * 1.3))
            hull(pts, fire(), smooth=True)


def band(r, n, z, team, rot=0.0, h=0.9):
    """A strip in the nation's colour round an n-gon wall of (apothem-ish) radius r."""
    pts = disc(r, n, rot)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        a = math.atan2(y1 - y0, x1 - x0)
        nx, ny = math.sin(a), -math.cos(a)
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        if nx * mx + ny * my < 0:
            nx, ny = -nx, -ny
        obox(mx + nx * 0.08, my + ny * 0.08, a, math.hypot(x1 - x0, y1 - y0) * 0.98, 0.16, z, z + h, flat(team))


def slit(x, y, a, w, h, z, depth=1.6, wall=None, hood=None):
    """Firing embrasure in a wall at (x, y) facing a: a dark recess with splayed concrete cheeks and a hood."""
    obox(x, y, a, depth, w, z - h / 2, z + h / 2, dark())
    if wall is not None:
        c, s = math.cos(a), math.sin(a)
        for side in (-1, 1):
            obox(x + c * 0.5 - s * side * (w / 2 + 0.35), y + s * 0.5 + c * side * (w / 2 + 0.35), a, 1.0, 0.7, z - h / 2 - 0.3, z + h / 2 + 0.3, wall, bevel=0.15)
    if hood is not None:
        c, s = math.cos(a), math.sin(a)
        obox(x + c * 1.0, y + s * 1.0, a, 1.8, w + 1.6, z + h / 2 + 0.1, z + h / 2 + 0.8, hood, bevel=0.15)


def sandbag(x, y, a, z, material):
    obox(x, y, a + math.pi / 2, 2.9, 2.2, z, z + 1.45, material, bevel=0.55, segs=3)


def sandbags(r, frm, to, rows, material, gap=(), z0=1.0, alt=None):
    for row in range(rows):
        n = max(1, round((to - frm) * r / 3.0))
        for i in range(n + 1):
            t = (i + (row % 2) * 0.5) / n
            if t > 1:
                continue
            a = frm + (to - frm) * t
            if any(abs(a - g) < 0.18 for g in gap):
                continue
            sandbag(math.cos(a) * r, math.sin(a) * r, a, z0 + row * 1.4, alt if (alt is not None and (i + row) % 3 == 0) else material)


def apron(r, n, color, stage, rot=0.0):
    """Packed earth / gravel lying flush on the ground (no raised plate)."""
    vprism(disc(r, n, rot), 0, 0.12, dmat(color, stage, grain=0.35, scale=90, cracks=False))


def crates(x, y, n, color="#5d6a3a"):
    m = dmat(color, 0, rough=0.85, grain=0.3, scale=120, cracks=False)
    for i in range(n):
        z = 1 if i < 2 else 2.6
        yy = y + (i % 2) * 2.4 - (1.2 if i > 1 else 0)
        cbox(x - 1.4, x + 1.4, yy - 1.1, yy + 1.1, z, z + 1.6, m, bevel=0.12)


def antenna(x, y, z0, h):
    cyl((x, y, z0), (x, y, z0 + h), 0.14, gun(), 5)


def star_plate(cx, cy, z, r, material, up=True, n=5, normal=(0, 0, 1)):
    """A flat five-point star: on the roof (up) or on the +x wall (normal = (1, 0, 0))."""
    pts = []
    for i in range(2 * n):
        rr = r if i % 2 == 0 else r * 0.42
        a = math.pi / 2 + math.pi * i / n
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    # Build as a thin fan of triangles (concave), each its own hull.
    for i in range(0, 2 * n, 2):
        tri = [(0, 0), pts[i - 1], pts[i], pts[(i + 1) % (2 * n)]]
        if up:
            hull([(cx + a, cy + b, z + d) for a, b in tri for d in (0, 0.05)], material)
        else:
            hull([(cx + d, cy + a, z + b) for a, b in tri for d in (0, 0.1)], material)


def ruin_walls(rng, poly, h, material, segs=4):
    """Broken stumps along a wall outline."""
    n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        a = math.atan2(y1 - y0, x1 - x0)
        L = math.hypot(x1 - x0, y1 - y0)
        for k in range(segs):
            if rng.random() < 0.3:
                continue
            t = (k + 0.5) / segs
            obox(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, a, L / segs * rng.uniform(0.6, 1.0), 1.2, 1, 1 + rng.uniform(0.6, 1) * h, material, bevel=0.2)


# ---------------------------------------------------------------- nations


def usa(st, team, rng):
    C = dmat("#b3ad9c", st)
    apron(18, 6, "#8d8470", st)
    hesco = dmat("#c4ad7e", st, grain=0.25, scale=160, cloth=True, cracks=False)
    wire = mat("#6e6a5e", 0.5, metal=0.6, grain=0)
    for i in range(14):
        a = i / 14 * 2 * math.pi + math.pi / 14
        if abs(a - math.pi) < 0.3 or (st >= 4 and i % 2):
            continue
        h = 1.6 if st >= 4 else 4.2
        if st in (2, 3) and i % 5 == 0:
            h = 2.4
        cx, cy = math.cos(a) * 15.2, math.sin(a) * 15.2
        obox(cx, cy, a + math.pi / 2, 3.5, 3.1, 1, 1 + h, hesco, bevel=0.35, segs=3)
        # Welded mesh frame: posts and rails round the basket.
        c, s = math.cos(a + math.pi / 2), math.sin(a + math.pi / 2)
        for lx in (-1.8, 0, 1.8):
            for wy in (-1.6, 1.6):
                x, y = cx + c * lx - s * wy, cy + s * lx + c * wy
                cyl((x, y, 1), (x, y, 1 + h + 0.1), 0.07, wire, 4, False)
        for wy in (-1.6, 1.6):
            for zz in (1 + h * 0.5, 1 + h + 0.05):
                cyl((cx - s * wy - c * 1.8, cy + c * wy - s * 1.8, zz), (cx - s * wy + c * 1.8, cy + c * wy + s * 1.8, zz), 0.06, wire, 4, False)
    hexp = lambda r: disc(r, 6)
    if st < 4:
        vprism(hexp(12.8), 1, 2.2, dmat("#9c9686", st), bevel=0.3)
        vprism(hexp(11.8), 2.2, 10, C, bevel=0.2)
        band(11.8 * math.cos(math.pi / 6) / math.cos(math.pi / 6), 6, 8.4, team)
        vprism(hexp(13.4), 10, 11.8, dmat("#c1bba9", st), bevel=0.35)
        vprism(hexp(12.4), 11.8, 12.6, dmat("#cbc5b2", st), bevel=0.3)
        for a in (-math.pi / 3, 0, math.pi / 3):
            slit(math.cos(a) * 10.4, math.sin(a) * 10.4, a, 4.6, 1.4, 6.4, wall=C, hood=C)
        if st < 3:
            tur = dmat("#6d6f5e", st, rough=0.6, grain=0.1, cracks=False)
            cbox(-4, 3, -3, 3, 12.6, 15, tur, bevel=0.5)
            cbox(-1, 2.2, 3, 4.4, 13.2, 15.4, dmat("#3c3e34", st, cracks=False), bevel=0.2)
            cyl((3, 0, 14), (11, 0, 14.2), 0.35, gun(), 8)
            cyl((10.2, 0, 14.15), (11.4, 0, 14.2), 0.6, gun(), 8)
            antenna(-6, -6, 12.6, 8)
            crates(-8, 4, 3)
            star_plate(-6, -3, 12.62, 2.4, flat("#f2f0e6"))
        if st >= 1:
            rubble(rng, 3 * st, 12, 14, dmat("#b3ad9c", st, cracks=False), z=1.0)
        if st >= 2:
            # A corner of the roof slab broken off and lying against the wall.
            obox(-9, 8, 0.6, 5, 2.4, 1, 3.2, dmat("#c1bba9", st), bevel=0.3)
        if st == 3:
            flames(rng, [(10.5, 0, 6.6, 1.5), (0, 0, 12.6, 2.4), (5, 6, 12.6, 1.6)])
    else:
        ruin_walls(rng, hexp(11.8), 3.5, C)
        rubble(rng, 26, 0, 12, C, (0.8, 2.2), z=1)
        rubble(rng, 6, 0, 8, dmat("#c1bba9", st), (1.6, 2.8), z=1)
    return (11, 0, 14.2)


def europe(st, team, rng):
    C = dmat("#9ea395", st)
    apron(18, 8, "#7a7a5c", st)
    for i in range(4):
        vprism(disc(16 - i * 1.3, 8), 1 + i * 1.5, 2.5 + i * 1.5, dmat("#5f7a3e", st, grain=0.4, scale=110, cracks=False), bevel=0.5)
    if st < 4:
        vprism(disc(11, 8), 7, 11.5, C, bevel=0.2)
        if st < 3:
            camo_m = dmat("#6b7a4e", st, cracks=False)
            for side in (-1, 1):
                for t, zt, s in ((-0.5, 0.3, 1.6), (0.35, 0.6, 1.3), (0.1, 0.15, 1.1)):
                    a = side * math.pi / 4 + t * 0.4
                    obox(math.cos(a) * 10.25, math.sin(a) * 10.25, a + math.pi / 2, s * 2.2, 0.16, 7.5 + zt * 3.5, 7.5 + zt * 3.5 + s * 1.2, camo_m, bevel=0.06)
        band(11.05, 8, 10.3, team)
        vprism(disc(12.2, 8), 11.5, 13.2, dmat("#aeb3a4", st), bevel=0.3)
        for a in (-math.pi / 4, 0, math.pi / 4):
            slit(math.cos(a) * 10.4, math.sin(a) * 10.4, a, 6.0 if a == 0 else 3.4, 1.6, 9.2, wall=C)
        obox(11.6, 0, 0, 2.4, 8, 10.3, 10.9, dmat("#b0b5a6", st), bevel=0.15)
        steel = dmat("#555a5c", st, rough=0.5, grain=0.15, scale=120, cracks=False, metal=0.5)
        if st < 3:
            vprism(disc(4, 20), 13.2, 15.2, steel, cx=-3)
            dome(-3, 0, 4, 15.2, 3, steel)
            for k in range(6):
                a = k / 6 * 2 * math.pi
                obox(-3 + math.cos(a) * 3.9, math.sin(a) * 3.9, a, 0.6, 1.3, 14, 14.7, dark())
            cyl((4, 4, 13.2), (4, 4, 16), 0.5, steel, 10)
            cyl((1, 0, 9.6), (13.5, 0, 9.8), 0.35, gun(), 8)
        else:
            vprism(disc(4, 20), 13.2, 14.0, steel, cx=-3)  # the cloche torn off, its ring left
        # EU roundel on the roof, team disc.
        hull([(5 + x, y, z) for x, y in disc(2.2, 16) for z in (13.2, 13.26)], flat("#1f3f9a"))
        for i in range(12):
            a = i / 12 * 2 * math.pi
            hull([(5 + math.sin(a) * 1.5 + x, math.cos(a) * 1.5 + y, z) for x, y in disc(0.3, 5) for z in (13.26, 13.3)], flat("#f2c94c"))
        hull([(-7 + x, 6 + y, z) for x, y in disc(1.2, 10) for z in (13.2, 13.26)], flat(team))
        if st >= 1:
            rubble(rng, 3 * st, 11.5, 14, dmat("#9ea395", st, cracks=False), z=5)
        if st == 3:
            flames(rng, [(10.5, 0, 9, 1.6), (-3, 0, 13.2, 2.4), (3, -5, 13.2, 1.5)])
    else:
        ruin_walls(rng, disc(11, 8), 3.0, C)
        rubble(rng, 24, 0, 11, C, (0.8, 2.2), z=6)
        hull([(-3 + x, y, z) for x, y in disc(3.6, 16) for z in (5.5, 6.6)], dmat("#555a5c", st, metal=0.5, cracks=False))
    return (13.5, 0, 9.8)


def russia(st, team, rng):
    C = dmat("#8f8d80", st)
    earth = lambda k: dmat(soot("#6e6248", 0)[0:7], st, grain=0.4, scale=90, cracks=False)
    apron(18, 10, "#6e6248", st)
    for i in range(4):
        m = dmat("#5e7a38", st, grain=0.45, scale=130, cracks=False) if i == 3 else dmat("#6e6248", st, grain=0.4, scale=90, cracks=False)
        cbox(-15 + i * 1.2, 14 - i * 2.4, -15 + i * 1.6, 15 - i * 1.6, 1 + i * 1.8, 2.8 + i * 1.8, m, bevel=1.0)
    if st < 4:
        for sgn in (-1, 1):
            for k in range(3):
                cyl((-8, sgn * 10.7, 3 + k * 1.3), (9, sgn * 10.7, 3 + k * 1.3), 0.65, dmat("#6b4b2c" if k % 2 else "#7a5734", st, grain=0.35, scale=200, cracks=False), 8)
        cbox(-9, 10, -9, 9, 2, 11.5, C, bevel=0.8)
        cbox(-10.5, 11.8, -10, 10, 11.5, 13.8, dmat("#9a9889", st), bevel=1.0)
        slit(10.2, 0, 0, 7.0, 2.0, 7.2, wall=C)
        obox(11.6, 0, 0, 2.6, 10, 8.6, 9.4, dmat("#9e9c8c", st), bevel=0.2)
        for y in (-9.6, 9.6):
            slit(3, y, math.copysign(math.pi / 2, y), 3.0, 1.4, 7.2)
        # Red star on the front of the roof slab, team strip on the roof.
        star_plate(11.85, 0, 12.65, 1.05, flat("#c8231e"), up=False)
        cbox(-9, -6.5, -9.5, 9.5, 13.8, 13.9, flat(team))
        if st < 3:
            net = dmat("#4c5e32", st, grain=0.5, scale=260, cloth=True, cracks=False)
            hull([(-10, -10, 14.0), (11, -10, 14.0), (11, 10, 14.0), (-10, 10, 14.0), (0, 0, 14.9), (5, -5, 14.5), (-5, 5, 14.6)], net, smooth=True)
            cyl((10, 0, 7.2), (16, 0, 7.3), 0.32, gun(), 8)
            cyl((-5, -4, 14.5), (-5, -4, 17.5), 0.6, dmat("#3c3c38", 0, cracks=False), 10)
            antenna(-7, 6, 14.5, 7)
            crates(-12, -2, 2, "#56603a")
        if st >= 1:
            rubble(rng, 3 * st, 11.5, 13.5, dmat("#8f8d80", st, cracks=False), z=1)
        if st == 3:
            flames(rng, [(11, 0, 7, 1.6), (0, 0, 13.8, 2.6), (-6, 5, 13.8, 1.5)])
    else:
        ruin_walls(rng, [(-9, -9), (10, -9), (10, 9), (-9, 9)], 4, C)
        rubble(rng, 24, 0, 10, C, (0.8, 2.2), z=6)
        for k in range(4):
            cyl((rng.uniform(-10, 8), rng.uniform(-12, 12), 7), (rng.uniform(-10, 8), rng.uniform(-12, 12), 7.5), 0.6, dmat("#4a3420", st, cracks=False), 8)
    return (16, 0, 7.3)


def china(st, team, rng):
    brick = dmat("#8d6e5a", st, grain=0.3, scale=110)
    conc = dmat("#aba493", st)
    apron(17, 4, "#8a8270", st, rot=math.pi / 4)
    bags = dmat("#b29e74", st, grain=0.3, scale=200, cloth=True, cracks=False)
    if st < 4:
        cbox(-11, 11, -11, 11, 1, 4, conc, bevel=0.3)
        cbox(-10, 10, -10, 10, 4, 14, brick, bevel=0.1)
        mortar = dmat("#6e5646", st, cracks=False)
        z = 5.0
        while z < 14:
            for s in (-1, 1):
                cbox(-10.05, 10.05, s * 10 - 0.06, s * 10 + 0.06, z, z + 0.22, mortar)
                cbox(s * 10 - 0.06, s * 10 + 0.06, -10.05, 10.05, z, z + 0.22, mortar)
            z += 1.6
        band(14.14, 4, 12.4, team, math.pi / 4)
        for y in (-4.5, 4.5):
            slit(10, y, 0, 3.4, 1.3, 9.5)
        for s in (-1, 1):
            for x in (-4.5, 4.5):
                slit(x, s * 10, s * math.pi / 2, 2.6, 1.3, 9.5)
        cbox(-10.8, 10.8, -10.8, 10.8, 14, 15.2, dmat("#b5ae9c", st), bevel=0.3)
        cren = dmat("#bcb5a3", st)
        for i in range(6):
            t = -9 + i * 3.6
            if st >= 2 and i % 2:
                continue
            for s in (-1, 1):
                cbox(t - 0.9, t + 0.9, s * 10.8 - (1.2 if s > 0 else 0), s * 10.8 + (1.2 if s < 0 else 0), 15.2, 17.2, cren, bevel=0.15)
                cbox(s * 10.8 - (1.2 if s > 0 else 0), s * 10.8 + (1.2 if s < 0 else 0), t - 0.9, t + 0.9, 15.2, 17.2, cren, bevel=0.15)
        star_plate(10.02, 0, 6.6, 2.4, flat("#f0c419"), up=False)
        star_plate(10.1, 0, 6.6, 1.9, flat("#d0201a"), up=False)
        if st < 3:
            sandbags(14.5, -0.9, 0.9, 2, bags, gap=[0])
            cyl((7, 0, 16.2), (15, 0, 16.4), 0.32, gun(), 8)
            antenna(-8, -8, 15.2, 7)
            crates(-13, 5, 2, "#5b6236")
        if st >= 1:
            rubble(rng, 3 * st, 11, 13.5, cren, z=1)
            rubble(rng, 2 * st, 11, 13.5, brick, z=1)
        if st == 3:
            flames(rng, [(0, 0, 15.2, 2.6), (10.5, 4.5, 9, 1.3), (-4, 6, 15.2, 1.6)])
    else:
        sandbags(12, -math.pi, math.pi, 1, bags)
        ruin_walls(rng, [(-10, -10), (10, -10), (10, 10), (-10, 10)], 4.5, brick)
        rubble(rng, 26, 0, 10, brick, (0.6, 1.8), z=1)
        rubble(rng, 8, 0, 9, conc, (1.4, 2.6), z=1)
    return (15, 0, 16.3)


def islamic(st, team, rng):
    stone = dmat("#b09a72", st, grain=0.35, scale=45)
    apron(17, 18, "#a38d64", st)
    bags = dmat("#c9b384", st, grain=0.3, scale=200, cloth=True, cracks=False)
    bags2 = dmat("#b8a274", st, grain=0.3, scale=200, cloth=True, cracks=False)
    if st < 4:
        vprism(disc(12.4, 18), 1, 5.5, stone, bevel=0.3)
        for k in range(22):
            a = k / 22 * 2 * math.pi + rng.uniform(-0.05, 0.05)
            z = 1.6 + (k % 3) * 1.3
            chunk(rng, math.cos(a) * 12.3, math.sin(a) * 12.3, z, 0.9, dmat("#9c8662" if k % 2 else "#bfa97f", st, grain=0.3, scale=45))
        band(12.5, 18, 4.2, team)
        sandbags(11, -math.pi, math.pi, 3, bags, gap=[0, -0.9, 0.9], z0=5.5, alt=bags2)
        for a in (0, -0.9, 0.9):
            slit(math.cos(a) * 11.2, math.sin(a) * 11.2, a, 1.6, 1.3, 7.3, depth=2.4)
        if st < 3:
            wood = dmat("#6a4a2a", st, grain=0.35, scale=220, cracks=False)
            for y in (-6, -2, 2, 6):
                cyl((-10, y, 10.6), (10, y, 10.6), 0.45, wood, 8)
            tarp = dmat("#c8b78e", st, grain=0.25, scale=300, cloth=True, cracks=False)
            hull([(-10, -9, 10.9), (10, -9, 10.9), (10, 9, 10.9), (-10, 9, 10.9), (-9, -8.5, 11.7), (9, -8.5, 11.7), (9, 8.5, 11.7), (-9, 8.5, 11.7)], tarp, bevel=0.5)
            cyl((10, 0, 7.3), (16, 0, 7.4), 0.3, gun(), 8)
            cyl((-7, 7, 11), (-7, 7, 20), 0.2, dmat("#5a4a32", 0, cracks=False), 6)
            hull([(-7, 7.05, 17.2), (-7, 11.5, 17.2), (-7, 11.5, 20), (-7, 7.05, 20), (-7.1, 7.05, 17.2), (-7.1, 11.5, 20)], flat("#1f8a44"))
            hull([(-6.95, 7.05, 18.6), (-6.95, 11.5, 18.6), (-6.95, 11.5, 19.2), (-6.95, 7.05, 19.2), (-6.9, 7.05, 18.6), (-6.9, 11.5, 19.2)], flat(team))
            crates(-13, -4, 2, "#7a6a44")
        if st >= 1:
            rubble(rng, 3 * st, 12, 14.5, stone, z=1)
        if st == 3:
            flames(rng, [(0, 0, 8, 2.6), (6, -4, 8, 1.6), (-4, 5, 8, 1.6)])
    else:
        sandbags(11, -math.pi, math.pi, 1, bags)
        rubble(rng, 30, 0, 11, stone, (0.6, 1.8), z=1)
    return (16, 0, 7.4)


NATIONS = {"usa": usa, "europe": europe, "russia": russia, "china": china, "islamic": islamic}


# ---------------------------------------------------------------- render


def camera():
    sc = bpy.context.scene
    sc.cycles.samples = SAMPLES
    sc.render.resolution_x = sc.render.resolution_y = CELL * RES
    sc.render.image_settings.color_mode = "RGBA"
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = CELL / PX_PER_BU
    cam.shift_x = (ANCHOR[0] - CELL / 2) / CELL * -1 if False else (CELL / 2 - ANCHOR[0]) / CELL
    cam.shift_y = (ANCHOR[1] - CELL / 2) / CELL
    cam.clip_end = 500
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    el, az = math.radians(30), math.radians(45)
    co.location = (100 * math.cos(el) * math.cos(az), 100 * math.cos(el) * math.sin(az), 100 * math.sin(el))
    co.rotation_euler = (math.radians(60), 0, math.radians(135))
    sc.camera = co
    # Ground that only catches shadows.
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=2)
    me = bpy.data.meshes.new("ground")
    bm.to_mesh(me)
    g = bpy.data.objects.new("ground", me)
    sc.collection.objects.link(g)
    g.is_shadow_catcher = True


def bunker(nation):
    tmp = os.path.join(tempfile.gettempdir(), "bunker_frames")
    os.makedirs(tmp, exist_ok=True)
    C = CELL * RES
    sheet = np.zeros((STAGES * C, FACINGS * C, 4), np.float32)
    for st in range(STAGES):
        kit.reset()
        _dm.clear()
        camera()
        rng = random.Random(f"{nation}{st}")
        before = set(bpy.data.objects)
        NATIONS[nation](st, TEAM[nation], rng)
        objs = [o for o in bpy.data.objects if o not in before]
        piv = bpy.data.objects.new("piv", None)
        bpy.context.scene.collection.objects.link(piv)
        for o in objs:
            o.parent = piv
        sc = bpy.context.scene
        for r in range(FACINGS):
            piv.rotation_euler = (0, 0, -r * math.pi / 4)
            path = os.path.join(tmp, f"{nation}-{st}-{r}.png")
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            px = np.array(img.pixels[:], np.float32).reshape(C, C, 4)
            bpy.data.images.remove(img)
            y0 = (STAGES - 1 - st) * C
            sheet[y0 : y0 + C, r * C : (r + 1) * C] = px
    out = bpy.data.images.new(f"bunker-{nation}", FACINGS * C, STAGES * C, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(OUT, f"bunker-{nation}.png")
    out.file_format = "PNG"
    out.save()
    print(f"[bunker] {nation} written")


MODELS = {f"bunker-{n}": (lambda n=n: bunker(n)) for n in NATIONS}
