"""
Damage stages for the utility structures (power plants, port, radar, fuel station, oil tank, missile silo) —
ART_GUIDE.md "Damage states" — added to the finished scene just before it is rendered, so every stage keeps the same
architecture, camera and origin:

    1 (<= 80 % HP)  soot streaks on the walls, panes blacked out, chipped tops / parapets, a few rubble chunks,
                    scorched ground.
    2 (<= 50 % HP)  HALF the structure collapsed: on the `side` half every tall part is broken down to a jagged
                    slope / stubs (the broken tops charred), floating parts gone, rubble heaps, charred beams and
                    rebar along the break; the other half stands with lighter damage.
    3 (<= 20 % HP)  completely collapsed: everything tall broken to low jagged stubs with a few taller corner
                    fragments, rubble over the plot, charred beams, scorched ground (craters on flat pieces).

The break is a height clamp (vertices pushed down to a noisy height field), never a boolean: the meshes stay closed,
open shells (lathes) just end at a ragged rim. Usage in a model module:

    from models._utilwreck import variant
    MODELS[f"oil-{k}-d{d}"] = lambda k=k, d=d: variant(globals(), lambda: oil_tank(k), d)
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector, noise

import kit
from kit import mat, srgb, zp


class _Done(Exception):
    pass


def variant(g, build, damage, **opt):
    """Runs build() with the module's render patched: the stage's damage is added just before its first render, which
    is written as <name>-d<damage>; renders after it (animation frames) are skipped."""
    orig, zs = g["render"], kit.ZS

    def r(name, footprint, height):
        wreck(damage, footprint, **opt)
        orig(f"{name}-d{damage}", footprint, height)
        raise _Done

    g["render"] = r
    try:
        build()
    except _Done:
        pass
    finally:
        g["render"] = orig
        kit.ZS = zs


# ---------------------------------------------------------------- materials


def char_mat():
    return mat("#1b1713", 0.95, grain=0.45, scale=60)


def rebar_mat():
    return mat("#4a2f20", 0.7, metal=0.5, grain=0.2, scale=80)


def _soot_film(strength=0.9):
    m = bpy.data.materials.new("soot_film")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb("#120f0c")
    bsdf.inputs["Roughness"].default_value = 0.97
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 6
    nz.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (strength,) * 3 + (1,)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
    return m


def _is_glass(bsdf):
    return bsdf.inputs["Roughness"].default_value < 0.1 and bsdf.inputs["Specular IOR Level"].default_value > 0.85


def soot_materials(amount, seed):
    """Every material of the scene gets soot: world-space streaky noise (stretched up the walls) mixing the colour
    towards soot-black; glass blacks out (broken panes) in larger patches."""
    for m in list(bpy.data.materials):
        if not m.use_nodes or m.name.startswith(("holdout", "soot_film")):
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        inp = bsdf.inputs["Base Color"]
        src = inp.links[0].from_socket if inp.is_linked else None
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        if src is not None:
            nt.links.new(src, mix.inputs[6])
        else:
            mix.inputs[6].default_value = inp.default_value[:]
        mix.inputs[7].default_value = srgb("#100d0a")
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Location"].default_value = (seed * 3.7, seed * 1.3, 0)
        mp.inputs["Scale"].default_value = (2.2, 2.2, 0.35)  # stretched along z: streaks running up the walls
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 2.5
        nz.inputs["Detail"].default_value = 8
        nz.inputs["Roughness"].default_value = 0.65
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        glass = _is_glass(bsdf)
        cover = min(0.95, amount * (1.6 if glass else 1.0))
        e0, e1 = ramp.color_ramp.elements[0], ramp.color_ramp.elements[1]
        e0.position = max(0.0, 0.72 - 0.45 * cover)
        e0.color = (0, 0, 0, 1)
        e1.position = e0.position + 0.08
        f = 1.0 if glass else min(0.92, 0.55 + 0.4 * amount)
        e1.color = (f, f, f, 1)
        nt.links.new(geo.outputs["Position"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], mix.inputs[0])
        nt.links.new(mix.outputs[2], inp)
        if glass:  # a blacked-out pane loses its sheen
            rr = nt.nodes.new("ShaderNodeMapRange")
            nt.links.new(ramp.outputs["Color"], rr.inputs["Value"])
            rr.inputs["To Min"].default_value = 0.08
            rr.inputs["To Max"].default_value = 0.95
            nt.links.new(rr.outputs["Result"], bsdf.inputs["Roughness"])


# ---------------------------------------------------------------- geometry helpers


def _bounds(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb))),
            Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb))))


def _structure(min_z):
    out = []
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH" or ob.hide_render or ob.name.startswith("ground_holdout"):
            continue
        lo, hi = _bounds(ob)
        if hi.z > min_z:
            out.append((ob, lo, hi))
    return out


def _clamp(ob, field, charm, max_iter=4, seg=0.09):
    """Pushes the object's vertices down to field(x, y) (Blender world coordinates, None = untouched), subdividing
    long edges first so the break is ragged. Faces left entirely on the break take the charred material.
    Returns the world positions of broken-top vertices."""
    for md in list(ob.modifiers):
        if md.type == "BEVEL":
            ob.modifiers.remove(md)
    Mw = ob.matrix_world.copy()
    Mi = Mw.inverted()
    bm = bmesh.new()
    bm.from_mesh(ob.data)

    def hit(co):
        w = Mw @ co
        h = field(w.x, w.y)
        return h is not None and w.z > h

    for _ in range(max_iter):
        long_edges = [e for e in bm.edges if (Mw @ e.verts[0].co - Mw @ e.verts[1].co).length > seg
                      and (hit(e.verts[0].co) or hit(e.verts[1].co) or hit((e.verts[0].co + e.verts[1].co) / 2))]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    tops = []
    moved = set()
    bm.verts.index_update()
    for v in bm.verts:
        w = Mw @ v.co
        h = field(w.x, w.y)
        if h is not None and w.z > h:
            w.z = h
            v.co = Mi @ w
            moved.add(v.index)
            tops.append(w.copy())
    if moved:
        mats = ob.data.materials
        names = [m.name if m else "" for m in mats]
        if charm.name not in names:
            mats.append(charm)
            names.append(charm.name)
        ci = names.index(charm.name)
        for f in bm.faces:
            if all(v.index in moved for v in f.verts):
                f.material_index = ci
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return tops


def _rock(bm, rng, x, y, z, size):
    """One irregular rubble lump into bm (Blender coordinates), resting on z."""
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sx, sy, sz = size * rng.uniform(0.7, 1.3), size * rng.uniform(0.7, 1.3), size * rng.uniform(0.35, 0.75)
    rot = rng.uniform(0, math.pi)
    c, s = math.cos(rot), math.sin(rot)
    for v in res["verts"]:
        j = rng.uniform(0.7, 1.25)
        px, py, pz = v.co.x * j * sx, v.co.y * j * sy, max(v.co.z * j, -0.4) * sz
        v.co = Vector((x + px * c - py * s, y + px * s + py * c, z + pz + 0.4 * sz))


def _ground_at(x, y, top=60.0):
    """The top surface under (x, y) (Blender coordinates), or None over transparent ground (holdout)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ok, loc, _n, _i, ob, _m = bpy.context.scene.ray_cast(dg, Vector((x, y, top)), Vector((0, 0, -1)))
    if not ok or ob is None or ob.name.startswith("ground_holdout"):
        return None
    if ob.data.materials and any(m and m.name.startswith("holdout") for m in ob.data.materials):
        return None
    return loc.z


