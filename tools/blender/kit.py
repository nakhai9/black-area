"""
Shared modelling kit for building_render.py. Renders structures in Blender into ui/public/sprites/building-<name>.png in the game's building projection.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/building_render.py -- powerplant-usa ...
    ... -- all            (every model below)

Projection (see IsoPainter.project): screen x = (u - v) * 32, y = (u + v) * 16 - z * ZS in art px, z in art px.
Blender world: x = v, y = u (1 tile = 1 BU; swapped because the game's axes are mirrored), Z in BU; a height of z art px is zp(z) BU. The orthographic camera looks
down at 30° from the +u +v side, so the picture lines up with the footprint exactly. render() prints where the art
origin (u = v = z = 0) lies in the picture (art px) and the picture's px per art px (SCALE), as PictureSpec wants.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "ui", "public", "sprites")
SCALE = 3
ZS = 1.35
PX_PER_BU = 32 / math.sqrt(0.5)  # art px per BU across the screen
GROUND_PLATE_MAX = 4  # art px: a thicker slab is a podium, not paving
Z_PX_PER_BU = PX_PER_BU * math.cos(math.radians(30))


def zp(z):
    """Height in art px → BU."""
    return z * ZS / Z_PX_PER_BU


# ---------------------------------------------------------------- materials


def srgb(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


_mats = {}


def mat(hexstr, rough=0.8, metal=0.0, grain=0.12, scale=18.0, emit=None, glass=False):
    """Principled material with a noise grain (weathered concrete / stone / paint), cached by its settings."""
    key = (hexstr, rough, metal, grain, scale, emit, glass)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f"m{len(_mats)}_{hexstr}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    base = srgb(hexstr)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if glass:
        bsdf.inputs["Roughness"].default_value = 0.08
        bsdf.inputs["Specular IOR Level"].default_value = 0.9
    if grain > 0:
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = scale
        noise.inputs["Detail"].default_value = 8
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        lo = tuple(c * (1 - grain) for c in base[:3]) + (1,)
        hi = tuple(min(1, c * (1 + grain * 0.6)) for c in base[:3]) + (1,)
        ramp.color_ramp.elements[0].color = lo
        ramp.color_ramp.elements[1].color = hi
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.15
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        bsdf.inputs["Base Color"].default_value = base
    if emit:
        bsdf.inputs["Emission Color"].default_value = srgb(emit)
        bsdf.inputs["Emission Strength"].default_value = 1.5
    _mats[key] = m
    return m


# ---------------------------------------------------------------- geometry kit


def _obj(name, bm, material):
    # The game's projection is mirrored against Blender's right-handed axes: u goes on Blender's y, v on its x.
    for vert in bm.verts:
        vert.co.x, vert.co.y = vert.co.y, vert.co.x
    for f in bm.faces:
        f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if isinstance(material, (list, tuple)):
        for m in material:
            me.materials.append(m)
    else:
        me.materials.append(material)
    return ob


def box(u, v, w, d, z, h, material, bevel=0.0):
    """Axis-aligned box: corner (u, v), size w × d tiles, from z up h (art px)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co.x = u + (vert.co.x + 0.5) * w
        vert.co.y = v + (vert.co.y + 0.5) * d
        vert.co.z = zp(z) + (vert.co.z + 0.5) * zp(h)
    ob = _obj("box", bm, material)
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return ob


def lathe(cu, cv, z, profile, material, segs=48, cap_top=False, cap_bottom=False, thickness=0.0):
    """Surface of revolution round (cu, cv): profile = [(radius tiles, height art px), ...] bottom to top."""
    bm = bmesh.new()
    rings = []
    for r, hz in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((cu + r * math.cos(a), cv + r * math.sin(a), zp(z + hz))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    ob = _obj("lathe", bm, material)
    for f in ob.data.polygons:
        f.use_smooth = True
    if thickness > 0:
        mod = ob.modifiers.new("solid", "SOLIDIFY")
        mod.thickness = thickness
    return ob


def cylinder(cu, cv, r, z, h, material, segs=32):
    return lathe(cu, cv, z, [(r, 0), (r, h)], material, segs, cap_top=True, cap_bottom=True)


def rod(a, b, r, material, segs=6):
    """Thin cylinder from point a to point b (BU)."""
    bm = bmesh.new()
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=length)
    ob = _obj("rod", bm, material)
    ax, ay, bx, by, dx, dy = ay, ax, by, bx, dy, dx
    ob.location = ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    ob.rotation_mode = "QUATERNION"
    from mathutils import Vector

    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)))
    return ob


