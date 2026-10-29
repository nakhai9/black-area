"""
Blender-side builder + renderer for the game's structures (run headless):
  blender --background --factory-startup --python tools/blender/building_render.py -- <building> <out.png>
Builds the structure in code (1 Blender unit = 1 map cell; u = +Y, v = +X so the game's u runs right-down on screen),
gives it procedural weathered materials, and renders it with an orthographic camera in the game's 2:1 projection
(IsoPainter: x = (u - v) * 32, y = (u + v) * 16 - z art px) at PX_PER_ART picture px per art px, on a transparent
background. Writes <out>.json beside the picture: { originX, originY, scale, width, height } — the art-space point
u = v = z = 0 inside the picture (in art px) and the picture size.
Buildings: barracks-europe (Ministry of Defence, 5 x 3: a Parisian stone palace round a courtyard, mansard roofs).
"""
import json
import math
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

PX_PER_ART = 3
ART_PX_PER_UNIT = 32 / math.sqrt(0.5)  # one cell along u moves 32 art px sideways → 45.25 art px per unit on screen

args = sys.argv[sys.argv.index('--') + 1:]
NAME, OUT = args[0], args[1]

# ------------------------------------------------------------------ scene

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.78, 0.82, 0.9, 1)
bg.inputs['Strength'].default_value = 0.55


def mat_stone(name, base, dark, scale=6.0, grime=0.35):
    """Weathered stone / render: base colour mottled by noise, darker towards the foot (rising damp), fine bump."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    n = nt.nodes
    l = nt.links
    bsdf = n['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.82
    tc = n.new('ShaderNodeTexCoord')
    noise = n.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 8
    l.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*base, 1)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[1].position = 0.7
    l.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    # Grime: darker low on the walls (world Z), mixed over the mottled stone.
    sep = n.new('ShaderNodeSeparateXYZ')
    l.new(tc.outputs['Generated'], sep.inputs['Vector'])
    gr = n.new('ShaderNodeMapRange')
    gr.inputs['From Min'].default_value = 0.0
    gr.inputs['From Max'].default_value = 0.35
    gr.inputs['To Min'].default_value = grime
    gr.inputs['To Max'].default_value = 0.0
    l.new(sep.outputs['Z'], gr.inputs['Value'])
    mix = n.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    l.new(gr.outputs['Result'], mix.inputs['Factor'])
    l.new(ramp.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = (0.35, 0.32, 0.28, 1)
    l.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.15
    l.new(noise.outputs['Fac'], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def mat_plain(name, color, rough=0.6, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.5
    return m


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def box(name, x0, y0, z0, sx, sy, sz, mat, bevel=0.0):
    """Axis-aligned box from corner (x0, y0, z0) with size (sx, sy, sz)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x0 + sx / 2, y0 + sy / 2, z0 + sz / 2))
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    if bevel > 0:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return o


def mansard(name, x0, y0, sx, sy, z0, h_low, h_top, inset, mat):
    """Mansard roof over the rectangle: a steep lower slope (inset in plan by `inset`) then a low flat top."""
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    b = [(x0, y0), (x0 + sx, y0), (x0 + sx, y0 + sy), (x0, y0 + sy)]
    t = [(x0 + inset, y0 + inset), (x0 + sx - inset, y0 + inset), (x0 + sx - inset, y0 + sy - inset), (x0 + inset, y0 + sy - inset)]
    vb = [bm.verts.new((x, y, z0)) for x, y in b]
    vm = [bm.verts.new((x, y, z0 + h_low)) for x, y in t]
    t2 = [(x + (0.06 if x < x0 + sx / 2 else -0.06), y + (0.06 if y < y0 + sy / 2 else -0.06)) for x, y in t]
    vt = [bm.verts.new((x, y, z0 + h_low + h_top)) for x, y in t2]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vb[i], vb[j], vm[j], vm[i]))
        bm.faces.new((vm[i], vm[j], vt[j], vt[i]))
    bm.faces.new(vt)
    bm.faces.new(list(reversed(vb)))
    bm.normal_update()
    bm.to_mesh(me)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


# ------------------------------------------------------------------ buildings

def facade_windows(x0, y0, x1, y1, z0, floors, storey, n, normal, mats, skip_mid=False):
    """A row of windows per floor along a wall from (x0, y0) to (x1, y1) facing `normal` (+X or +Y, -X, -Y)."""
    glass, frame, sill = mats
    L = math.hypot(x1 - x0, y1 - y0)
    dx, dy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = normal
    for f in range(floors):
        zb = z0 + f * storey + storey * 0.28
        wh = storey * (0.58 if f < floors - 1 else 0.5)
        for k in range(n):
            if skip_mid and f == 0 and k == n // 2:
                continue
            s = (k + 0.5) / n * L
            cx, cy = x0 + dx * s, y0 + dy * s
            ww = L / n * 0.42
            # Glass slightly recessed behind a stone frame, sill below, a small cornice above.
            def slab(off, w, h, zz, depth, m):
                ox = cx + nx * off - dx * w / 2 - (abs(nx) * depth / 2 if nx else 0)
                oy = cy + ny * off - dy * w / 2 - (abs(ny) * depth / 2 if ny else 0)
                sx = abs(dx) * w + abs(nx) * depth
                sy = abs(dy) * w + abs(ny) * depth
                box('w', ox, oy, zz, sx, sy, h, m)
            slab(0.012, ww * 1.22, wh * 1.12, zb - wh * 0.05, 0.03, frame)
            slab(0.03, ww, wh, zb, 0.02, glass)
            slab(0.04, ww * 1.4, storey * 0.05, zb - storey * 0.07, 0.05, sill)
            slab(0.045, ww * 1.45, storey * 0.06, zb + wh + storey * 0.02, 0.06, sill)


