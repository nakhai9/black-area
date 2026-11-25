"""Shared ≤80 % HP (d1) damage boost, applied by kit.render to every picture named "...-d1" after the asset's own d1
damage pass. Infrastructure only (no shape builders of any asset): it ray-casts the finished scene from the two visible
sides (+x = game +v, +y = game +u in Blender) and from above, and adds on what it hits:
- most glass turned to dark broken panes;
- soot plumes rising up the walls from the hit points (dark, fading upward);
- small punched holes (charred jagged patches) in walls and roof edges, with a rubble pile below each;
- scorch blooms and rubble on the roofs; rubble piles at the wall feet.
The building stays whole: nothing is removed or cut, so d1 never reads as d2.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import kit

_C = {}


def _alive(m):
    try:
        m.name
        return True
    except ReferenceError:
        return False


def _soot():
    m = _C.get("soot")
    if m and _alive(m):
        return m
    m = bpy.data.materials.new("d1_soot")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.012, 0.010, 0.009, 1)
    b.inputs["Roughness"].default_value = 0.95
    uv = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs["UV"], sep.inputs[0])
    # Alpha: strong at the bottom, fading up (1 - v)^0.8, narrowing at the sides, broken by noise.
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(sep.outputs["Y"], inv.inputs[1])
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = 0.8
    nt.links.new(inv.outputs[0], pw.inputs[0])
    cx = nt.nodes.new("ShaderNodeMath")
    cx.operation = "SUBTRACT"
    cx.inputs[1].default_value = 0.5
    nt.links.new(sep.outputs["X"], cx.inputs[0])
    ab = nt.nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    nt.links.new(cx.outputs[0], ab.inputs[0])
    side = nt.nodes.new("ShaderNodeMath")
    side.operation = "MULTIPLY_ADD"
    side.inputs[1].default_value = -1.9
    side.inputs[2].default_value = 1.0
    nt.links.new(ab.outputs[0], side.inputs[0])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 6.0
    a1 = nt.nodes.new("ShaderNodeMath")
    a1.operation = "MULTIPLY"
    nt.links.new(pw.outputs[0], a1.inputs[0])
    nt.links.new(side.outputs[0], a1.inputs[1])
    a2 = nt.nodes.new("ShaderNodeMath")
    a2.operation = "MULTIPLY"
    nt.links.new(a1.outputs[0], a2.inputs[0])
    nt.links.new(noise.outputs["Fac"], a2.inputs[1])
    a3 = nt.nodes.new("ShaderNodeMath")
    a3.operation = "MULTIPLY"
    a3.inputs[1].default_value = 3.2
    a3.use_clamp = True
    nt.links.new(a2.outputs[0], a3.inputs[0])
    nt.links.new(a3.outputs[0], b.inputs["Alpha"])
    _C["soot"] = m
    return m


def _char():
    m = _C.get("char")
    if not (m and _alive(m)):
        m = _C["char"] = kit.mat("#141110", 0.95, grain=0.4, scale=60)
    return m


def _broken():
    m = _C.get("broken")
    if not (m and _alive(m)):
        m = _C["broken"] = kit.mat("#16181a", 0.35, grain=0.25, scale=40)
    return m


def _scorch_mat():
    m = _C.get("scorch")
    if not (m and _alive(m)):
        m = _C["scorch"] = kit.mat("#1b1714", 0.97, grain=0.5, scale=25)
    return m


def _dust():
    m = _C.get("dust")
    if not (m and _alive(m)):
        m = _C["dust"] = kit.mat("#7d756a", 0.95, grain=0.35, scale=40)
    return m


def _is_glass(m):
    if not m or not m.use_nodes:
        return False
    b = m.node_tree.nodes.get("Principled BSDF")
    if not b:
        return False
    try:
        if abs(b.inputs["Specular IOR Level"].default_value - 0.9) < 0.02 and b.inputs["Roughness"].default_value <= 0.12:
            return True
    except KeyError:
        pass
    return "glass" in m.name.lower()


def _link(name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(m)
    return ob


def _quad_on(hit, nrm, w, h, m, off=0.005, jag=0.0, rng=None, name="d1"):
    """A quad (or jagged polygon) standing on a wall at `hit` (bottom centre), facing `nrm` (horizontal)."""
    n = Vector((nrm.x, nrm.y, 0)).normalized()
    t = Vector((-n.y, n.x, 0))
    up = Vector((0, 0, 1))
    base = hit + n * off
    bm = bmesh.new()
    if jag and rng:
        pts = []
        k = 9
        for i in range(k):
            a = 2 * math.pi * i / k
            r = 1 - jag * rng.random()
            pts.append(base + t * (math.cos(a) * w / 2 * r) + up * (h / 2 + math.sin(a) * h / 2 * r))
        bm.faces.new([bm.verts.new(p) for p in pts])
    else:
        vs = [bm.verts.new(base + t * s * w / 2 + up * z) for s, z in ((-1, 0), (1, 0), (1, h), (-1, h))]
        f = bm.faces.new(vs)
        uvl = bm.loops.layers.uv.new("UVMap")
        for loop, uvc in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uvl].uv = uvc
    return _link(name, bm, m)


def _rock(rng, p, size, m):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=size)
    for v in bm.verts:
        v.co.x *= 0.7 + rng.random() * 0.7
        v.co.y *= 0.7 + rng.random() * 0.7
        v.co.z *= 0.35 + rng.random() * 0.45
        v.co += Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0)) * size
    bmesh.ops.translate(bm, verts=bm.verts, vec=p + Vector((0, 0, size * 0.25)))
    return _link("d1_rock", bm, m)


def _disc(p, r, m, n=12, rng=None):
    bm = bmesh.new()
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = r * (0.65 + 0.35 * (rng.random() if rng else 1))
        pts.append(bm.verts.new(p + Vector((math.cos(a) * rr, math.sin(a) * rr * 0.85, 0.004))))
    bm.faces.new(pts)
    return _link("d1_scorch", bm, m)


def _first_mat(ob):
    if ob and ob.type == "MESH" and ob.data.materials:
        return ob.data.materials[0]
    return None


def boost(footprint, height):
    """Adds the stronger d1 damage to the current scene (see module doc). footprint = (w, d) in tiles."""
    w, d = footprint
    rng = random.Random(f"d1:{w}:{d}:{height}")
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    meshes = [o for o in sc.objects if o.type == "MESH"]
    if not meshes:
        return
    # Ground top: the flat slab covering most of the plot (as kit.sink_ground_plate finds it).
    ground = 0.0
    for o in meshes:
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        z0, z1 = min(c.z for c in bb), max(c.z for c in bb)
        area = (max(c.x for c in bb) - min(c.x for c in bb)) * (max(c.y for c in bb) - min(c.y for c in bb))
        if abs(z0) < 1e-3 and z1 <= kit.zp(kit.GROUND_PLATE_MAX) and area >= 0.5 * w * d:
            ground = max(ground, z1)
    top = max(max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in meshes)
    if top - ground < kit.zp(3):
        return  # a flat piece: nothing stands up to damage here
    # 1) Most glass broken dark.
    broken = _broken()
    for o in meshes:
        for i, m in enumerate(o.data.materials):
            if _is_glass(m) and rng.random() < 0.8:
                o.data.materials[i] = broken
    soot, char, scorch, dust = _soot(), _char(), _scorch_mat(), _dust()
    min_z = ground + kit.zp(2.5)

    def cast(origin, direction):
        ok, loc, nrm, _i, ob, _m = sc.ray_cast(dg, origin, direction)
        return (loc, nrm, ob) if ok else None

    # 2) Wall hits from the two visible sides: soot plumes, punched holes, rubble at the feet.
    area = w * d
    n_wall = min(48, max(14, int(area * 3.4)))
    hits = []
    tries = 0
    while len(hits) < n_wall and tries < n_wall * 12:
        tries += 1
        z = ground + rng.uniform(kit.zp(3), max(kit.zp(4), (top - ground) * 0.85))
        if rng.random() < 0.5:  # from +x (game +v side) toward -x
            y = rng.uniform(0.1, w - 0.1)
            r = cast(Vector((d + 3, y, z)), Vector((-1, 0, 0)))
        else:  # from +y (game +u side) toward -y
            x = rng.uniform(0.1, d - 0.1)
            r = cast(Vector((x, w + 3, z)), Vector((0, -1, 0)))
        if not r:
            continue
        loc, nrm, ob = r
        if abs(nrm.z) > 0.35 or loc.z < min_z or ob.name.startswith("d1_") or ob.name == "ground_holdout":
            continue
        hits.append((loc, nrm, ob))
    print(f"[d1_boost] ground={ground:.3f} top={top:.3f} wall_hits={len(hits)} tries={tries}")
    for k, (loc, nrm, ob) in enumerate(hits):
        # Soot plume: as tall as the wall continues above the hit (probe upward along the same face).
        hmax = kit.zp(rng.uniform(7, 15))
        h = 0.0
        step = kit.zp(1.0)
        while h < hmax:
            probe = loc + Vector((0, 0, h + step)) + nrm * 0.25
            r = cast(probe, -Vector((nrm.x, nrm.y, 0)).normalized())
            if not r or (r[0] - (loc + Vector((0, 0, h + step)))).length > 0.06:
                break
            h += step
        if h > kit.zp(2):
            _quad_on(loc + Vector((0, 0, -kit.zp(1.0))), nrm, rng.uniform(0.24, 0.46), h + kit.zp(1.0), soot, off=0.02, name="d1_soot")
        # Burn mark round every hit (charred, opaque, jagged).
        _quad_on(loc + Vector((0, 0, -kit.zp(1.6))), nrm, rng.uniform(0.09, 0.16), kit.zp(rng.uniform(2.6, 4.0)), _scorch_mat(), off=0.022, jag=0.5, rng=rng, name="d1_burn")
        if k % 3 == 0:  # punched hole: charred jagged patch with a pile below
            hw = rng.uniform(0.07, 0.13)
            hh = kit.zp(rng.uniform(2.2, 3.6))
            _quad_on(loc + Vector((0, 0, -hh / 2)), nrm, hw, hh, char, off=0.026, jag=0.45, rng=rng, name="d1_hole")
        if k % 2 == 0:  # rubble at the wall foot below the hit
            foot = cast(loc + Vector((nrm.x, nrm.y, 0)).normalized() * 0.09 + Vector((0, 0, 0.2)), Vector((0, 0, -1)))
            if foot and foot[0].z <= loc.z:
                wm = _first_mat(ob) or dust
                for _ in range(rng.randint(4, 7)):
                    p = foot[0] + Vector((rng.uniform(-0.09, 0.09), rng.uniform(-0.09, 0.09), 0))
                    _rock(rng, p, rng.uniform(0.018, 0.034), (char, dust, dust)[rng.randrange(3)])
    # 3) Roof hits from above: scorch blooms, rubble chunks, charred notches at roof edges.
    n_roof = min(24, max(6, int(area * 1.4)))
    done = 0
    tries = 0
    while done < n_roof and tries < n_roof * 15:
        tries += 1
        x, y = rng.uniform(0.1, d - 0.1), rng.uniform(0.1, w - 0.1)
        r = cast(Vector((x, y, top + 2)), Vector((0, 0, -1)))
        if not r:
            continue
        loc, nrm, ob = r
        if loc.z < min_z + kit.zp(2) or nrm.z < 0.55 or ob.name.startswith("d1_"):
            continue
        done += 1
        _disc(loc, rng.uniform(0.07, 0.16), scorch, rng=rng)
        rm = _first_mat(ob) or dust
        for _ in range(rng.randint(2, 4)):
            p = loc + Vector((rng.uniform(-0.07, 0.07), rng.uniform(-0.07, 0.07), 0))
            _rock(rng, p, rng.uniform(0.014, 0.026), (char, dust)[rng.randrange(2)])
    print(f"[d1_boost] roof_hits={done}")
    # 4) Ground scorch blooms and loose rubble round the building.
    for _ in range(min(8, max(4, int(area * 0.8)))):
        x, y = rng.uniform(0.05, d - 0.05), rng.uniform(0.05, w - 0.05)
        r = cast(Vector((x, y, top + 2)), Vector((0, 0, -1)))
        if r and r[0].z <= ground + kit.zp(1.5):
            _disc(r[0], rng.uniform(0.1, 0.22), scorch, rng=rng)
