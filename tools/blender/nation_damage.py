"""
Damage stages for the contested-nation capitals (ART_GUIDE "Trang thai hu hai / Damage states").

Every *_capital_render.py builds its intact palace, then calls apply(stage) on the finished scene and renders
building-nation-<name>[-d1|-d2|-d3] with the same camera and origin:

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/cuba_capital_render.py -- 0 1 2 3

  d1 (<= 80 % HP): scorch blooms, broken panes with soot streaks, chipped parapet / cornice pieces, a few rubble chunks.
  d2 (<= 50 % HP): the +u half (right on screen) blown open and collapsed: its roof gone, a jagged stepped break
                   through the massing with charred cut faces, protruding floor slabs, rebar and charred beams, low wall
                   stubs and a rubble mound over the fallen half; the -u half stands with d1-level damage.
  d3 (<= 20 % HP): completely collapsed: everything cut to low wall stubs and column bases, a few taller broken corner
                   fragments, a rubble field over the whole footprint, charred beams and scorched paving.

Works generically on the scene: no boolean modifiers (open shells break them) -- meshes are bisected and their holes
capped with a charred material, or deleted. The two flag poles on the front edge are never touched (the flags are
drawn by NationCapital.ts on them).
Axes: kit._obj puts u on Blender y and v on Blender x; z is BU (kit.zp converts art px).
"""
import math
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit
from kit import mat, zp

GROUND = 3.0  # art px: top of the plaza paving
POLES = ((0.15, 2.25), (3.85, 2.25))


def stages():
    """Damage stages named after '--' on the command line (default: all four)."""
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    st = [int(a.lstrip("d")) for a in args if a.lstrip("d").isdigit()]
    return st or [0, 1, 2, 3]


def suffix(stage):
    return f"-d{stage}" if stage else ""


# ---------------------------------------------------------------- materials

_M = {}


def _char():
    return mat("#1c1713", 0.95, grain=0.45, scale=60)


def _broken():
    """Exposed core of a broken wall / slab: dark, sooty concrete (not pitch black)."""
    return mat("#4e4943", 0.95, grain=0.35, scale=45)


def _soot(strength):
    key = f"soot{strength}"
    m = _M.get(key)
    try:
        if m is not None and bpy.data.materials.get(m.name) == m:
            return m
    except ReferenceError:
        pass
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = kit.srgb("#15110e")
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
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (strength, strength, strength, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
    _M[key] = m
    return m


def _is_glass(m):
    try:
        b = m.node_tree.nodes["Principled BSDF"]
        return abs(b.inputs["Specular IOR Level"].default_value - 0.9) < 1e-3 and b.inputs["Roughness"].default_value < 0.1
    except (AttributeError, KeyError):
        return False


# ---------------------------------------------------------------- scene helpers


def _mw(ob):
    """World matrix from the object's own loc/rot/scale (matrix_world is stale for freshly rotated rods)."""
    return ob.matrix_basis if ob.parent is None else ob.matrix_world


def _bounds(ob):
    bb = [_mw(ob) @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb)))
    hi = Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb)))
    return lo, hi


def _is_pole(lo, hi):
    for u, v in POLES:
        if abs((lo.y + hi.y) / 2 - u) < 0.06 and abs((lo.x + hi.x) / 2 - v) < 0.06 and hi.y - lo.y < 0.1:
            return True
    return False


def _structure():
    """Mesh objects standing above the paving, flag poles excluded; transforms baked into the mesh."""
    out = []
    for ob in list(bpy.context.scene.objects):
        if ob.type in ("CURVE", "SURFACE", "META", "FONT"):  # dome ribs etc.: make them cuttable meshes
            me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            mo = bpy.data.objects.new(ob.name + "_m", me)
            mo.matrix_basis = _mw(ob).copy()
            bpy.context.collection.objects.link(mo)
            _remove(ob)
            ob = mo
        if ob.type != "MESH":
            continue
        lo, hi = _bounds(ob)
        if hi.z <= zp(GROUND + 0.12) or _is_pole(lo, hi):
            continue
        if ob.data.users > 1:
            ob.data = ob.data.copy()
        ob.data.transform(_mw(ob))
        ob.matrix_basis = Matrix.Identity(4)
        out.append(ob)
    return out