def barracks_europe():
    stone = mat_stone('stone', srgb('#e2dccd'), srgb('#b9b1a0'))
    plinth = mat_stone('plinth', srgb('#b8b0a0'), srgb('#8f877a'), grime=0.45)
    slate = mat_stone('slate', srgb('#4f5d6a'), srgb('#36404a'), scale=14, grime=0.1)
    zinc = mat_plain('zinc', srgb('#8d979e'), rough=0.35, metal=0.6)
    glass = mat_plain('glass', srgb('#24323d'), rough=0.08, metal=0.4)
    frame = mat_plain('frame', srgb('#efe9db'), rough=0.7)
    sill = mat_plain('sill', srgb('#f4efe2'), rough=0.6)
    door = mat_plain('door', srgb('#2b2620'), rough=0.5)
    blue = mat_plain('eu-blue', srgb('#1f3f8f'), rough=0.6)
    gold = mat_plain('eu-gold', srgb('#d8b23a'), rough=0.35, metal=0.7)
    wins = (glass, frame, sill)
    # Plan (X = v across 0..3, Y = u along 0..5): a closed block round a courtyard, corner pavilions, front pavilion.
    X0, Y0, SX, SY = 0.2, 0.2, 2.6, 4.6
    WING = 0.75
    H = 0.95  # three storeys
    ST = H / 3
    box('plinth', X0 - 0.04, Y0 - 0.04, 0, SX + 0.08, SY + 0.08, 0.1, plinth)
    wings = [
        (X0, Y0, SX, WING),  # u-low wing
        (X0, Y0 + SY - WING, SX, WING),  # u-high wing (front right on screen)
        (X0, Y0, WING, SY),  # v-low wing
        (X0 + SX - WING, Y0, WING, SY),  # v-high wing (front left on screen)
    ]
    for i, (x, y, sx, sy) in enumerate(wings):
        box(f'wing{i}', x, y, 0.1, sx, sy, H, stone)
        box(f'cornice{i}', x - 0.03, y - 0.03, 0.1 + H - 0.02, sx + 0.06, sy + 0.06, 0.05, frame)
        box(f'band{i}', x - 0.015, y - 0.015, 0.1 + ST * 1.0, sx + 0.03, sy + 0.03, 0.025, frame)
        mansard(f'roof{i}', x - 0.01, y - 0.01, sx + 0.02, sy + 0.02, 0.1 + H + 0.03, 0.32, 0.06, 0.16, slate)
    # Corner pavilions: a little taller, with their own steep roofs and chimneys.
    P = 0.95
    for i, (x, y) in enumerate([(X0 - 0.05, Y0 - 0.05), (X0 + SX - P + 0.05, Y0 - 0.05), (X0 - 0.05, Y0 + SY - P + 0.05), (X0 + SX - P + 0.05, Y0 + SY - P + 0.05)]):
        box(f'pav{i}', x, y, 0.1, P, P, H + 0.08, stone)
        box(f'pavc{i}', x - 0.03, y - 0.03, 0.1 + H + 0.06, P + 0.06, P + 0.06, 0.05, frame)
        mansard(f'pavroof{i}', x, y, P, P, 0.1 + H + 0.11, 0.42, 0.05, 0.2, slate)
        for cx, cy in [(x + 0.08, y + 0.08), (x + P - 0.2, y + P - 0.2)]:
            box(f'chim{i}', cx, cy, 0.1 + H + 0.2, 0.12, 0.12, 0.42, stone)
            box(f'chimcap{i}', cx - 0.015, cy - 0.015, 0.1 + H + 0.62, 0.15, 0.15, 0.03, frame)
    # Front pavilion (centre of the u-high wing) with the entrance, a balcony and the EU banners.
    cx = X0 + SX / 2
    fy = Y0 + SY
    box('front', cx - 0.5, fy - WING, 0.1, 1.0, WING + 0.08, H + 0.1, stone)
    mansard('frontroof', cx - 0.5, fy - WING, 1.0, WING + 0.08, 0.1 + H + 0.1, 0.36, 0.05, 0.18, slate)
    box('door', cx - 0.14, fy + 0.075, 0.1, 0.28, 0.02, ST * 0.85, door)
    box('balcony', cx - 0.3, fy + 0.08, 0.1 + ST * 1.05, 0.6, 0.08, 0.03, zinc)
    for k in (-1, 1):
        box('banner', cx + k * 0.38 - 0.06, fy + 0.085, 0.1 + ST * 1.2, 0.12, 0.01, ST * 1.4, blue)
        box('bannerstar', cx + k * 0.38 - 0.02, fy + 0.096, 0.1 + ST * 2.0, 0.04, 0.005, 0.04, gold)
    # Windows on the two faces towards the viewer (+X: v-high, +Y: u-high) and the courtyard faces just as dark slots.
    facade_windows(X0 + SX, Y0 + P, X0 + SX, Y0 + SY - P, 0.1, 3, ST, 9, (1, 0), wins)
    facade_windows(X0 + P, Y0 + SY, cx - 0.5, Y0 + SY, 0.1, 3, ST, 2, (0, 1), wins)
    facade_windows(cx + 0.5, Y0 + SY, X0 + SX - P, Y0 + SY, 0.1, 3, ST, 2, (0, 1), wins)
    facade_windows(cx - 0.5, Y0 + SY + 0.08, cx + 0.5, Y0 + SY + 0.08, 0.1, 3, ST, 3, (0, 1), wins, skip_mid=True)
    for (x, y, sx) in [(X0 + SX + 0.05, Y0 - 0.05, P), (X0 + SX + 0.05, Y0 + SY - P + 0.05, P)]:
        facade_windows(x, y + 0.15, x, y + sx - 0.15, 0.1, 3, ST, 2, (1, 0), wins)
    for x in (X0 - 0.05 + 0.15, X0 + SX - P + 0.05 + 0.15):
        facade_windows(x, Y0 + SY + 0.05, x + P - 0.3, Y0 + SY + 0.05, 0.1, 3, ST, 2, (0, 1), wins)
    # Dormers along the long roofs.
    for k in range(5):
        y = Y0 + P + 0.3 + k * (SY - 2 * P - 0.6) / 4
        box('dormer', X0 + SX - 0.2, y - 0.08, 0.1 + H + 0.07, 0.14, 0.16, 0.2, frame)
        box('dormerglass', X0 + SX - 0.065, y - 0.05, 0.1 + H + 0.1, 0.01, 0.1, 0.12, glass)
    # Courtyard paving.
    box('court', X0 + WING, Y0 + WING, 0.1, SX - 2 * WING, SY - 2 * WING, 0.005, plinth)
    return dict(footprint=(5, 3), pole=None)


