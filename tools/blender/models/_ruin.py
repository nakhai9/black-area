"""Generic damage stages for a finished building scene (capital_russia, capital_china, capitals.py).

Called just before kit.render with the stage and a spec of the design's masses, it damages what is already in the
scene, in plot units (u, v tiles) and art px (z):
- 1 (80 % HP or less): chipped parapets / cornices (small blast voids), broken panes with soot streaks above them,
  soot blooms on the walls, a few rubble chunks and scorch marks on the ground.
- 2 (50 % or less): HALF the building gone — everything on the +u side of a ragged break line is cut down to a
  ragged heightfield (high at the break, low stubs further out), so the break shows a jagged cliff through floors;
  broken floor slabs and charred beams / rebar jut from it, rubble mounds lie over the collapsed half; the -u half
  stands with stage-1 damage.
- 3 (20 % or less): completely collapsed — everything cut down to low ragged wall stubs (a few broken corner
  fragments left standing as peaks), rubble mounds over every mass, charred beams, scorched ground.
The cut is a closed heightfield mesh (Boolean difference, EXACT; the cut faces take the charred material). Objects
wholly above it are deleted, thin pieces and open shells (which cannot be cut cleanly) are kept or deleted by their
centre — never cut — so no coplanar / inside-out faces appear.

Spec keys: ground (paving top px), top (highest px), blocks [("box", u0, v0, u1, v1, top) | ("cyl", cu, cv, r, top)],
split (u of the stage-2 break), frags [(u, v, radius, height px)] for stage 3, mount (u, v, z px of the flag block at
stage 3) or None, mount2 (same for stage 2) or None, debris [materials], glass [materials], seed.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

from kit import mat, rod, zp, srgb

_C = {}


def _alive(m):
    try:
        return m is not None and m.name in bpy.data.materials and bpy.data.materials[m.name] == m
    except ReferenceError:
        return False


def char_mat():
    m = _C.get("char")
    if not _alive(m):
        m = _C["char"] = mat("#1d1814", 0.95, grain=0.45, scale=60)
    return m


def dust_mat():
    """Broken-masonry / ash surface left where the field cut slices a mass (reads as rubble, not a black void)."""
    m = _C.get("dust")
    if not _alive(m):
        m = _C["dust"] = mat("#5f564c", 0.95, grain=0.6, scale=45)
    return m


def broken_mat():
    m = _C.get("broken")
    if not _alive(m):
        m = _C["broken"] = mat("#0d0c0b", 0.9, grain=0.2, scale=40)
    return m


def soot_mat(strength=0.75):
    """Soot film whose alpha is broken up by stretched noise, so it fades into streaks."""
    key = f"soot{strength}"
    m = _C.get(key)
    if _alive(m):
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb("#16120f")
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
    _C[key] = m
    return m


# ---------------------------------------------------------------- noise


class Noise:
    def __init__(self, seed):
        self.seed = seed

    def _h(self, i, j, k):
        x = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (self.seed * 2654435761)
        x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
        return ((x ^ (x >> 16)) & 0xFFFF) / 65535.0

    def __call__(self, u, v, scale, k=0):
        x, y = u / scale, v / scale
        i, j = math.floor(x), math.floor(y)
        fx, fy = x - i, y - j
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a, b = self._h(i, j, k), self._h(i + 1, j, k)
        c, d = self._h(i, j + 1, k), self._h(i + 1, j + 1, k)
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy


# ---------------------------------------------------------------- helpers (plot units, px)


def _new(name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(m)
    return ob


def P(u, v, z):
    """Plot point → Blender world (x = v, y = u)."""
    return (v, u, zp(z))


def bounds(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb))),
            Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb))))


def closed(ob):
    if ob.type != "MESH":
        return False
    if any(m.type == "SOLIDIFY" for m in ob.modifiers):
        return True  # a sheet thickened by Solidify is closed once evaluated: Boolean it like a solid
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    ok = len(bm.edges) > 0 and all(e.is_manifold for e in bm.edges)
    bm.free()
    return ok


def rock(rng, u, v, z, size, m):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    su, sv = size * rng.uniform(0.7, 1.3), size * rng.uniform(0.7, 1.3)
    sz = size * rng.uniform(30, 55)
    for vert in bm.verts:
        j = rng.uniform(0.75, 1.2)
        x, y, zz = vert.co.x * j, vert.co.y * j, vert.co.z * j
        vert.co.x = v + y * sv
        vert.co.y = u + x * su
        vert.co.z = zp(z + (max(zz, -0.3) + 0.3) * sz * 0.7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new("rubble", bm, m)


def pile(rng, u, v, z, radius, count, mats, size=0.05, heap=4.0):
    for _ in range(count):
        a = rng.uniform(0, 2 * math.pi)
        r = radius * math.sqrt(rng.random())
        hz = (1 - r / radius) * heap
        rock(rng, u + r * math.cos(a), v + r * math.sin(a), z + rng.uniform(0, hz), rng.uniform(size * 0.5, size * 1.6), rng.choice(mats))


def scorch(rng, u, v, r, z):
    bm = bmesh.new()
    vs = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        rr = r * rng.uniform(0.55, 1.15)
        vs.append(bm.verts.new(P(u + rr * math.cos(a), v + rr * math.sin(a), z)))
    bm.faces.new(vs)
    _new("scorch", bm, soot_mat(0.9))


def face_patch(face, s0, s1, z0, z1, plane, m, off=0.006):
    """Quad on a +v face (face "v": plane = v, s along u) or a +u face (face "u": plane = u, s along v)."""
    bm = bmesh.new()
    if face == "v":
        pts = [P(s0, plane + off, z0), P(s1, plane + off, z0), P(s1 + (s1 - s0) * 0.15, plane + off, z1), P(s0 - (s1 - s0) * 0.15, plane + off, z1)]
    else:
        pts = [P(plane + off, s0, z0), P(plane + off, s1, z0), P(plane + off, s1 + (s1 - s0) * 0.15, z1), P(plane + off, s0 - (s1 - s0) * 0.15, z1)]
    bm.faces.new([bm.verts.new(p) for p in pts])
    return _new("soot", bm, m)


def arc_patch(cu, cv, r, a0, a1, z0, z1, m, n=6):
    bm = bmesh.new()
    lo = [bm.verts.new(P(cu + r * math.cos(a0 + (a1 - a0) * k / n), cv + r * math.sin(a0 + (a1 - a0) * k / n), z0)) for k in range(n + 1)]
    hi = [bm.verts.new(P(cu + r * math.cos(a0 + (a1 - a0) * k / n), cv + r * math.sin(a0 + (a1 - a0) * k / n), z1)) for k in range(n + 1)]
    for k in range(n):
        bm.faces.new((lo[k], lo[k + 1], hi[k + 1], hi[k]))
    return _new("soot", bm, m)


def ellipsoid(u, v, z, ru, rv, rz, seed):
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for vert in bm.verts:
        n = vert.co.normalized()
        k = 1 + rng.uniform(-0.2, 0.2) + 0.15 * math.sin(7 * n.x + 3 * n.y) * math.cos(5 * n.z)
        vert.co = Vector(P(u + n.y * ru * k, v + n.x * rv * k, z + n.z * rz * k))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _new("cutter", bm, char_mat())
    ob.hide_render = True
    return ob


def _boolean(ob, cutter):
    mod = ob.modifiers.new("blast", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "TRANSFER"


def _small(lo, hi):
    return max(hi.x - lo.x, hi.y - lo.y) < 0.1 and hi.z - lo.z < zp(6)


def chip_cuts(cutters, ground_z, protect):
    """Ellipsoid blast voids: Boolean the closed meshes they reach; small / open pieces inside are removed."""
    boxes = [(c, *bounds(c)) for c in cutters]
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH" or ob in cutters or ob.name in protect:
            continue
        lo, hi = bounds(ob)
        if hi.z <= ground_z:
            continue
        hits = [(c, a, b) for c, a, b in boxes if lo.x < b.x and hi.x > a.x and lo.y < b.y and hi.y > a.y and lo.z < b.z and hi.z > a.z]
        if not hits:
            continue
        if _small(lo, hi) or not closed(ob):
            mid = (lo + hi) / 2
            for _, a, b in hits:
                c, r = (a + b) / 2, (b - a) / 2 * 0.85
                if sum(((mid[i] - c[i]) / max(r[i], 1e-6)) ** 2 for i in range(3)) <= 1:
                    bpy.data.objects.remove(ob, do_unlink=True)
                    break
            continue
        for c, _, _ in hits:
            _boolean(ob, c)


# ---------------------------------------------------------------- heightfield cut


class Field:
    """Ragged cut surface H(u, v) in px on a lattice of step STEP over the plot (with a margin)."""

    STEP = 0.07

    def __init__(self, W, D, fn):
        self.u0, self.v0 = -0.3, -0.3
        self.nu = int((W + 0.6) / self.STEP) + 2
        self.nv = int((D + 0.6) / self.STEP) + 2
        self.h = [[fn(self.u0 + i * self.STEP, self.v0 + j * self.STEP) for j in range(self.nv)] for i in range(self.nu)]

    def idx(self, u, v):
        return (min(self.nu - 2, max(0, int((u - self.u0) / self.STEP))), min(self.nv - 2, max(0, int((v - self.v0) / self.STEP))))

    def at(self, u, v):
        i, j = self.idx(u, v)
        fu = min(1, max(0, (u - self.u0) / self.STEP - i))
        fv = min(1, max(0, (v - self.v0) / self.STEP - j))
        h = self.h
        return (h[i][j] * (1 - fu) * (1 - fv) + h[i + 1][j] * fu * (1 - fv) + h[i][j + 1] * (1 - fu) * fv + h[i + 1][j + 1] * fu * fv)

    def range(self, u0, v0, u1, v1):
        i0, j0 = self.idx(u0, v0)
        i1, j1 = self.idx(u1, v1)
        vals = [self.h[i][j] for i in range(i0, i1 + 2) for j in range(j0, j1 + 2)]
        return min(vals), max(vals)

    def cutter(self, u0, v0, u1, v1, ztop):
        """Closed block: the field surface over the window, walls, a lid at ztop px."""
        i0, j0 = self.idx(u0, v0)
        i1, j1 = self.idx(u1, v1)
        i1, j1 = min(self.nu - 1, i1 + 2), min(self.nv - 1, j1 + 2)
        bm = bmesh.new()
        bot = {}
        top = {}
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                u, v = self.u0 + i * self.STEP, self.v0 + j * self.STEP
                bot[i, j] = bm.verts.new(P(u, v, self.h[i][j]))
                top[i, j] = bm.verts.new(P(u, v, ztop))
        for i in range(i0, i1):
            for j in range(j0, j1):
                bm.faces.new((bot[i, j], bot[i + 1, j], bot[i + 1, j + 1], bot[i, j + 1]))
                bm.faces.new((top[i, j], top[i, j + 1], top[i + 1, j + 1], top[i + 1, j]))
        ring = [(i, j0) for i in range(i0, i1)] + [(i1, j) for j in range(j0, j1)] + [(i, j1) for i in range(i1, i0, -1)] + [(i0, j) for j in range(j1, j0, -1)]
        for k in range(len(ring)):
            a, b = ring[k], ring[(k + 1) % len(ring)]
            bm.faces.new((bot[a], bot[b], top[b], top[a]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = _new("cutter", bm, dust_mat())
        ob.hide_render = True
        return ob


def field_cut(field, ground, ztop, protect):
    """Cuts every structure piece down to the field (see the module doc)."""
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH" or ob.hide_render or ob.name in protect:
            continue
        lo, hi = bounds(ob)
        if hi.z <= zp(ground + 0.6):
            continue  # paving, joints, water
        u0, v0, u1, v1 = lo.y, lo.x, hi.y, hi.x
        hmin, hmax = field.range(u0, v0, u1, v1)
        if lo.z >= zp(hmax):
            bpy.data.objects.remove(ob, do_unlink=True)
            continue
        if hi.z <= zp(hmin):
            continue
        if _small(lo, hi) or not closed(ob):
            mid = (lo + hi) / 2
            if mid.z > zp(field.at(mid.y, mid.x)):
                bpy.data.objects.remove(ob, do_unlink=True)
            continue
        _boolean(ob, field.cutter(u0, v0, u1, v1, ztop))


# ---------------------------------------------------------------- the stages


def _block_top_at(blocks, u, v):
    best = None
    for b in blocks:
        if b[0] == "box":
            _, u0, v0, u1, v1, t = b
            inside = u0 <= u <= u1 and v0 <= v <= v1
        else:
            _, cu, cv, r, t = b
            inside = (u - cu) ** 2 + (v - cv) ** 2 <= r * r
        if inside:
            best = t if best is None else max(best, t)
    return best


def _block_points(rng, blocks, n_per_tile, cond=lambda u, v: True):
    pts = []
    for b in blocks:
        if b[0] == "box":
            _, u0, v0, u1, v1, t = b
            n = max(1, int((u1 - u0) * (v1 - v0) * n_per_tile))
            for _ in range(n):
                u, v = rng.uniform(u0 + 0.05, u1 - 0.05), rng.uniform(v0 + 0.05, v1 - 0.05)
                if cond(u, v):
                    pts.append((u, v, t))
        else:
            _, cu, cv, r, t = b
            n = max(1, int(math.pi * r * r * n_per_tile))
            for _ in range(n):
                a, rr = rng.uniform(0, 2 * math.pi), r * math.sqrt(rng.random()) * 0.9
                u, v = cu + rr * math.cos(a), cv + rr * math.sin(a)
                if cond(u, v):
                    pts.append((u, v, t))
    return pts


def soot_glass(rng, glass_mats, frac, only=lambda u, v: True):
    """Breaks a share of the thin glass panes (dark) and streaks soot up the wall above them."""
    panes = []
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH" and ob.data.materials and ob.data.materials[0] in glass_mats:
            lo, hi = bounds(ob)
            if min(hi.x - lo.x, hi.y - lo.y) < 0.05 and max(hi.x - lo.x, hi.y - lo.y) < 0.6:
                panes.append(ob)
    panes.sort(key=lambda o: o.name)
    for ob in panes:
        lo, hi = bounds(ob)
        if not only(lo.y, lo.x) or rng.random() >= frac:
            continue
        ob.data.materials[0] = broken_mat()
        h = hi.z - lo.z
        up = h * rng.uniform(1.0, 2.2)
        bm = bmesh.new()
        if hi.x - lo.x < hi.y - lo.y:
            xs, wy = hi.x + 0.006, hi.y - lo.y
            pts = [(xs, lo.y - wy * 0.1, hi.z - h * 0.2), (xs, hi.y + wy * 0.1, hi.z - h * 0.2), (xs, hi.y + wy * 0.35, hi.z + up), (xs, lo.y - wy * 0.35, hi.z + up)]
        else:
            ys, wx = hi.y + 0.006, hi.x - lo.x
            pts = [(lo.x - wx * 0.1, ys, hi.z - h * 0.2), (hi.x + wx * 0.1, ys, hi.z - h * 0.2), (hi.x + wx * 0.35, ys, hi.z + up), (lo.x - wx * 0.35, ys, hi.z + up)]
        bm.faces.new([bm.verts.new(p) for p in pts])
        _new("soot", bm, soot_mat())


def blooms(rng, blocks, n, ground, only=lambda u, v: True, glassy=False):
    """Soot blooms (and blown-out window patches on glass) on the visible faces of the masses."""
    for _ in range(n):
        b = rng.choice(blocks)
        t = b[-1]
        z0 = ground + rng.uniform(0.05, 0.75) * (t - ground)
        z1 = min(t - 1, z0 + rng.uniform(6, 16))
        if z1 <= z0 + 2:
            continue
        m = broken_mat() if glassy and rng.random() < 0.5 else soot_mat(0.75)
        if b[0] == "box":
            _, u0, v0, u1, v1, _ = b
            if rng.random() < 0.55:
                s = rng.uniform(u0 + 0.08, u1 - 0.08)
                if only(s, v1):
                    w = rng.uniform(0.07, 0.18)
                    face_patch("v", s - w, s + w, z0, z1, v1, m, 0.008)
            else:
                s = rng.uniform(v0 + 0.08, v1 - 0.08)
                if only(u1, s):
                    w = rng.uniform(0.07, 0.18)
                    face_patch("u", s - w, s + w, z0, z1, u1, m, 0.008)
        else:
            _, cu, cv, r, _ = b
            a = rng.uniform(0.0, math.pi / 2)
            if only(cu + r * math.cos(a), cv + r * math.sin(a)):
                da = rng.uniform(0.12, 0.3)
                arc_patch(cu, cv, r + 0.012, a - da, a + da, z0, z1, m)


def chips(rng, blocks, n, ground, only=lambda u, v: True, seed=0):
    out = []
    for k in range(n * 4):
        if len(out) >= n:
            break
        b = rng.choice(blocks)
        t = b[-1]
        if b[0] == "box":
            _, u0, v0, u1, v1, _ = b
            if rng.random() < 0.5:
                u, v = rng.uniform(u0 + 0.1, u1 - 0.1), v1
            else:
                u, v = u1, rng.uniform(v0 + 0.1, v1 - 0.1)
        else:
            _, cu, cv, r, _ = b
            a = rng.uniform(0, math.pi / 2)
            u, v = cu + r * math.cos(a), cv + r * math.sin(a)
        if not only(u, v) or t - ground < 6:
            continue
        rz = min(4.0, (t - ground) * 0.2)
        out.append(ellipsoid(u, v, t, rng.uniform(0.07, 0.12), rng.uniform(0.06, 0.1), rz, seed + k))
    return out


def apply(stage, spec, W, D):
    if not stage:
        return
    bpy.context.view_layer.update()  # rods set location / rotation after creation: refresh matrix_world for bounds()
    g, top = spec["ground"], spec["top"]
    blocks = spec["blocks"]
    rng = random.Random(spec.get("seed", 7) * 31 + stage)
    nz = Noise(spec.get("seed", 7))
    charm = char_mat()
    debris = list(spec["debris"]) + [charm]
    protect = set()
    ztop = top + 80

    if stage == 1:
        cuts = chips(rng, blocks, 6, g, seed=100)
        chip_cuts(cuts, zp(g + 0.6), protect)
        soot_glass(rng, spec.get("glass", []), 0.3)
        blooms(rng, blocks, 10, g, glassy=spec.get("glassy", False))
        for b in blocks[:4]:
            if b[0] == "box":
                pile(rng, rng.uniform(b[1] + 0.1, b[3] - 0.1), b[4] + 0.08, g, 0.1, 7, debris, 0.04, 2.0)
            else:
                pile(rng, b[1] + b[3] * 0.8, b[2] + b[3] * 0.8, g, 0.1, 7, debris, 0.04, 2.0)
        for _ in range(3):
            b = rng.choice(blocks)
            u, v = (b[3] + 0.08, rng.uniform(b[2], b[4])) if b[0] == "box" else (b[1] + b[3] + 0.05, b[2])
            scorch(rng, u, v, rng.uniform(0.12, 0.22), g + 0.05)
        return

    if stage == 2:
        split = spec["split"]

        def brk(v):
            return split + 0.24 * (nz(0, v, 0.55, 1) - 0.5) + 0.08 * (nz(0, v, 0.12, 2) - 0.5)

        def H(u, v):
            t = u - brk(v)
            if t < 0:
                return top + 40
            # spec "drop" [(cu, cv, r)]: big masses (domes) whose collapsed-side half caves in whole, no tall ramp.
            for cu, cv, r in spec.get("drop", ()):
                if (u - cu) ** 2 + (v - cv) ** 2 < r * r:
                    return g + 4 + 14 * nz(u, v, 0.25, 3) + 4 * (nz(u, v, 0.06, 5) - 0.5)
            ramp = 0.62 * (top - g) * math.exp(-t / 0.28) * (0.45 + 0.55 * nz(u, v, 0.22, 3))
            return g + 3 + 10 * nz(u, v, 0.4, 4) + ramp + 5 * (nz(u, v, 0.06, 5) - 0.5)

        standing = lambda u, v: u < brk(v) - 0.1
        cuts = chips(rng, blocks, 5, g, standing, seed=200)
        chip_cuts(cuts, zp(g + 0.6), protect)
        field = Field(W, D, lambda u, v: max(g + 1.6, H(u, v)))
        field_cut(field, g, ztop, protect)
        # "drop" masses (domes and their drums, ribs, finials): the field cut can leave a closed dome standing whole;
        # slice every mesh centred inside the circle at the break and drop its collapsed-side half (world y = u).
        for cu, cv, r in spec.get("drop", ()):
            bpy.context.view_layer.update()
            for ob in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
                lo, hi = bounds(ob)
                mu, mv = (lo.y + hi.y) / 2, (lo.x + hi.x) / 2
                if (mu - cu) ** 2 + (mv - cv) ** 2 > r * r or hi.z < zp(g + 12):
                    continue
                cut = brk(mv)
                if lo.y >= cut:
                    bpy.data.objects.remove(ob, do_unlink=True)
                    continue
                if hi.y <= cut:
                    continue
                if ob.modifiers or ob.matrix_world != ob.matrix_world.Identity(4):
                    dg = bpy.context.evaluated_depsgraph_get()
                    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
                    ob.modifiers.clear()
                    me.transform(ob.matrix_world)
                    ob.data = me
                    ob.matrix_world = ob.matrix_world.Identity(4)
                bm = bmesh.new()
                bm.from_mesh(ob.data)
                res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, cut, 0), plane_no=(0, 1, 0), clear_outer=True)
                # ragged edge: jitter the new cut vertices down / in a little
                for e in res["geom_cut"]:
                    if isinstance(e, bmesh.types.BMVert):
                        e.co.y -= rng.uniform(0, 0.08)
                        e.co.z -= zp(rng.uniform(0, 4))
                if not bm.faces:
                    bm.free()
                    bpy.data.objects.remove(ob, do_unlink=True)
                    continue
                bm.to_mesh(ob.data)
                bm.free()
        soot_glass(rng, spec.get("glass", []), 0.6, standing)
        blooms(rng, blocks, 16, g, standing, glassy=spec.get("glassy", False))
        # Broken floor slabs and charred beams / rebar jutting from the break.
        slab_m = spec.get("slab", debris[0])
        for b in blocks:
            if b[0] == "box":
                _, u0, v0, u1, v1, t = b
                vs = [v0 + (v1 - v0) * (k + 0.5) / max(1, int((v1 - v0) / 0.22)) for k in range(max(1, int((v1 - v0) / 0.22)))]
            else:
                _, cu, cv, r, t = b
                vs = [cv - r * 0.8 + 1.6 * r * (k + 0.5) / 5 for k in range(5)]
            for v in vs:
                bu = brk(v)
                inside = (b[0] == "box" and b[1] < bu < b[3]) or (b[0] == "cyl" and (bu - b[1]) ** 2 + (v - b[2]) ** 2 < b[3] ** 2)
                if not inside:
                    continue
                z = g + 9
                while z < t - 4:
                    if z > H(bu + 0.02, v) - 1 and rng.random() < 0.8:
                        L = rng.uniform(0.04, 0.16)
                        sag = rng.uniform(0, 3)
                        bm = bmesh.new()
                        hw = rng.uniform(0.06, 0.11)
                        q = [P(bu - 0.02, v - hw, z), P(bu - 0.02, v + hw, z), P(bu + L, v + hw * 0.6, z - sag), P(bu + L, v - hw * 0.7, z - sag * 0.8)]
                        vb = [bm.verts.new(p) for p in q]
                        vt = [bm.verts.new((p[0], p[1], p[2] + zp(0.7))) for p in q]
                        bm.faces.new(vb[::-1])
                        bm.faces.new(vt)
                        for k in range(4):
                            bm.faces.new((vb[k], vb[(k + 1) % 4], vt[(k + 1) % 4], vt[k]))
                        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
                        _new("slab", bm, rng.choice([slab_m, charm]))
                        for _ in range(2):
                            dv = rng.uniform(-hw, hw)
                            rod((bu, v + dv, zp(z + 0.3)), (bu + L + rng.uniform(0.03, 0.1), v + dv + rng.uniform(-0.03, 0.03), zp(z - sag - rng.uniform(1, 5))), 0.006, charm, 4)
                    z += rng.uniform(7, 10)
        cond = lambda u, v: u > brk(v) + 0.03
    else:
        frags = spec.get("frags", [])

        def H(u, v):
            h = g + 2 + 7 * nz(u, v, 0.3, 6) + 3 * (nz(u, v, 0.06, 7) - 0.5)
            # Fragments: low broken wall corners / column stubs, not peaks — a flat, jagged-topped stub (capped low so
            # the building reads as collapsed) inside the radius, dropping straight to the rubble outside it.
            for fu, fv, r, fh in frags:
                d2 = ((u - fu) ** 2 + (v - fv) ** 2) / (r * r)
                if d2 < 1:
                    jag = 0.55 + 0.45 * nz(u, v, 0.09, 8)
                    if nz(u, v, 0.03, 9) > 0.72:  # a notch knocked out of the top
                        jag *= 0.55
                    h = max(h, g + min(fh, 24.0) * jag)
            return h

        field = Field(W, D, lambda u, v: max(g + 1.6, H(u, v)))
        field_cut(field, g, ztop, protect)
        cond = lambda u, v: True

    # Rubble mounds over the collapsed masses, spill at their feet, charred beams, scorched ground.
    for u, v, t in _block_points(rng, blocks, 7 if stage == 3 else 6, cond):
        base = min(t, field.at(u, v)) if stage == 2 else g + 0.5
        heap = min(14.0, 2 + (t - g) * (0.12 if stage == 3 else 0.06))
        pile(rng, u, v, base - 1.5, rng.uniform(0.16, 0.3), 16, debris, 0.055, heap)
    for u, v, t in _block_points(rng, blocks, 1.6, cond):
        z = g + rng.uniform(2, 6 if stage == 3 else 4)
        rod((u, v, zp(z)), (u + rng.uniform(-0.35, 0.35), v + rng.uniform(-0.35, 0.35), zp(z + rng.uniform(-2, 7))), 0.014, charm, 5)
    for b in blocks:
        if b[0] == "box":
            edge = [(rng.uniform(b[1], b[3]), b[4] + rng.uniform(0.05, 0.25)) for _ in range(3)] + [(b[3] + rng.uniform(0.05, 0.25), rng.uniform(b[2], b[4])) for _ in range(2)]
        else:
            edge = [(b[1] + b[3] * math.cos(a) * 1.1, b[2] + b[3] * math.sin(a) * 1.1) for a in (0.3, 0.8, 1.3)]
        for u, v in edge:
            if 0.05 < u < W - 0.05 and 0.05 < v < D - 0.05 and cond(u - 0.2, v):
                pile(rng, u, v, g, 0.14, 10, debris, 0.045, 2.5)
                scorch(rng, u, v, rng.uniform(0.18, 0.35), g + 0.05)
    mount = spec.get("mount" if stage == 3 else "mount2")
    if mount:
        mu, mv, mz, mm = mount
        from kit import box
        box(mu - 0.07, mv - 0.07, 0.14, 0.14, g, mz - g, mm)
        pile(rng, mu, mv, g, 0.15, 12, debris, 0.05, 3.0)
