"""
Damage stages for the War Factory and Airfield pictures (ART_GUIDE "Trạng thái hư hại / Damage states"), applied in
world space just before render(), so every stage comes from the structure's own script, camera and origin:

    1  (<= 80 % HP)  scorch marks, broken panes, chipped parapets / eaves, a few rubble chunks, soot streaks
    2  (<= 50 % HP)  half the building (the u > split side) blown open / collapsed: roof gone, jagged breaks with
                     charred floors and beams, rubble; the other half standing with lighter damage
    3  (<= 20 % HP)  completely collapsed: rubble field over the plot, low wall stubs, a broken corner fragment
                     (with the team line), charred beams, scorched ground

`flat=True` (airfield aprons): the damage is per cluster of structures (tower, hangars) plus craters and burnt stands.
with_damage(MODELS, __name__, ...) adds "<key>-d1..d3" for every key: the build runs unchanged and its render() call
is intercepted to wreck the scene and write building-<name>-d<n>.

Flags: a pole in the destroyed part (stage 2, u > split) or any pole at stage 3 stands on a masonry block whose top is
RUIN_POLE_Z art px above the plot ground (WarFactory.ts lowers the pole there).
"""
import math
import random
import sys

import bmesh
import bpy
from mathutils import Vector

import kit

RUIN_POLE_Z = 8.0  # plot px: top of the block a flag pole stands on once its mount is gone (WarFactory.ts)


# ---------------------------------------------------------------- materials

_M = {}


def _alive(m):
    try:
        return m is not None and m.name in bpy.data.materials and bpy.data.materials[m.name] == m
    except ReferenceError:
        return False


def char_mat():
    m = _M.get("char")
    if not _alive(m):
        m = _M["char"] = kit.mat("#1d1814", 0.95, grain=0.45, scale=60)
    return m


def broken_mat():
    m = _M.get("broken")
    if not _alive(m):
        m = _M["broken"] = kit.mat("#0d0c0b", 0.9, grain=0.2, scale=40)
    return m


