"""
T-90M "Proryv" main battle tank (Russian green) for the Research Lab: built procedurally in Blender, 6 views rendered into
ui/public/research-lab/t90m/, scene saved as tools/blender/t90m.blend. Self-contained (shares no code with other models).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/t90m_render.py

Env: T90_QUICK=1 (small fast test renders), T90_SAMPLES=<n>.
Rig: turret parts are children of the empty "Turret" (rotate Z to traverse), the gun of "Gun" (rotate Y, negative = up).
Axes: +X front, +Y left, +Z up, metres.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(DIR))
OUT_DIR = os.path.join(REPO, "ui", "public", "research-lab", "t90m")
BLEND_PATH = os.path.join(DIR, "t90m.blend")
FAST = bool(os.environ.get("T90_QUICK"))
SPP = int(os.environ.get("T90_SAMPLES", "24" if FAST else "96"))
SIZE = (600, 450) if FAST else (1400, 1050)

# ------------------------------------------------------------------ shading


def to_linear(hexstr):
    h = hexstr.lstrip("#")
    rgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb) + (1.0,)


def shader(label, hexc, rough=0.7, metal=0.0, mottle=0.1, cavity=0.15, glow=None):
    """Principled surface with a mottled paint noise, fine bump and ambient-occlusion darkening in recesses."""
    mt = bpy.data.materials.new(label)
    mt.use_nodes = True
    tree = mt.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    col = to_linear(hexc)
    src = None
    if mottle > 0:
        tex = tree.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 4.5
        tex.inputs["Detail"].default_value = 12
        cr = tree.nodes.new("ShaderNodeValToRGB")
        cr.color_ramp.elements[0].color = tuple(c * (1 - mottle) for c in col[:3]) + (1,)
        cr.color_ramp.elements[1].color = tuple(min(1, c * (1 + mottle)) for c in col[:3]) + (1,)
        tree.links.new(tex.outputs["Fac"], cr.inputs["Fac"])
        src = cr.outputs["Color"]
        grit = tree.nodes.new("ShaderNodeTexNoise")
        grit.inputs["Scale"].default_value = 160.0
        bp = tree.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = 0.05
        tree.links.new(grit.outputs["Fac"], bp.inputs["Height"])
        tree.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    if cavity > 0:
        occ = tree.nodes.new("ShaderNodeAmbientOcclusion")
        occ.inputs["Distance"].default_value = cavity
        if src is not None:
            tree.links.new(src, occ.inputs["Color"])
        else:
            occ.inputs["Color"].default_value = col
        tree.links.new(occ.outputs["Color"], bsdf.inputs["Base Color"])
    elif src is not None:
        tree.links.new(src, bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = col
    if glow:
        bsdf.inputs["Emission Color"].default_value = to_linear(glow)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return mt


# ------------------------------------------------------------------ modelling primitives


def place(ob, parent):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def finish(label, bm, mt, parent=None, chamfer=0.0, soft=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(label)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mt)
    ob = bpy.data.objects.new(label, me)
    if soft:
        for poly in me.polygons:
            poly.use_smooth = True
        try:
            me.set_sharp_from_angle(angle=math.radians(40))
        except Exception:
            pass
    place(ob, parent)
    if chamfer > 0:
        bv = ob.modifiers.new("chamfer", "BEVEL")
        bv.width = chamfer
        bv.segments = 2
        bv.limit_method = "ANGLE"
        bv.angle_limit = math.radians(30)
    return ob


def block(label, centre, dims, mt, parent=None, chamfer=0.012, euler=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(dims), verts=bm.verts)
    ob = finish(label, bm, mt, parent, chamfer=min(chamfer, min(dims) * 0.3))
    ob.location = centre
    ob.rotation_euler = euler
    return ob


def skin(label, loops, mt, parent=None, chamfer=0.015, soft=False, capped=True):
    """Solid through a sequence of equal-length point loops."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in lp] for lp in loops]
    n = len(loops[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if capped:
        bm.faces.new(vs[0])
        bm.faces.new(vs[-1])
    return finish(label, bm, mt, parent, chamfer=chamfer, soft=soft)


def slab_y(label, outline_xz, ya, yb, mt, parent=None, chamfer=0.015):
    """Side outline (x, z) pushed across y from ya to yb."""
    return skin(label, [[(x, ya, z) for x, z in outline_xz], [(x, yb, z) for x, z in outline_xz]], mt, parent, chamfer)


def tube(label, a, b, r, mt, parent=None, sides=10):
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r, radius2=r, depth=d.length)
    ob = finish(label, bm, mt, parent, soft=True)
    ob.location = (a + b) / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    return ob


def drum(label, centre, r, length, axis, mt, parent=None, sides=32, chamfer=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r, radius2=r, depth=length)
    ob = finish(label, bm, mt, parent, chamfer=chamfer, soft=True)
    ob.location = centre
    ob.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return ob


def turned(label, prof, mt, parent=None, sides=40):
    """Body of revolution along +X: prof = [(x, radius), ...]."""
    loops = [[(x, r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides)) for i in range(sides)] for x, r in prof]
    return skin(label, loops, mt, parent, chamfer=0, soft=True)