def _main_materials(objs):
    """The palace's own stone / render colours (most used by volume): its rubble is made of them."""
    vol = {}
    for ob in objs:
        if not ob.data.materials or _is_glass(ob.data.materials[0]):
            continue
        lo, hi = _bounds(ob)
        v = (hi.x - lo.x) * (hi.y - lo.y) * (hi.z - lo.z)
        m = ob.data.materials[0]
        vol[m] = vol.get(m, 0) + v
    top = sorted(vol, key=vol.get, reverse=True)[:3]
    return top or [mat("#bdb6a6", 0.9)]


def _remove(ob):
    bpy.data.objects.remove(ob, do_unlink=True)


def _cut(ob, co, no, rng, jag=0.0):
    """Bisects ob, dropping the part on the +no side; the opening is capped with the charred material (when the
    mesh was closed) and the new edge is made ragged by jittering its vertices by up to `jag` BU.
    Returns False when nothing is left."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    closed = all(e.is_manifold for e in bm.edges) and len(bm.edges) > 0
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=co, plane_no=no, clear_outer=True)
    if not bm.faces:
        bm.free()
        _remove(ob)
        return False
    cut_verts = [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMVert)]
    if closed and cut_verts:
        edges = [e for e in bm.edges if e.is_boundary]
        if edges:
            fill = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            faces = fill["faces"]
            if faces:
                tri = bmesh.ops.triangulate(bm, faces=faces)
                cm = _broken()
                if cm.name not in [m.name for m in ob.data.materials]:
                    ob.data.materials.append(cm)
                idx = [m.name for m in ob.data.materials].index(cm.name)
                for f in tri["faces"]:
                    f.material_index = idx
    if jag > 0:
        n = Vector(no).normalized()
        for v in cut_verts:
            if v.is_valid:
                v.co -= n * rng.uniform(0, jag)
                v.co.z -= rng.uniform(0, jag * 0.5)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()
    return True


def _keep_below(ob, z, rng, jag=0.0):
    lo, hi = _bounds(ob)
    if lo.z >= z:
        _remove(ob)
        return False
    if hi.z <= z:
        return True
    return _cut(ob, (0, 0, z), (0, 0, 1), rng, jag)


def _uv(u, v, z):
    return (u, v, z)  # kit.rod takes (u, v, z) and swaps to Blender itself


def rock(rng, u, v, zpx, size, m):
    """Faceted rubble chunk resting on zpx (art px), size in tiles."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sx, sy = size * rng.uniform(0.6, 1.4), size * rng.uniform(0.6, 1.4)
    sz = zp(size * rng.uniform(22, 40))
    a = rng.uniform(0, math.pi)
    ca, sa = math.cos(a), math.sin(a)
    base = zp(zpx)
    for vert in bm.verts:
        j = rng.uniform(0.75, 1.2)
        x, y, zz = vert.co.x * j * sx, vert.co.y * j * sy, vert.co.z * j
        vert.co.x = v + x * ca - y * sa
        vert.co.y = u + x * sa + y * ca
        vert.co.z = base + (max(zz, -0.3) + 0.3) * sz * 0.75
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("rubble")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("rubble", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(m)
    return ob


def mound(rng, u0, v0, u1, v1, count, heap, mats, size=0.05):
    """Rubble heaped over a rectangle, highest in the middle (heap in art px)."""
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    for _ in range(count):
        u, v = rng.uniform(u0, u1), rng.uniform(v0, v1)
        t = max(0.0, 1 - max(abs(u - cu) / ((u1 - u0) / 2 + 1e-6), abs(v - cv) / ((v1 - v0) / 2 + 1e-6)) ** 2)
        rock(rng, u, v, GROUND + t * heap * rng.uniform(0.4, 1.0), rng.uniform(size * 0.4, size * 1.5), rng.choice(mats))


def beam(rng, u, v, zpx, length, m, r=0.011):
    a = rng.uniform(0, 2 * math.pi)
    tilt = rng.uniform(-0.6, 0.9)
    du, dv = math.cos(a) * length / 2, math.sin(a) * length / 2
    kit.rod(_uv(u - du, v - dv, zp(zpx)), _uv(u + du, v + dv, zp(zpx + tilt * length * 30)), r, m, 6)


def scorch(rng, u, v, r, zpx=GROUND + 0.06, strength=0.9):
    bm = bmesh.new()
    vs = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        rr = r * rng.uniform(0.55, 1.15)
        vs.append(bm.verts.new((v + rr * math.sin(a), u + rr * math.cos(a), zp(zpx))))
    bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.faces[0].normal.z < 0:
        bm.faces[0].normal_flip()
    me = bpy.data.meshes.new("scorch")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("scorch", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(_soot(strength))


def _streak(lo, hi, up, rng, strength=0.8):
    """Soot streak rising from a pane / break on the visible faces (+v front = Blender +x, +u side = +y)."""
    h = hi.z - lo.z
    bm = bmesh.new()
    if hi.x - lo.x < hi.y - lo.y:  # thin in x: pane on the +v front
        xs, wy = hi.x + 0.004, hi.y - lo.y
        pts = [(xs, lo.y - wy * 0.1, hi.z - h * 0.3), (xs, hi.y + wy * 0.1, hi.z - h * 0.3),
               (xs, hi.y + wy * 0.4, hi.z + up), (xs, lo.y - wy * 0.4, hi.z + up)]
    else:
        ys, wx = hi.y + 0.004, hi.x - lo.x
        pts = [(lo.x - wx * 0.1, ys, hi.z - h * 0.3), (hi.x + wx * 0.1, ys, hi.z - h * 0.3),
               (hi.x + wx * 0.4, ys, hi.z + up), (lo.x - wx * 0.4, ys, hi.z + up)]
    bm.faces.new([bm.verts.new(p) for p in pts])
    me = bpy.data.meshes.new("soot")
    bm.to_mesh(me)
    bm.free()
    so = bpy.data.objects.new("soot", me)
    bpy.context.collection.objects.link(so)
    me.materials.append(_soot(strength))


def _break_panes(objs, frac, rng):
    hole = mat("#0d0b0a", 0.95, grain=0.3, scale=40)
    for ob in sorted(objs, key=lambda o: o.name):
        if not ob.data.materials or not _is_glass(ob.data.materials[0]) or rng.random() >= frac:
            continue
        ob.data.materials[0] = hole
        lo, hi = _bounds(ob)
        if hi.z - lo.z > 1e-4 and min(hi.x - lo.x, hi.y - lo.y) < 0.02:
            _streak(lo, hi, (hi.z - lo.z) * rng.uniform(0.8, 2.0), rng, rng.uniform(0.6, 0.9))


# ---------------------------------------------------------------- stages


def apply(stage, seed=7):
    """Turns the finished intact palace in the scene into damage stage 1..3 (0: leaves it intact)."""
    if not stage:
        return
    rng = random.Random(seed * 10 + stage)
    bpy.context.view_layer.update()  # rods carry a fresh rotation: matrix_world is stale until updated
    objs = _structure()
    if not objs:
        return
    names = {o.name for o in objs}  # before the damage removes some of them
    stone = _main_materials(objs)
    char = _char()
    grey = mat("#8a857b", 0.95, grain=0.25, scale=30)
    brown = mat("#6d6458", 0.95, grain=0.3, scale=30)
    dust = mat("#9a9284", 0.97, grain=0.3, scale=30)
    rub = stone + [grey, grey, brown, brown, dust, dust, char]
    bl = [_bounds(o) for o in objs]
    U0 = min(lo.y for lo, _ in bl)
    U1 = max(hi.y for _, hi in bl)
    V0 = min(lo.x for lo, _ in bl)
    V1 = max(hi.x for _, hi in bl)
    tops = sorted(hi.z for lo, hi in bl if (hi.y - lo.y) * (hi.x - lo.x) > 0.15)
    TOP = (tops[len(tops) // 2] if tops else max(hi.z for _, hi in bl)) / zp(1)  # main massing height, art px
    TOP = max(TOP, 12.0)

    if stage == 1:
        _light(objs, rng, rub, U0, U1, V0, V1, TOP, 0.6)
    elif stage == 2:
        _half(objs, rng, rub, char, grey, U0, U1, V0, V1, TOP)
    else:
        _flat(objs, rng, rub, char, U0, U1, V0, V1, TOP)
    _sweep(stage, U0, U1, TOP, names)


def _sweep(stage, U0, U1, TOP, original=frozenset()):
    """Last pass on world bounds: nothing may float over the fallen part (dome ribs, finials, lantern rods)."""
    bpy.context.view_layer.update()
    UC = (U0 + U1) / 2
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH":
            continue
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        lo = Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb)))
        hi = Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb)))
        if _is_pole(lo, hi):
            continue
        if stage == 3 and lo.z > zp(GROUND + 20):
            _remove(ob)
        # Thin leftovers of the palace (window frames, mullions, bars) over the fallen part read as wire mesh on the
        # rubble: gone everywhere at stage 3, over the collapsed half at stage 2.
        elif ob.name in original and min(hi.x - lo.x, hi.y - lo.y) < 0.03                 and (stage == 3 or (stage == 2 and (lo.y + hi.y) / 2 > UC - 0.15 * (U1 - U0))):
            _remove(ob)
        elif stage == 2 and lo.z > zp(TOP * 0.8) and (lo.y + hi.y) / 2 > UC - 0.15 * (U1 - U0)                 and max(hi.x - lo.x, hi.y - lo.y) < 0.08:
            _remove(ob)


