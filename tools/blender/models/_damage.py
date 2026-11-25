"""Generic damage stages for a finished building scene (ART_GUIDE "Trạng thái hư hại / Damage states").

ruined_render(name, footprint, height, damage, flag=...) adds stage `damage` (0 intact, 1 light, 2 half destroyed,
3 completely collapsed) to whatever the model built, then renders building-<name>[-d<n>] with the same camera, so the
origin never moves between stages. The geometry is sliced on a fine grid and the faces inside the blast are DELETED
(no boolean cuts: open shells break them); exposed floors, charred beams, rebar, rubble mounds in the building's own
materials, soot and scorched ground are added. Coordinates: u / v in tiles, z in art px (kit's world is x = v, y = u).
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

import kit
from kit import _obj, box, mat, render, rod, zp, TEAM

CELL = 0.05  # height-map cell (tiles)
SLICE_UV = 0.06  # slicing grid (tiles)
SLICE_Z = 2.2  # slicing grid (art px)
GROUND_PX = 2.6  # meshes no taller than this are paving / lawn and stay whole


def _px(zbu):
    return zbu / zp(1.0)


def _n(x, y, z=0.0, seed=0):
    return noise.noise(Vector((x + seed * 17.13, y - seed * 7.7, z + seed * 3.1)))


def _meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_render]


def _bounds(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb))),
            Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb))))


def _is_ground(ob):
    lo, hi = _bounds(ob)
    return hi.z <= zp(GROUND_PX) + 1e-5


# ---------------------------------------------------------------- materials

def _soot(strength=0.75):
    m = bpy.data.materials.new(f"soot{strength}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = kit.srgb("#16120f")
    bsdf.inputs["Roughness"].default_value = 0.95
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (3.0, 3.0, 0.6)
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 9
    nz.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (strength, strength, strength, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
    return m


class Mats:
    def __init__(self):
        self.char = mat("#1d1814", 0.95, grain=0.45, scale=60)
        self.concrete = mat("#8a857c", 0.95, grain=0.35, scale=50)
        self.dust = mat("#6f6960", 0.97, grain=0.5, scale=90)
        self.slab = mat("#9b968c", 0.9, grain=0.3, scale=40)
        self.interior = mat("#2b2622", 0.95, grain=0.3, scale=30)
        self.broken = mat("#0d0c0b", 0.9, grain=0.2, scale=40)
        self.rebar = mat("#4a3426", 0.7, metal=0.6, grain=0.2)
        self.soot = _soot(0.75)
        self.scorch = _soot(0.92)
        self.glass = {m for k, m in kit._mats.items() if k[6]}
        teams = {h.lower() for h in TEAM.values()}
        self.team = {m for k, m in kit._mats.items() if k[0].lower() in teams}


# ---------------------------------------------------------------- survey

class Survey:
    """Height map of the building (top z in px per cell), the material seen from above, occupancy."""

    def __init__(self, footprint):
        self.w, self.d = footprint
        self.nu, self.nv = int(round(self.w / CELL)), int(round(self.d / CELL))
        dg = bpy.context.evaluated_depsgraph_get()
        sc = bpy.context.scene
        ground = {o.name for o in _meshes() if _is_ground(o)}
        self.top = [[0.0] * self.nv for _ in range(self.nu)]
        self.mat = [[None] * self.nv for _ in range(self.nu)]
        for i in range(self.nu):
            for j in range(self.nv):
                u, v = (i + 0.5) * CELL, (j + 0.5) * CELL
                hit, loc, nrm, idx, ob, _ = sc.ray_cast(dg, Vector((v, u, 50.0)), Vector((0, 0, -1)))
                if hit and ob.name not in ground:
                    self.top[i][j] = _px(loc.z)
                    ms = ob.data.materials
                    try:
                        mi = ob.data.polygons[idx].material_index if idx < len(ob.data.polygons) else 0
                    except Exception:
                        mi = 0
                    self.mat[i][j] = ms[mi] if len(ms) > mi else (ms[0] if ms else None)
        self.hmax = max(max(r) for r in self.top)
        self.ground_top = max([_px(_bounds(o)[1].z) for o in _meshes() if o.name in ground] + [0.0])

    def at(self, u, v):
        i, j = int(u / CELL), int(v / CELL)
        if 0 <= i < self.nu and 0 <= j < self.nv:
            return self.top[i][j]
        return 0.0

    def cells(self):
        for i in range(self.nu):
            for j in range(self.nv):
                if self.top[i][j] > GROUND_PX:
                    yield (i + 0.5) * CELL, (j + 0.5) * CELL, self.top[i][j], self.mat[i][j]


# ---------------------------------------------------------------- destruction

def _bake(ob):
    """Applies modifiers and the object transform into the mesh."""
    if ob.modifiers:
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        ob.data = me
    if ob.matrix_world != Matrix.Identity(4):
        ob.data.transform(ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)


def destroy(pred, regions, protect=()):
    """Deletes every face whose centre satisfies pred(u, v, zpx); regions = [(u0, u1, v0, v1, z0, z1)] bound where
    pred can be true (only there is geometry sliced). protect = [(u, v, r)]: columns that always stay."""
    def dead(u, v, z):
        for pu, pv, r in protect:
            if (u - pu) ** 2 + (v - pv) ** 2 < r * r:
                return False
        return pred(u, v, z)

    for ob in list(_meshes()):
        if _is_ground(ob):
            continue
        lo, hi = _bounds(ob)
        bu0, bu1, bv0, bv1 = lo.y, hi.y, lo.x, hi.x
        bz0, bz1 = _px(lo.z), _px(hi.z)
        hits = [r for r in regions if bu0 < r[1] and bu1 > r[0] and bv0 < r[3] and bv1 > r[2] and bz0 < r[5] and bz1 > r[4]]
        if not hits:
            continue
        size = max(bu1 - bu0, bv1 - bv0, zp(bz1 - bz0))
        if size < 0.09:  # small part (pane, fin, finial): all or nothing
            c = (lo + hi) / 2
            if dead(c.y, c.x, _px(c.z)):
                bpy.data.objects.remove(ob, do_unlink=True)
            continue
        _bake(ob)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        us, vs, zs = set(), set(), set()
        for r in hits:
            a0, a1 = max(bu0, r[0]), min(bu1, r[1])
            k = math.ceil(a0 / SLICE_UV)
            while k * SLICE_UV < a1:
                us.add(round(k * SLICE_UV, 5)); k += 1
            a0, a1 = max(bv0, r[2]), min(bv1, r[3])
            k = math.ceil(a0 / SLICE_UV)
            while k * SLICE_UV < a1:
                vs.add(round(k * SLICE_UV, 5)); k += 1
            a0, a1 = max(bz0, r[4]), min(bz1, r[5])
            k = math.ceil(a0 / SLICE_Z)
            while k * SLICE_Z < a1:
                zs.add(round(k * SLICE_Z, 5)); k += 1
        for co, no in ([((v, 0, 0), (1, 0, 0)) for v in vs] + [((0, u, 0), (0, 1, 0)) for u in us]
                       + [((0, 0, zp(z)), (0, 0, 1)) for z in zs]):
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        kill = []
        for f in bm.faces:
            c = f.calc_center_median()
            if dead(c.y, c.x, _px(c.z)):
                kill.append(f)
        if kill:
            bmesh.ops.delete(bm, geom=kill, context="FACES")
        if not bm.faces:
            bm.free()
            bpy.data.objects.remove(ob, do_unlink=True)
            continue
        bm.to_mesh(ob.data)
        bm.free()


# ---------------------------------------------------------------- dressing

def rock(rng, u, v, z, size, m):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    su, sv = size * rng.uniform(0.7, 1.4), size * rng.uniform(0.7, 1.4)
    sz = size * rng.uniform(0.45, 0.9)
    a = rng.uniform(0, math.pi)
    ca, sa = math.cos(a), math.sin(a)
    for vt in bm.verts:
        j = rng.uniform(0.7, 1.2)
        x, y, zz = vt.co.x * j * su, vt.co.y * j * sv, vt.co.z * j * sz
        vt.co.x = u + x * ca - y * sa
        vt.co.y = v + x * sa + y * ca
        vt.co.z = zp(z) + (zz + sz * 0.3)
    return _obj("rubble", bm, m)


def mound(field, nu, nv, m):
    """Continuous rubble surface over a height field (px above ground) sampled at grid vertices."""
    bm = bmesh.new()
    vt = {}
    for i in range(nu + 1):
        for j in range(nv + 1):
            h = field[i][j]
            if h > 0.05:
                vt[i, j] = bm.verts.new((i * CELL, j * CELL, zp(h)))
    for i in range(nu):
        for j in range(nv):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            if all(k in vt for k in q):
                bm.faces.new([vt[k] for k in q])
    if not bm.faces:
        bm.free()
        return
    _obj("mound", bm, m)


def soot_quad(sc, dg, M, rng, u, v, z, along_v, h_px, w):
    """Soot streak on the wall a horizontal ray from the camera side hits."""
    if along_v:  # ray towards -u (world -y)
        o, dvec = Vector((v, 9.0, zp(z))), Vector((0, -1, 0))
    else:
        o, dvec = Vector((9.0, u, zp(z))), Vector((-1, 0, 0))
    hit, loc, nrm, idx, ob, _ = sc.ray_cast(dg, o, dvec)
    if not hit or abs(nrm.z) > 0.3 or ob.name.startswith(("soot", "mound", "rubble")):
        return
    t = Vector((-nrm.y, nrm.x, 0)).normalized()
    p = loc + nrm * 0.004
    hh = zp(h_px)
    pts = [p - t * w * 0.5 - Vector((0, 0, hh * 0.15)), p + t * w * 0.5 - Vector((0, 0, hh * 0.15)),
           p + t * w * 0.8 + Vector((0, 0, hh)), p - t * w * 0.8 + Vector((0, 0, hh))]
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(q) for q in pts])
    me = bpy.data.meshes.new("soot")
    bm.to_mesh(me)
    bm.free()
    so = bpy.data.objects.new("soot", me)
    bpy.context.collection.objects.link(so)
    me.materials.append(M.soot)


def scorch(rng, M, u, v, r, z):
    bm = bmesh.new()
    vs = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        rr = r * rng.uniform(0.55, 1.15)
        vs.append(bm.verts.new((v + rr * math.sin(a), u + rr * math.cos(a), zp(z))))
    bm.faces.new(vs)
    me = bpy.data.meshes.new("scorch")
    bm.to_mesh(me)
    bm.free()
    so = bpy.data.objects.new("scorch", me)
    bpy.context.collection.objects.link(so)
    me.materials.append(M.scorch)


def break_glass(M, frac, rng):
    for ob in sorted(_meshes(), key=lambda o: o.name):
        ms = ob.data.materials
        if len(ms) == 1 and ms[0] in M.glass and rng.random() < frac:
            ms[0] = M.broken


# ---------------------------------------------------------------- stages

def apply(damage, footprint, flag=None, seed=1, cut_u=2.9):
    """Adds damage stage 1..3 to the scene. flag = (u, v, zpx): the TS flag pole foot (kept standing at stage 2;
    at stage 3 a masonry block RUIN_POLE_Z px high is left under it)."""
    if not damage:
        return
    rng = random.Random(seed * 101 + damage)
    M = Mats()
    S = Survey(footprint)
    H = S.hmax
    G = S.ground_top
    W, D = S.w, S.d
    occ = list(S.cells())
    # At stage 2 the column under the flag stays standing — unless the flag spot lies in the half that collapses: then
    # it falls with it and the pole stands on a ruin block (as at stage 3; the TS art drops the pole to RUIN_POLE_Z).
    flag_falls = bool(flag and damage == 2 and flag[0] > cut_u - 0.3)
    protect = [(flag[0], flag[1], 0.13)] if (flag and damage == 2 and not flag_falls) else []

    # Chipped cornices / parapets: small blasts on high roof edges.
    edges = []
    for u, v, t, m in occ:
        if t < 0.45 * H:
            continue
        if any(S.at(u + du, v + dv) < t - 4 for du, dv in ((0.1, 0), (0, 0.1), (-0.1, 0), (0, -0.1))):
            edges.append((u, v, t))
    rng.shuffle(edges)
    chips = []
    for u, v, t in edges:
        if damage == 2 and u > cut_u - 0.3:
            continue
        if flag and (u - flag[0]) ** 2 + (v - flag[1]) ** 2 < 0.3 ** 2:
            continue
        if all((u - a) ** 2 + (v - b) ** 2 > 0.4 ** 2 for a, b, _, _, _ in chips):
            chips.append((u, v, t, rng.uniform(0.07, 0.13), rng.uniform(3, 7)))
        if len(chips) >= (5 if damage == 1 else 4):
            break

    def in_chip(u, v, z):
        for a, b, t, r, rz in chips:
            q = ((u - a) / r) ** 2 + ((v - b) / r) ** 2 + ((z - t) / rz) ** 2
            if q < 1 + 0.35 * _n(u * 30, v * 30, z * 0.3):
                return True
        return False

    regions = [(a - r * 1.4, a + r * 1.4, b - r * 1.4, b + r * 1.4, t - rz * 1.4, t + rz * 1.4) for a, b, t, r, rz in chips]

    def boundary(v, z):
        return cut_u + 0.2 * _n(v * 2.5, z * 0.04, 0, seed) + 0.06 * _n(v * 11, z * 0.2, 1, seed)

    def keep2(u, v):
        t = S.at(u, v)
        k = 3 + 9 * max(0.0, _n(u * 3, v * 3, 2, seed))
        dist = u - boundary(v, 0)
        if dist < 0.35:  # broken walls rising towards the standing half
            k += (1 - dist / 0.35) * t * (0.45 + 0.3 * _n(v * 6, 0, 3, seed))
        return k

    frags = []
    if damage == 3:
        teams = [o for o in _meshes() if o.data.materials and o.data.materials[0] in M.team and not _is_ground(o)]
        teams = [(_bounds(o), o) for o in teams]
        teams = [(lo, hi) for (lo, hi), _ in teams if _px(hi.z) < 0.7 * H + 4]
        if teams:  # the front-most team band stays on a broken corner fragment
            lo, hi = max(teams, key=lambda b: (b[1].y + b[1].x))
            fu, fv = min(hi.y, lo.y + 0.25), min(hi.x, lo.x + 0.25)
            frags.append((fu, fv, min(_px(hi.z) + 3.5, 0.55 * H), 0.42))
        um = min(u for u, v, t, m in occ)
        vm = max(v for u, v, t, m in occ)
        cand = min(occ, key=lambda c: (c[0] - um) ** 2 + (c[1] - vm) ** 2)
        frags.append((cand[0] + 0.1, cand[1] - 0.1, 0.32 * H, 0.38))
        cand = max(occ, key=lambda c: c[0] - 0.4 * c[1])
        frags.append((cand[0] - 0.1, cand[1] + 0.1, 0.22 * H, 0.3))

    def keep3(u, v):
        k = 2.5 + 7 * (0.5 + 0.5 * _n(u * 5, v * 5, 4, seed))
        for fu, fv, fh, fr in frags:
            dd = math.hypot(u - fu, v - fv)
            if dd < fr:
                k = max(k, fh * (1 - dd / fr) ** 0.6 * (0.8 + 0.25 * _n(u * 9, v * 9, 5, seed)))
        return k

    if damage == 2:
        def pred(u, v, z):
            if u > boundary(v, z) and z > keep2(u, v):
                return True
            return in_chip(u, v, z)
        regions.append((cut_u - 0.35, W + 0.1, -0.1, D + 0.1, 2.0, H + 2))
    elif damage == 3:
        def pred(u, v, z):
            return z > keep3(u, v)
        regions = [(-0.1, W + 0.1, -0.1, D + 0.1, 2.0, H + 2)]
    else:
        pred = in_chip
    if regions:
        destroy(pred, regions, protect)

    # How much fell where: rubble height field (px above ground) at grid vertices.
    nu, nv = S.nu, S.nv
    src = [[0.0] * nv for _ in range(nu)]
    for i in range(nu):
        for j in range(nv):
            t = S.top[i][j]
            if t <= GROUND_PX:
                continue
            u, v = (i + 0.5) * CELL, (j + 0.5) * CELL
            if damage == 3:
                src[i][j] = min(0.2 * t, 10.0) * (0.65 + 0.35 * _n(u * 6, v * 6, 6, seed))
            elif damage == 2 and u > boundary(v, 0) - 0.05:
                src[i][j] = min(0.3 * (t - keep2(u, v)), 14.0) * (0.7 + 0.3 * _n(u * 6, v * 6, 6, seed))
    for a, b, t, r, rz in chips:  # a little heap under each chip, at the foot of the wall
        i, j = int(a / CELL), int(b / CELL)
        for di in range(-3, 4):
            for dj in range(-3, 4):
                ii, jj = i + di, j + dj
                if 0 <= ii < nu and 0 <= jj < nv and S.top[ii][jj] <= GROUND_PX:
                    src[ii][jj] = max(src[ii][jj], 2.5)
    R = 5
    field = [[0.0] * (nv + 1) for _ in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            s = src[i][j]
            if s <= 0:
                continue
            for di in range(-R, R + 2):
                for dj in range(-R, R + 2):
                    ii, jj = i + di, j + dj
                    if 0 <= ii <= nu and 0 <= jj <= nv:
                        dd = math.hypot(di - 0.5, dj - 0.5) / R
                        if dd < 1:
                            field[ii][jj] = max(field[ii][jj], s * (1 - dd * dd))
    for i in range(nu + 1):
        for j in range(nv + 1):
            if field[i][j] > 0:
                field[i][j] = G + field[i][j] * (0.8 + 0.3 * _n(i * 0.4, j * 0.4, 7, seed))
    mound(field, nu, nv, M.dust)

    def fz(u, v):
        i, j = int(round(u / CELL)), int(round(v / CELL))
        if 0 <= i <= nu and 0 <= j <= nv:
            return field[i][j]
        return 0.0

    # Rocks in the building's own materials (plus concrete and char) scattered over the mounds.
    pts = [(i * CELL, j * CELL) for i in range(nu + 1) for j in range(nv + 1) if field[i][j] > G + 0.6]
    n_rocks = {1: 50, 2: 420, 3: 950}[damage]
    for _ in range(min(n_rocks, len(pts) * 3)):
        u, v = rng.choice(pts)
        u += rng.uniform(-CELL, CELL)
        v += rng.uniform(-CELL, CELL)
        m = S.mat[min(nu - 1, max(0, int(u / CELL)))][min(nv - 1, max(0, int(v / CELL)))]
        if m is None or m in M.glass or rng.random() < 0.35:
            m = rng.choice([M.concrete, M.concrete, M.char, M.slab])
        size = rng.uniform(0.018, 0.05) if rng.random() < 0.8 else rng.uniform(0.05, 0.09)
        rock(rng, u, v, fz(u, v) - 0.6, size, m)

    if damage == 2:
        # Dark interior behind the break, exposed floor slabs with rebar, charred rafters hanging off the walls.
        us = cut_u - 0.24
        for j in range(nv):
            v = (j + 0.5) * CELL
            t = S.at(us, v)
            if t > 8:
                box(us, j * CELL, 0.012, CELL, G, t - G - 1.2, M.interior)
        for j in range(0, nv, 2):
            v = (j + 0.5) * CELL
            t = S.at(cut_u, v)
            if t < 14:
                continue
            lev = 11.0
            while lev < t - 3:
                if rng.random() < 0.8:
                    b = boundary(v, lev)
                    u0 = cut_u - 0.24
                    u1 = b + rng.uniform(-0.05, 0.35)
                    sag = rng.uniform(0, 2.5) if u1 > b + 0.15 else 0
                    box(u0, j * CELL, u1 - u0, 2 * CELL - 0.004, lev - sag * 0.3, 1.1, rng.choice([M.slab, M.slab, M.char]))
                    for _ in range(2):
                        rv = j * CELL + rng.uniform(0.01, 2 * CELL - 0.01)
                        rod((u1, rv, zp(lev + 0.5)), (u1 + rng.uniform(0.04, 0.12), rv + rng.uniform(-0.02, 0.02), zp(lev + 0.5 - rng.uniform(0, 2.5))), 0.0045, M.rebar, 4)
                lev += 11.0
        for k in range(14):
            v = rng.uniform(0.1, D - 0.1)
            t = S.at(cut_u - 0.15, v)
            if t < 12:
                continue
            z0 = t - rng.uniform(1, 4)
            rod((cut_u - 0.15, v, zp(z0)), (cut_u + rng.uniform(0.15, 0.5), v + rng.uniform(-0.1, 0.1), zp(z0 - rng.uniform(3, 12))), 0.011, M.char, 5)

    # Charred beams lying in the rubble.
    for _ in range({1: 0, 2: 14, 3: 30}[damage]):
        if not pts:
            break
        u, v = rng.choice(pts)
        a = rng.uniform(0, math.pi)
        L = rng.uniform(0.2, 0.55)
        z0 = fz(u, v) + rng.uniform(0, 1.5)
        u2, v2 = u + L * math.cos(a), v + L * math.sin(a)
        rod((u, v, zp(z0)), (u2, v2, zp(max(G, fz(u2, v2)) + rng.uniform(-0.5, 3))), rng.uniform(0.01, 0.017), M.char, 5)

    if flag_falls:
        box(flag[0] - 0.07, flag[1] - 0.07, 0.14, 0.14, G, RUIN_POLE_Z - G, M.concrete)
    if damage == 3:
        for m in list(M.glass):  # whatever glass is left low is blown out
            for ob in _meshes():
                ms = ob.data.materials
                for k in range(len(ms)):
                    if ms[k] == m:
                        ms[k] = M.broken
        if flag:
            box(flag[0] - 0.07, flag[1] - 0.07, 0.14, 0.14, G, RUIN_POLE_Z - G, M.concrete)
    else:
        break_glass(M, (0, 0.35, 0.65)[damage], rng)

    # Soot streaks up the walls, scorched ground.
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    n_soot = {1: 14, 2: 22, 3: 26}[damage]
    for _ in range(n_soot):
        top = H * (0.6 if damage < 3 else 0.15)
        z = rng.uniform(G + 2, max(G + 3, top))
        h = rng.uniform(6, 16) if damage < 3 else rng.uniform(3, 7)
        if rng.random() < 0.5:
            soot_quad(sc, dg, M, rng, 0, rng.uniform(0.1, D - 0.1), z, False, h, rng.uniform(0.12, 0.28))
        else:
            soot_quad(sc, dg, M, rng, rng.uniform(0.1, W - 0.1), 0, z, True, h, rng.uniform(0.12, 0.28))
    n_sc = {1: 3, 2: 6, 3: 10}[damage]
    for _ in range(n_sc):
        u, v = rng.uniform(0.2, W - 0.2), rng.uniform(0.2, D - 0.2)
        if damage == 2 and rng.random() < 0.7:
            u = rng.uniform(cut_u - 0.3, W - 0.15)
        scorch(rng, M, u, v, rng.uniform(0.15, 0.4) * (1 + 0.3 * (damage - 1)), G + 0.05)
    print(f"[damage] stage {damage}: H={H:.1f}px ground={G:.2f}px chips={len(chips)} frags={len(frags)}")


RUIN_POLE_Z = 8.0  # px: top of the block the flag pole stands on at stage 3


def ruined_render(name, footprint, height, damage=0, **kw):
    apply(damage, footprint, **kw)
    render(name + (f"-d{damage}" if damage else ""), footprint, height)