def mesh_grid(label, origin, u_vec, v_vec, nu, nv, wire, mt, parent=None):
    """Flat wire net (wireframe modifier) spanning origin + s*u_vec + t*v_vec, nu × nv cells."""
    bm = bmesh.new()
    o, u, v = Vector(origin), Vector(u_vec), Vector(v_vec)
    vs = [[bm.verts.new(o + u * (i / nu) + v * (j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    me = bpy.data.meshes.new(label)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mt)
    ob = place(bpy.data.objects.new(label, me), parent)
    wf = ob.modifiers.new("wire", "WIREFRAME")
    wf.thickness = wire
    return ob


def outer_hull_2d(points):
    pts = sorted(set(points))

    def turn(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and turn(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and turn(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def even_points(loop, pitch):
    edges = [(loop[i], loop[(i + 1) % len(loop)]) for i in range(len(loop))]
    lens = [math.dist(a, b) for a, b in edges]
    count = max(8, round(sum(lens) / pitch))
    pitch = sum(lens) / count
    out, e, run = [], 0, 0.0
    for k in range(count):
        s = k * pitch
        while run + lens[e] < s:
            run += lens[e]
            e += 1
        a, b = edges[e]
        f = (s - run) / lens[e]
        out.append(((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), math.atan2(b[1] - a[1], b[0] - a[0])))
    return out


# ------------------------------------------------------------------ stage


def new_stage():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SPP
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = SIZE
    sc.view_settings.view_transform = "Standard"
    wd = bpy.data.worlds.new("sky")
    sc.world = wd
    wd.use_nodes = True
    bgn = wd.node_tree.nodes["Background"]
    bgn.inputs["Color"].default_value = (0.6, 0.65, 0.72, 1)
    bgn.inputs["Strength"].default_value = 0.75
    key = bpy.data.lights.new("key", "SUN")
    key.energy = 3.2
    key.angle = math.radians(3)
    ko = bpy.data.objects.new("key", key)
    sc.collection.objects.link(ko)
    ko.rotation_euler = (math.radians(40), math.radians(6), math.radians(125))
    rim = bpy.data.lights.new("rim", "SUN")
    rim.energy = 0.9
    ro = bpy.data.objects.new("rim", rim)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(58), 0, math.radians(-55))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    floor = finish("Floor", bm, shader("floor", "#ffffff", mottle=0, cavity=0))
    floor.is_shadow_catcher = True


# ------------------------------------------------------------------ the T-90M

GREEN = "#56623f"
WHEELS_X = [-2.3, -1.42, -0.54, 0.34, 1.22, 2.1]
WHEEL_R, WHEEL_Z = 0.37, 0.43
IDLER_C = (2.92, 0.64, 0.26)
SPROCKET_C = (-3.06, 0.68, 0.29)
SUPPORT = [(-1.85, 1.03, 0.08), (-0.1, 1.03, 0.08), (1.65, 1.03, 0.08)]
TRACK_CY, TRACK_WIDTH, SHOE = 1.37, 0.58, 0.07
TURRET_AT = (-0.25, 0.0, 1.36)
GLACIS_DEG = math.degrees(math.atan2(1.36 - 0.92, 3.42 - 2.05))


def assemble(K):
    g, g2, rubber, iron, dark, lens, net, red, amber = K["green"], K["green2"], K["rubber"], K["iron"], K["dark"], K["lens"], K["net"], K["red"], K["amber"]
    root = place(bpy.data.objects.new("T-90M", None), None)

    # ---------------- hull body
    slab_y("lower_hull", [(-3.42, 0.4), (2.6, 0.4), (3.38, 0.82), (3.38, 1.14), (-3.42, 1.14)], -1.04, 1.04, g, root)
    upper = [(-3.48, 1.12), (3.3, 1.12), (3.42, 0.92), (3.46, 0.98), (2.05, 1.36), (-3.3, 1.36), (-3.48, 1.26)]
    slab_y("upper_hull", upper, -1.62, 1.62, g, root, chamfer=0.025)
    # fenders running the full length, with mudguard flaps fore and aft
    for s in (-1, 1):
        block(f"fender{s}", (-0.05, s * 1.67, 1.14), (6.95, 0.1, 0.04), g2, root, chamfer=0.01)
        slab_y(f"front_mudguard{s}", [(3.3, 1.12), (3.62, 0.98), (3.66, 1.04), (3.34, 1.17)], s * 1.1, s * 1.72, g2, root, chamfer=0.01)

    # glacis: Relikt ERA in a forward-pointing chevron, laid on the sloped plate
    gl = place(bpy.data.objects.new("glacis_frame", None), root)
    gl.location = (3.42, 0, 0.92)
    gl.rotation_euler = (0, math.radians(GLACIS_DEG), 0)
    run = math.hypot(3.42 - 2.05, 1.36 - 0.92)
    block("glacis_base", (-run / 2, 0, 0.02), (run, 2.3, 0.04), g2, gl)
    for s in (-1, 1):
        for row in range(2):
            for k in range(4):
                side = s * (0.2 + k * 0.27)
                along = -0.3 - row * 0.6 - abs(side) * 0.35  # rows sweep back towards the sides: a forward-pointing chevron
                block(f"glacis_era{s}{row}{k}", (along, side, 0.08), (0.52, 0.25, 0.09), g, gl, chamfer=0.012, euler=(0, 0, s * math.radians(-20)))
    block("driver_hatch", (-run + 0.2, 0.0, 0.05), (0.36, 0.5, 0.06), g2, gl, chamfer=0.01)
    for k in range(2):
        block(f"driver_scope{k}", (-run + 0.38, (k - 0.5) * 0.18, 0.08), (0.06, 0.14, 0.06), lens, gl, chamfer=0.004)
    # front: tow hooks, headlights in guards, splash board
    for s in (-1, 1):
        drum(f"tow_hook{s}", (3.4, s * 0.62, 0.86), 0.07, 0.06, "Y", iron, root, chamfer=0.01)
        block(f"tow_lug{s}", (3.36, s * 0.62, 0.86), (0.1, 0.14, 0.12), g2, root)
        hl = Vector((3.25, s * 1.32, 1.24))
        block(f"lamp_box{s}", hl, (0.12, 0.2, 0.1), dark, root, chamfer=0.008)
        drum(f"lamp{s}", hl + Vector((0.07, 0.04, 0.0)), 0.04, 0.04, "X", lens, root)
        block(f"lamp_amber{s}", hl + Vector((0.065, -0.06, 0.0)), (0.03, 0.04, 0.04), amber, root, chamfer=0.004)
        for o in (-0.11, 0.11):
            tube(f"lamp_guard{s}{o}", hl + Vector((-0.06, o, -0.05)), hl + Vector((0.12, o, 0.08)), 0.01, iron, root)

    # engine deck: grilles, access panels, rear fuel drums, unditching log, rear plate
    block("engine_deck", (-2.45, 0, 1.375), (1.75, 2.6, 0.03), g2, root)
    for k in range(10):
        block(f"deck_louvre{k}", (-3.2 + k * 0.08, 0.55, 1.4), (0.035, 1.1, 0.025), dark, root, chamfer=0.003)
        block(f"deck_louvre_b{k}", (-3.2 + k * 0.08, -0.55, 1.4), (0.035, 1.1, 0.025), dark, root, chamfer=0.003)
    for s in (-1, 1):
        block(f"deck_panel{s}", (-1.35, s * 1.05, 1.372), (1.0, 0.85, 0.025), g2, root, chamfer=0.005)
        for k in range(3):
            drum(f"deck_bolt{s}{k}", (-1.75 + k * 0.4, s * 0.62, 1.39), 0.02, 0.02, "Z", iron, root, sides=8)
    block("rear_plate", (-3.47, 0, 0.88), (0.06, 2.1, 0.88), g, root, chamfer=0.02)
    for s in (-1, 1):
        drum(f"fuel_drum{s}", (-3.68, s * 0.65, 1.2), 0.29, 0.92, "Y", g2, root, sides=40, chamfer=0.01)
        for k in (-0.3, 0.0, 0.3):
            drum(f"drum_rib{s}{k}", (-3.68, s * 0.65 + k, 1.2), 0.3, 0.025, "Y", g, root, sides=40)
        block(f"drum_bracket{s}", (-3.52, s * 0.65, 1.0), (0.12, 0.7, 0.08), dark, root)
        block(f"tail_lamp{s}", (-3.51, s * 1.45, 1.08), (0.04, 0.12, 0.08), red, root, chamfer=0.005)
    drum("log", (-3.6, 0, 0.72), 0.13, 2.9, "Y", K["wood"], root, sides=20)
    block("tow_pintle", (-3.52, 0, 0.55), (0.12, 0.3, 0.14), dark, root)
    # exhaust louvre on the left rear side
    block("exhaust_box", (-2.85, 1.66, 1.22), (0.55, 0.06, 0.16), dark, root, chamfer=0.006)
    for k in range(6):
        block(f"exhaust_vane{k}", (-3.07 + k * 0.09, 1.7, 1.22), (0.03, 0.02, 0.14), iron, root, chamfer=0.002)

    # ---------------- running gear and tracks (both sides)
    for s in (-1, 1):
        cy = s * TRACK_CY
        for i, x in enumerate(WHEELS_X):
            for half in (-1, 1):
                yy = cy + half * 0.14
                drum(f"tyre{s}{i}{half}", (x, yy, WHEEL_Z), WHEEL_R, 0.12, "Y", rubber, root, sides=48)
                drum(f"rim{s}{i}{half}", (x, yy + half * 0.065, WHEEL_Z), 0.31, 0.02, "Y", g, root, sides=48, chamfer=0.006)
            face = cy + s * 0.215
            drum(f"hub{s}{i}", (x, face, WHEEL_Z), 0.11, 0.05, "Y", g2, root, chamfer=0.01)
            drum(f"hub_cap{s}{i}", (x, face + s * 0.03, WHEEL_Z), 0.055, 0.03, "Y", iron, root)
            for k in range(8):
                a = 2 * math.pi * (k + 0.5) / 8
                drum(f"spoke_hole{s}{i}{k}", (x + 0.205 * math.cos(a), face - s * 0.012, WHEEL_Z + 0.205 * math.sin(a)), 0.045, 0.012, "Y", dark, root, sides=12)
            block(f"swing_arm{s}{i}", (x + 0.2, s * 1.06, WHEEL_Z + 0.06), (0.42, 0.1, 0.11), g2, root, euler=(0, math.radians(-12), 0))
        ix, iz, ir = IDLER_C
        for half in (-1, 1):
            drum(f"idler{s}{half}", (ix, cy + half * 0.14, iz), ir, 0.1, "Y", g, root, sides=40, chamfer=0.008)
        drum(f"idler_hub{s}", (ix, cy + s * 0.2, iz), 0.08, 0.05, "Y", iron, root)
        for j, (rx, rz, rr) in enumerate(SUPPORT):
            drum(f"support{s}{j}", (rx, cy, rz), rr, 0.26, "Y", rubber, root)
        sx, sz, sr = SPROCKET_C
        n = 12
        teeth = []
        for k in range(n * 4):
            a = 2 * math.pi * k / (n * 4)
            rad = sr + 0.05 if k % 4 in (1, 2) else sr - 0.01
            teeth.append((sx + rad * math.cos(a), sz + rad * math.sin(a)))
        for half in (-1, 1):
            y0 = cy + half * 0.14
            slab_y(f"sprocket{s}{half}", teeth, y0 - 0.035, y0 + 0.035, iron, root, chamfer=0.006)
        drum(f"sprocket_core{s}", (sx, cy, sz), 0.2, 0.3, "Y", g, root)
        drum(f"sprocket_cap{s}", (sx, cy + s * 0.2, sz), 0.12, 0.06, "Y", g2, root, chamfer=0.01)
        for k in range(8):
            a = 2 * math.pi * k / 8
            drum(f"sprocket_nut{s}{k}", (sx + 0.085 * math.cos(a), cy + s * 0.235, sz + 0.085 * math.sin(a)), 0.013, 0.02, "Y", iron, root, sides=6)
        # the belt: links laid along the taut outline round every wheel, with end connectors and inner guide teeth
        ring = []
        for cx, cz, cr in [(x, WHEEL_Z, WHEEL_R) for x in WHEELS_X] + [IDLER_C, (sx, sz, sr + 0.015)] + SUPPORT:
            for k in range(72):
                a = 2 * math.pi * k / 72
                ring.append((round(cx + (cr + SHOE / 2) * math.cos(a), 5), round(cz + (cr + SHOE / 2) * math.sin(a), 5)))
        bm = bmesh.new()
        for (px, pz), ang in even_points(outer_hull_2d(ring), 0.15):
            m = Matrix.Translation((px, cy, pz)) @ Matrix.Rotation(-ang, 4, "Y")
            bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Diagonal((0.13, TRACK_WIDTH, SHOE, 1)))
            bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Translation((0, 0, -0.045)) @ Matrix.Diagonal((0.04, TRACK_WIDTH * 0.9, 0.025, 1)))  # grouser
            for e in (-1, 1):
                bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Translation((0, e * (TRACK_WIDTH / 2 + 0.02), 0)) @ Matrix.Diagonal((0.07, 0.045, 0.08, 1)))
            bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Translation((0, 0, 0.06)) @ Matrix.Diagonal((0.06, 0.05, 0.07, 1)))
        finish(f"track{s}", bm, K["track"], root, chamfer=0.007)

        # side protection: rubber skirt, ERA box panels over the front half, slat armour over the engine bay
        block(f"rubber_skirt{s}", (0.15, s * 1.72, 0.98), (5.9, 0.03, 0.3), rubber, root, chamfer=0.008)
        for k in range(5):
            x0 = 0.15 + k * 0.62
            block(f"era_panel{s}{k}", (x0, s * 1.76, 0.94), (0.58, 0.1, 0.4), g, root, chamfer=0.015)
            for r_ in range(2):
                block(f"era_rib{s}{k}{r_}", (x0, s * 1.815, 0.84 + r_ * 0.2), (0.54, 0.012, 0.02), g2, root, chamfer=0)
            for c_ in (-0.22, 0.22):
                drum(f"era_bolt{s}{k}{c_}", (x0 + c_, s * 1.815, 1.08), 0.016, 0.02, "Y", iron, root, sides=8)
        slat_x0, slat_x1 = -3.3, -0.25
        for k in range(16):
            x = slat_x0 + k * (slat_x1 - slat_x0) / 15
            block(f"slat_post{s}{k}", (x, s * 1.78, 0.96), (0.03, 0.03, 0.42), net, root, chamfer=0.004)
        for z in (0.78, 0.96, 1.14):
            block(f"slat_bar{s}{z}", ((slat_x0 + slat_x1) / 2, s * 1.785, z), (slat_x1 - slat_x0, 0.025, 0.035), net, root, chamfer=0.004)
        for k in range(6):
            x = -3.0 + k * 0.55
            tube(f"slat_bracket{s}{k}", (x, s * 1.64, 1.14), (x, s * 1.78, 1.14), 0.012, net, root)
        # spare track links / stowage boxes on the fender
        for k in range(3):
            block(f"fender_box{s}{k}", (-1.6 + k * 0.95, s * 1.5, 1.27), (0.85, 0.28, 0.24), g2, root, chamfer=0.02)
            block(f"box_latch{s}{k}", (-1.6 + k * 0.95, s * 1.645, 1.3), (0.06, 0.015, 0.05), iron, root, chamfer=0)

    # ---------------- turret
    tur = place(bpy.data.objects.new("Turret", None), root)
    tur.location = TURRET_AT
    drum("turret_ring", (0, 0, 0.03), 1.0, 0.07, "Z", dark, tur, sides=64)
    plan = [(1.5, -0.32), (1.5, 0.32), (1.05, 1.18), (0.45, 1.48), (-0.95, 1.46), (-1.15, 1.26), (-2.3, 1.22),
            (-2.3, -1.22), (-1.15, -1.26), (-0.95, -1.46), (0.45, -1.48), (1.05, -1.18)]
    pivot_x = -0.4
    foot = [(pivot_x + (x - pivot_x) * 0.9, y * 0.86, 0.0) for x, y in plan]
    waist = [(x, y, 0.16) for x, y in plan]
    crown = [(x - (0.3 if x > 0.9 else 0.12 if x > 0.3 else 0.0), y * 0.93, 0.66) for x, y in plan]
    skin("turret_shell", [foot, waist, crown], g, tur, chamfer=0.03)
    block("bustle_lid", (-1.75, 0, 0.665), (1.05, 2.25, 0.02), g2, tur, chamfer=0.006)
    # Relikt ERA: sloped wedge blocks on the roof front, rows of boxes on the cheeks
    for s in (-1, 1):
        wedge = [(0.35, s * 0.36), (1.48, s * 0.36), (1.12, s * 1.15), (0.45, s * 1.42)]
        if s < 0:
            wedge.reverse()
        lo = [(x, y, 0.66) for x, y in wedge]
        hi = [(x - 0.1, y * 0.97, 0.66 + (0.2 if x > 1.0 else 0.08)) for x, y in wedge]
        skin(f"roof_era{s}", [lo, hi], g, tur, chamfer=0.02)
        for k in range(4):
            block(f"roof_era_seam{s}{k}", (0.6 + k * 0.22, s * 0.85, 0.79 + k * 0.025), (0.015, 0.95, 0.015), g2, tur, chamfer=0, euler=(0, math.radians(-10), s * math.radians(-28)))
        a, b = Vector((1.5, s * 0.32)), Vector((1.05, s * 1.18))
        d = b - a
        ang = math.atan2(d.y, d.x)
        for row in range(2):
            for k in range(3):
                p = a + d * (0.18 + 0.32 * k)
                block(f"cheek_era{s}{row}{k}", (p.x + 0.1, p.y + s * 0.05, 0.2 + row * 0.24), (d.length * 0.3, 0.12, 0.21), g, tur, chamfer=0.012, euler=(0, 0, ang))
        # smoke grenade launchers (6 per side), angled forward and up
        for k in range(6):
            t_ = tube(f"smoke{s}{k}", (0, 0, 0), (0.22, 0, 0), 0.035, dark, tur, sides=12)
            t_.location = (0.55 - (k % 3) * 0.08, s * (1.36 - (k % 3) * 0.04), 0.5 + (k // 3) * 0.08)
            t_.rotation_mode = "XYZ"
            t_.rotation_euler = (0, math.radians(65), s * math.radians(40))
        block(f"smoke_rack{s}", (0.5, s * 1.32, 0.48), (0.3, 0.12, 0.06), g2, tur, chamfer=0.01, euler=(0, 0, s * math.radians(40)))
        # anti-cumulative net screen round the turret sides and bustle, on a tube frame
        y_out = s * 1.62
        for x in (-2.35, -1.6, -0.85, -0.1):
            tube(f"net_post{s}{x}", (x, s * 1.42, 0.12), (x, y_out, 0.12), 0.015, net, tur)
            tube(f"net_upright{s}{x}", (x, y_out, 0.08), (x, y_out, 0.58), 0.015, net, tur)
        tube(f"net_rail_top{s}", (-2.35, y_out, 0.58), (-0.1, y_out, 0.58), 0.015, net, tur)
        tube(f"net_rail_bot{s}", (-2.35, y_out, 0.08), (-0.1, y_out, 0.08), 0.015, net, tur)
        mesh_grid(f"net_side{s}", (-2.35, y_out, 0.08), (2.25, 0, 0), (0, 0, 0.5), 30, 7, 0.008, net, tur)
        # stowage boxes along the turret flanks, under the net
        block(f"flank_box{s}", (-1.3, s * 1.38, 0.32), (1.4, 0.16, 0.36), g2, tur, chamfer=0.015)
    y_rear = 1.62
    tube("net_rear_top", (-2.5, -y_rear, 0.58), (-2.5, y_rear, 0.58), 0.015, net, tur)
    tube("net_rear_bot", (-2.5, -y_rear, 0.08), (-2.5, y_rear, 0.08), 0.015, net, tur)
    for s in (-1, 1):
        tube(f"net_corner{s}", (-2.35, s * y_rear, 0.58), (-2.5, s * y_rear, 0.58), 0.015, net, tur)
    mesh_grid("net_rear", (-2.5, -y_rear, 0.08), (0, 2 * y_rear, 0), (0, 0, 0.5), 40, 7, 0.008, net, tur)
    block("bustle_box", (-2.42, 0, 0.36), (0.18, 2.0, 0.42), g2, tur, chamfer=0.02)

    # commander (right, -Y): cupola + remote Kord 12.7 mm with shield
    cm = Vector((-0.55, -0.68, 0.66))
    drum("cupola", cm + Vector((0, 0, 0.07)), 0.38, 0.14, "Z", g, tur, sides=48, chamfer=0.012)
    for k in range(6):
        a = math.pi * (0.2 + 0.32 * k)
        block(f"cupola_prism{k}", cm + Vector((0.36 * math.cos(a), 0.36 * math.sin(a), 0.1)), (0.04, 0.1, 0.05), lens, tur, chamfer=0.004, euler=(0, 0, a))
    drum("cupola_hatch", cm + Vector((-0.05, 0, 0.16)), 0.3, 0.05, "Z", g2, tur, sides=40, chamfer=0.01)
    block("rws_base", cm + Vector((0.15, 0, 0.3)), (0.36, 0.3, 0.24), g, tur)
    block("rws_sight", cm + Vector((0.32, 0.2, 0.42)), (0.26, 0.16, 0.2), g2, tur)
    drum("rws_lens", cm + Vector((0.46, 0.2, 0.44)), 0.05, 0.02, "X", lens, tur)
    block("kord_body", cm + Vector((0.35, -0.05, 0.47)), (0.55, 0.12, 0.12), dark, tur, chamfer=0.006)
    turned("kord_barrel", [(0.0, 0.026), (0.95, 0.026), (0.95, 0.034), (1.06, 0.034)], dark, tur, sides=12).location = cm + Vector((0.6, -0.05, 0.47))
    block("kord_ammo", cm + Vector((0.2, -0.2, 0.42)), (0.26, 0.14, 0.18), g2, tur, chamfer=0.01)
    # gunner (left, +Y): Sosna-U sight box and hatch
    gn = Vector((0.15, 0.68, 0.7))
    block("sosna_body", gn + Vector((0, 0, 0.16)), (0.5, 0.36, 0.3), g, tur, chamfer=0.02)
    block("sosna_head", gn + Vector((0.1, 0, 0.36)), (0.36, 0.3, 0.12), g2, tur, chamfer=0.015)
    block("sosna_window", gn + Vector((0.26, 0, 0.18)), (0.02, 0.26, 0.14), lens, tur, chamfer=0.005)
    drum("gunner_hatch", (-0.65, 0.68, 0.69), 0.3, 0.05, "Z", g2, tur, sides=40, chamfer=0.01)
    # roof fittings: wind sensor mast, antennas, crosswind sensor, lifting eyes
    tube("wind_mast", (-1.2, -0.2, 0.66), (-1.2, -0.2, 1.3), 0.018, dark, tur)
    block("wind_head", (-1.2, -0.2, 1.33), (0.08, 0.03, 0.05), dark, tur, chamfer=0.004)
    for s in (-1, 1):
        drum(f"antenna_foot{s}", (-2.0, s * 0.9, 0.73), 0.05, 0.1, "Z", dark, tur)
        tube(f"antenna{s}", (-2.0, s * 0.9, 0.78), (-2.05, s * 0.9, 2.4), 0.008, dark, tur, sides=6)
        drum(f"lift_eye{s}", (0.0, s * 1.3, 0.68), 0.035, 0.03, "Y", iron, tur)

    # ---------------- gun: 125 mm 2A46M-5 with mantlet dust cover, thermal sleeve, bore evacuator, muzzle sensor
    gun = place(bpy.data.objects.new("Gun", None), tur)
    gun.location = (1.42, 0.0, 0.36)
    turned("mantlet_cover", [(-0.1, 0.32), (0.12, 0.3), (0.28, 0.2), (0.42, 0.17)], K["canvas"], gun, sides=32)
    block("coax_port", (0.05, 0.38, 0.06), (0.1, 0.08, 0.08), dark, gun, chamfer=0.004)
    barrel = [(0.4, 0.17), (0.55, 0.15), (1.3, 0.13), (1.32, 0.12), (2.0, 0.115), (2.05, 0.12), (2.1, 0.115),
              (2.55, 0.112), (2.62, 0.16), (2.7, 0.17), (3.3, 0.17), (3.38, 0.16), (3.45, 0.105), (4.2, 0.1),
              (4.25, 0.106), (4.3, 0.1), (5.2, 0.092), (5.22, 0.098), (5.3, 0.098), (5.3, 0.065), (5.05, 0.065)]
    turned("barrel", barrel, g, gun, sides=48)
    turned("bore", [(5.05, 0.066), (5.31, 0.066)], dark, gun, sides=24)
    for k, x in enumerate((0.9, 1.6, 2.35, 3.8, 4.7)):
        drum(f"sleeve_clamp{k}", (x, 0, 0), 0.175 if 2.6 < x < 3.4 else 0.124, 0.035, "X", g2, gun, sides=48)
    block("mrs_box", (5.12, 0, 0.13), (0.12, 0.05, 0.07), g2, gun, chamfer=0.006)
    return root, tur, gun


# ------------------------------------------------------------------ views


def mesh_corners():
    pts = []
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.name != "Floor":
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    return pts


def photograph(fname, az, el, ortho, traverse=0.0, elevate=0.0, lens_mm=55, pad=1.08):
    sc = bpy.context.scene
    bpy.data.objects["Turret"].rotation_euler = (0, 0, math.radians(traverse))
    bpy.data.objects["Gun"].rotation_euler = (0, -math.radians(elevate), 0)
    bpy.context.view_layer.update()
    cd = bpy.data.cameras.new(fname)
    cd.type = "ORTHO" if ortho else "PERSP"
    cd.lens = lens_mm
    cd.clip_end = 300
    cam = bpy.data.objects.new(fname, cd)
    sc.collection.objects.link(cam)
    back = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)), math.cos(math.radians(el)) * math.sin(math.radians(az)), math.sin(math.radians(el))))
    cam.rotation_euler = (-back).to_track_quat("-Z", "Y").to_euler()
    pts = mesh_corners()
    mid = sum(pts, Vector()) / len(pts)
    if ortho:
        q = cam.rotation_euler.to_quaternion()
        rv, uv = q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0))
        xs, ys = [p.dot(rv) for p in pts], [p.dot(uv) for p in pts]
        aspect = sc.render.resolution_x / sc.render.resolution_y
        cam.location = rv * (min(xs) + max(xs)) / 2 + uv * (min(ys) + max(ys)) / 2 + back * (40 + mid.dot(back))
        cd.ortho_scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * aspect) * pad
    else:
        cam.location = mid + back * 40
        bpy.context.view_layer.update()
        loc, _ = cam.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), [c for p in pts for c in p])
        cam.location = Vector(loc) + (Vector(loc) - mid) * (pad - 1)
    sc.camera = cam
    sc.render.filepath = os.path.join(OUT_DIR, fname)
    bpy.ops.render.render(write_still=True)
    print(f"[t90m] wrote {fname}")