def _rubble(points, mats, rng):
    """points: (x, y, size) — lumps dropped onto whatever surface is below, one mesh per material."""
    bms = {m.name: (bmesh.new(), m) for m in mats}
    names = list(bms)
    for x, y, size in points:
        z = _ground_at(x, y)
        if z is None:
            continue
        _rock(bms[rng.choice(names)][0], rng, x, y, z - size * 0.15, size)
    for bm, m in bms.values():
        if not bm.verts:
            bm.free()
            continue
        me = bpy.data.meshes.new("rubble")
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("rubble", me)
        bpy.context.collection.objects.link(ob)
        me.materials.append(m)


def _rod(a, b, r, m, segs=5):
    # kit.rod takes (u, v, z): Blender (x, y) swapped.
    kit.rod((a[1], a[0], a[2]), (b[1], b[0], b[2]), r, m, segs)


def _scorch(rng, x, y, r, crater=False):
    z = _ground_at(x, y)
    if z is None:
        return
    layers = [(r, _soot_film(0.92))] + ([(r * 0.45, char_mat())] if crater else [])
    for k, (rr, m) in enumerate(layers):
        bm = bmesh.new()
        vs = []
        n = 16
        for i in range(n):
            a = 2 * math.pi * i / n
            q = rr * rng.uniform(0.6, 1.15)
            vs.append(bm.verts.new((x + q * math.cos(a), y + q * math.sin(a), z + 0.002 + 0.002 * k)))
        bm.faces.new(vs)
        me = bpy.data.meshes.new("scorch")
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("scorch", me)
        bpy.context.collection.objects.link(ob)
        me.materials.append(m)