def soot_mat(strength=0.75):
    key = f"soot{strength}"
    m = _M.get(key)
    if _alive(m):
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = kit.srgb("#16120f")
    bsdf.inputs["Roughness"].default_value = 0.95
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (3.0, 3.0, 0.6)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9
    noise.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (strength, strength, strength, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
    _M[key] = m
    return m


def _is_glass(m):
    if m is None or not m.use_nodes:
        return False
    b = m.node_tree.nodes.get("Principled BSDF")
    if b is None:
        return False
    if b.inputs["Emission Strength"].default_value > 0 and tuple(b.inputs["Emission Color"].default_value)[:3] != (0, 0, 0):
        return True  # lit windows
    return b.inputs["Roughness"].default_value <= 0.12 and b.inputs["Specular IOR Level"].default_value >= 0.85


def _team_mat():
    for m in bpy.data.materials:
        for hexv in kit.TEAM.values():
            if m.name.endswith("_" + hexv):
                return m
    return None


# ---------------------------------------------------------------- world-space primitives (x = v, y = u, z BU)


def _mk(name, bm, m):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(m)
    return ob


def wbox(x0, y0, z0, x1, y1, z1, m, name="ruin"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vt in bm.verts:
        vt.co.x = x0 + (vt.co.x + 0.5) * (x1 - x0)
        vt.co.y = y0 + (vt.co.y + 0.5) * (y1 - y0)
        vt.co.z = z0 + (vt.co.z + 0.5) * (z1 - z0)
    return _mk(name, bm, m)


def jag_block(rng, x0, y0, z0, x1, y1, z1, m, jag=0.35):
    """A wall piece with a jagged broken top (its top vertices dropped at random)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6], cuts=3, use_grid_fill=True)
    h = z1 - z0
    for vt in bm.verts:
        top = vt.co.z > 0.49
        vt.co.x = x0 + (vt.co.x + 0.5) * (x1 - x0)
        vt.co.y = y0 + (vt.co.y + 0.5) * (y1 - y0)
        vt.co.z = z0 + (vt.co.z + 0.5) * h
        if top:
            vt.co.z -= h * rng.uniform(0, jag)
    return _mk("stub", bm, m)


def wrod(a, b, r, m):
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    if L < 1e-6:
        return None
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=r, radius2=r, depth=L)
    rot = d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    return _mk("beam", bm, m)


def rock(rng, x, y, z, size, m):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sx, sy, sz = size * rng.uniform(0.7, 1.3), size * rng.uniform(0.7, 1.3), size * rng.uniform(0.5, 0.9)
    for vt in bm.verts:
        j = rng.uniform(0.75, 1.2)
        vt.co.x = x + vt.co.x * j * sx
        vt.co.y = y + vt.co.y * j * sy
        vt.co.z = z + (max(vt.co.z * j, -0.3) + 0.3) * sz
    return _mk("rubble", bm, m)


def pile(rng, x, y, z, radius, count, mats, size=0.045, heap=None):
    heap = kit.zp(4.0) if heap is None else heap
    for _ in range(count):
        a = rng.uniform(0, 2 * math.pi)
        r = radius * math.sqrt(rng.random())
        rock(rng, x + r * math.cos(a), y + r * math.sin(a), z + rng.uniform(0, heap) * (1 - r / radius), rng.uniform(size * 0.5, size * 1.6), rng.choice(mats))


def scorch(rng, x, y, r, z, strength=0.9, squash=1.0):
    bm = bmesh.new()
    vs = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        rr = r * rng.uniform(0.6, 1.15)
        vs.append(bm.verts.new((x + rr * math.cos(a) * squash, y + rr * math.sin(a), z)))
    bm.faces.new(vs)
    return _mk("scorch", bm, soot_mat(strength))


def cutter(rng, x, y, z, rx, ry, rz):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    p1, p2 = rng.uniform(0, 6), rng.uniform(0, 6)
    for vt in bm.verts:
        n = vt.co.normalized()
        k = 1 + rng.uniform(-0.15, 0.15) + 0.15 * math.sin(7 * n.x + 3 * n.y + p1) * math.cos(5 * n.z + p2)
        vt.co.x = x + n.x * rx * k
        vt.co.y = y + n.y * ry * k
        vt.co.z = z + n.z * rz * k
    ob = _mk("cutter", bm, char_mat())
    ob.hide_render = True
    ob.hide_viewport = True
    return ob


# ---------------------------------------------------------------- scene queries


def bounds(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb))),
            Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb))))


def _closed(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    ok = len(bm.edges) > 0 and all(e.is_manifold for e in bm.edges)
    bm.free()
    return ok


def ground_top(footprint):
    """Top of the plot's paving (the slab kit.sink_ground_plate lowers to the map ground)."""
    w, d = footprint
    top = 0.0
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        lo, hi = bounds(o)
        if abs(lo.z) < 1e-4 and hi.z <= kit.zp(kit.GROUND_PLATE_MAX) and (hi.x - lo.x) * (hi.y - lo.y) >= 0.5 * w * d:
            top = max(top, hi.z)
    return top


def surface_z(x, y, G):
    """Top of the flat paving / paint under (x, y) (structures excluded), for laying films on."""
    z = G
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.hide_render:
            continue
        lo, hi = bounds(o)
        if hi.z <= G + kit.zp(1.0) and lo.x <= x <= hi.x and lo.y <= y <= hi.y:
            z = max(z, hi.z)
    return z


def structures(G, min_px=2.5):
    out = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.hide_render or o.name.startswith("ground_holdout"):
            continue
        lo, hi = bounds(o)
        if hi.z > G + kit.zp(min_px):
            out.append((o, lo, hi))
    return out


def _inside(p, c, r):
    return sum(((p[i] - c[i]) / max(r[i], 1e-6)) ** 2 for i in range(3)) <= 1


def apply_cuts(cuts, G):
    """cuts: [(cutter, centre, radii)]. Booleans every closed structure mesh a blast reaches; small parts and open
    shells (which break boolean cuts) whose middle lies inside a blast are deleted instead."""
    for ob, lo, hi in structures(G, 0.2):
        hits = [(c, cc, rr) for c, cc, rr in cuts
                if lo.x < cc.x + rr.x and hi.x > cc.x - rr.x and lo.y < cc.y + rr.y and hi.y > cc.y - rr.y
                and lo.z < cc.z + rr.z and hi.z > cc.z - rr.z]
        if not hits:
            continue
        mid = (lo + hi) / 2
        closed = _closed(ob)
        if any(_inside(mid, cc, rr * 0.8) for _, cc, rr in hits) and ((hi - lo).length < 0.5 or not closed):
            bpy.data.objects.remove(ob, do_unlink=True)
            continue
        if not closed:
            continue
        for c, _, _ in hits:
            mod = ob.modifiers.new("blast", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.object = c
            mod.material_mode = "TRANSFER"


def blast(rng, cuts, x, y, z, rx, ry, rz):
    c = cutter(rng, x, y, z, rx, ry, rz)
    cuts.append((c, Vector((x, y, z)), Vector((rx, ry, rz)) * 1.2))


# ---------------------------------------------------------------- stage pieces


def break_glass(rng, frac, region=None):
    br = broken_mat()
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if o.type != "MESH" or not o.data.materials:
            continue
        if not any(_is_glass(m) for m in o.data.materials):
            continue
        lo, hi = bounds(o)
        f = frac if region is None or not region((lo + hi) / 2) else min(1.0, frac + 0.4)
        if rng.random() < f:
            for i, m in enumerate(o.data.materials):
                if _is_glass(m):
                    o.data.materials[i] = br


def soot_streaks(rng, G, n, objs):
    """Soot films rising up the visible (+x = +v, +y = +u) walls of the larger structure meshes."""
    big = [(o, lo, hi) for o, lo, hi in objs if (hi.z - lo.z) > kit.zp(6) and min(hi.x - lo.x, hi.y - lo.y) > 0.25]
    if not big:
        return
    for _ in range(n):
        o, lo, hi = rng.choice(big)
        h = hi.z - max(lo.z, 0)
        z0 = max(lo.z, 0) + h * rng.uniform(0.05, 0.5)
        z1 = min(hi.z - 0.002, z0 + h * rng.uniform(0.3, 0.6))
        hw = rng.uniform(0.1, 0.25)
        bm = bmesh.new()
        if rng.random() < 0.5:
            c = rng.uniform(lo.y + hw, max(lo.y + hw, hi.y - hw))
            xs = hi.x + 0.004
            pts = [(xs, c - hw, z0), (xs, c + hw, z0), (xs, c + hw * 1.5, z1), (xs, c - hw * 1.5, z1)]
        else:
            c = rng.uniform(lo.x + hw, max(lo.x + hw, hi.x - hw))
            ys = hi.y + 0.004
            pts = [(c - hw, ys, z0), (c + hw, ys, z0), (c + hw * 1.5, ys, z1), (c - hw * 1.5, ys, z1)]
        bm.faces.new([bm.verts.new(p) for p in pts])
        _mk("soot", bm, soot_mat(0.7))


def _mats_of(o):
    ms = [m for m in o.data.materials if m is not None and not _is_glass(m)]
    return ms or [char_mat()]


def stubs_over(rng, lo, hi, G, m, max_px=7.0, gap=0.25):
    """Low jagged wall stubs around a rectangle's walls."""
    t = min(0.07, (hi.x - lo.x) / 4, (hi.y - lo.y) / 4)
    sides = ((lo.x, lo.y, hi.x, lo.y + t), (lo.x, hi.y - t, hi.x, hi.y), (lo.x, lo.y, lo.x + t, hi.y), (hi.x - t, lo.y, hi.x, hi.y))
    for (a, b, c, d) in sides:
        along_x = (c - a) > (d - b)
        L = (c - a) if along_x else (d - b)
        n = max(1, int(L / 0.14))
        for k in range(n):
            if rng.random() < gap:
                continue
            h = kit.zp(rng.uniform(1.5, max_px))
            if along_x:
                jag_block(rng, a + k * L / n, b, G, a + (k + 1) * L / n - 0.006, d, G + h, m)
            else:
                jag_block(rng, a, b + k * L / n, G, c, b + (k + 1) * L / n - 0.006, G + h, m)


def fragment(rng, lo, hi, G, m, team, top_px):
    """A broken corner of a wall left standing at the front corner (+x +y), with the team line if there is one."""
    x1, y1 = hi.x, hi.y
    t = 0.08
    lx, ly = min(0.5, (hi.x - lo.x) * 0.5), min(0.45, (hi.y - lo.y) * 0.5)
    zt = G + kit.zp(top_px)
    jag_block(rng, x1 - t, y1 - ly, G, x1, y1, zt, m, jag=0.5)
    jag_block(rng, x1 - lx, y1 - t, G, x1, y1, zt, m, jag=0.5)
    if team is not None:
        zb = G + kit.zp(top_px * 0.4)
        wbox(x1 - lx * 0.7, y1 + 0.0005, zb, x1 + 0.006, y1 + 0.012, zb + kit.zp(1.5), team, "team")
        wbox(x1 + 0.0005, y1 - ly * 0.7, zb, x1 + 0.012, y1 + 0.006, zb + kit.zp(1.5), team, "team")
    for _ in range(4):
        rock(rng, x1 - rng.uniform(0, lx), y1 - rng.uniform(0, ly), zt - kit.zp(rng.uniform(0, 4)), 0.035, m)


def beams(rng, n, x0, y0, x1, y1, z0, z1, m):
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        a = rng.uniform(0, math.pi)
        L = rng.uniform(0.25, 0.6)
        z = rng.uniform(z0, z1)
        wrod((x, y, z), (x + L * math.cos(a), y + L * math.sin(a), z + rng.uniform(-kit.zp(3), kit.zp(4))), 0.014, m)


def flag_blocks(flags, G, m):
    for u, v in flags:
        wbox(v - 0.07, u - 0.07, G, v + 0.07, u + 0.07, G + kit.zp(RUIN_POLE_Z), m, "poleblock")


def crater(rng, x, y, r, G, mats):
    z = surface_z(x, y, G) + 0.0015
    scorch(rng, x, y, r * 1.6, z, 0.75)
    scorch(rng, x, y, r * 0.9, z + 0.0008, 1.0)
    for k in range(14):
        a = 2 * math.pi * k / 14 + rng.uniform(-0.2, 0.2)
        rr = r * rng.uniform(0.75, 1.05)
        rock(rng, x + rr * math.cos(a), y + rr * math.sin(a), z, rng.uniform(0.03, 0.06), rng.choice(mats))


# ---------------------------------------------------------------- the stages


def wreck(stage, footprint, seed, flags=(), split=None):
    """Building damage. flags: [(u, v)] pole spots; split: u beyond which stage 2 destroys (default half the plot)."""
    w, d = footprint
    rng = random.Random(seed * 10 + stage)
    G = ground_top(footprint)
    split = w * 0.5 if split is None else split
    objs = structures(G)
    team = _team_mat()
    charm = char_mat()
    mats_all = []
    for o, _, _ in objs:
        for m in _mats_of(o):
            if m not in mats_all:
                mats_all.append(m)
    big = sorted([(o, lo, hi) for o, lo, hi in objs if (hi.x - lo.x) * (hi.y - lo.y) > 0.25 and hi.z - G > kit.zp(8)],
                 key=lambda t: -(t[2].x - t[1].x) * (t[2].y - t[1].y) * (t[2].z - G))
    main_m = _mats_of(big[0][0])[0] if big else mats_all[0]
    debris = [main_m, main_m] + mats_all[:6] + [charm, charm]
    top = max((hi.z for _, _, hi in objs), default=G + kit.zp(20))

    if stage >= 3:
        return _ruins(rng, footprint, G, objs, big, team, debris, main_m, flags)

    big_info = [(o, lo.copy(), hi.copy(), _mats_of(o)[0]) for o, lo, hi in big]
    cuts = []
    # Chips along parapets / eaves of the larger blocks.
    for o, lo, hi in big[: 5 if stage == 1 else 8]:
        for _ in range(2 if stage == 1 else 3):
            if rng.random() < 0.5:
                x, y = hi.x, rng.uniform(lo.y, hi.y)
            else:
                x, y = rng.uniform(lo.x, hi.x), hi.y
            blast(rng, cuts, x, y, hi.z, 0.1, 0.1, kit.zp(3.0))
    if stage == 2:
        # Half the building gone: overlapping ragged blasts over the u > split side, from the roof down to low stubs.
        span = w - split
        h = top - G
        for k in range(4):
            cy = split + span * (0.62 + 0.1 * k / 3) + rng.uniform(-0.08, 0.08)
            cx = d * (0.12 + 0.76 * k / 3) + rng.uniform(-0.15, 0.15)
            blast(rng, cuts, cx, cy, G + h * 0.55, d * 0.4, span * 0.72, h * 0.62)
        for k in range(6):  # ragged break running along the split, a little into the standing half
            blast(rng, cuts, d * (0.05 + 0.18 * k), split + rng.uniform(-0.08, 0.1), G + h * rng.uniform(0.55, 0.95), 0.22, 0.2, h * 0.3)
    apply_cuts(cuts, G)
    lost = lambda p: p.y > split  # noqa: E731
    break_glass(rng, (0, 0.3, 0.55)[stage], lost if stage == 2 else None)
    soot_streaks(rng, G, 6 + 6 * stage, structures(G))
    if stage == 2:
        # Charred floor slabs and beams in the break, low stubs, rubble over the fallen half.
        for o, lo, hi, m in big_info:
            if hi.y <= split:
                continue
            ylo = max(lo.y, split)
            stubs_over(rng, Vector((lo.x, ylo, lo.z)), hi, G, m, 7.0)
            if lo.y >= split:
                continue
            nfl = max(1, int((hi.z - G) / kit.zp(13)))
            for f in range(1, nfl + 1):
                z = G + (hi.z - G) * f / (nfl + 1) * 0.75
                y0 = split - 0.05
                wbox(lo.x + 0.05, y0, z, hi.x - 0.05, y0 + rng.uniform(0.1, 0.25), z + kit.zp(0.8), rng.choice([charm, m]), "slab")
                jx = lo.x + 0.06
                while jx < hi.x - 0.05:
                    wrod((jx, y0, z), (jx + rng.uniform(-0.06, 0.06), y0 + rng.uniform(0.15, 0.45), z - kit.zp(rng.uniform(1, 7))), 0.011, charm)
                    jx += 0.12
        for _ in range(int(8 * d)):
            pile(rng, rng.uniform(0.2, d - 0.2), rng.uniform(split + 0.05, w - 0.15), G, rng.uniform(0.25, 0.45), 20, debris, 0.05, kit.zp(5))
        beams(rng, 12, 0.2, split + 0.1, d - 0.2, w - 0.2, G + kit.zp(2), G + kit.zp(7), charm)
        flag_blocks([f for f in flags if f[0] > split], G, main_m)
    # Rubble at the foot of the walls, scorched ground.
    for _ in range(3 if stage == 1 else 6):
        if big_info:
            o, lo, hi, m = rng.choice(big_info)
            x, y = (hi.x + 0.06, rng.uniform(lo.y, hi.y)) if rng.random() < 0.5 else (rng.uniform(lo.x, hi.x), hi.y + 0.06)
            pile(rng, min(x, d - 0.05), min(y, w - 0.05), G, 0.12, 8, [m] + debris)
    for _ in range(2 if stage == 1 else 5):
        x, y = rng.uniform(0.2, d - 0.2), rng.uniform(0.2, w - 0.2)
        scorch(rng, x, y, rng.uniform(0.15, 0.35), surface_z(x, y, G) + 0.0015)


def _ruins(rng, footprint, G, objs, big, team, debris, main_m, flags):
    w, d = footprint
    charm = char_mat()
    rects = [(lo.copy(), hi.copy(), _mats_of(o)[0], hi.z - G) for o, lo, hi in big]
    tall_slim = [(lo.copy(), hi.copy(), _mats_of(o)[0], hi.z - G) for o, lo, hi in objs
                 if (hi.z - G) > kit.zp(25) and (hi.x - lo.x) < 0.3 and (hi.y - lo.y) < 0.3]
    for o, lo, hi in objs:
        if hi.z > G + kit.zp(3.5):
            bpy.data.objects.remove(o, do_unlink=True)
    for lo, hi, m, h in rects:
        stubs_over(rng, lo, hi, G, m, min(8.0, max(3.0, h / kit.zp(1) * 0.2)))
    if rects:
        lo, hi, m, h = rects[0]
        fragment(rng, lo, hi, G, m, team, min(18.0, h / kit.zp(1) * 0.45))
    # Rubble mounds over every building rect, higher over the taller ones.
    for lo, hi, m, h in rects:
        area = (hi.x - lo.x) * (hi.y - lo.y)
        for _ in range(max(2, int(area * 3))):
            x, y = rng.uniform(lo.x + 0.1, max(lo.x + 0.1, hi.x - 0.1)), rng.uniform(lo.y + 0.1, max(lo.y + 0.1, hi.y - 0.1))
            pile(rng, x, y, G + rng.uniform(0, min(kit.zp(4), h * 0.1)), rng.uniform(0.3, 0.45), 24, [m, m] + debris, 0.055, kit.zp(5))
    # Tall slender parts (crane masts, chimneys, stacks) lie fallen across the rubble.
    for lo, hi, m, h in tall_slim[:3]:
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        a = rng.uniform(0, 2 * math.pi)
        L = min(h * 0.7, 1.6)
        ex, ey = min(max(cx + L * math.cos(a), 0.1), d - 0.1), min(max(cy + L * math.sin(a), 0.1), w - 0.1)
        r = max(0.02, min(hi.x - lo.x, hi.y - lo.y) * 0.35)
        wrod((cx, cy, G + kit.zp(2)), (ex, ey, G + kit.zp(4)), r, m)
    beams(rng, int(6 * d), 0.2, 0.2, d - 0.2, w - 0.2, G + kit.zp(3), G + kit.zp(8), charm)
    for _ in range(int(2 * w)):
        x, y = rng.uniform(0.2, d - 0.2), rng.uniform(0.2, w - 0.2)
        scorch(rng, x, y, rng.uniform(0.25, 0.6), surface_z(x, y, G) + 0.0015)
    flag_blocks(flags, G, main_m)


def wreck_flat(stage, footprint, seed):
    """Flat piece (airfield): craters and burnt stands on the paving; each cluster of structures half / fully destroyed."""
    w, d = footprint
    rng = random.Random(seed * 10 + stage)
    G = ground_top(footprint)
    objs = structures(G, 3.0)
    team = _team_mat()
    charm = char_mat()
    concrete = [kit.mat("#8a8a84", 0.95, grain=0.25, scale=20), kit.mat("#6e6e68", 0.95, grain=0.3, scale=20)]
    # Clusters of structures (bounding boxes within 0.3 tiles of each other).
    clusters = []
    for t in objs:
        lo, hi = t[1], t[2]
        hit = [c for c in clusters if lo.x < c[1].x + 0.3 and hi.x > c[0].x - 0.3 and lo.y < c[1].y + 0.3 and hi.y > c[0].y - 0.3]
        nlo, nhi = lo.copy(), hi.copy()
        members = [t]
        for c in hit:
            clusters.remove(c)
            nlo = Vector((min(nlo.x, c[0].x), min(nlo.y, c[0].y), min(nlo.z, c[0].z)))
            nhi = Vector((max(nhi.x, c[1].x), max(nhi.y, c[1].y), max(nhi.z, c[1].z)))
            members += c[2]
        clusters.append([nlo, nhi, members])
    mats_all = []
    for o, _, _ in objs:
        for m in _mats_of(o):
            if m not in mats_all:
                mats_all.append(m)
    debris = concrete + mats_all[:5] + [charm]
    if stage >= 3:
        for lo, hi, members in clusters:
            mbig = max(members, key=lambda t: (t[2].x - t[1].x) * (t[2].y - t[1].y) * (t[2].z - G))
            m = _mats_of(mbig[0])[0]
            h = hi.z - G
            for o, _, _ in members:
                bpy.data.objects.remove(o, do_unlink=True)
            stubs_over(rng, lo, hi, G, m, 6.0, 0.2)
            fragment(rng, lo, hi, G, m, team, min(12.0, h / kit.zp(1) * 0.3))
            cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
            r = max(hi.x - lo.x, hi.y - lo.y) * 0.55 + 0.15
            pile(rng, cx, cy, G, r, int(40 + 60 * r), [m, m] + debris, 0.05, kit.zp(5))
            beams(rng, 6, lo.x, lo.y, hi.x, hi.y, G + kit.zp(2), G + kit.zp(6), charm)
            scorch(rng, cx, cy, r * 1.5, surface_z(cx, cy, G) + 0.0012, 0.8)
    else:
        cuts = []
        for lo, hi, members in clusters:
            h = hi.z - G
            if stage == 1:
                for _ in range(2):
                    blast(rng, cuts, hi.x, rng.uniform(lo.y, hi.y), hi.z, 0.1, 0.1, kit.zp(2.5))
            else:  # the upper / u-side half of each structure blown away
                sy = hi.y - lo.y
                blast(rng, cuts, (lo.x + hi.x) / 2 + rng.uniform(-0.05, 0.05), hi.y, hi.z, (hi.x - lo.x) * 0.8, sy * 0.6, h * 0.75)
                blast(rng, cuts, hi.x, (lo.y + hi.y) / 2, hi.z, (hi.x - lo.x) * 0.45, sy * 0.45, h * 0.45)
        apply_cuts(cuts, G)
        break_glass(rng, (0, 0.4, 0.85)[stage])
        soot_streaks(rng, G, 4 * stage, structures(G, 3.0))
        for lo, hi, members in clusters:
            cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
            r = max(hi.x - lo.x, hi.y - lo.y) * 0.5 + 0.1
            if stage == 2:
                pile(rng, hi.x + 0.1, cy, G, r * 0.6, int(30 + 30 * r), debris, 0.05)
                pile(rng, cx, hi.y + 0.1, G, r * 0.5, int(20 + 20 * r), debris, 0.05)
                beams(rng, 4, lo.x, lo.y, hi.x + 0.3, hi.y + 0.3, G + kit.zp(1), G + kit.zp(4), charm)
            else:
                pile(rng, hi.x + 0.08, cy, G, 0.15, 8, debris)
            scorch(rng, cx + 0.2, cy + 0.2, r * (0.7 + 0.4 * stage), surface_z(cx + 0.2, cy + 0.2, G) + 0.0012, 0.7)
    # Craters across the paving, more each stage; burnt aircraft stands.
    for _ in range((0, 3, 7, 12)[stage]):
        x, y = rng.uniform(0.4, d - 0.4), rng.uniform(0.4, w - 0.4)
        crater(rng, x, y, rng.uniform(0.18, 0.32), G, debris)
    for _ in range((0, 1, 3, 5)[stage]):
        x, y = rng.uniform(1, d - 1), rng.uniform(1, w - 1)
        z = surface_z(x, y, G) + 0.002
        scorch(rng, x, y, rng.uniform(0.5, 0.8), z, 0.85, squash=0.6)
        for k in range(3):
            a = rng.uniform(0, math.pi)
            wrod((x, y, z + 0.01), (x + 0.4 * math.cos(a), y + 0.4 * math.sin(a), z + 0.012), 0.012, charm)


# ---------------------------------------------------------------- hook into a module's MODELS


def with_damage(models, module_name, seed=1, flags=None, flat=False, split=None):
    """Adds "<key>-d1..d3" for each key in `models`: the same build, wrecked before its render() writes -d<n>."""
    flags = flags or {}
    for key, fn in list(models.items()):
        for n in (1, 2, 3):
            models[f"{key}-d{n}"] = (lambda fn=fn, n=n, key=key: _run(module_name, fn, n, seed + sum(map(ord, key)), flags.get(key, ()), flat, split))
    return models


def _run(module_name, fn, stage, seed, flags, flat, split):
    mod = sys.modules[module_name]
    orig = mod.render

    def render(name, footprint, height):
        if flat:
            wreck_flat(stage, footprint, seed)
        else:
            wreck(stage, footprint, seed, flags, split)
        orig(f"{name}-d{stage}", footprint, height)

    mod.render = render
    try:
        fn()
    finally:
        mod.render = orig
