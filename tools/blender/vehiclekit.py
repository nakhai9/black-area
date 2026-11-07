"""
Shared INFRASTRUCTURE for single-sheet ground vehicles (ART_GUIDE section 1: only camera, lighting, sheet export, basic
materials and primitives are shared; every vehicle builds all of its own geometry in its own script).

Sheet contract (ui/src/render/MantisSheet.ts): one row of 32 cells, screen headings clockwise from North (column 0 =
nose straight up the screen), CELL_PX stored px per cell laid out on a LAYOUT_PX grid, the vehicle's ground centre at
ANCHOR, orthographic view 30 deg above the ground, the soft ground shadow baked into each cell (shadow catcher).
Every vehicle of a group is drawn the same length on screen: its overall length spans LENGTH_PX layout px.

Axes of the models: +X front, +Y left, +Z up, metres.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(THIS_DIR))
SPRITE_DIR = os.path.join(REPO_ROOT, "ui", "public", "sprites")

LAYOUT_PX, HEADINGS = 128, 32
CELL_PX, OVERSAMPLE = 256, 2
ANCHOR = (64, 84)
LENGTH_PX = 80
VIEW_ELEV = math.radians(30)
STRETCH_Z = 1.3  # RA2-style chunky look, kept low so raised launchers stay inside the cell


# ------------------------------------------------------------------ materials


def lin_rgba(hexc):
    h = hexc.lstrip("#")
    ch = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in ch) + (1.0,)


def _grime(nt, base_socket_value, bsdf, amount=0.04, scale=6.0):
    """Light grime: base colour darkened by up to `amount` with a fine noise (ART_GUIDE 6: 3-5 %, never blotchy)."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = base_socket_value
    dark = tuple(c * (1 - amount * 2.5) for c in base_socket_value[:3]) + (1.0,)
    mix.inputs[7].default_value = dark
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.35
    ramp.inputs["From Max"].default_value = 0.75
    ramp.inputs["To Max"].default_value = 0.4
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])