SHOTS = [
    ("1-hero.png", 30, 18, False, 0, 0),
    ("2-side.png", 90, 0, True, 0, 0),
    ("3-front.png", 0, 0, True, 0, 0),
    ("4-rear.png", 210, 24, False, 0, 0),
    ("5-top.png", -90, 89.9, True, 0, 0),
    ("6-turret-45.png", -35, 22, False, 40, 5),
]


def palette():
    return {
        "green": shader("green", GREEN, rough=0.72),
        "green2": shader("green_dark", "#4a5536", rough=0.75),
        "rubber": shader("rubber", "#1f211c", rough=0.9, mottle=0.04),
        "track": shader("track", "#3a3832", rough=0.6, metal=0.65, mottle=0.16, cavity=0.08),
        "iron": shader("iron", "#5d5a50", rough=0.45, metal=0.8, mottle=0.08),
        "dark": shader("dark", "#2c2d28", rough=0.5, metal=0.5, mottle=0.05),
        "lens": shader("lens", "#16232b", rough=0.08, metal=0.3, mottle=0, cavity=0),
        "net": shader("net", "#3a4130", rough=0.8, metal=0.2, mottle=0.05, cavity=0.05),
        "red": shader("red", "#8a1a12", rough=0.2, mottle=0, cavity=0, glow="#ff2a10"),
        "amber": shader("amber", "#a86a10", rough=0.2, mottle=0, cavity=0),
        "canvas": shader("canvas", "#4c5435", rough=0.95, mottle=0.18),
        "wood": shader("wood", "#6b5236", rough=0.85, mottle=0.2),
    }


def run():
    os.makedirs(OUT_DIR, exist_ok=True)
    new_stage()
    assemble(palette())
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    for shot in SHOTS:
        photograph(*shot)
    bpy.data.objects["Turret"].rotation_euler = (0, 0, 0)
    bpy.data.objects["Gun"].rotation_euler = (0, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)


if __name__ == "__main__":
    run()
