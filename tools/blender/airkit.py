"""
Shared infrastructure for the Blender aircraft sprite scripts (ART_GUIDE.md: camera, lighting, materials, primitives,
sheet export). No aircraft geometry lives here: every aircraft builds its own shapes in its own <model>_render.py.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in ARGS
NUMS = [a for a in ARGS if a.isdigit()]
SPP = 1 if PREVIEW else int(NUMS[0]) if NUMS else 48

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPRITES = os.path.join(ROOT, 'ui', 'public', 'sprites')

CELL = 192
SS = 2
DIRS = 32
SIN_E = 0.5
TEAM = {"usa": "#2f6fe0", "russia": "#d22b2b", "china": "#e8b10a", "europe": "#6532d6", "islamic": "#1f9d4a"}  # = kit.TEAM

# ---------------------------------------------------------------------------------------------- colours / materials

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


MATS = {}


def mat(name, hexc, rough=0.6, metal=0.0, panels=False, ao=0.45, emit=0.0, glass=False):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    base = srgb(hexc)
    col = nt.nodes.new('ShaderNodeRGB')
    col.outputs[0].default_value = base
    src = col.outputs[0]
    coord = nt.nodes.new('ShaderNodeTexCoord')
    if panels:
        # Panel lines: frame rings every 1.6 m along the fuselage / chord, stringers every 1.25 m up the sides,
        # ~18 % darker than the skin.
        lines = None
        for axis, period in (('X', 1.6), ('Z', 1.25), ('Y', 1.9)):
            w = nt.nodes.new('ShaderNodeTexWave')
            w.bands_direction = axis
            w.inputs['Scale'].default_value = 1.0 / period / 2.0  # wave texture: one band per 2/scale units...
            w.inputs['Scale'].default_value = 1.0 / period
            nt.links.new(coord.outputs['Object'], w.inputs['Vector'])
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.interpolation = 'CONSTANT'
            ramp.color_ramp.elements[0].position = 0.0
            ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
            ramp.color_ramp.elements[1].position = 0.985
            ramp.color_ramp.elements[1].color = (0.82, 0.82, 0.82, 1)
            nt.links.new(w.outputs['Fac'], ramp.inputs['Fac'])
            if lines is None:
                lines = ramp.outputs['Color']
            else:
                mn = nt.nodes.new('ShaderNodeMix')
                mn.data_type = 'RGBA'
                mn.blend_type = 'DARKEN'
                mn.inputs['Factor'].default_value = 1.0
                nt.links.new(lines, mn.inputs['A'])
                nt.links.new(ramp.outputs['Color'], mn.inputs['B'])
                lines = mn.outputs['Result']
        mul = nt.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.inputs['Factor'].default_value = 1.0
        nt.links.new(src, mul.inputs['A'])
        nt.links.new(lines, mul.inputs['B'])
        src = mul.outputs['Result']
    # Light grime: +-4 % noise.
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 0.6
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    gr = nt.nodes.new('ShaderNodeMapRange')
    gr.inputs['To Min'].default_value = 0.96
    gr.inputs['To Max'].default_value = 1.04
    nt.links.new(noise.outputs['Fac'], gr.inputs['Value'])
    mg = nt.nodes.new('ShaderNodeMix')
    mg.data_type = 'RGBA'
    mg.blend_type = 'MULTIPLY'
    mg.inputs['Factor'].default_value = 1.0
    nt.links.new(src, mg.inputs['A'])
    nt.links.new(gr.outputs['Result'], mg.inputs['B'])
    src = mg.outputs['Result']
    if ao > 0:
        occ = nt.nodes.new('ShaderNodeAmbientOcclusion')
        occ.inputs['Distance'].default_value = ao
        nt.links.new(src, occ.inputs['Color'])
        src = occ.outputs['Color']
    nt.links.new(src, bsdf.inputs['Base Color'])
    if glass:
        bsdf.inputs['Coat Weight'].default_value = 1.0
        bsdf.inputs['Specular IOR Level'].default_value = 0.8
    if emit > 0:
        bsdf.inputs['Emission Color'].default_value = base
        bsdf.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m


# ---------------------------------------------------------------------------------------------- mesh primitives

PARTS = []  # (object, group) groups: 'always', 'gear', 'ramp', 'beacon'


def obj(name, verts, faces, material, group='always', smooth=40):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        try:
            bpy.context.view_layer.objects.active = ob
            ob.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth))
            ob.select_set(False)
        except Exception:  # noqa: BLE001
            pass
    PARTS.append((ob, group))
    return ob


def loft(name, rings, material, group='always', cap=True, smooth=40):
    """Rings: lists of the same number of 3D points; quads between neighbours, fans closing both ends."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    if cap:
        c0 = np.mean(rings[0], axis=0)
        c1 = np.mean(rings[-1], axis=0)
        verts += [tuple(c0), tuple(c1)]
        i0, i1 = len(verts) - 2, len(verts) - 1
        last = (len(rings) - 1) * n
        for j in range(n):
            faces.append((i0, (j + 1) % n, j))
            faces.append((i1, last + j, last + (j + 1) % n))
    return obj(name, verts, faces, material, group, smooth)