# ---------------------------------------------------------------- the stages


def wreck(damage, footprint, side=(1.0, 0.35), seed=7, stub=7.0, frag=18.0, flat=False, rubble=1.0, rock=1.0, keep_low=0.0):
    """Adds stage `damage` (1..3) to the scene. footprint (w, d) tiles; side: the (u, v) direction of the half that
    collapses at stage 2; stub / frag: art px of the stage-3 stubs / tallest corner fragments; flat: an apron piece
    (craters and burnt marks); rubble / rock: scale the amount / lump size of debris; keep_low: art px under which
    nothing is broken (aprons, pads, decks)."""
    kit.sink_ground_plate(footprint)  # the ground is z = 0 from here on (render() does not sink twice)
    bpy.context.view_layer.update()  # matrix_world of freshly placed objects (rods) is stale until the layer updates
    rng = random.Random(seed * 31 + damage)
    w, d = footprint
    charm = char_mat()
    floor = zp(max(1.2, keep_low))
    parts = _structure(floor + zp(1.0))
    top = max((hi.z for _, _, hi in parts), default=zp(10))
    # Blender x = v, y = u.
    su, sv = side
    n_ = math.hypot(su, sv)
    su, sv = su / n_, sv / n_
    span = abs(su) * w + abs(sv) * d
    off = rng.uniform(0, 100)

    def nz(x, y, f):
        return noise.noise(Vector((x * f + off, y * f - off, off * 0.5)))

    def s_of(x, y):  # -0.5 .. 0.5 across the plot along the collapse direction
        return ((y - w / 2) * su + (x - d / 2) * sv) / span

    fr0 = min(w, d) / 3
    frags = [(rng.uniform(0.1, d - 0.1), rng.uniform(0.1, w - 0.1), rng.uniform(0.18, 0.35) * fr0) for _ in range(3)]

    def low(x, y, scale=1.0):
        h = zp(stub * scale) * (0.35 + 0.65 * (0.5 + 0.5 * nz(x, y, 3.1))) + zp(stub * 0.35) * (0.5 + 0.5 * nz(x, y, 11))
        for fx, fy, fr in frags:
            dd = math.hypot(x - fx, y - fy)
            if dd < fr:
                h = max(h, zp(frag * scale) * (1 - dd / fr) ** 0.7 * (0.75 + 0.25 * nz(x, y, 9)))
        return floor + h

    if damage == 1:
        chips = []
        for ob, lo, hi in parts:
            if hi.z > floor + (top - floor) * 0.35 and rng.random() < 0.5:
                # Tall thin shells (cooling towers) only get small rim chips at d1, so they never read as torn (d2).
                rr = (0.04, 0.07) if hi.z - lo.z > zp(60) else (0.08, 0.16)
                chips.append((rng.uniform(lo.x, hi.x), rng.uniform(lo.y, hi.y), hi.z, rng.uniform(*rr)))

        def field(x, y):
            best = None
            for cx, cy, cz, cr in chips:
                dd = math.hypot(x - cx, y - cy)
                if dd < cr:
                    h = cz - zp(2.5 + 3 * (1 - dd / cr)) * (0.7 + 0.3 * nz(x, y, 20))
                    best = h if best is None else min(best, h)
            return best
    elif damage == 2:
        def field(x, y):
            s = s_of(x, y)
            b = 0.02 + 0.09 * nz(x, y, 1.6) + 0.04 * nz(x, y, 6)
            if s < b:
                return None
            t = (s - b) / 0.22  # 0 at the break, 1 well inside the collapsed half
            ramp = max(0.0, 1 - t) ** 1.3
            jag = 0.55 + 0.45 * (0.5 + 0.5 * nz(x, y, 7.5))
            return low(x, y, 1.4) + (top - floor) * ramp * jag * 0.85
    else:
        def field(x, y):
            return low(x, y)

    tops = []
    kept = []
    for ob, lo, hi in parts:
        c = (lo + hi) / 2
        h = field(c.x, c.y)
        if h is not None and damage >= 2:
            # Parts floating above the break fell: removed (their debris is the rubble), not squashed flat.
            if lo.z > h + zp(1.5):
                bpy.data.objects.remove(ob, do_unlink=True)
                continue
            # thin masts / rods / rails in the collapse: mostly snapped
            if (hi.x - lo.x) < 0.06 and (hi.y - lo.y) < 0.06 and hi.z - lo.z > zp(6) and rng.random() < 0.7:
                bpy.data.objects.remove(ob, do_unlink=True)
                continue
        tops += _clamp(ob, field, charm)
        kept.append((ob, lo, hi))
    bpy.context.view_layer.update()

    soot_materials((0.0, 0.35, 0.6, 0.85)[damage], seed)

    area = w * d
    big = max(1.0, min(w, d) / 4)
    # Scorched ground / craters (before the rubble, so the rubble lies on them).
    nmarks = (0, 2, 4, 6)[damage] * max(1, int(area / 12))
    for _ in range(nmarks):
        x, y = rng.uniform(0.3, d - 0.3), rng.uniform(0.3, w - 0.3)
        _scorch(rng, x, y, rng.uniform(0.25, 0.5) * (1.4 if flat else 1.0) * big, crater=flat and rng.random() < 0.6)
    bpy.context.view_layer.update()

    # Debris made of what broke: the most common materials among the tall parts, plus char and grey concrete dust.
    count = {}
    for ob, lo, hi in kept:
        for m in ob.data.materials:
            if m and m != charm and not m.name.startswith("holdout"):
                count[m.name] = count.get(m.name, 0) + (hi.z - lo.z) * max(0.05, (hi.x - lo.x) * (hi.y - lo.y))
    common = [bpy.data.materials[n] for n, _ in sorted(count.items(), key=lambda kv: -kv[1])[:4]]
    debris = common + [charm, mat("#7b776e", 0.95, grain=0.3, scale=30)]

    pts = []
    size = 0.045 * rock * big ** 0.5
    if damage == 1:
        for _ in range(int(6 * rubble * max(1, area / 9))):
            pts.append((rng.uniform(0, d), rng.uniform(0, w), size * rng.uniform(0.4, 1.0)))
    else:
        dens = (0, 0, 22, 34)[damage] * rubble
        for _ in range(int(dens * area)):
            x, y = rng.uniform(0.02, d - 0.02), rng.uniform(0.02, w - 0.02)
            if damage == 2 and s_of(x, y) < -0.05 + 0.1 * rng.random() and rng.random() > 0.12:
                continue
            pts.append((x, y, size * rng.uniform(0.5, 1.6)))
        for _ in range(int((3 if damage == 2 else 6) * max(1, area / 9))):  # heaps: denser clusters
            cx, cy = rng.uniform(0.2, d - 0.2), rng.uniform(0.2, w - 0.2)
            if damage == 2 and s_of(cx, cy) < 0.05:
                continue
            rr = rng.uniform(0.2, 0.45) * big
            for _ in range(int(40 * rubble)):
                a, q = rng.uniform(0, 2 * math.pi), rr * math.sqrt(rng.random())
                pts.append((cx + q * math.cos(a), cy + q * math.sin(a), size * rng.uniform(0.6, 1.8)))
    pts = [p for p in pts if 0 < p[0] < d and 0 < p[1] < w]
    _rubble(pts, debris, rng)
    if damage >= 2:  # a second layer falling on the first: heaped rubble
        bpy.context.view_layer.update()
        _rubble([(x + rng.uniform(-0.03, 0.03), y + rng.uniform(-0.03, 0.03), s * 0.8) for x, y, s in pts[::2]], debris, rng)

    # Charred beams and rebar sticking out of the break.
    if damage >= 2:
        rb = rebar_mat()
        tall = [p for p in tops if p.z > floor + zp(2)]
        for _ in range(min(len(tall), 26 if damage == 2 else 34)):
            p = rng.choice(tall)
            a = rng.uniform(0, 2 * math.pi)
            ln = rng.uniform(0.04, 0.11)
            _rod((p.x, p.y, p.z - zp(1)), (p.x + ln * math.cos(a), p.y + ln * math.sin(a), p.z + zp(rng.uniform(2, 6))), 0.006, rb, 4)
        bpy.context.view_layer.update()
        for _ in range(8 if damage == 2 else 12):
            x, y = rng.uniform(0.2, d - 0.2), rng.uniform(0.2, w - 0.2)
            if damage == 2 and s_of(x, y) < 0.0:
                continue
            z = _ground_at(x, y)
            if z is None:
                continue
            a = rng.uniform(0, 2 * math.pi)
            ln = rng.uniform(0.3, 0.7) * big
            _rod((x, y, z), (x + ln * math.cos(a), y + ln * math.sin(a), z + zp(rng.uniform(3, 9))), 0.022, charm, 6)
    bpy.context.view_layer.update()