def mat(name, hexc, rough=0.65, metal=0.0, grime=True, glass=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = lin_rgba(hexc)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if glass:
        bsdf.inputs["Coat Weight"].default_value = 0.6
    elif grime:
        _grime(nt, lin_rgba(hexc), bsdf)
    return m


def camo_mat(name, colors, scale=0.9, rough=0.7, digital=False):
    """Camouflage: Voronoi patches (or a coarse pixel grid for digital schemes) stepped through `colors`."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    tc = nt.nodes.new("ShaderNodeTexCoord")
    src = tc.outputs["Object"]
    if digital:
        snap = nt.nodes.new("ShaderNodeVectorMath")
        snap.operation = "SNAP"
        snap.inputs[1].default_value = (0.18, 0.18, 0.18)
        nt.links.new(src, snap.inputs[0])
        src = snap.outputs[0]
    cells = nt.nodes.new("ShaderNodeTexVoronoi" if not digital else "ShaderNodeTexWhiteNoise")
    if not digital:
        cells.inputs["Scale"].default_value = scale
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    r = ramp.color_ramp
    r.interpolation = "CONSTANT"
    n = len(colors)
    r.elements[0].position, r.elements[0].color = 0.0, lin_rgba(colors[0])
    r.elements[1].position, r.elements[1].color = 1.0 / n, lin_rgba(colors[1 % n])
    for i in range(2, n):
        r.elements.new(i / n).color = lin_rgba(colors[i])
    nt.links.new(src, cells.inputs["Vector"])
    nt.links.new(cells.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m


# ------------------------------------------------------------------ primitives


def node(name, loc, parent, rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def mesh_object(name, bm, material, parent, bevel=0.0, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    if smooth:
        for poly in me.polygons:
            poly.use_smooth = True
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return ob


def hull(name, pts, material, parent, bevel=0.015):
    """Convex hull of points: hard plates with a small chamfer (ART_GUIDE 5: bevel 1-3 cm)."""
    bm = bmesh.new()
    made = [bm.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=made)
    junk = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)}
    if junk:
        bmesh.ops.delete(bm, geom=list(junk), context="VERTS")
    return mesh_object(name, bm, material, parent, bevel)


def box(name, c, s, material, parent, bevel=0.012):
    return hull(name, [(c[0] + i * s[0] / 2, c[1] + j * s[1] / 2, c[2] + k * s[2] / 2) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)], material, parent, bevel)


def cyl(name, c, radius, length, axis, material, parent, sides=24, radius2=None):
    """Cylinder (or cone with radius2) centred on c along axis X/Y/Z, smooth sides and sharp caps."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=radius, radius2=radius if radius2 is None else radius2, depth=length)
    for f in bm.faces:
        f.smooth = len(f.verts) == 4
    ob = mesh_object(name, bm, material, parent)
    ob.location = c
    ob.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return ob


def tube_between(name, a, b, radius, material, parent, sides=12):
    """Round bar from point a to point b (frames, rails, hydraulic rams)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = cyl(name, (0, 0, 0), radius, d.length, "Z", material, parent, sides)
    ob.location = (a + b) / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = d.to_track_quat("Z", "Y")
    return ob


def wheel(name, x, y, z, r, width, tyre, rim, hub, parent, side):
    """Road wheel: tread band with lugs, sidewall, rim and hub on the outer face (side = +1 left, -1 right)."""
    cyl(f"{name}_tyre", (x, y, z), r, width, "Y", tyre, parent, 32)
    for k in range(16):
        a = k / 16 * 2 * math.pi
        lug = box(f"{name}_lug{k}", (r, 0, 0), (0.04, width * 0.9, 0.05), tyre, parent, 0.005)
        lug.location = (x, y, z)
        lug.rotation_euler = (0, -a, 0)
    cyl(f"{name}_rim", (x, y + side * width * 0.46, z), r * 0.6, 0.04, "Y", rim, parent, 24)
    cyl(f"{name}_hub", (x, y + side * width * 0.5, z), r * 0.22, 0.08, "Y", hub, parent, 12)


# ------------------------------------------------------------------ stage and sheet


def setup(res, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "Medium Contrast"
    wo = bpy.data.worlds.new("sky")
    sc.world = wo
    wo.use_nodes = True
    wo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.66, 0.72, 1)
    wo.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    # ART_GUIDE 2: key sun (-0.45, -0.35, 0.82), rim light ~0.9 slightly cool from the right.
    for name, d, e, col in (("key", (-0.45, -0.35, 0.82), 3.0, (1, 0.98, 0.94)), ("rim", (0.55, 0.5, 0.45), 0.9, (0.86, 0.92, 1.0))):
        ld = bpy.data.lights.new(name, "SUN")
        ld.energy = e
        ld.angle = math.radians(3)
        ld.color = col
        lo = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo)
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = Vector(d).normalized().to_track_quat("Z", "Y")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    floor = mesh_object("Floor", bm, mat("floor", "#ffffff", grime=False), None)
    floor.is_shadow_catcher = True
    return sc, floor


def camera(sc, length_m):
    px_per_m = LENGTH_PX / length_m
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = LAYOUT_PX / px_per_m
    cd.clip_end = 400
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.pi / 2 - VIEW_ELEV, 0, 0)
    q = cam.rotation_euler.to_quaternion()
    cam.location = (q @ Vector((0, 1, 0))) * ((ANCHOR[1] - LAYOUT_PX / 2) / px_per_m) + (q @ Vector((0, 0, 1))) * 80
    cam.location.x -= (ANCHOR[0] - LAYOUT_PX / 2) / px_per_m
    sc.camera = cam


def model_yaw(k):
    """ART_GUIDE 3: rig.rotation_euler.z = atan2(cos(h) / SIN_E, sin(h)), h = k / 32 * 2 pi (column 0 = North)."""
    h = k / HEADINGS * 2 * math.pi
    return math.atan2(math.cos(h) / math.sin(VIEW_ELEV), math.sin(h))


def smooth_round(root):
    """Hard where hard, round where round: smooth shading by angle (38 deg) on every mesh of the model."""
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "Floor"]
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38), keep_sharp_edges=True)
    for o in meshes:
        o.select_set(False)


def render_sheet(sheet, build, length_m, centre_x=0.0, samples=32, preview=None, preview_dir=4):
    """Builds the model (build(root) under a turntable), renders 32 headings and writes ui/public/sprites/<sheet>.png.
    centre_x: the model's ground centre along +X (the turntable pivot)."""
    sc, floor = setup(512 if preview else CELL_PX * OVERSAMPLE, samples)
    camera(sc, length_m)
    turntable = node("Turntable", (0, 0, 0), None)
    root = node("Model", (-centre_x, 0, 0), turntable)
    build(root)
    smooth_round(root)
    turntable.scale = (1, 1, STRETCH_Z)
    scratch = os.path.join(THIS_DIR, f"_{sheet}_tmp.png")
    if preview:
        turntable.rotation_euler = (0, 0, model_yaw(preview_dir))
        sc.render.filepath = preview
        bpy.ops.render.render(write_still=True)
        return
    n = CELL_PX * OVERSAMPLE
    acc = np.zeros((CELL_PX, CELL_PX * HEADINGS, 4), np.float32)
    for k in range(HEADINGS):
        turntable.rotation_euler = (0, 0, model_yaw(k))
        sc.render.filepath = scratch
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(scratch)
        buf = np.empty(n * n * 4, np.float32)
        im.pixels.foreach_get(buf)
        bpy.data.images.remove(im)
        buf = buf.reshape(CELL_PX, OVERSAMPLE, CELL_PX, OVERSAMPLE, 4)
        a = buf[..., 3].mean((1, 3))
        rgb = (buf[..., :3] * buf[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
        acc[:, k * CELL_PX : (k + 1) * CELL_PX, :3] = rgb
        acc[:, k * CELL_PX : (k + 1) * CELL_PX, 3] = a
        print(f"[{sheet}] direction {k + 1}/{HEADINGS}", flush=True)
    img = bpy.data.images.new(sheet, CELL_PX * HEADINGS, CELL_PX, alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = os.path.join(SPRITE_DIR, f"{sheet}.png")
    img.file_format = "PNG"
    img.save()
    os.remove(scratch)
    print(f"[{sheet}] wrote {sheet}.png", flush=True)
