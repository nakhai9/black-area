"""
M1A2 Abrams (desert tan) for the Research Lab: builds the tank procedurally in Blender, renders 6 views into
ui/public/research-lab/m1a2-abrams/ and saves the scene as tools/blender/m1a2_abrams.blend.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/abrams_render.py

Env: ABRAMS_QUICK=1 (small, fast test renders), ABRAMS_SAMPLES=<n>.

Rig: every turret part is parented to the empty "Turret" (rotate its Z to traverse); the gun hangs on "Gun"
(rotate its Y to elevate, negative = up). Axes: +X = front, +Y = left side, +Z = up, 1 BU = 1 m.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "ui", "public", "research-lab", "m1a2-abrams")
BLEND = os.path.join(HERE, "m1a2_abrams.blend")
QUICK = bool(os.environ.get("ABRAMS_QUICK"))
SAMPLES = int(os.environ.get("ABRAMS_SAMPLES", "24" if QUICK else "128"))
RES = (600, 450) if QUICK else (1600, 1200)

# ------------------------------------------------------------------ materials


def lin(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def material(name, hexc, rough=0.6, metal=0.0, grain=0.07, ao=0.18, emit=None):
    """Principled paint: noise grain, small-scale bump, ambient-occlusion darkening in seams and corners."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    base = lin(hexc)
    col_out = None
    if grain > 0:
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 6.0
        nz.inputs["Detail"].default_value = 10
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = tuple(c * (1 - grain) for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = tuple(min(1, c * (1 + grain)) for c in base[:3]) + (1,)
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        col_out = ramp.outputs["Color"]
        fine = nt.nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = 140.0
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.04
        nt.links.new(fine.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    if ao > 0:
        aon = nt.nodes.new("ShaderNodeAmbientOcclusion")
        aon.inputs["Distance"].default_value = ao
        if col_out is not None:
            nt.links.new(col_out, aon.inputs["Color"])
        else:
            aon.inputs["Color"].default_value = base
        nt.links.new(aon.outputs["Color"], b.inputs["Base Color"])
    elif col_out is not None:
        nt.links.new(col_out, b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = base
    if emit:
        b.inputs["Emission Color"].default_value = lin(emit)
        b.inputs["Emission Strength"].default_value = 2.0
    return m


# ------------------------------------------------------------------ geometry helpers


def link(ob, parent):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def mesh_obj(name, bm, mat, parent=None, bevel=0.0, smooth=False, recalc=True):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        try:
            me.set_sharp_from_angle(angle=math.radians(40))
        except Exception:
            pass
    link(ob, parent)
    if bevel > 0:
        md = ob.modifiers.new("bevel", "BEVEL")
        md.width = bevel
        md.segments = 2
        md.limit_method = "ANGLE"
        md.angle_limit = math.radians(30)
    return ob


def box(name, c, s, mat, parent=None, bevel=0.012, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(s), verts=bm.verts)
    ob = mesh_obj(name, bm, mat, parent, bevel=min(bevel, min(s) * 0.3))
    ob.location = c
    ob.rotation_euler = rot
    return ob


def loft(name, rings, mat, parent=None, bevel=0.015, cap=True, smooth=False):
    """Skin consecutive rings (equal-length lists of 3D points) into a closed solid."""
    bm = bmesh.new()
    R = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(R, R[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(R[0])
        bm.faces.new(R[-1])
    return mesh_obj(name, bm, mat, parent, bevel=bevel, smooth=smooth)


def extrude_y(name, prof_xz, y0, y1, mat, parent=None, bevel=0.015):
    return loft(name, [[(x, y0, z) for x, z in prof_xz], [(x, y1, z) for x, z in prof_xz]], mat, parent, bevel)


def rod(name, a, b, r, mat, parent=None, segs=12, smooth=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=d.length)
    ob = mesh_obj(name, bm, mat, parent, smooth=smooth)
    ob.location = (a + b) / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    return ob


def cyl(name, c, r, length, axis, mat, parent=None, segs=32, bevel=0.0):
    """Cylinder centred on c along axis 'X', 'Y' or 'Z'."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=length)
    ob = mesh_obj(name, bm, mat, parent, bevel=bevel, smooth=True)
    ob.location = c
    ob.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return ob


def lathe_x(name, prof, mat, parent=None, segs=40, y=0.0, z=0.0):
    """Surface of revolution along +X: prof = [(x, radius), ...]."""
    rings = [[(x, y + r * math.cos(2 * math.pi * i / segs), z + r * math.sin(2 * math.pi * i / segs)) for i in range(segs)] for x, r in prof]
    return loft(name, rings, mat, parent, bevel=0, smooth=True)


def hull2d(pts):
    pts = sorted(set(pts))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def resample(loop, step):
    segs = [(loop[i], loop[(i + 1) % len(loop)]) for i in range(len(loop))]
    lens = [math.dist(a, b) for a, b in segs]
    total = sum(lens)
    n = max(8, round(total / step))
    step = total / n
    out, si, acc = [], 0, 0.0
    for k in range(n):
        t = k * step
        while acc + lens[si] < t:
            acc += lens[si]
            si += 1
        a, b = segs[si]
        f = (t - acc) / lens[si]
        p = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
        out.append((p, math.atan2(b[1] - a[1], b[0] - a[0])))
    return out


# ------------------------------------------------------------------ scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("world")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.66, 0.72, 1)
    bg.inputs["Strength"].default_value = 0.7
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.0
    sun.angle = math.radians(3)
    so = bpy.data.objects.new("sun", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(40), math.radians(8), math.radians(120))
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 0.8
    fo = bpy.data.objects.new("fill", fill)
    sc.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(60), 0, math.radians(-60))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    ground = mesh_obj("ShadowCatcher", bm, material("ground", "#ffffff", grain=0, ao=0))
    ground.is_shadow_catcher = True


# ------------------------------------------------------------------ the tank

TAN = "#c4a87a"
ROAD_X = [-2.55, -1.75, -0.95, -0.15, 0.65, 1.45, 2.25]
WHEEL_R, WHEEL_Z = 0.32, 0.39
IDLER = (3.08, 0.58, 0.29)
SPROCKET = (-3.33, 0.66, 0.31)
ROLLERS = [(-2.15, 0.93, 0.09), (-0.55, 0.93, 0.09), (1.05, 0.93, 0.09)]
TRACK_Y, TRACK_W, LINK_T = 1.48, 0.64, 0.07
TURRET_PIVOT = (0.35, 0.0, 1.47)


def build(M):
    paint, paint2, dark, steel, rubber, glass, red, amber = M["paint"], M["paint2"], M["dark"], M["steel"], M["rubber"], M["glass"], M["red"], M["amber"]
    tank = bpy.data.objects.new("M1A2_Abrams", None)
    link(tank, None)

    # ---------------- hull
    extrude_y("hull_lower", [(-3.6, 0.42), (2.7, 0.42), (3.55, 0.86), (3.55, 1.1), (-3.6, 1.1)], -1.13, 1.13, paint, tank)
    deck = [(-3.86, 1.1), (3.48, 1.1), (3.74, 1.19), (2.05, 1.47), (-3.86, 1.47)]
    extrude_y("hull_deck", deck, -1.84, 1.84, paint, tank, bevel=0.025)
    # glacis plate seam and driver's station
    box("glacis_plate", (2.9, 0, 1.345), (1.2, 2.1, 0.03), paint2, tank, rot=(0, math.radians(9.4), 0))
    box("driver_hatch", (2.45, 0, 1.43), (0.55, 0.6, 0.05), paint2, tank, rot=(0, math.radians(9.4), 0))
    for i, yy in enumerate((-0.2, 0.0, 0.2)):
        box(f"driver_periscope{i}", (2.68, yy, 1.4), (0.06, 0.16, 0.07), glass, tank, bevel=0.005, rot=(0, math.radians(9.4), 0))
    # front: tow eyes, headlight clusters with guards, splash guard
    for s in (-1, 1):
        y = s * 1.5
        box(f"headlight_base{s}", (3.5, y, 1.24), (0.16, 0.22, 0.1), dark, tank, bevel=0.01)
        cyl(f"headlight{s}", (3.6, y + 0.05, 1.27), 0.045, 0.05, "X", glass, tank)
        box(f"blackout{s}", (3.59, y - 0.06, 1.27), (0.04, 0.05, 0.05), amber, tank, bevel=0.005)
        for g in (-0.12, 0.12):
            rod(f"lightguard{s}{g}", (3.42, y + g, 1.2), (3.66, y + g, 1.36), 0.012, steel, tank)
        rod(f"lightguard_top{s}", (3.66, y - 0.12, 1.36), (3.66, y + 0.12, 1.36), 0.012, steel, tank)
        cyl(f"tow_eye{s}", (3.6, s * 0.75, 0.95), 0.08, 0.05, "Y", steel, tank, bevel=0.01)
        box(f"tow_lug{s}", (3.55, s * 0.75, 0.95), (0.12, 0.14, 0.12), paint2, tank)
    rod("front_rail", (3.74, -1.0, 1.2), (3.74, 1.0, 1.2), 0.018, steel, tank)
    # fender lip running the length of the deck
    for s in (-1, 1):
        box(f"fender_lip{s}", (-0.2, s * 1.86, 1.45), (7.3, 0.04, 0.05), paint2, tank, bevel=0.01)

    # engine deck: grilles with slats, access doors, fuel caps
    box("engine_deck", (-3.15, 0, 1.49), (1.35, 2.9, 0.04), paint2, tank)
    for k in range(14):
        box(f"grille_slat{k}", (-3.75 + k * 0.09, 0, 1.525), (0.035, 2.5, 0.03), dark, tank, bevel=0.004)
    for s in (-1, 1):
        box(f"deck_door{s}", (-1.75, s * 1.15, 1.485), (1.3, 0.95, 0.03), paint2, tank)
        cyl(f"fuel_cap{s}", (-2.55, s * 1.55, 1.5), 0.09, 0.05, "Z", paint2, tank, bevel=0.01)
        for k in range(3):
            box(f"deck_hinge{s}{k}", (-2.38 + k * 0.6, s * 0.7, 1.49), (0.1, 0.06, 0.04), steel, tank, bevel=0.005)
    # rear plate: exhaust grille, tail lights, tow pintle, stowage
    box("rear_plate", (-3.9, 0, 0.98), (0.08, 3.2, 1.0), paint, tank, bevel=0.02)
    box("exhaust", (-3.96, 0, 1.13), (0.06, 2.0, 0.5), dark, tank, bevel=0.01)
    for k in range(9):
        box(f"exhaust_vane{k}", (-4.0, 0, 0.92 + k * 0.053), (0.04, 2.0, 0.018), steel, tank, bevel=0.003)
    for s in (-1, 1):
        box(f"taillight{s}", (-3.97, s * 1.38, 1.35), (0.05, 0.2, 0.12), dark, tank, bevel=0.01)
        box(f"taillight_lens{s}", (-4.0, s * 1.33, 1.35), (0.02, 0.07, 0.07), red, tank, bevel=0.004)
        box(f"taillight_lens2{s}", (-4.0, s * 1.43, 1.35), (0.02, 0.07, 0.07), amber, tank, bevel=0.004)
        box(f"rear_box{s}", (-3.98, s * 1.15, 0.7), (0.1, 0.45, 0.3), paint2, tank)
    cyl("pintle", (-4.0, 0, 0.6), 0.07, 0.12, "Z", steel, tank)
    box("pintle_mount", (-3.95, 0, 0.6), (0.12, 0.3, 0.16), paint2, tank)

    # ---------------- running gear, both sides
    for s in (-1, 1):
        ty = s * TRACK_Y
        for i, x in enumerate(ROAD_X):
            for half in (-1, 1):
                yy = ty + half * 0.15
                cyl(f"wheel_tyre{s}{i}{half}", (x, yy, WHEEL_Z), WHEEL_R, 0.13, "Y", rubber, tank, segs=40)
                cyl(f"wheel_disc{s}{i}{half}", (x, yy + half * 0.07, WHEEL_Z), 0.27, 0.02, "Y", paint, tank, segs=40, bevel=0.006)
            hy = ty + s * 0.24
            cyl(f"hub{s}{i}", (x, hy, WHEEL_Z), 0.1, 0.04, "Y", paint2, tank, bevel=0.008)
            cyl(f"hubcap{s}{i}", (x, hy + s * 0.025, WHEEL_Z), 0.05, 0.03, "Y", steel, tank)
            for k in range(8):
                a = 2 * math.pi * k / 8
                cyl(f"lug{s}{i}{k}", (x + 0.17 * math.cos(a), hy - s * 0.005, WHEEL_Z + 0.17 * math.sin(a)), 0.018, 0.03, "Y", steel, tank, segs=6)
            # torsion-bar road arm
            box(f"road_arm{s}{i}", (x + 0.18, s * 1.18, WHEEL_Z + 0.08), (0.42, 0.1, 0.12), paint2, tank, rot=(0, math.radians(-15), 0))
        ix, iz, ir = IDLER
        for half in (-1, 1):
            cyl(f"idler{s}{half}", (ix, ty + half * 0.15, iz), ir, 0.12, "Y", paint, tank, segs=40, bevel=0.008)
        cyl(f"idler_hub{s}", (ix, ty + s * 0.23, iz), 0.09, 0.05, "Y", steel, tank)
        box(f"idler_arm{s}", (ix - 0.2, s * 1.18, iz + 0.05), (0.45, 0.1, 0.12), paint2, tank, rot=(0, math.radians(10), 0))
        for j, (rx, rz, rr) in enumerate(ROLLERS):
            cyl(f"roller{s}{j}", (rx, ty, rz), rr, 0.3, "Y", rubber, tank)
        # drive sprocket: two toothed rings and a hub
        sx, sz, sr = SPROCKET
        N = 11
        prof = []
        for k in range(N * 4):
            a = 2 * math.pi * k / (N * 4)
            r = sr + 0.05 if k % 4 in (1, 2) else sr - 0.01
            prof.append((sx + r * math.cos(a), sz + r * math.sin(a)))
        for half in (-1, 1):
            y0 = ty + half * 0.15
            extrude_y(f"sprocket{s}{half}", prof, y0 - 0.04, y0 + 0.04, steel, tank, bevel=0.006)
        cyl(f"sprocket_drum{s}", (sx, ty, sz), 0.22, 0.34, "Y", paint, tank)
        cyl(f"sprocket_hub{s}", (sx, ty + s * 0.22, sz), 0.13, 0.06, "Y", paint2, tank, bevel=0.01)
        for k in range(10):
            a = 2 * math.pi * k / 10
            cyl(f"sprocket_bolt{s}{k}", (sx + 0.1 * math.cos(a), ty + s * 0.255, sz + 0.1 * math.sin(a)), 0.014, 0.02, "Y", steel, tank, segs=6)
        box(f"final_drive{s}", (-3.45, s * 1.15, 0.66), (0.4, 0.25, 0.4), paint, tank)

        # track: links along the belt round every wheel (one mesh), with end connectors and centre guides
        pts = []
        circles = [(x, WHEEL_Z, WHEEL_R) for x in ROAD_X] + [IDLER, (sx, sz, sr + 0.01)] + ROLLERS
        for cx, cz, cr in circles:
            for k in range(72):
                a = 2 * math.pi * k / 72
                pts.append((round(cx + (cr + LINK_T / 2) * math.cos(a), 5), round(cz + (cr + LINK_T / 2) * math.sin(a), 5)))
        belt = resample(hull2d(pts), 0.155)
        bm = bmesh.new()
        for (px, pz), ang in belt:
            R = Matrix.Rotation(-ang, 4, "Y")
            T = Matrix.Translation((px, ty, pz))
            bmesh.ops.create_cube(bm, size=1.0, matrix=T @ R @ Matrix.Diagonal((0.135, TRACK_W, LINK_T, 1)))
            for e in (-1, 1):  # end connectors
                bmesh.ops.create_cube(bm, size=1.0, matrix=T @ R @ Matrix.Translation((0.0, e * (TRACK_W / 2 + 0.02), 0)) @ Matrix.Diagonal((0.07, 0.05, 0.085, 1)))
            # centre guide horn, on the inner face of the belt
            bmesh.ops.create_cube(bm, size=1.0, matrix=T @ R @ Matrix.Translation((0, 0, 0.065)) @ Matrix.Diagonal((0.06, 0.05, 0.07, 1)))
        # the horn must point into the loop: belt is CCW in (x, z), so the inside is to the left of travel (+90Â°)
        mesh_obj(f"track{s}", bm, M["track"], tank, bevel=0.008)

        # armoured side skirts: thick front panel, five main panels, a short rear panel, bolts along the top
        y0, y1 = s * 1.84, s * 1.93
        extrude_y(f"skirt_front{s}", [(2.62, 0.6), (3.36, 0.6), (3.66, 0.92), (3.66, 1.44), (2.62, 1.44)], s * 1.84, s * 1.97, paint, tank, bevel=0.02)
        edges = [-2.88 + k * 1.09 for k in range(6)]
        for k in range(5):
            xa, xb = edges[k] + 0.012, edges[k + 1] - 0.012
            extrude_y(f"skirt{s}{k}", [(xa, 0.66), (xb, 0.66), (xb, 1.44), (xa, 1.44)], y0, y1, paint, tank, bevel=0.015)
            for b in range(5):
                bx = xa + 0.1 + b * (xb - xa - 0.2) / 4
                cyl(f"skirt_bolt{s}{k}{b}", (bx, s * 1.94, 1.38), 0.016, 0.025, "Y", paint2, tank, segs=8)
            box(f"skirt_handle{s}{k}", ((xa + xb) / 2, s * 1.945, 0.78), (0.18, 0.02, 0.03), steel, tank, bevel=0.005)
        extrude_y(f"skirt_rear{s}", [(-3.12, 1.0), (-2.9, 0.82), (-2.9, 1.44), (-3.12, 1.44)], y0, y1, paint, tank, bevel=0.01)
        box(f"skirt_rubber{s}", (0.3, s * 1.885, 0.62), (5.6, 0.05, 0.08), rubber, tank, bevel=0.01)
        # chevron marking on the front skirt
        for sign in (-1, 1):
            box(f"chevron{s}{sign}", (2.15, s * 1.932, 1.05 + sign * 0.09), (0.32, 0.004, 0.035), dark, tank, bevel=0, rot=(0, math.radians(sign * 28), 0))
        # tow cable along the hull side
        for k in range(24):
            x0 = -2.0 + k * 0.17
            rod(f"cable{s}{k}", (x0, s * 1.82, 1.52 + 0.03 * math.sin(k)), (x0 + 0.17, s * 1.82, 1.52 + 0.03 * math.sin(k + 1)), 0.022, dark, tank, segs=8)

    # ---------------- turret (child of the Turret empty, local coordinates around the turret ring)
    tur = bpy.data.objects.new("Turret", None)
    link(tur, tank)
    tur.location = TURRET_PIVOT
    cyl("turret_ring", (0, 0, 0.03), 1.02, 0.08, "Z", dark, tur, segs=64)
    plan = [(1.95, -0.45), (1.95, 0.45), (1.2, 1.74), (-1.55, 1.8), (-2.45, 1.62), (-2.45, -1.62), (-1.55, -1.8), (1.2, -1.74)]
    cx = -0.2
    low = [(cx + (x - cx) * 0.9, y * 0.88, 0.0) for x, y in plan]
    mid = [(x, y, 0.22) for x, y in plan]
    top = [(x - (0.22 if x > 1.0 else 0.0), y * 0.97, 0.8) for x, y in plan]
    loft("turret_body", [low, mid, top], paint, tur, bevel=0.03)
    # add-on armour plates on the cheeks, outlined so the faceted front reads clearly
    for s in (-1, 1):
        a, b = Vector((1.95, s * 0.45)), Vector((1.2, s * 1.74))
        d = b - a
        mid_p = (a + b) / 2
        n = Vector((d.y, -d.x)).normalized() * s  # outward normal of the cheek
        if n.x < 0:
            n = -n
        ang = math.atan2(d.y, d.x)
        box(f"cheek_plate{s}", (mid_p.x + n.x * 0.03, mid_p.y + n.y * 0.03, 0.45), (d.length * 0.92, 0.04, 0.5), paint2, tur, bevel=0.01, rot=(0, 0, ang))
        for k in range(3):
            p = a + d * (0.2 + 0.3 * k)
            cyl(f"cheek_bolt{s}{k}", (p.x + n.x * 0.06, p.y + n.y * 0.06, 0.66), 0.02, 0.03, "Z", steel, tur, segs=8)
        # side armour seam lines and the turret side stowage rail
        box(f"side_seam{s}", (-0.2, s * 1.79, 0.5), (2.6, 0.02, 0.02), dark, tur, bevel=0)
        for k, x in enumerate((-2.0, -1.3, -0.6, 0.1, 0.8)):
            rod(f"rail_post{s}{k}", (x, s * 1.77, 0.3), (x, s * 1.9, 0.3), 0.015, steel, tur)
            rod(f"rail_post_up{s}{k}", (x, s * 1.9, 0.3), (x, s * 1.9, 0.72), 0.015, steel, tur)
        rod(f"rail_top{s}", (-2.0, s * 1.9, 0.72), (0.8, s * 1.9, 0.72), 0.015, steel, tur)
        rod(f"rail_mid{s}", (-2.0, s * 1.9, 0.5), (0.8, s * 1.9, 0.5), 0.013, steel, tur)
        # smoke grenade launchers: block with six tubes
        gx, gy = 1.1, s * 1.62
        box(f"smoke_base{s}", (gx, gy, 0.72), (0.34, 0.24, 0.1), paint2, tur, rot=(0, 0, s * math.radians(-35)))
        for k in range(6):
            r_, c_ = divmod(k, 3)
            tube = cyl(f"smoke_tube{s}{k}", (gx + 0.08 + 0.02 * c_, gy + s * (-0.06 + c_ * 0.07), 0.8 + r_ * 0.07), 0.03, 0.22, "X", dark, tur, segs=12)
            tube.rotation_euler = (0, math.radians(70), s * math.radians(35))
        # lifting eyes and loop antenna base
        cyl(f"lift_eye{s}", (0.6, s * 1.55, 0.83), 0.04, 0.03, "Y", steel, tur)
        cyl(f"antenna_base{s}", (-2.1, s * 1.4, 0.85), 0.05, 0.1, "Z", dark, tur)
        rod(f"antenna{s}", (-2.1, s * 1.4, 0.9), (-2.15, s * 1.4, 2.4), 0.008, dark, tur, segs=6)

    # roof: blow-out panels over the ammunition bustle, the loader's and commander's hatches
    for s in (-1, 1):
        box(f"blowout{s}", (-1.75, s * 0.62, 0.81), (0.95, 0.95, 0.015), paint2, tur, bevel=0.004)
    box("roof_plate", (0.55, 0, 0.805), (1.0, 1.6, 0.012), paint2, tur, bevel=0.004)
    # commander's station (right side = -Y): cupola ring + CROWS remote weapon station with an M2
    cmd = Vector((-0.3, -0.72, 0.8))
    cyl("cupola_ring", cmd + Vector((0, 0, 0.06)), 0.42, 0.12, "Z", paint, tur, segs=48, bevel=0.01)
    for k in range(8):
        a = 2 * math.pi * k / 8
        box(f"vision_block{k}", cmd + Vector((0.4 * math.cos(a), 0.4 * math.sin(a), 0.1)), (0.04, 0.09, 0.05), glass, tur, bevel=0.004, rot=(0, 0, a))
    cyl("cupola_hatch", cmd + Vector((0, 0, 0.14)), 0.33, 0.05, "Z", paint2, tur, segs=48, bevel=0.01)
    box("crows_pedestal", cmd + Vector((0.1, 0, 0.3)), (0.32, 0.26, 0.28), paint, tur)
    box("crows_cradle", cmd + Vector((0.2, 0, 0.52)), (0.6, 0.32, 0.2), paint, tur)
    box("crows_sight", cmd + Vector((0.3, 0.24, 0.58)), (0.36, 0.18, 0.24), paint2, tur)
    cyl("crows_lens", cmd + Vector((0.49, 0.24, 0.6)), 0.06, 0.02, "X", glass, tur)
    box("crows_ammo", cmd + Vector((0.1, -0.24, 0.5)), (0.34, 0.16, 0.22), paint2, tur)
    box("m2_receiver", cmd + Vector((0.45, 0, 0.66)), (0.45, 0.11, 0.12), dark, tur, bevel=0.006)
    lathe_x("m2_barrel", [(0, 0.03), (0.15, 0.03), (0.15, 0.022), (1.1, 0.022), (1.1, 0.028), (1.18, 0.028)], dark, tur, segs=12, y=cmd.y, z=cmd.z + 0.66).location.x = cmd.x + 0.67
    # gunner's primary sight "doghouse" (right front)
    extrude_y("gps_doghouse", [(0.55, 0.8), (1.42, 0.8), (1.42, 0.92), (1.1, 1.08), (0.55, 1.08)], -1.0, -0.62, paint, tur, bevel=0.015)
    box("gps_window", (1.43, -0.81, 0.86), (0.02, 0.26, 0.08), glass, tur, bevel=0.004)
    for k in range(3):
        box(f"gps_shutter{k}", (1.3, -0.81 + (k - 1) * 0.12, 1.01), (0.2, 0.08, 0.02), paint2, tur, bevel=0.004, rot=(0, math.radians(26), 0))
    # commander's independent thermal viewer (CITV) on the left front
    citv = Vector((0.75, 0.62, 0.8))
    cyl("citv_base", citv + Vector((0, 0, 0.12)), 0.14, 0.24, "Z", paint, tur, segs=24, bevel=0.01)
    box("citv_head", citv + Vector((0.02, 0, 0.34)), (0.34, 0.3, 0.22), paint, tur)
    box("citv_window", citv + Vector((0.2, 0, 0.35)), (0.02, 0.22, 0.12), glass, tur, bevel=0.004)
    # loader's hatch and swing-mounted M240
    ld = Vector((-0.4, 0.75, 0.8))
    cyl("loader_ring", ld + Vector((0, 0, 0.03)), 0.36, 0.06, "Z", paint, tur, segs=40, bevel=0.008)
    cyl("loader_hatch", ld + Vector((0, 0, 0.08)), 0.3, 0.05, "Z", paint2, tur, segs=40, bevel=0.01)
    box("loader_shield", ld + Vector((0.2, 0.0, 0.3)), (0.04, 0.5, 0.3), paint, tur, rot=(0, 0, math.radians(10)))
    rod("m240_post", ld + Vector((0.1, -0.15, 0.08)), ld + Vector((0.1, -0.15, 0.38)), 0.02, dark, tur)
    box("m240_body", ld + Vector((0.3, -0.15, 0.42)), (0.5, 0.07, 0.09), dark, tur, bevel=0.006)
    rod("m240_barrel", ld + Vector((0.55, -0.15, 0.43)), ld + Vector((1.15, -0.15, 0.43)), 0.014, dark, tur)
    box("m240_ammo", ld + Vector((0.2, -0.08, 0.36)), (0.14, 0.09, 0.12), paint2, tur, bevel=0.006)
    # wind sensor mast, tank-urban-survival thermal camera / rear box
    rod("wind_mast", (-0.95, 0.0, 0.8), (-0.95, 0.0, 1.35), 0.018, dark, tur)
    box("wind_head", (-0.95, 0.0, 1.38), (0.09, 0.03, 0.05), dark, tur, bevel=0.004)
    box("aux_box", (-1.25, -0.55, 0.92), (0.4, 0.3, 0.22), paint, tur)

    # bustle rack: tubular frame behind the turret with stowage boxes and a mesh floor
    bx0, bx1, by, bz0, bz1 = -2.45, -3.05, 1.62, 0.12, 0.72
    for s in (-1, 1):
        rod(f"rack_side_top{s}", (bx0, s * by, bz1), (bx1, s * by, bz1), 0.02, steel, tur)
        rod(f"rack_side_bot{s}", (bx0, s * by, bz0), (bx1, s * by, bz0), 0.02, steel, tur)
        rod(f"rack_corner{s}", (bx1, s * by, bz0), (bx1, s * by, bz1), 0.02, steel, tur)
    rod("rack_rear_top", (bx1, -by, bz1), (bx1, by, bz1), 0.02, steel, tur)
    rod("rack_rear_bot", (bx1, -by, bz0), (bx1, by, bz0), 0.02, steel, tur)
    rod("rack_rear_mid", (bx1, -by, (bz0 + bz1) / 2), (bx1, by, (bz0 + bz1) / 2), 0.016, steel, tur)
    for k in range(13):
        y = -by + k * (2 * by) / 12
        rod(f"rack_bar{k}", (bx1, y, bz0), (bx1, y, bz1), 0.01, steel, tur, segs=6)
    box("rack_floor", ((bx0 + bx1) / 2, 0, bz0), (0.6, 2 * by, 0.02), dark, tur, bevel=0)
    for k, (yy, w, h, m_) in enumerate(((-1.05, 0.9, 0.38, paint2), (-0.05, 0.85, 0.46, M["canvas"]), (0.95, 0.95, 0.34, paint2))):
        box(f"rack_cargo{k}", ((bx0 + bx1) / 2, yy, bz0 + h / 2 + 0.01), (0.5, w, h), m_, tur, bevel=0.03)
    for s in (-1, 1):
        box(f"jerrycan{s}", (bx1 + 0.12, s * 1.3, 0.42), (0.14, 0.32, 0.45), M["olive"], tur, bevel=0.02)

    # ---------------- gun: mantlet + 120 mm M256 with thermal sleeve, bore evacuator and muzzle reference sensor
    gun = bpy.data.objects.new("Gun", None)
    link(gun, tur)
    gun.location = (1.95, 0.0, 0.4)
    extrude_y("mantlet", [(-0.15, -0.3), (0.32, -0.22), (0.32, 0.24), (-0.15, 0.32)], -0.45, 0.45, paint, gun, bevel=0.02)
    box("mantlet_face", (0.33, 0, 0.0), (0.03, 0.5, 0.36), paint2, gun, bevel=0.008)
    box("coax_port", (0.34, 0.3, 0.05), (0.04, 0.08, 0.08), dark, gun, bevel=0.004)
    barrel = [(0.3, 0.2), (0.6, 0.2), (0.62, 0.16), (1.2, 0.14), (1.25, 0.12), (2.0, 0.115), (2.05, 0.1), (2.15, 0.1),
              (2.3, 0.155), (2.35, 0.165), (3.0, 0.165), (3.05, 0.155), (3.2, 0.1), (3.6, 0.098), (3.65, 0.105), (3.7, 0.098),
              (4.9, 0.09), (4.95, 0.1), (5.05, 0.1), (5.08, 0.09), (5.3, 0.09), (5.3, 0.06), (5.0, 0.06)]
    lathe_x("gun_barrel", barrel, paint, gun, segs=48)
    lathe_x("bore", [(5.0, 0.061), (5.31, 0.061)], dark, gun, segs=24)
    for k, x in enumerate((1.5, 2.6, 3.4, 4.3)):
        cyl(f"sleeve_band{k}", (x + 0.02, 0, 0), 0.172 if 2.3 < x < 3.0 else 0.122, 0.04, "X", paint2, gun, segs=48)
    box("mrs_mount", (5.0, 0, 0.13), (0.12, 0.05, 0.08), paint2, gun, bevel=0.006)

    return tank, tur, gun


# ------------------------------------------------------------------ cameras / rendering


def scene_coords():
    pts = []
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.name != "ShadowCatcher":
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    return pts


def shoot(fname, az, el, ortho, turret_deg=0.0, gun_elev=0.0, lens=55, margin=1.08):
    sc = bpy.context.scene
    tur = bpy.data.objects["Turret"]
    tur.rotation_euler = (0, 0, math.radians(turret_deg))
    bpy.data.objects["Gun"].rotation_euler = (0, -math.radians(gun_elev), 0)
    bpy.context.view_layer.update()
    cam_data = bpy.data.cameras.new(fname)
    cam_data.type = "ORTHO" if ortho else "PERSP"
    cam_data.lens = lens
    cam_data.clip_end = 300
    cam = bpy.data.objects.new(fname, cam_data)
    sc.collection.objects.link(cam)
    d = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)), math.cos(math.radians(el)) * math.sin(math.radians(az)), math.sin(math.radians(el))))
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    pts = scene_coords()
    centre = sum(pts, Vector()) / len(pts)
    cam.location = centre + d * 40
    bpy.context.view_layer.update()
    flat = [c for p in pts for c in p]
    loc, scale = cam.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), flat)
    if ortho:
        # frame by projecting every bound-box corner onto the camera's right / up axes
        rq = cam.rotation_euler.to_quaternion()
        right, up = rq @ Vector((1, 0, 0)), rq @ Vector((0, 1, 0))
        xs, ys = [p.dot(right) for p in pts], [p.dot(up) for p in pts]
        aspect = sc.render.resolution_x / sc.render.resolution_y
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        cam.location = right * cx + up * cy + d * (40 + centre.dot(d))
        cam_data.ortho_scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * aspect) * margin
    else:
        cam.location = Vector(loc) + (Vector(loc) - centre) * (margin - 1)
    sc.camera = cam
    sc.render.filepath = os.path.join(OUT, fname)
    bpy.ops.render.render(write_still=True)
    print(f"[abrams] wrote {fname}")


VIEWS = [  # file, azimuth, elevation, ortho, turret, gun elevation
    ("1-hero.png", 32, 20, False, 0, 0),
    ("2-side.png", 90, 0, True, 0, 0),
    ("3-front.png", 0, 0, True, 0, 0),
    ("4-rear.png", 215, 24, False, 0, 0),
    ("5-top.png", -90, 89.9, True, 0, 0),
    ("6-turret-45.png", -38, 24, False, 45, 6),
]


def make_materials():
    return {
        "paint": material("tan", TAN, rough=0.62),
        "paint2": material("tan_dark", "#b39a6d", rough=0.66),
        "dark": material("gunmetal", "#33312d", rough=0.45, metal=0.6, grain=0.05),
        "steel": material("steel", "#6b6457", rough=0.4, metal=0.85, grain=0.08),
        "rubber": material("rubber", "#1e1d1b", rough=0.85, grain=0.04),
        "track": material("track", "#3d3a35", rough=0.55, metal=0.7, grain=0.15, ao=0.08),
        "glass": material("glass", "#1b2a33", rough=0.08, metal=0.3, grain=0, ao=0),
        "red": material("red", "#8a1a12", rough=0.2, grain=0, ao=0, emit="#ff2a10"),
        "amber": material("amber", "#a86a10", rough=0.2, grain=0, ao=0),
        "canvas": material("canvas", "#a8916a", rough=0.95, grain=0.15),
        "olive": material("olive", "#6e6a45", rough=0.6),
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    reset()
    build(make_materials())
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    for v in VIEWS:
        shoot(*v)
    # leave the saved scene with the turret forward
    bpy.data.objects["Turret"].rotation_euler = (0, 0, 0)
    bpy.data.objects["Gun"].rotation_euler = (0, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)


if __name__ == "__main__":
    main()