def superellipse(cx, cy, cz, hw, hh, n=2.4, segs=48, axis='u'):
    """Ring round the u axis (or v / z): half width hw (v), half height hh (z)."""
    pts = []
    for k in range(segs):
        t = k / segs * 2 * math.pi
        c, s = math.cos(t), math.sin(t)
        a = math.copysign(abs(c) ** (2 / n), c)
        b = math.copysign(abs(s) ** (2 / n), s)
        if axis == 'u':
            pts.append((cx, cy + hw * a, cz + hh * b))
        elif axis == 'v':
            pts.append((cx + hw * a, cy, cz + hh * b))
        else:
            pts.append((cx + hw * a, cy + hh * b, cz))
    return pts


def lathe(name, profile, origin, axis, material, group='always', segs=40, smooth=50):
    """Profile (x along the axis, r); axis 'u' (to the nose: x runs backwards) or 'v'."""
    ox, oy, oz = origin
    rings = []
    for x, r in profile:
        ring = []
        for k in range(segs):
            t = k / segs * 2 * math.pi
            if axis == 'u':
                ring.append((ox - x, oy + r * math.cos(t), oz + r * math.sin(t)))
            else:
                ring.append((ox + r * math.cos(t), oy + x, oz + r * math.sin(t)))
        rings.append(ring)
    return loft(name, rings, material, group, cap=True, smooth=smooth)


def airfoil(t, camber=0.018, n=16):
    """Closed section (x 0..1 back from the leading edge, y up), rounded nose, sharp trailing edge."""
    xs = [(1 - math.cos(math.pi * i / n)) / 2 for i in range(n + 1)]
    yt = lambda x: 5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
    yc = lambda x: camber * 4 * x * (1 - x)
    upper = [(x, yc(x) + yt(x)) for x in xs]
    lower = [(x, yc(x) - yt(x)) for x in reversed(xs[1:-1])]
    return upper + lower


def surface(name, sections, material, group='always', camber=0.018, smooth=35):
    """Lifting surface lofted through sections: (leading-edge point, chord vector, thickness 'up' vector, t/c)."""
    rings = []
    for le, chord, up, tc in sections:
        le, chord, up = np.array(le, float), np.array(chord, float), np.array(up, float)
        cl = np.linalg.norm(chord)
        up = up / np.linalg.norm(up)
        rings.append([tuple(le + chord * x + up * y * cl) for x, y in airfoil(tc, camber)])
    return loft(name, rings, material, group, cap=True, smooth=smooth)


def box(name, center, size, material, group='always', rot=(0, 0, 0)):
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    R = Matrix.Rotation(rot[2], 3, 'Z') @ Matrix.Rotation(rot[1], 3, 'Y') @ Matrix.Rotation(rot[0], 3, 'X')
    v = [tuple(Vector((cx, cy, cz)) + R @ Vector(p)) for p in v]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return obj(name, v, f, material, group, smooth=0)


def rod(name, a, b, r, material, group='always', segs=10):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = d.orthogonal().normalized()
    up = d.cross(side)
    rings = []
    for p in (a, b):
        rings.append([tuple(p + r * (math.cos(t) * side + math.sin(t) * up)) for t in (k / segs * 2 * math.pi for k in range(segs))])
    return loft(name, rings, material, group, cap=True, smooth=60)


def plate(name, pts, normal, material, group='always', off=0.02):
    """Flat decal polygon (convex or star fan from its centre), pushed `off` along `normal`."""
    nrm = Vector(normal).normalized() * off
    v = [tuple(Vector(p) + nrm) for p in pts]
    c = Vector(np.mean(pts, axis=0)) + nrm
    v.append(tuple(c))
    ci = len(v) - 1
    faces = [(ci, i, (i + 1) % (len(pts))) for i in range(len(pts))]
    return obj(name, v, faces, material, group, smooth=0)



