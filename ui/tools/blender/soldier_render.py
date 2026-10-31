"""
Blender-side soldier builder + renderer (run headless):
  blender --background --factory-startup --python tools/blender/soldier_render.py -- <soldier> <frames dir> [rows]
Builds a rigged soldier in code — body parts on an armature (pelvis, spine, chest, head, arms, legs), uniform with a
procedural camouflage, helmet / cap, plate carrier with pouches, boots, gloves, rifle — poses it per frame (idle,
walk cycle, aiming, falling, swimming, treading water) and renders every frame of the game's 8-direction sheet
('dir8', InfantryArt DIR8_ROW) into <frames dir>/r<row>_c<col>.png with the game's orthographic 2:1 camera
(the same as tools/blender/building_render.py) and the ground shadow baked in. tools/soldier_sheet.py then packs
the frames into public/sprites/<file>.png.
Rows: 0 fire (column = direction), 1-8 walk (row = direction, 8 frames), 9 idle (column = direction), 10 dying
(8 frames, one direction), 11-18 swim, 19-26 tread water (swimmers only). Walk-only sheets (engineers): rows 0-7 walk.
Directions: column / row k = screen direction k * 45 deg clockwise from straight up.
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

args = sys.argv[sys.argv.index('--') + 1:]
NAME, OUTDIR = args[0], args[1]
ONLY = set(int(r) for r in args[2].split(',')) if len(args) > 2 and args[2] != 'all' else None
# Squatters teams are two soldiers in one picture: each is rendered in its own pass ('bearer' with the national flag,
# 'escort' with a rifle) at its place beside the other, then tools/soldier_sheet.py lays the passes over each other.
ROLE = args[3] if len(args) > 3 else None
os.makedirs(OUTDIR, exist_ok=True)

CELL = 192 if ROLE else 128
FEET = (96, 150) if ROLE else (64, 98)  # feet (team centre) in the cell (px)
FIG_PX = 90  # a 1.8 m soldier stands this many px tall on screen
SAMPLES = 24


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ------------------------------------------------------------------ looks
# camo: up to four colours (base first) and a pattern scale; gear colours; headgear; weapon.
LOOKS = {
    'us-regular': dict(camo=['#9a8f6e', '#6f6a4a', '#b7a983', '#4d4a36'], cscale=9, vest='#8a7b5a', helmet='#7d7458', head='helmet',
                       weapon='m4', skin='#d2a17f', boots='#6b5a42', gloves='#4a4236'),
    'us-special': dict(camo=['#7d7758', '#565239', '#9c9270', '#3a382a'], cscale=11, vest='#5f5a45', helmet='#6e6a50', head='boonie',
                       weapon='m4', skin='#c99472', boots='#4f4434', gloves='#2e2b24', extra_pouches=True),
    'ru-regular': dict(camo=['#6f7650', '#4c5338', '#8d8a64', '#2f3324'], cscale=16, digital=True, vest='#4f5638', helmet='#5a6142', head='helmet',
                       weapon='ak', skin='#e0b494', boots='#2c2a26', gloves='#33352a'),
    'ru-special': dict(camo=['#1f2a3a', '#151d29', '#2c3a4f', '#0c1118'], cscale=7, vest='#34465f', helmet='#1b1b1b', band='#050505', head='balaclava',
                       weapon='ak', skin='#e0b494', boots='#22201d', gloves='#1d1d1b', extra_pouches=True),
    'cn-regular': dict(camo=['#36472a', '#25321c', '#4b5c37', '#1a2314'], cscale=18, digital=True, vest='#2a3820', helmet='#2e3c23', head='helmet',
                       weapon='qbz', skin='#dcb38c', boots='#2b2924', gloves='#3a3f2e'),
    'cn-special': dict(camo=['#6b6e70', '#4a4d50', '#8f9294', '#2f3133'], cscale=18, digital=True, vest='#3a3c3f', helmet='#45484b', band='#f2c018', head='helmet',
                       weapon='qbz', skin='#dcb38c', boots='#1f1f22', gloves='#22262c', extra_pouches=True),
    'eu-regular': dict(camo=['#5b3f78', '#3e2a55', '#7d62a0', '#2a1d3a'], cscale=10, flecks=True, vest='#4a3563', helmet='#4f3a68', head='helmet',
                       weapon='g36', skin='#e6c0a2', boots='#2a2723', gloves='#33372b'),
    'eu-special': dict(camo=['#3a2650', '#271a38', '#4d3768', '#18101f'], cscale=7, vest='#151318', helmet='#1a171e', head='cap',
                       weapon='g36', skin='#e2bb9a', boots='#24252a', gloves='#25282c', extra_pouches=True),
    'islamic-regular': dict(camo=['#a8946a', '#857250', '#c4b087', '#5f5236'], cscale=12, vest='#6e6448', helmet='#6f6a48', head='helmet',
                            weapon='ak', skin='#b98a63', boots='#5a4a35', gloves='#4a3f2e'),
    'islamic-special': dict(camo=['#4c5236', '#363b27', '#6a6e4c', '#25281b'], cscale=12, vest='#2f3324', helmet='#1c1d18', head='balaclava',
                            weapon='ak', skin='#b98a63', boots='#24221d', gloves='#1f1e19', extra_pouches=True),
}
for f, u in (('us', '#8a7a55'), ('ru', '#6c6a4c'), ('cn', '#5f6a48'), ('eu', '#5b3f78'), ('islamic', '#8a7a5a')):
    LOOKS[f'{f}-engineer'] = dict(camo=[u, u, u, u], cscale=10, vest='#f06a1a', hivis=True, helmet='#f2c230', head='hardhat',
                                  weapon='wrench', skin='#d6a884', boots='#4a3a28', gloves='#6b5536', walk_only=True)
# Europe: purple uniforms throughout — regulars light purple with a helmet, special forces near-black purple with a
# black vest and cap, engineers purple under the orange hi-vis vest and hard hat.
# Crazy Soldier (Islamic world): explosive vest and a satchel charge instead of a rifle.
LOOKS['islamic-demolition'] = dict(LOOKS['islamic-regular'], head='balaclava', helmet='#2c4a2a', vest='#5a3f28', weapon='satchel', charges=True)
if NAME.endswith('-squatters'):
    look = dict(LOOKS[NAME.replace('-squatters', '-special')])
    look['nation'] = NAME.split('-')[0]
    if ROLE == 'bearer':
        look['weapon'] = 'flag'
else:
    look = LOOKS[NAME]

# ------------------------------------------------------------------ scene

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = CELL
scene.render.resolution_y = CELL
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.84, 0.92, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9


def principled(name, color, rough=0.75, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def camo_material(colors, scale, digital=False, flecks=False):
    """Uniform cloth: up to four colour blotches from layered noise (pixelated for digital, specks for flecktarn)."""
    m = bpy.data.materials.new('camo')
    m.use_nodes = True
    nt = m.node_tree
    n, l = nt.nodes, nt.links
    b = n['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.88
    tc = n.new('ShaderNodeTexCoord')
    vec = tc.outputs['Object']
    if digital:
        snap = n.new('ShaderNodeVectorMath')
        snap.operation = 'SNAP'
        snap.inputs[1].default_value = (1 / scale * 0.9,) * 3
        l.new(vec, snap.inputs[0])
        vec = snap.outputs['Vector']
    noise = n.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale * (0.6 if flecks else 1)
    noise.inputs['Detail'].default_value = 3 if not flecks else 6
    noise.inputs['Roughness'].default_value = 0.65
    l.new(vec, noise.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'CONSTANT'
    cs = [srgb(c) for c in colors]
    cr.elements[0].color = (*cs[1], 1)
    cr.elements[0].position = 0.0
    cr.elements[1].color = (*cs[0], 1)
    cr.elements[1].position = 0.42
    e = cr.elements.new(0.58)
    e.color = (*cs[2], 1)
    e = cr.elements.new(0.7)
    e.color = (*cs[3], 1)
    l.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    # Cloth weave / folds: a fine bump.
    wave = n.new('ShaderNodeTexNoise')
    wave.inputs['Scale'].default_value = 60
    l.new(tc.outputs['Object'], wave.inputs['Vector'])
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    l.new(wave.outputs['Fac'], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], b.inputs['Normal'])
    l.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


M = dict(
    camo=camo_material(look['camo'], look['cscale'], look.get('digital', False), look.get('flecks', False)),
    skin=principled('skin', look['skin'], 0.55),
    vest=principled('vest', look['vest'], 0.85),
    helmet=principled('helmet', look['helmet'], 0.7),
    boots=principled('boots', look['boots'], 0.6),
    gloves=principled('gloves', look['gloves'], 0.7),
    metal=principled('gunmetal', '#2a2b2d', 0.42, 0.7),
    poly=principled('polymer', '#1f1f20', 0.6),
    wood=principled('wood', '#7a4a2a', 0.55),
    strip=principled('reflective', '#e8e6d8', 0.3),
    steel=principled('steel', '#9aa0a6', 0.3, 0.9),
)

# ------------------------------------------------------------------ rig
# The soldier faces -Y; Z up; feet on z = 0; 1 unit = 1 m.

arm_data = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
B = {}


def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = B[parent]
    B[name] = b
    return b


bone('pelvis', (0, 0, 0.98), (0, 0, 1.08))
bone('spine', (0, 0, 1.08), (0, 0, 1.28), 'pelvis')
bone('chest', (0, 0, 1.28), (0, 0, 1.48), 'spine')
bone('head', (0, 0, 1.52), (0, 0, 1.78), 'chest')
# Arms are built in their working pose: hands on the rifle (grip and handguard) for riflemen, hanging for engineers.
WRENCH = look['weapon'] in ('wrench', 'flag', 'satchel')  # no rifle: the arms hang (a hand holds the tool / pole)
SHOULDER = {'L': Vector((0.19, 0.0, 1.44)), 'R': Vector((-0.19, 0.0, 1.44))}
if WRENCH:
    ELBOW = {'L': Vector((0.21, 0.01, 1.16)), 'R': Vector((-0.21, 0.01, 1.16))}
    HAND = {'L': Vector((0.22, -0.03, 0.9)), 'R': Vector((-0.22, -0.05, 0.9))}
else:
    ELBOW = {'L': Vector((0.2, -0.16, 1.16)), 'R': Vector((-0.24, 0.02, 1.16))}
    HAND = {'L': Vector((0.04, -0.42, 1.19)), 'R': Vector((-0.05, -0.17, 1.13))}
for s, x in (('L', 0.19), ('R', -0.19)):
    bone(f'upper_arm.{s}', SHOULDER[s], ELBOW[s], 'chest')
    bone(f'forearm.{s}', ELBOW[s], HAND[s], f'upper_arm.{s}')
    bone(f'thigh.{s}', (x * 0.5, 0, 0.98), (x * 0.52, 0, 0.53), 'pelvis')
    bone(f'shin.{s}', (x * 0.52, 0, 0.53), (x * 0.52, 0.02, 0.09), f'thigh.{s}')
bpy.ops.object.mode_set(mode='OBJECT')
POSE = rig.pose.bones
for pb in POSE:
    pb.rotation_mode = 'XYZ'


def capsule(loc, r=0.05, depth=0.3):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=16)


def sphere(loc, r=0.1):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=20, ring_count=12)


def cube(loc, size=1.0):
    bpy.ops.mesh.primitive_cube_add(size=size, location=loc)


def limb(name, a, b, r0, r1, bone_name, mat):
    """A tapered limb from a to b (cone with rounded ends: spheres at both joints)."""
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2
    d = b - a
    rot = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_cone_add(radius1=r0, radius2=r1, depth=d.length, location=mid, vertices=16)
    o = bpy.context.object
    o.rotation_euler = rot
    finish(o, name, bone_name, mat)
    sphere(b, r1 * 1.02)
    finish(bpy.context.object, name + '_j', bone_name, mat)


def finish(o, name, bone_name, mat, smooth=True):
    o.name = name
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(mat)
    if smooth:
        bpy.ops.object.shade_smooth()
    o.select_set(False)
    parent_keep(o, bone_name)
    return o


def parent_keep(o, bone_name):
    wm = o.matrix_world.copy()
    o.parent = rig
    o.parent_type = 'BONE'
    o.parent_bone = bone_name
    bpy.context.view_layer.update()
    o.matrix_world = wm


def blob(name, loc, size, bone_name, mat, bevel=0.02):
    cube(loc)
    o = bpy.context.object
    o.scale = size
    md = o.modifiers.new('bv', 'BEVEL')
    md.width = bevel
    md.segments = 3
    return finish(o, name, bone_name, mat)


def ball(name, loc, r, bone_name, mat, scale=(1, 1, 1)):
    sphere(loc, r)
    o = bpy.context.object
    o.scale = scale
    return finish(o, name, bone_name, mat)


# Body.
blob('hips', (0, 0, 1.0), (0.32, 0.2, 0.16), 'pelvis', M['camo'], 0.06)
blob('belly', (0, 0, 1.18), (0.3, 0.19, 0.2), 'spine', M['camo'], 0.07)
blob('torso', (0, 0, 1.36), (0.38, 0.22, 0.24), 'chest', M['camo'], 0.08)
ball('neck', (0, 0, 1.5), 0.055, 'chest', M['skin'], (1, 1, 1.3))
ball('head', (0, -0.01, 1.62), 0.1, 'head', M['skin'], (0.9, 1.0, 1.12))
ball('nose', (0, -0.1, 1.61), 0.022, 'head', M['skin'])
# Plate carrier with pouches (front), backpack / hydration (back).
vest = M['vest']
blob('carrier', (0, -0.005, 1.33), (0.34, 0.27, 0.3), 'chest', vest, 0.05)
for i, x in enumerate((-0.1, 0.0, 0.1)):
    blob(f'pouch{i}', (x, -0.15, 1.24), (0.085, 0.06, 0.11), 'chest', vest, 0.015)
if look.get('extra_pouches'):
    for i, x in enumerate((-0.15, 0.15)):
        blob(f'side{i}', (x, -0.05, 1.12), (0.07, 0.09, 0.1), 'spine', vest, 0.015)
blob('pack', (0, 0.17, 1.3), (0.26, 0.12, 0.3), 'chest', vest, 0.04)
# Nation mark: a bright band right round the plate carrier (China's special forces: yellow on grey camouflage;
# China's regulars wear dark moss green).
if look.get('band'):
    blob('nationband', (0, 0.045, 1.31), (0.355, 0.40, 0.03), 'chest', principled('band', look['band'], 0.5), 0.008)
if look.get('hivis'):
    for z in (1.24, 1.38):
        blob(f'band{z}', (0, -0.01, z), (0.36, 0.29, 0.025), 'chest', M['strip'], 0.005)
blob('belt', (0, 0, 1.06), (0.34, 0.22, 0.05), 'pelvis', M['vest'], 0.01)
# Legs and arms.
for s, x in (('L', 0.19), ('R', -0.19)):
    limb(f'thigh{s}', (x * 0.5, 0, 0.98), (x * 0.52, 0, 0.53), 0.1, 0.075, f'thigh.{s}', M['camo'])
    blob(f'kneepad{s}', (x * 0.52, -0.06, 0.53), (0.09, 0.05, 0.09), f'thigh.{s}', vest, 0.02)
    limb(f'shin{s}', (x * 0.52, 0, 0.53), (x * 0.52, 0.02, 0.12), 0.072, 0.056, f'shin.{s}', M['camo'])
    blob(f'boot{s}', (x * 0.52, -0.04, 0.06), (0.11, 0.26, 0.12), f'shin.{s}', M['boots'], 0.03)
    limb(f'uarm{s}', SHOULDER[s], ELBOW[s], 0.058, 0.048, f'upper_arm.{s}', M['camo'])
    ball(f'shoulder{s}', SHOULDER[s], 0.07, f'upper_arm.{s}', M['camo'])
    limb(f'farm{s}', ELBOW[s], HAND[s], 0.046, 0.038, f'forearm.{s}', M['camo'])
    ball(f'hand{s}', HAND[s], 0.042, f'forearm.{s}', M['gloves'], (1, 1.2, 1.2))
# Headgear.
hg = look['head']
if hg in ('helmet', 'hardhat'):
    ball('helmet', (0, 0.0, 1.66), 0.125, 'head', M['helmet'], (1.0, 1.08, 0.82))
    if hg == 'hardhat':
        bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=0.012, location=(0, -0.02, 1.62), vertices=24)
        finish(bpy.context.object, 'brim', 'head', M['helmet'])
    else:
        blob('nvgmount', (0, -0.12, 1.69), (0.05, 0.03, 0.04), 'head', M['poly'], 0.008)
elif hg == 'boonie':
    ball('boonie', (0, 0, 1.68), 0.11, 'head', M['camo'], (1, 1, 0.75))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.17, depth=0.012, location=(0, 0, 1.64), vertices=24)
    finish(bpy.context.object, 'brim', 'head', M['camo'])
elif hg == 'cap':
    ball('cap', (0, 0, 1.68), 0.105, 'head', M['helmet'], (1, 1.05, 0.7))
    blob('peak', (0, 0.12, 1.66), (0.12, 0.08, 0.012), 'head', M['helmet'], 0.004)  # worn reversed
elif hg == 'balaclava':
    ball('balaclava', (0, 0, 1.63), 0.108, 'head', M['helmet'], (0.95, 1.03, 1.18))
    blob('eyes', (0, -0.09, 1.64), (0.11, 0.03, 0.03), 'head', M['skin'], 0.005)
# Weapon, held across the chest (parented to the chest: it follows the torso in every pose).
w = look['weapon']
if w == 'flag':
    # The national flag on a pole held upright in the right hand.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=2.3, location=(-0.22, -0.05, 1.75), vertices=10)
    finish(bpy.context.object, 'pole', 'forearm.R', M['wood'])
    W_, H_ = 0.7, 0.44
    # The cloth trails back and out to the side from the pole top (never edge-on to the camera in any direction).
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=14, y_subdivisions=9, size=1, location=(0, 0, 0))
    cloth = bpy.context.object
    trail = Vector((-0.6, 0.8, 0)).normalized()
    pole_top = Vector((-0.22, -0.05, 2.2))
    for vtx in cloth.data.vertices:
        gx, gy = vtx.co.x + 0.5, vtx.co.y + 0.5
        vtx.co = pole_top + trail * (gx * W_) + Vector((0, 0, gy * H_))
    img = bpy.data.images.new('flag', 60, 40)
    px = []
    nation = look.get('nation')
    for yy in range(40):
        for xx in range(60):
            u, v = 1 - xx / 60, yy / 40  # Blender image rows run bottom-up; the grid's u runs away from the hoist
            if nation == 'us':
                c = (0.15, 0.2, 0.45) if (u < 0.4 and v > 0.46) else ((0.75, 0.1, 0.12) if int(v * 13) % 2 == 0 else (0.95, 0.95, 0.95))
            elif nation == 'ru':
                c = (0.95, 0.95, 0.95) if v > 0.66 else ((0.0, 0.22, 0.65) if v > 0.33 else (0.8, 0.1, 0.12))
            elif nation == 'cn':
                c = (0.95, 0.85, 0.05) if math.hypot(u - 0.17, v - 0.72) < 0.09 else (0.85, 0.06, 0.05)
            elif nation == 'eu':
                c = (0.98, 0.8, 0.0) if abs(math.hypot((u - 0.5) * 1.5, v - 0.5) - 0.3) < 0.03 and int(math.degrees(math.atan2(v - 0.5, u - 0.5)) // 15) % 2 == 0 else (0.0, 0.2, 0.6)
            else:
                c = (0.95, 0.95, 0.95) if math.hypot(u - 0.45, v - 0.5) < 0.17 and math.hypot(u - 0.52, v - 0.53) > 0.15 else (0.0, 0.45, 0.2)
            px += [*c, 1.0]
    img.pixels = px
    fm = bpy.data.materials.new('flagmat')
    fm.use_nodes = True
    tex = fm.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    fm.node_tree.links.new(tex.outputs['Color'], fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    cloth.data.materials.append(fm)
    WAVE = cloth.modifiers.new('wave', 'WAVE')
    WAVE.use_normal = False
    WAVE.use_x = True
    WAVE.use_y = True
    WAVE.height = 0.05
    WAVE.width = 0.35
    WAVE.speed = 0.25
    finish(cloth, 'flagcloth', 'forearm.R', fm, smooth=True)
elif w == 'satchel':
    blob('satchel', (-0.22, -0.06, 0.8), (0.14, 0.09, 0.12), 'forearm.R', M['vest'], 0.01)
    for i, x in enumerate((-0.12, -0.04, 0.04, 0.12)):
        blob(f'charge{i}', (x, -0.16, 1.3), (0.06, 0.04, 0.1), 'chest', M['wood'], 0.006)
    blob('wire', (0, -0.18, 1.37), (0.3, 0.01, 0.01), 'chest', principled('wire', '#c8302a', 0.4), 0.002)
elif w == 'wrench':
    blob('wrench', (-0.22, -0.1, 0.84), (0.03, 0.03, 0.3), 'forearm.R', M['steel'], 0.006)
    blob('wrenchhead', (-0.22, -0.1, 0.69), (0.07, 0.03, 0.05), 'forearm.R', M['steel'], 0.006)
else:
    gun = M['poly'] if w in ('m4', 'g36', 'qbz') else M['metal']
    L = 0.95 if w != 'qbz' else 0.8
    # Long axis along the soldier's front-left diagonal at port arms (stock at the right hip, muzzle up-left).
    # Low ready: pointing forward and a little down, stock at the right shoulder, between the two hands.
    blob('receiver', (-0.03, -0.25, 1.19), (0.05, L * 0.42, 0.09), 'chest', gun, 0.01)
    blob('barrel', (-0.01, -0.25 - L * 0.42, 1.18), (0.022, L * 0.34, 0.022), 'chest', M['metal'], 0.004)
    blob('stock', (-0.06, -0.25 + L * 0.3, 1.24), (0.045, L * 0.22, 0.1), 'chest', M['wood'] if w == 'ak' else gun, 0.01)
    blob('mag', (-0.03, -0.29, 1.09), (0.035, 0.06, 0.12), 'chest', gun, 0.006)
    blob('optic', (-0.03, -0.23, 1.27), (0.035, 0.1, 0.04), 'chest', M['poly'], 0.005)
GUN = [o for o in bpy.data.objects if o.name.split('.')[0] in ('receiver', 'barrel', 'stock', 'mag', 'optic')]

# ------------------------------------------------------------------ poses


def reset():
    for pb in POSE:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    rig.location = (0, 0, 0)
    rig.rotation_euler = (0, 0, rig.rotation_euler.z)


def rot(name, x=0.0, y=0.0, z=0.0):
    POSE[name].rotation_euler = Euler((math.radians(x), math.radians(y), math.radians(z)))


def arms_hold():
    pass  # the rest pose already has both hands on the rifle


def pose_idle():
    reset()
    arms_hold()
    rot('head', -4)


def pose_aim():
    reset()
    # Rifle shouldered: the chest pitches the rifle level and the stance widens.
    rot('chest', -8, 0, 6)
    rot('head', 6)
    rot('thigh.L', -10)
    rot('thigh.R', 12)
    rot('shin.R', -10)


def bump(p, centre, width):
    """Smooth hump (0..1) at `centre` of a cycle phase p (wraps round), `width` its half-width."""
    d = (p - centre + 0.5) % 1 - 0.5
    return math.exp(-(d / width) ** 2)


def leg(side, p):
    """One leg at gait phase p (0 = heel strike, 0.6 = toe-off): hip swings forward and back, the knee takes a small
    give after heel strike and folds well up during the swing so the foot clears the ground."""
    hip = 24 * math.cos(2 * math.pi * p) + 4
    knee = 14 * bump(p, 0.12, 0.08) + 58 * bump(p, 0.72, 0.12) + 4
    rot(f'thigh.{side}', -hip)
    rot(f'shin.{side}', knee)


def pose_walk(t):
    reset()
    leg('L', t)
    leg('R', (t + 0.5) % 1)
    w = 2 * math.pi * t
    # Body: lowest at each heel strike (both feet down), highest mid-stance; hips turn with the forward leg and the
    # shoulders turn against them; a slight forward lean, the hip dropping a little over the swinging leg.
    POSE['pelvis'].location = (0, 0, 0.035 * (0.5 - 0.5 * math.cos(2 * w)) - 0.015)
    rot('pelvis', 0, 3 * math.sin(w), 6 * math.cos(w))
    rot('spine', 3, 0, -4 * math.cos(w))
    rot('chest', 3, -2 * math.sin(w), -3 * math.cos(w))
    rot('head', -3, 0, 3 * math.cos(w))
    arms_hold()
    if WRENCH:
        rot('upper_arm.L', 22 * math.cos(w))
        rot('upper_arm.R', -22 * math.cos(w))
        rot('forearm.L', -12 - 10 * max(0, math.cos(w)))
        rot('forearm.R', -12 - 10 * max(0, -math.cos(w)))


def pose_die(t):
    reset()
    s = min(1.0, t * 1.15)
    k = s * s
    rot('shin.L', -70 * min(1, s * 2) * (1 - k * 0.6))
    rot('shin.R', -60 * min(1, s * 2) * (1 - k * 0.6))
    rot('thigh.L', 40 * min(1, s * 2) * (1 - k))
    rot('thigh.R', 30 * min(1, s * 2) * (1 - k))
    rig.rotation_euler.x = math.radians(-88 * k)  # topples backwards
    rig.location.z = 0.12 * k - 0.35 * min(1, s * 2) * (1 - k)
    rot('upper_arm.L', -40 * k)
    rot('upper_arm.R', -50 * k)
    rot('head', -25 * k)


def pose_swim(t, moving):
    reset()
    a = t * 2 * math.pi
    if moving:
        rig.rotation_euler.x = math.radians(80)  # prone in the water, head first the way it swims
        rig.location.z = -0.17  # back, head and the stroking arms break the surface
        rot('upper_arm.L', -150 * (0.5 + 0.5 * math.sin(a)))
        rot('upper_arm.R', -150 * (0.5 + 0.5 * math.sin(a + math.pi)))
        rot('thigh.L', 8 * math.sin(a * 2))
        rot('thigh.R', -8 * math.sin(a * 2))
        rot('head', -55)
    else:
        rig.location.z = -1.18 + 0.03 * math.sin(a)  # treading water: chest deep
        rot('upper_arm.L', -30, 0, 25 * math.sin(a))
        rot('upper_arm.R', -30, 0, -25 * math.sin(a))
        rot('thigh.L', 30 * math.sin(a))
        rot('thigh.R', -30 * math.sin(a))


# ------------------------------------------------------------------ light, ground, camera

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
bpy.context.collection.objects.link(sun)
sun.data.energy = 3.4
sun.data.angle = math.radians(10)
sun.rotation_euler = Vector((0.45, -0.6, 2.4)).to_track_quat('Z', 'Y').to_euler()

bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
ground = bpy.context.object
ground.is_shadow_catcher = True
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
water = bpy.context.object
hold = bpy.data.materials.new('holdout')
hold.use_nodes = True
hn = hold.node_tree.nodes
hn.remove(hn['Principled BSDF'])
ho = hn.new('ShaderNodeHoldout')
hold.node_tree.links.new(ho.outputs['Holdout'], hn['Material Output'].inputs['Surface'])
water.data.materials.append(hold)
# Ripple ring at the waterline (swim rows).
bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.015, location=(0, 0, 0.005))
ripple = bpy.context.object
foam = principled('foam', '#e9f2f4', 0.4)
foam.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.45
ripple.data.materials.append(foam)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
bpy.context.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
dview = Vector((1, 1, math.tan(math.radians(30)) * math.sqrt(2))).normalized()
# px per metre: the soldier's 1.8 m height projects by cos(30 deg) on screen.
px_per_m = FIG_PX / (1.8 * math.cos(math.radians(30)))
cam.data.ortho_scale = CELL / px_per_m
target = Vector((0, 0, 0))
cam.location = target + dview * 20
cam.rotation_euler = (-dview).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
# Shift so the feet (world origin) land on FEET in the cell.
right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
cam.location += right * ((CELL / 2 - FEET[0]) / px_per_m) + up * ((FEET[1] - CELL / 2) / px_per_m)


def facing(k):
    """World yaw for screen direction k (k * 45 deg clockwise from up). Screen: x = (Y - X), y = (X + Y) / 2."""
    a = math.radians(k * 45)
    sx, sy = math.sin(a), -math.cos(a)
    Y = (sx + 2 * sy) / 2
    X = (2 * sy - sx) / 2
    heading = math.atan2(Y, X)
    return heading + math.pi / 2  # the soldier faces -Y


# Squad passes: the bearer stands on the team's left, the escort on its right and a half step ahead.
OFFSET = {'bearer': Vector((0.3, 0.12, 0)), 'escort': Vector((-0.3, -0.12, 0))}.get(ROLE, Vector((0, 0, 0)))


def shot(row, col, k, swim=False):
    if ONLY is not None and row not in ONLY:
        return
    rig.rotation_euler.z = facing(k)
    # A swimmer lies along the water: shift him forward half a body length so his chest sits on the unit's point.
    shift = OFFSET + (Vector((0, 0.85, 0)) if swim and abs(rig.rotation_euler.x) > 1 else Vector((0, 0, 0)))
    rig.location.xy = (Euler((0, 0, facing(k))).to_matrix() @ shift).xy
    if look['weapon'] == 'flag':
        cloth = bpy.data.objects['flagcloth']
        cloth.modifiers['wave'].time_offset = -col * 6
    ground.hide_render = swim
    for o in GUN:
        o.hide_render = swim
    water.hide_render = not swim
    ripple.hide_render = not swim
    if swim:
        ripple.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUTDIR, f'r{row}_c{col}.png')
    bpy.ops.render.render(write_still=True)


if ROLE:
    me_shoots = ROLE == 'escort'
    for k in range(8):
        for f in range(8):
            pose_walk(f / 8)
            shot(k, f, k)
    for k in range(8):
        for f in range(8):
            pose_aim() if me_shoots else pose_idle()
            shot(8 + k, f, k)
    for row, falls in ((16, ROLE == 'escort'), (17, ROLE == 'bearer'), (18, True)):
        for f in range(8):
            pose_die(f / 7) if falls else pose_idle()
            shot(row, f, 3)
elif look.get('walk_only'):
    for k in range(8):
        for f in range(8):
            pose_walk(f / 8)
            shot(k, f, k)
else:
    for k in range(8):
        pose_aim()
        shot(0, k, k)
    for k in range(8):
        for f in range(8):
            pose_walk(f / 8)
            shot(1 + k, f, k)
    for k in range(8):
        pose_idle()
        shot(9, k, k)
    for f in range(8):
        pose_die(f / 7)
        shot(10, f, 3)
    if NAME.endswith('special'):
        for k in range(8):
            for f in range(8):
                pose_swim(f / 8, True)
                shot(11 + k, f, k, swim=True)
        for k in range(8):
            for f in range(8):
                pose_swim(f / 8, False)
                shot(19 + k, f, k, swim=True)
print('DONE', NAME)