def prism(poly, z, h, material, top=None):
    """Vertical extrusion of a ground polygon [(u, v), ...] (counter-clockwise) from z up h (art px); top: roof material."""
    bm = bmesh.new()
    lo = [bm.verts.new((u, v, zp(z))) for u, v in poly]
    hi = [bm.verts.new((u, v, zp(z + h))) for u, v in poly]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    f = bm.faces.new(hi)
    if top is not None:
        f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("prism", bm, [material, top] if top is not None else material)


def roof(u, v, w, d, z, h, material, kind="hip", ridge="u", overhang=0.08):
    """Pitched roof over the rectangle (u, v, w, d) from z, h art px tall: kind "hip", "gable" or "pyramid"; ridge along u or v."""
    u0, v0, u1, v1 = u - overhang, v - overhang, u + w + overhang, v + d + overhang
    bm = bmesh.new()
    a, b, c, e = (bm.verts.new((x, y, zp(z))) for x, y in ((u0, v0), (u1, v0), (u1, v1), (u0, v1)))
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    top = zp(z + h)
    if kind == "pyramid":
        p = bm.verts.new((cu, cv, top))
        for x, y in ((a, b), (b, c), (c, e), (e, a)):
            bm.faces.new((x, y, p))
    else:
        inset = 0 if kind == "gable" else min(u1 - u0, v1 - v0) / 2
        if ridge == "u":
            r0, r1 = bm.verts.new((u0 + inset, cv, top)), bm.verts.new((u1 - inset, cv, top))
            bm.faces.new((a, b, r1, r0))
            bm.faces.new((c, e, r0, r1))
            bm.faces.new((e, a, r0))
            bm.faces.new((b, c, r1))
        else:
            r0, r1 = bm.verts.new((cu, v0 + inset, top)), bm.verts.new((cu, v1 - inset, top))
            bm.faces.new((e, a, r0, r1))
            bm.faces.new((b, c, r1, r0))
            bm.faces.new((a, b, r0))
            bm.faces.new((c, e, r1))
    bm.faces.new((e, c, b, a))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("roof", bm, material)


def dome(cu, cv, r, z, h, material, segs=32, rings=10, onion=False):
    """Dome (or onion dome) of radius r tiles on z, h art px tall."""
    prof = []
    for i in range(rings + 1):
        t = i / rings
        if onion:
            rr = r * (1 + 0.35 * math.sin(math.pi * min(1, t * 1.6))) * (1 - t) ** 0.8
        else:
            rr = r * math.cos(t * math.pi / 2)
        prof.append((max(rr, 0.0005), h * (t if onion else math.sin(t * math.pi / 2))))
    return lathe(cu, cv, z, prof, material, segs, cap_bottom=True)


def windows(face, u, v, w, d, z, h, cols, rows, material, frame=None, margin=0.12, fill=0.55, depth=0.012):
    """Grid of window panes on a box's visible face ("left" = the +v face, "right" = the +u face), slightly proud of it."""
    for c in range(cols):
        for r in range(rows):
            s0 = margin + (1 - 2 * margin) * (c + (1 - fill) / 2) / cols
            s1 = s0 + (1 - 2 * margin) * fill / cols
            t0 = z + h * (margin + (1 - 2 * margin) * (r + 0.2) / rows)
            th = h * (1 - 2 * margin) * 0.6 / rows
            if face == "left":
                box(u + s0 * w, v + d, (s1 - s0) * w, depth, t0, th, material)
                if frame is not None:
                    box(u + s0 * w - 0.01, v + d, (s1 - s0) * w + 0.02, depth * 1.5, t0 - 0.6, 0.6, frame)
            else:
                box(u + w, v + d - s1 * d, depth, (s1 - s0) * d, t0, th, material)
                if frame is not None:
                    box(u + w, v + d - s1 * d - 0.01, depth * 1.5, (s1 - s0) * d + 0.02, t0 - 0.6, 0.6, frame)


# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.6, 0.68, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(4)
    so = bpy.data.objects.new("sun", sun)
    sc.collection.objects.link(so)
    # Light from the upper right: the +u (right) faces brighter than the +v (left) ones.
    so.rotation_euler = (math.radians(42), 0, math.radians(205))


def sink_ground_plate(footprint):
    """Sinks the structure's ground plate into the ground: the plot's paving / pad (a flat slab from z = 0, at most
    GROUND_PLATE_MAX art px thick, covering most of the plot) is lowered with everything on it until its top is level
    with the map's ground, and a holdout plane at z = 0 hides what went below — so the plot lies flush with the
    surrounding terrain instead of standing on it like a raised tile. Done once per scene."""
    sc = bpy.context.scene
    if sc.get("ground_sunk"):
        return
    sc["ground_sunk"] = True
    w, d = footprint
    top = 0.0
    meshes = [o for o in sc.objects if o.type == "MESH"]
    for o in meshes:
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        z0, z1 = min(c.z for c in bb), max(c.z for c in bb)
        area = (max(c.x for c in bb) - min(c.x for c in bb)) * (max(c.y for c in bb) - min(c.y for c in bb))
        if abs(z0) < 1e-4 and z1 <= zp(GROUND_PLATE_MAX) and area >= 0.5 * w * d:
            top = max(top, z1)
    if top > 0:
        for o in meshes:
            if o.parent is None:
                o.location.z -= top
        for o in sc.objects:
            if o.type == "EMPTY" and o.parent is None:
                o.location.z -= top
    bm = bmesh.new()
    pad = 0.02
    corners = [(-pad, -pad), (w + pad, -pad), (w + pad, d + pad), (-pad, d + pad)]
    bm.faces.new([bm.verts.new((u, v, -0.0005)) for u, v in corners])
    hold = bpy.data.materials.new("holdout")
    hold.use_nodes = True
    nt = hold.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(nt.nodes.new("ShaderNodeHoldout").outputs[0], out.inputs["Surface"])
    _obj("ground_holdout", bm, hold)


def render(name, footprint, height):
    """Frames footprint (w, d) and height (art px), renders, writes the PNG and prints its origin (for the PictureSpec)."""
    w, d = footprint
    sink_ground_plate(footprint)
    m = 6
    x0, x1 = -d * 32 - m, w * 32 + m
    y0, y1 = -height * ZS - m, (w + d) * 16 + m
    W, H = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    sc = bpy.context.scene
    sc.render.resolution_x = round(W * SCALE)
    sc.render.resolution_y = round(H * SCALE)
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    big = max(W, H)
    cam.ortho_scale = big / PX_PER_BU
    cam.shift_x = cx / big
    cam.shift_y = -cy / big
    cam.clip_end = 500
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    el, az = math.radians(30), math.radians(45)
    dist = 100
    co.location = (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), dist * math.sin(el))
    co.rotation_euler = (math.radians(60), 0, math.radians(135))
    sc.camera = co
    path = os.path.join(OUT, f"building-{name}.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    spec = {"originX": W / 2 - cx, "originY": H / 2 - cy, "scale": SCALE, "width": sc.render.resolution_x, "height": sc.render.resolution_y, "footprint": [w, d]}
    print(f"[building_render] {name}: originX={spec['originX']:.2f} originY={spec['originY']:.2f}")



TEAM = {"usa": "#2f6fe0", "russia": "#d22b2b", "china": "#e8b10a", "europe": "#6532d6", "islamic": "#1f9d4a"}