class Body:
    """Fuselage of superellipse rings through stations (u, axis offset dz, half width, half height) round axis height zc."""

    def __init__(self, stations, zc, n=2.4):
        self.s, self.zc, self.n = stations, zc, n

    def station(self, u):
        s = self.s
        if u >= s[0][0]:
            return s[0][1:]
        for (u0, *a), (u1, *b) in zip(s, s[1:]):
            if u1 <= u <= u0:
                f = (u0 - u) / (u0 - u1)
                return tuple(x + (y - x) * f for x, y in zip(a, b))
        return s[-1][1:]

    def point(self, u, side, z, off=0.0):
        """Skin point at (u, height z) on the left (+1) / right (-1) side, pushed `off` outwards along the normal."""
        n = self.n
        dz, hw, hh = self.station(u)
        s = max(-0.999, min(0.999, (z - self.zc - dz) / hh))
        vv = hw * (1 - abs(s) ** n) ** (1 / n)
        gy = (abs(vv) / hw) ** (n - 1) / hw if hw > 0 else 0
        gz = math.copysign(abs(s) ** (n - 1) / hh, s)
        ln = math.hypot(gy, gz) or 1
        return (u, side * (vv + off * gy / ln), z + off * gz / ln)

    def half_width(self, u, z):
        dz, hw, hh = self.station(u)
        s = max(-0.999, min(0.999, (z - self.zc - dz) / hh))
        return hw * (1 - abs(s) ** self.n) ** (1 / self.n)

    def patch(self, name, u0, u1, z0, z1, side, material, group='always', off=0.03, nu=4, nz=3):
        verts, faces = [], []
        for i in range(nu + 1):
            for j in range(nz + 1):
                verts.append(self.point(u0 + (u1 - u0) * i / nu, side, z0 + (z1 - z0) * j / nz, off))
        for i in range(nu):
            for j in range(nz):
                a = i * (nz + 1) + j
                q = (a, a + nz + 1, a + nz + 2, a + 1)
                faces.append(q if side > 0 else q[::-1])
        return obj(name, verts, faces, material, group, smooth=0)

    def skin(self, name, material, us, segs=56, grow=0.0):
        rings = []
        for u in us:
            dz, hw, hh = self.station(u)
            rings.append(superellipse(u, 0, self.zc + dz, hw + grow, hh + grow, self.n, segs))
        return loft(name, rings, material, smooth=40)


def flag_plate(name, u, y, z, w, h, side, colour_mat, off=0.0):
    """Flat rectangle in the u-z plane at v = y, facing side (+1 left / -1 right)."""
    pts = [(u + w / 2, y, z - h / 2), (u - w / 2, y, z - h / 2), (u - w / 2, y, z + h / 2), (u + w / 2, y, z + h / 2)]
    return plate(name, pts[::side], (0, side, 0), colour_mat, off=off)


def star_plate(name, u, y, z, ro, ri, points, side, m, off=0.0, rot=math.pi / 2):
    pts = []
    for k in range(points * 2):
        a = rot + k * math.pi / points
        r = ro if k % 2 == 0 else ri
        pts.append((u + r * math.cos(a), y, z + r * math.sin(a)))
    return plate(name, pts[::side], (0, side, 0), m, off=off)


def star_flat(name, u, v, z, ro, ri, points, m, rot=0.0):
    """Star lying flat (on a wing top), pointing along +u."""
    pts = []
    for k in range(points * 2):
        a = rot + k * math.pi / points
        r = ro if k % 2 == 0 else ri
        pts.append((u + r * math.cos(a), v + r * math.sin(a), z))
    return plate(name, pts, (0, 0, 1), m, off=0.0)

# ---------------------------------------------------------------------------------------------- stage and render

def stage(scale):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SPP
    sc.cycles.use_denoising = not PREVIEW
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = CELL * SS
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'Medium Contrast'
    wd = bpy.data.worlds.new('sky')
    sc.world = wd
    wd.use_nodes = True
    bg = wd.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.55
    key = bpy.data.lights.new('key', 'SUN')
    key.energy = 2.8
    key.angle = math.radians(3)
    ko = bpy.data.objects.new('key', key)
    sc.collection.objects.link(ko)
    ko.rotation_mode = 'QUATERNION'
    ko.rotation_quaternion = Vector((-0.45, -0.35, 0.82)).normalized().to_track_quat('Z', 'Y')
    rim = bpy.data.lights.new('rim', 'SUN')
    rim.energy = 0.9
    rim.color = (0.85, 0.9, 1.0)
    ro = bpy.data.objects.new('rim', rim)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(58), 0, math.radians(-55))
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = CELL / scale
    cam_d.clip_end = 600
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(60), 0, 0)
    cam.location = (cam.rotation_euler.to_quaternion() @ Vector((0, 0, 1))) * 200
    sc.camera = cam
    return sc


def show(groups):
    for ob, g in PARTS:
        hide = g not in groups
        ob.hide_render = hide


