"""
Damage stages for the contested-nation capitals (ART_GUIDE "Trạng thái hư hại / Damage states").

Each *_capital_render.py builds its intact building, then calls apply(damage, cfg) before rendering:
    0  intact (nothing done)
    1  <= 80 % HP: scorch marks, broken panes, chipped cornice / parapet, a few rubble chunks, soot streaks
    2  <= 50 % HP: the east half (u > split) blown open / collapsed with jagged breaks, exposed floors and charred
       beams, rubble; the west half stands with lighter damage
    3  <= 20 % HP: completely collapsed: rubble over the plot, low wall stubs, two broken corner fragments (one
       carrying the team line), charred beams, scorched ground
Same camera / footprint / picture height as the intact render, so the origin never moves. The flag poles at the
plot corners stay (the game draws the flags on them).

cfg keys (author units u, v; heights in art px):
    rects   [(u0, v0, u1, v1, z0, z1)]  the building's main masses (first = the main block)
    base    px, top of the podium / terrace the ruins sit on
    walls   [materials] facade materials (rubble, stubs, fragments)
    roof    material of roof sheets lying in the rubble
    team    the team-line material (kept on the surviving fragment)
    glass   pane material (broken / sooted share of panes) or None for curtain walls
    curtain True: the facades are glass curtains: broken-glass patches drawn on them instead
    split   u where the stage-2 break runs (default 2.0)
    floors  px levels of the floor slabs exposed at stage 2
    columns [(u, v, r)] round columns whose broken bases stay at stage 3
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

from kit import _obj, box, lathe, mat, rod, srgb, zp

POLES = ((0.15, 2.25), (3.85, 2.25))
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


def concrete_mat():
    """Broken concrete / masonry core seen in the breaks."""
    m = _C.get("conc")
    if not _alive(m):
        m = _C["conc"] = mat("#7a756d", 0.95, grain=0.4, scale=50)
    return m


def dust_mat():
    m = _C.get("dust")
    if not _alive(m):
        m = _C["dust"] = mat("#9b958a", 0.95, grain=0.3, scale=40)
    return m


def soot_mat(strength=0.75):
    """Soot film whose alpha is broken up by stretched noise (streaks, never a flat patch)."""
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


# ---------------------------------------------------------------- pieces


def rock(rng, cu, cv, z, size, m):
    """Rubble chunk: an irregular faceted lump resting on z (px)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sx, sy = size * rng.uniform(0.7, 1.3), size * rng.uniform(0.7, 1.3)
    sz = size * rng.uniform(25, 45)
    for vert in bm.verts:
        j = rng.uniform(0.75, 1.2)
        x, y, zz = vert.co.x * j, vert.co.y * j, vert.co.z * j
        vert.co.x = cu + x * sx
        vert.co.y = cv + y * sy
        vert.co.z = zp(z + (max(zz, -0.3) + 0.3) * sz * 0.7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("rubble", bm, m)


def pile(rng, cu, cv, z, radius, count, mats, size=0.045, heap=4.0):
    for _ in range(count):
        a = rng.uniform(0, 2 * math.pi)
        r = radius * math.sqrt(rng.random())
        hz = (1 - r / radius) * heap
        rock(rng, cu + r * math.cos(a), cv + r * math.sin(a), z + rng.uniform(0, hz), rng.uniform(size * 0.5, size * 1.6), rng.choice(mats))


def jag_cap(cu, cv, z, r, m, n=10):
    """Jagged broken top of a column."""
    rng = random.Random(int(cu * 1000 + cv * 77))
    bm = bmesh.new()
    ring, lo = [], []
    for k in range(n):
        a = 2 * math.pi * k / n
        pu, pv = cu + r * math.cos(a), cv + r * math.sin(a)
        ring.append(bm.verts.new((pu, pv, zp(z + rng.uniform(-0.6, 1.4)))))
        lo.append(bm.verts.new((pu, pv, zp(z - 1.2))))
    bm.faces.new(ring)
    bm.faces.new(list(reversed(lo)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], ring[j], ring[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("stump", bm, m)


def jag_wall(u0, v0, u1, v1, z, h0, h1, m, rng, n=7):
    """Wall fragment with a ragged broken top running from h0 (at u0/v0 end) to h1 (px above z)."""
    bm = bmesh.new()
    along_u = (u1 - u0) >= (v1 - v0)
    top_a, top_b, bot_a, bot_b = [], [], [], []
    for k in range(n + 1):
        t = k / n
        h = h0 + (h1 - h0) * t + (rng.uniform(-1.6, 1.6) if 0 < k < n else 0)
        h = max(0.8, h)
        if along_u:
            pa, pb = (u0 + (u1 - u0) * t, v0), (u0 + (u1 - u0) * t, v1)
        else:
            pa, pb = (u0, v0 + (v1 - v0) * t), (u1, v0 + (v1 - v0) * t)
        top_a.append(bm.verts.new((pa[0], pa[1], zp(z + h))))
        top_b.append(bm.verts.new((pb[0], pb[1], zp(z + h))))
        bot_a.append(bm.verts.new((pa[0], pa[1], zp(z))))
        bot_b.append(bm.verts.new((pb[0], pb[1], zp(z))))
    for k in range(n):
        bm.faces.new((bot_a[k], bot_a[k + 1], top_a[k + 1], top_a[k]))
        bm.faces.new((bot_b[k + 1], bot_b[k], top_b[k], top_b[k + 1]))
        bm.faces.new((top_a[k], top_a[k + 1], top_b[k + 1], top_b[k]))
        bm.faces.new((bot_a[k + 1], bot_a[k], bot_b[k], bot_b[k + 1]))
    bm.faces.new((bot_a[0], top_a[0], top_b[0], bot_b[0]))
    bm.faces.new((bot_b[n], top_b[n], top_a[n], bot_a[n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("fragment", bm, m)


def cutter(cu, cv, cz, ru, rv, rz, seed, m=None):
    """Irregular blast void (ragged ellipsoid); z, rz in px."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for vert in bm.verts:
        n = vert.co.normalized()
        k = 1 + rng.uniform(-0.12, 0.12) + 0.15 * math.sin(7 * n.x + 3 * n.y) * math.cos(5 * n.z)
        vert.co.x = cu + n.x * ru * k
        vert.co.y = cv + n.y * rv * k
        vert.co.z = zp(cz + n.z * rz * k)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("cutter", bm, m or char_mat())
    ob.hide_render = True
    ob.hide_viewport = True
    return ob


def _bounds(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb))),
            Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb))))


def _closed(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    ok = all(e.is_manifold for e in bm.edges)
    bm.free()
    return ok


def _inside(p, clo, chi):
    c = (clo + chi) / 2
    r = (chi - clo) / 2 * 0.9
    return sum(((p[i] - c[i]) / max(r[i], 1e-6)) ** 2 for i in range(3)) <= 1


def _is_pole(lo, hi):
    """Flag pole parts (Blender x = v, y = u)."""
    for pu, pv in POLES:
        if lo.y > pu - 0.08 and hi.y < pu + 0.08 and lo.x > pv - 0.08 and hi.x < pv + 0.08:
            return True
    return False


def apply_cuts(cutters, ground_top):
    bpy.context.view_layer.update()
    boxes = [(c, *_bounds(c)) for c in cutters]
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH" or ob in cutters:
            continue
        lo, hi = _bounds(ob)
        if hi.z <= ground_top + 1e-4 or _is_pole(lo, hi):
            continue
        hits = [(c, clo, chi) for c, clo, chi in boxes if lo.x < chi.x and hi.x > clo.x and lo.y < chi.y and hi.y > clo.y and lo.z < chi.z and hi.z > clo.z]
        if not hits:
            continue
        if not _closed(ob) or ob.modifiers:
            # Open shells and modified meshes cannot be cut cleanly: blown away when inside a blast.
            mid = (lo + hi) / 2
            if any(_inside(mid, clo, chi) for _, clo, chi in hits):
                bpy.data.objects.remove(ob, do_unlink=True)
            continue
        for c, _, _ in hits:
            mod = ob.modifiers.new("blast", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.object = c
            mod.material_mode = "TRANSFER"


def soot_over_windows(glass, frac, rng, broken_m, u_max=9.0):
    """Breaks a share of the panes (dark, the glass gone) and streaks soot up the wall above them."""
    if glass is None:
        return
    panes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.materials and o.data.materials[0] == glass]
    panes.sort(key=lambda o: o.name)
    for ob in panes:
        lo, hi = _bounds(ob)
        if rng.random() >= frac or lo.y > u_max:
            continue
        ob.data.materials[0] = broken_m
        h = hi.z - lo.z
        if h <= 0:
            continue
        up = h * rng.uniform(1.0, 2.2)
        bm = bmesh.new()
        if hi.x - lo.x < hi.y - lo.y:
            xs, wy = hi.x + 0.006, hi.y - lo.y
            pts = [(xs, lo.y - wy * 0.1, hi.z - h * 0.2), (xs, hi.y + wy * 0.1, hi.z - h * 0.2), (xs, hi.y + wy * 0.35, hi.z + up), (xs, lo.y - wy * 0.35, hi.z + up)]
        else:
            ys, wx = hi.y + 0.006, hi.x - lo.x
            pts = [(lo.x - wx * 0.1, ys, hi.z - h * 0.2), (hi.x + wx * 0.1, ys, hi.z - h * 0.2), (hi.x + wx * 0.35, ys, hi.z + up), (lo.x - wx * 0.35, ys, hi.z + up)]
        bm.faces.new([bm.verts.new(p) for p in pts])
        me = bpy.data.meshes.new("soot")
        bm.to_mesh(me)
        bm.free()
        so = bpy.data.objects.new("soot", me)
        bpy.context.collection.objects.link(so)
        me.materials.append(soot_mat())


def scorch(rng, cu, cv, r, z):
    bm = bmesh.new()
    vs = []
    for k in range(14):
        a = 2 * math.pi * k / 14
        rr = r * rng.uniform(0.6, 1.15)
        vs.append(bm.verts.new((cu + rr * math.cos(a), cv + rr * math.sin(a), zp(z + 0.06))))
    bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("scorch", bm, soot_mat(0.9))


def face_quad(face, a0, a1, plane, z0, z1, m, out=0.012):
    """Thin film on a visible face, standing a little proud (never coplanar)."""
    if face == "left":
        box(a0, plane + out, a1 - a0, 0.003, z0, z1 - z0, m)
    else:
        box(plane + out, a0, 0.003, a1 - a0, z0, z1 - z0, m)


# ---------------------------------------------------------------- stages


def apply(damage, cfg):
    if not damage:
        return
    if damage >= 3:
        ruins(cfg)
        return
    rng = random.Random(cfg.get("seed", 1600))
    rects, base = cfg["rects"], cfg["base"]
    split = cfg.get("split", 2.0)
    charm = char_mat()
    broken = mat("#0d0c0b", 0.9, grain=0.2, scale=40)
    debris = list(cfg["walls"]) + [charm, concrete_mat(), concrete_mat(), dust_mat()]
    cuts = []
    # Chipped cornice / parapet: bites out of the top edges of the visible faces.
    chips = []
    for (u0, v0, u1, v1, z0, z1) in rects[:2]:
        w = u1 - u0
        chips += [(u0 + w * 0.22, v1, z1 - 1.0), (u1, v0 + (v1 - v0) * 0.35, z1 - 1.2), (u0 + w * 0.7, v1, z1 - 1.5), (u1, v0 + (v1 - v0) * 0.8, z1 - 1.8)]
    if damage == 2:
        chips = [c for c in chips if c[0] < split - 0.2]
    for i, (cu, cv, cz) in enumerate(chips[: 4 if damage == 1 else 8]):
        cuts.append(cutter(cu, cv, cz, 0.16, 0.12, 4.0, 10 + i, concrete_mat()))
    plans = []
    if damage == 2:
        for i, (u0, v0, u1, v1, z0, z1) in enumerate(rects):
            if u1 <= split + 0.05:
                continue
            w = u1 - max(u0, split)
            bottom = max(z0, base) + 2.5
            cz = z1 + 6
            cuts.append(cutter(u1 + w * 0.6, (v0 + v1) / 2, cz, w * 1.6 + 0.05, (v1 - v0) / 2 + 0.6, cz - bottom, 40 + i, concrete_mat()))
            plans.append((max(u0, split), v0, u1, v1, z0, z1))
        top = max(r[5] for r in rects)
        r0 = rects[0]
        cuts.append(cutter(split + 0.05, r0[3], (r0[4] + r0[5]) / 2 + 3, 0.28, 0.25, (r0[5] - r0[4]) / 2, 61))  # ragged break down the front
        cuts.append(cutter(split - 0.12, (r0[1] + r0[3]) / 2 - 0.25, top, 0.3, 0.35, 7, 62))  # break running back across the roof
    apply_cuts(cuts, zp(base + 0.05))
    # Exposed floors and charred beams cantilevered out of the standing half.
    levels = cfg.get("floors", [])
    for (u0, v0, u1, v1, z0, z1) in plans:
        for z in levels:
            if not (z0 + 3 < z < z1 - 2):
                continue
            reach = 0.18 + 0.25 * (1 - (z - z0) / (z1 - z0))
            for _ in range(3):
                b0 = v0 + 0.04 + rng.uniform(0, 0.2)
                b1 = v1 - 0.04 - rng.uniform(0, 0.25)
                box(u0 - 0.05, b0, reach * rng.uniform(0.5, 1.0), b1 - b0, z + rng.uniform(-0.3, 0.2), 0.7, rng.choice([cfg["walls"][0], charm, charm]))
            n = max(3, int((v1 - v0) / 0.12))
            for k in range(n):
                jv = v0 + 0.05 + (k + 0.5) * (v1 - v0 - 0.1) / n
                rod((u0 - 0.02, jv, zp(z - 0.3)), (u0 + reach + rng.uniform(0.05, 0.3), jv + rng.uniform(-0.06, 0.06), zp(z - 0.3 - rng.uniform(1, 6))), 0.011, charm, 5)
        # Rebar whiskers along the break.
        for k in range(14):
            rv_ = rng.uniform(v0 + 0.05, v1 - 0.05)
            rz = rng.uniform(z0 + 3, z1 - 1)
            rod((u0 - 0.03, rv_, zp(rz)), (u0 + rng.uniform(0.06, 0.16), rv_ + rng.uniform(-0.04, 0.04), zp(rz + rng.uniform(-2, 2))), 0.004, mat("#4a3426", 0.7, metal=0.5, grain=0.1), 4)
    soot_over_windows(cfg.get("glass"), (0.0, 0.35, 0.6)[damage], random.Random(77), broken, u_max=(9.0 if damage == 1 else split - 0.1))
    # Soot blooms (and, on glass curtains, blown-out panels) on the visible faces of the standing parts.
    faces = []
    for (u0, v0, u1, v1, z0, z1) in rects[:2]:
        uh = u1 if damage == 1 else min(u1, split - 0.15)
        if uh - u0 > 0.3:
            faces.append(("left", u0, uh, v1, max(z0, base), z1))
        if damage == 1:
            faces.append(("right", v0, v1, u1, max(z0, base), z1))
    for k in range(12 + 6 * damage):
        face, lo, hi, plane, z0, z1 = rng.choice(faces)
        hw = rng.uniform(0.1, 0.2)
        c = rng.uniform(lo + hw, hi - hw)
        zz = rng.uniform(z0 + 1, z1 - 8)
        if cfg.get("curtain") and k % 2 == 0:
            face_quad(face, c - hw * 0.7, c + hw * 0.7, plane, zz, zz + rng.uniform(3, 6), broken, out=0.028)
        face_quad(face, c - hw, c + hw, plane, zz, min(zz + rng.uniform(6, 12), z1 - 0.5), soot_mat(0.9), out=0.034)
    # Rubble at the foot of the walls and scorched ground.
    r0 = rects[0]
    piles = [((r0[0] + r0[2]) / 2 - 0.4, r0[3] + 0.18, 0.12, 8), (r0[2] + 0.15, (r0[1] + r0[3]) / 2, 0.1, 6)]
    marks = [((r0[0] + r0[2]) / 2 - 0.3, r0[3] + 0.2, 0.2)]
    if damage == 2:
        for (u0, v0, u1, v1, z0, z1) in plans:
            uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
            g = max(z0, base)
            piles += [(uc, vc, (u1 - u0) / 2 + 0.1, 110, g, 7.0), (uc, v1 + 0.15, 0.35, 45, g), (u1 + 0.15, vc, 0.3, 35, g), (u0 - 0.05, vc, 0.25, 25, g, 5.0)]
            marks += [(uc, v1 + 0.3, 0.45), (u1 + 0.2, vc, 0.35)]
    for p in piles:
        pile(rng, p[0], p[1], p[4] if len(p) > 4 else base, p[2], p[3], debris, heap=p[5] if len(p) > 5 else 4.0)
    for cu, cv, r in marks:
        scorch(rng, cu, cv, r, cfg.get("ground", 3.0))


def ruins(cfg):
    """Stage 3: everything above the podium removed, then stubs, fragments, rubble and charred beams built."""
    rng = random.Random(cfg.get("seed", 1600) + 3300)
    rects, base = cfg["rects"], cfg["base"]
    walls = cfg["walls"]
    charm = char_mat()
    debris = list(walls) + [charm, cfg.get("roof", walls[0]), concrete_mat(), concrete_mat(), dust_mat(), dust_mat()]
    cut = zp(base + 0.4)
    bpy.context.view_layer.update()
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH":
            continue
        lo, hi = _bounds(ob)
        if hi.z > cut and not _is_pole(lo, hi):
            bpy.data.objects.remove(ob, do_unlink=True)
    G = base
    for (u0, v0, u1, v1, z0, z1) in rects:
        if z0 > base + 2:
            continue  # upper storeys / roof structures: they are in the rubble
        g = max(z0, base)
        t = 0.06
        for (a, b, c, d) in ((u0, v1 - t, u1, v1), (u0, v0, u1, v0 + t), (u0, v0, u0 + t, v1), (u1 - t, v0, u1, v1)):
            along_u = (c - a) > (d - b)
            L = (c - a) if along_u else (d - b)
            n = max(2, int(L / 0.12))
            for k in range(n):
                if rng.random() < 0.25:
                    continue
                h = rng.uniform(1.5, 7.0)
                if along_u:
                    box(a + k * L / n, b, L / n - 0.006, d - b, g, h, rng.choice(walls[:2]))
                else:
                    box(a, b + k * L / n, c - a, L / n - 0.006, g, h, rng.choice(walls[:2]))
    # Corner fragments: the main block's front-left corner (with the team line) and its back-right corner.
    u0, v0, u1, v1, z0, z1 = rects[0]
    g = max(z0, base)
    fh = min(18.0, (z1 - g) * 0.6)
    wm = walls[0]
    jag_wall(u0, v1 - 0.08, u0 + 0.5, v1, g, fh, fh * 0.35, wm, rng)
    jag_wall(u0, v1 - 0.55, u0 + 0.08, v1 - 0.08, g, fh * 0.45, fh * 0.9, wm, rng)
    tz = g + min(fh * 0.5, cfg.get("team_z", fh * 0.5))
    box(u0 - 0.004, v1 + 0.002, 0.3, 0.012, tz, 1.2, cfg["team"])
    box(u0 - 0.006, v1 - 0.4, 0.012, 0.4, tz, 1.2, cfg["team"])
    box(u0 + 0.14, v1 + 0.003, 0.1, 0.006, g + 2.5, min(4.0, fh * 0.3), charm)  # blown-out opening
    jag_wall(u1 - 0.45, v0, u1, v0 + 0.08, g, fh * 0.25, fh * 0.55, wm, rng)
    jag_wall(u1 - 0.08, v0 + 0.08, u1, v0 + 0.5, g, fh * 0.5, fh * 0.2, wm, rng)
    for cu, cv, r in cfg.get("columns", []):
        h = rng.uniform(1.0, 6.0)
        lathe(cu, cv, G, [(r, 0), (r * 0.96, h)], walls[0], 16, cap_top=True)
        jag_cap(cu, cv, G + h, r * 0.96, charm)
        if rng.random() < 0.6:
            a = rng.uniform(0, math.pi)
            ln = rng.uniform(0.2, 0.35)
            rod((cu, cv + 0.06, zp(G + r * 30)), (cu + ln * math.cos(a), cv + 0.06 + ln * math.sin(a), zp(G + r * 28)), r * 0.9, walls[0], 12)
    # Rubble mounds over the footprint (higher over the main block), charred beams across them.
    for i, (a0, b0, a1, b1, z0, z1) in enumerate(rects):
        area = (a1 - a0) * (b1 - b0)
        n = max(4, int(area * 4))
        for k in range(n):
            cu, cv = rng.uniform(a0 + 0.12, a1 - 0.12), rng.uniform(b0 + 0.12, b1 - 0.12)
            pile(rng, cu, cv, G + rng.uniform(0, 3.0 if i == 0 else 1.5), 0.35, 24, debris, size=0.055, heap=5.0)
    for k in range(24):
        cu, cv = rng.uniform(u0 + 0.1, u1 - 0.1), rng.uniform(v0 + 0.1, v1 - 0.1)
        a = rng.uniform(0, math.pi)
        ln = rng.uniform(0.25, 0.6)
        zz = G + rng.uniform(2, 7)
        rod((cu, cv, zp(zz)), (cu + ln * math.cos(a), cv + ln * math.sin(a), zp(zz + rng.uniform(-3, 4))), 0.016, charm, 5)
    for k in range(6):
        cu, cv = rng.uniform(u0 + 0.2, u1 - 0.4), rng.uniform(v0 + 0.1, v1 - 0.3)
        box(cu, cv, rng.uniform(0.15, 0.3), rng.uniform(0.08, 0.15), G + rng.uniform(5, 8), 0.4, cfg.get("roof", walls[0]))
    gz = cfg.get("ground", 3.0)
    for cu, cv, r in ((u0 + 0.3, v1 + 0.25, 0.4), (u1 - 0.3, v1 + 0.25, 0.45), ((u0 + u1) / 2, v1 + 0.3, 0.35), (u1 + 0.2, (v0 + v1) / 2, 0.3)):
        scorch(rng, cu, cv, r, gz)
    for cu, cv in ((u0 + 0.5, v1 + 0.2), (u1 - 0.6, v1 + 0.2), (u1 + 0.12, v0 + 0.5)):
        pile(rng, cu, cv, gz, 0.22, 18, debris)


def stages():
    """Damage stages asked for on the command line after "--" (default all four)."""
    import sys

    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    st = [int(a) for a in args if a.isdigit()]
    return st or [0, 1, 2, 3]