def _light(objs, rng, rub, U0, U1, V0, V1, TOP, panes, u_max=None):
    """d1 damage (also the standing half of d2): blast chips knocked off the roof line and cornices of the visible
    faces, broken panes, soot, a few rubble chunks and scorch marks."""
    u_max = U1 if u_max is None else u_max
    hits = []
    for _ in range(10):
        face = rng.random() < 0.6
        u = rng.uniform(U0 + 0.2, u_max - 0.15) if face else u_max - 0.02
        v = V1 if face else rng.uniform(V0 + 0.1, V1 - 0.1)
        hits.append((u, v, zp(TOP * rng.uniform(0.7, 1.05)), 0.34))
    alive = []
    for ob in objs:
        lo, hi = _bounds(ob)
        c = (lo + hi) / 2
        small = (hi.x - lo.x) * (hi.y - lo.y) * (hi.z - lo.z) < 0.004
        hit = any((c.y - u) ** 2 + (c.x - v) ** 2 < r * r and abs(c.z - z) < zp(10) for u, v, z, r in hits)
        if small and hit and c.y <= u_max:
            _remove(ob)
        else:
            alive.append(ob)
    _break_panes([o for o in alive if _bounds(o)[1].y <= u_max + 0.01], panes, rng)
    for u, v, z, _ in hits:
        _streak(Vector((v - 0.08, u - 0.08, z - zp(6))), Vector((v + 0.002, u + 0.002, z)), zp(rng.uniform(10, 18)), rng, 0.95) \
            if abs(v - V1) < 1e-3 else _streak(Vector((v - 0.08, u - 0.002, z - zp(6))), Vector((v + 0.08, u + 0.002, z)), zp(8), rng, 0.85)
        gu, gv = min(u + 0.06, U1 + 0.05), min(v + 0.08, V1 + 0.12)
        for _ in range(5):
            rock(rng, gu + rng.uniform(-0.1, 0.1), gv + rng.uniform(-0.05, 0.08), GROUND, rng.uniform(0.02, 0.045), rng.choice(rub))
        scorch(rng, gu, gv, 0.16, strength=0.85)