BUILDERS = {'barracks-europe': barracks_europe}
info = BUILDERS[NAME]()
fw, fd = info['footprint']

# ------------------------------------------------------------------ light + camera

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
bpy.context.collection.objects.link(sun)
sun.data.energy = 3.2
sun.data.angle = math.radians(3)
# Game light: from the upper left of the screen (screen left = -u +v → world +X -Y) and high.
sun.rotation_euler = Vector((0.6, -0.9, 1.6)).to_track_quat('Z', 'Y').to_euler()

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
bpy.context.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
centre = Vector((fd / 2, fw / 2, 0.5))
d = Vector((1, 1, math.tan(math.radians(30)) * math.sqrt(2))).normalized()
cam.location = centre + d * 30
cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
# Picture size: the footprint diamond plus the tallest point, with a margin.
px_per_unit = ART_PX_PER_UNIT * PX_PER_ART
top = max((o.matrix_world @ Vector(c)).z for o in scene.objects if o.type == 'MESH' for c in o.bound_box)
width_px = int((fw + fd) * 32 * PX_PER_ART + 24)
height_px = int(((fw + fd) * 16 + top * ART_PX_PER_UNIT * math.cos(math.radians(30))) * PX_PER_ART + 24)
scene.render.resolution_x = width_px
scene.render.resolution_y = height_px
cam.data.ortho_scale = max(width_px, height_px) / px_per_unit
# Recentre the camera so the footprint diamond sits at the bottom with the building above it.
bpy.context.view_layer.update()


def to_px(p):
    v = world_to_camera_view(scene, cam, Vector(p))
    return v.x * width_px, (1 - v.y) * height_px


# Shift the view so the lowest ground corner (u = fw, v = fd) lands near the bottom centre.
gx, gy = to_px((fd, fw, 0))
lx, ly = to_px((fd, 0, 0))
rx, ry = to_px((0, fw, 0))
want_cx, want_by = width_px / 2, height_px - 12
cur_cx = (lx + rx) / 2
shift_x = (cur_cx - want_cx) / px_per_unit
shift_y = (gy - want_by) / px_per_unit
right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
cam.location += right * shift_x - up * shift_y
bpy.context.view_layer.update()

scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
ox, oy = to_px((0, 0, 0))
meta = dict(originX=ox / PX_PER_ART, originY=oy / PX_PER_ART, scale=PX_PER_ART, width=width_px, height=height_px, footprint=[fw, fd])
with open(OUT[:-4] + '.json', 'w') as f:
    json.dump(meta, f)
print('META', json.dumps(meta))