def pose(plane, pitch, roll):
    p, q = math.radians(pitch), math.radians(roll)
    cp, sp, cr, sr = math.cos(p), math.sin(p), math.cos(q), math.sin(q)
    rp = np.array([[cp, 0, -sp], [0, 1, 0], [sp, 0, cp]])
    rr = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    m = rr @ rp
    plane.matrix_basis = Matrix([list(m[0]) + [0], list(m[1]) + [0], list(m[2]) + [0], [0, 0, 0, 1]])


def grab(sc, tmp):
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp)
    px = np.empty(CELL * SS * CELL * SS * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    px = px.reshape(CELL, SS, CELL, SS, 4)
    a = px[..., 3].mean((1, 3))
    rgb = (px[..., :3] * px[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
    return np.dstack([rgb, a])  # bottom-up rows, as Blender stores them


# Rows: (visible groups, pitch, roll, tint)
ROWS = [
    (('always', 'gear', 'beacon_off'), 0, 0, 1.0),        # 0 parked, gear down
    (('always', 'beacon_off'), 0, 0, 1.0),                # 1 flying
    (('always', 'beacon_on'), 0, 0, 1.0),                 # 2 flying, beacon flash
    (('always', 'gear', 'ramp', 'beacon_off'), 0, 0, 1.0),  # 3 ramp down
    (('always', 'beacon_off'), 0, -25, 1.0),              # 4 banked left
    (('always', 'beacon_off'), 0, 25, 1.0),               # 5 banked right
    (('always', 'beacon_off'), -20, 10, 0.6),             # 6 crashing
    (('always', 'beacon_off'), -35, 30, 0.4),             # 7 crashing, steeper, burnt
]


def shadow_material():
    m = bpy.data.materials.new('shadow')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0, 0, 0, 1)
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m



def run(model, out_name, length, build):
    """Builds the aircraft (`build()` makes its parts), renders the 32 x 9 sheet into ui/public/sprites/<out_name>.png."""
    scale = CELL * 0.74 / length  # sheet px per metre: side-on the aircraft spans 0.74 of a cell (AircraftSheets.ts)
    out = os.path.join(SPRITES, f'{model}-preview.png' if PREVIEW else f'{out_name}.png')
    sc = stage(scale)
    build()
    plane = bpy.data.objects.new('plane', None)
    sc.collection.objects.link(plane)
    rig = bpy.data.objects.new('rig', None)
    sc.collection.objects.link(rig)
    plane.parent = rig
    zs = []
    for ob, g in PARTS:
        if g == 'always':
            zs += [v.co.z for v in ob.data.vertices]
    zmid = (max(zs) + min(zs)) / 2
    for ob, _ in PARTS:
        ob.parent = plane
        ob.location.z -= zmid
    tmp = out + '.tmp.png'
    rows = [ROWS[0], ROWS[1], ROWS[3], ROWS[4]] if PREVIEW else ROWS
    dirs = list(range(0, DIRS, 8)) if PREVIEW else list(range(DIRS))
    sheet = np.zeros((CELL * (len(rows) + (0 if PREVIEW else 1)), CELL * len(dirs), 4), np.float32)
    heading = lambda k: (0, 0, math.atan2(math.cos(k / DIRS * 2 * math.pi) / SIN_E, math.sin(k / DIRS * 2 * math.pi)))
    for r, (groups, pitch, roll, tint) in enumerate(rows):
        show(groups)
        pose(plane, pitch, roll)
        for ci, k in enumerate(dirs):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] *= tint
            sheet[r * CELL:(r + 1) * CELL, ci * CELL:(ci + 1) * CELL] = cell
            print(f'[{model}] row {r + 1}/{len(rows)} facing {k + 1}/{DIRS}', flush=True)
    if not PREVIEW:
        # Shadow row: the level aircraft flattened onto the ground, flat black (the game sets its opacity).
        show(('always',))
        sh = shadow_material()
        for ob, _ in PARTS:
            ob.data.materials.clear()
            ob.data.materials.append(sh)
        plane.matrix_basis = Matrix.Diagonal((1, 1, 0.001, 1))
        sc.cycles.samples = 4
        sc.cycles.use_denoising = False
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
        for k in range(DIRS):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] = 0
            sheet[8 * CELL:9 * CELL, k * CELL:(k + 1) * CELL] = cell
            print(f'[{model}] shadow {k + 1}/{DIRS}', flush=True)
    os.remove(tmp)
    H, W = sheet.shape[:2]
    img = bpy.data.images.new('sheet', W, H, alpha=True)
    img.pixels.foreach_set(np.clip(sheet[::-1], 0, 1).astype(np.float32).ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    print(f'[{model}] wrote {out} ({W}x{H})', flush=True)