def _half(objs, rng, rub, char, grey, U0, U1, V0, V1, TOP):
    """d2: the +u half collapsed behind a stepped, ragged break; the -u half stands, lightly damaged."""
    W = U1 - U0
    UC = U0 + W * 0.5
    top_bu = zp(TOP)
    # Break plane: at the ground it lies at UC + 0.12 W, at the main roof line UC - 0.1 W (upper floors fell further).
    s = (0.06 * W) / top_bu

    def plane(jit):
        return (0, UC + 0.12 * W + jit, 0), (0, 1, s)  # Blender (x=v, y=u, z)

    stubs = []
    for ob in objs:
        lo, hi = _bounds(ob)
        if hi.y < UC - 0.12 * W - 0.05 and True:
            continue  # wholly in the standing half
        # Wall stubs of the fallen half: a copy kept below a low ragged line on the far side of the break.
        if hi.y > UC and (hi.y - lo.y) * (hi.x - lo.x) > 0.0004 and rng.random() < 0.85:
            dup = ob.copy()
            dup.data = ob.data.copy()
            bpy.context.collection.objects.link(dup)
            stubs.append(dup)
        co, no = plane(rng.uniform(-0.05, 0.05))
        _cut(ob, co, no, rng, jag=0.04)
    for dup in stubs:
        co, no = plane(rng.uniform(-0.05, 0.05))
        if not _cut(dup, co, (0, -no[1], -no[2]), rng):  # keep only the fallen side ...
            continue
        _keep_below(dup, zp(GROUND + rng.uniform(1.5, 7.5)), rng, jag=zp(2.0))  # ... as a low stub
    ids = set()
    for o in objs:
        try:
            ids.add(o.name)
        except ReferenceError:
            pass
    standing = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name in ids]
    _light(standing, rng, rub, U0, U1, V0, V1, TOP, 0.55, u_max=UC)
    # Floors and beams sticking out of the break; rebar from the cut slabs.
    levels = [GROUND + k * 9.0 for k in range(1, int((TOP - GROUND) / 9.0) + 1)]
    for z in levels:
        ub = UC + 0.12 * W - (zp(z) * s)
        for k in range(3):
            v0 = V0 + (V1 - V0) * k / 3 + 0.03
            vw = (V1 - V0) / 3 - 0.06
            reach = rng.uniform(0.03, 0.09)
            sag = rng.uniform(0.0, 1.5)
            m = grey
            bm = bmesh.new()
            q = [(ub - 0.06, z), (ub + reach, z - sag)]
            for (uu, zz), dz in ((q[0], 0), (q[1], 0)):
                pass
            pts = [(v0, ub - 0.06, zp(z)), (v0 + vw, ub - 0.06, zp(z)), (v0 + vw, ub + reach, zp(z - sag)), (v0, ub + reach, zp(z - sag))]
            top = [bm.verts.new(p) for p in pts]
            bot = [bm.verts.new((p[0], p[1], p[2] - zp(0.8))) for p in pts]
            bm.faces.new(top)
            bm.faces.new(list(reversed(bot)))
            for i in range(4):
                j = (i + 1) % 4
                bm.faces.new((bot[i], bot[j], top[j], top[i]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            me = bpy.data.meshes.new("slab")
            bm.to_mesh(me)
            bm.free()
            so = bpy.data.objects.new("slab", me)
            bpy.context.collection.objects.link(so)
            me.materials.append(m)
            for _ in range(3):
                vv = rng.uniform(v0, v0 + vw)
                kit.rod(_uv(ub + reach - 0.01, vv, zp(z - sag - 0.4)),
                        _uv(ub + reach + rng.uniform(0.03, 0.08), vv + rng.uniform(-0.03, 0.03), zp(z - sag - rng.uniform(-1.5, 3))),
                        0.0035, mat("#4a3a2e", 0.7, metal=0.5, grain=0.2), 4)
    # The fallen half: rubble mound, charred beams, scorch.
    mound(rng, UC - 0.05 * W, V0 - 0.05, U1 + 0.08, V1 + 0.1, int(260 * W * (V1 - V0)), min(14.0, TOP * 0.25), rub, 0.05)
    for _ in range(int(14 * W)):
        beam(rng, rng.uniform(UC, U1), rng.uniform(V0, V1), GROUND + rng.uniform(2, TOP * 0.25), rng.uniform(0.12, 0.3), char)
    for _ in range(5):
        scorch(rng, rng.uniform(UC, U1 + 0.1), rng.uniform(V0, V1 + 0.15), rng.uniform(0.15, 0.3))


def _flat(objs, rng, rub, char, U0, U1, V0, V1, TOP):
    """d3: collapsed to stubs under a rubble field; a few broken corner fragments stand taller."""
    corners = [(U0, V1), (U0, V0), (U1, V0)]  # the front-left, back corners (front-right is hidden by rubble)
    for ob in objs:
        lo, hi = _bounds(ob)
        c = (lo + hi) / 2
        near = min((c.y - u) ** 2 + (c.x - v) ** 2 for u, v in corners) < 0.18 ** 2
        z = GROUND + (rng.uniform(9, 18) if near else rng.uniform(1.0, 6.0))
        if (hi.y - lo.y) * (hi.x - lo.x) < 0.0006 and not near and rng.random() < 0.6:
            _remove(ob)  # balusters, mullions, small ornaments: gone
            continue
        if _keep_below(ob, zp(z), rng, jag=zp(2.5)):
            nl, nh = _bounds(ob)
            if nh.z - nl.z > zp(4):
                pass
    W, Dd = U1 - U0, V1 - V0
    mound(rng, U0 - 0.06, V0 - 0.06, U1 + 0.08, V1 + 0.12, int(330 * W * Dd), max(8.0, TOP * 0.18), rub, 0.06)
    for _ in range(int(18 * W)):
        beam(rng, rng.uniform(U0, U1), rng.uniform(V0, V1), GROUND + rng.uniform(2, 7), rng.uniform(0.12, 0.35), char)
    for _ in range(8):
        scorch(rng, rng.uniform(U0 - 0.1, U1 + 0.1), rng.uniform(V0, V1 + 0.2), rng.uniform(0.18, 0.35))
