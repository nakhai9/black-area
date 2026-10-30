"""
Blender (headless) renderer for the five national AWACS sprites. Builds each aircraft procedurally (hard-edged blocks:
hexagonal-section wings and tails, bevelled struts, a rimmed radar dome, podded engines), paints it with Principled
metal paint (panel lines, underside shade, camouflage, decals), lights it with the game sun (screen upper left) and
renders it with an orthographic camera in the game's 2:1 projection (elevation 30 deg).
Frames go to <out>/<faction>/<pose>_<dir>.png (256 px, 2x the 128 px sheet cell); tools/awacs_pack.py packs them into
public/sprites/awacs-<faction>.png in the AircraftSheets.ts 'bomber' layout (16 headings x 9 rows).
  usa      Boeing E-3 Sentry: 707 airframe, low swept wing, four podded engines, rotodome on two struts.
  europe   A330 AEW: wide-body, two big turbofans, winglets, long radome on a dorsal fairing.
  china    KJ-2000: Il-76 airframe, high wing, T-tail, fixed three-face radome on a pedestal.
  russia   Beriev A-50: Il-76 airframe, rotodome on struts, refuelling probe, tail gun position.
  islamic  Al-Basir (original design): high-wing airlifter, twin fins, thimble nose, rotodome on one pylon.
Usage: blender --background --factory-startup --python tools/blender/awacs_render.py -- <out dir> [faction ...]
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGV[0] if ARGV else 'awacs-frames'
FACTIONS = ARGV[1:] or ['usa', 'europe', 'china', 'russia', 'islamic']
RES = 256
QUICK = bool(os.environ.get('AWACS_QUICK'))
DIRS = 16
SPAN_FRAC = 0.74  # side-on the aircraft spans this much of a cell (AircraftSheets.ts)
SIN_E = 0.5
COS_E = math.sqrt(1 - SIN_E ** 2)
POSES = {  # name: (pitch, roll) in degrees; 'shadow' is flattened onto the ground
    'level': (0, 0), 'bankL': (0, -25), 'bankR': (0, 25), 'crash1': (-20, 10), 'crash2': (-35, 30), 'shadow': (0, 0),
}


def srgb(c):
    def lin(x):
        x /= 255
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return (lin(c[0]), lin(c[1]), lin(c[2]), 1)


# ------------------------------------------------------------------ materials

def nodes_of(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], nt.nodes['Material Output'].inputs[0])
    return m, nt, bsdf


def mat_plain(name, col, metal=0.2, rough=0.5):
    m, nt, b = nodes_of(name)
    b.inputs['Base Color'].default_value = srgb(col)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m


def mat_paint(name, base, under, camo=None, camo2=None, seam_axis=0, seam_step=1.7, seed=0.0):
    """Painted metal: underside shade by object-space normal, optional noise camouflage, thin dark panel seams."""
    m, nt, b = nodes_of(name)
    L = nt.links
    tc = nt.nodes.new('ShaderNodeTexCoord')
    col = nt.nodes.new('ShaderNodeRGB')
    col.outputs[0].default_value = srgb(base)
    cur = col.outputs[0]
    if camo:
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 0.11
        nz.inputs['Detail'].default_value = 1.0
        nz.noise_dimensions = '4D'
        nz.inputs['W'].default_value = seed
        L.new(tc.outputs['Object'], nz.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.interpolation = 'CONSTANT'
        e = ramp.color_ramp.elements
        e[0].color = srgb(camo2 or base)
        e[0].position = 0.0
        e[1].color = srgb(base)
        e[1].position = 0.42 if camo2 else 0.0
        e.new(0.58).color = srgb(camo)
        L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
        cur = ramp.outputs['Color']
    # Underside: object-space normal pointing down.
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Normal'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -0.25
    mr.inputs['From Max'].default_value = -0.55
    L.new(sep.outputs['Z'], mr.inputs['Value'])
    mu = nt.nodes.new('ShaderNodeMix')
    mu.data_type = 'RGBA'
    L.new(mr.outputs['Result'], mu.inputs['Factor'])
    L.new(cur, mu.inputs[6])
    mu.inputs[7].default_value = srgb(under)
    cur = mu.outputs[2]
    # Panel seams: fract(coord / step) < 0.05 → darker.
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], sp.inputs[0])
    dv = nt.nodes.new('ShaderNodeMath')
    dv.operation = 'DIVIDE'
    dv.inputs[1].default_value = seam_step
    L.new(sp.outputs[seam_axis], dv.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath')
    fr.operation = 'FRACT'
    L.new(dv.outputs[0], fr.inputs[0])
    lt = nt.nodes.new('ShaderNodeMath')
    lt.operation = 'LESS_THAN'
    lt.inputs[1].default_value = 0.06
    L.new(fr.outputs[0], lt.inputs[0])
    ms = nt.nodes.new('ShaderNodeMix')
    ms.data_type = 'RGBA'
    ms.blend_type = 'MULTIPLY'
    L.new(lt.outputs[0], ms.inputs['Factor'])
    L.new(cur, ms.inputs[6])
    ms.inputs[7].default_value = (0.72, 0.72, 0.74, 1)
    L.new(ms.outputs[2], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0.4
    b.inputs['Roughness'].default_value = 0.45
    return m


# ------------------------------------------------------------------ geometry (x = u forward, y = v left, z up; metres)

class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []
        self.smooth_mats = set()

    def mi(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def face(self, vs, mat, smooth=False):
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(mat)
        f.smooth = smooth
        return f

    def rings(self, rows, mat, closed=True, smooth=True, cap0=None, cap1=None):
        bm = self.bm
        vr = [[bm.verts.new(p) for p in r] for r in rows]
        n = len(rows[0])
        for i in range(len(vr) - 1):
            for j in range(n if closed else n - 1):
                k = (j + 1) % n
                self.face([vr[i][j], vr[i][k], vr[i + 1][k], vr[i + 1][j]], mat, smooth)
        if cap0:
            self.face(vr[0][::-1], cap0)
        if cap1:
            self.face(vr[-1], cap1)
        return vr

    def loft(self, secs, mat, n=24, cap0=None, cap1=None, smooth=True):
        """Sections (x, y, z, ry, rz) along x."""
        rows = []
        for x, y, z, ry, rz in secs:
            rows.append([(x, y + ry * math.cos(a), z + rz * math.sin(a)) for a in (2 * math.pi * k / n for k in range(n))])
        return self.rings(rows, mat, True, smooth, cap0 or mat, cap1 or mat)

    def surface(self, root, span_dir, span, c_root, c_tip, sweep, thick, mat, up=(0, 0, 1), tip_thick=0.55):
        """A wing / tail / fin panel with a hard-edged hexagonal section: leading edge at `root`, chord back along -x."""
        sd = Vector(span_dir).normalized()
        upv = Vector(up)
        prof = [(0, 0), (0.1, 0.5), (0.55, 0.5), (1, 0.06), (1, -0.06), (0.55, -0.32), (0.1, -0.32)]
        rows = []
        for f in (0, 1):
            le = Vector(root) + sd * span * f + Vector((-sweep * f, 0, 0))
            c = c_root + (c_tip - c_root) * f
            t = thick * c_root * (1 - (1 - tip_thick) * f)
            rows.append([tuple(le + Vector((-a * c, 0, 0)) + upv * (b * t)) for a, b in prof])
        self.rings(rows, mat, True, False, mat, mat)

    def block(self, a, b, w, h, mat):
        """A tapered box from point a to point b (width w across y, depth h along the axis-normal)."""
        a, b = Vector(a), Vector(b)
        ax = (b - a).normalized()
        side = Vector((0, 1, 0))
        nrm = ax.cross(side).normalized()
        if nrm.length < 0.1:
            nrm = Vector((1, 0, 0))
        rows = []
        for p, s in ((a, 1.0), (b, 0.8)):
            rows.append([tuple(p + side * (w / 2 * s * i) + nrm * (h / 2 * s * j)) for i, j in ((1, 1), (-1, 1), (-1, -1), (1, -1))])
        self.rings(rows, mat, True, False, mat, mat)

    def dome(self, c, rd, hd, mat, band, n=40):
        """Radar dome: a lens with a crisp vertical rim band."""
        cx, cy, cz = c
        prof = [(0.0, 1.0), (0.45, 0.93), (0.75, 0.72), (0.92, 0.42), (1.0, 0.22)]
        top = [(rd * r, hd * zz) for r, zz in prof]
        rows_t = [[(cx + r * math.cos(a), cy + r * math.sin(a), cz + z) for a in (2 * math.pi * k / n for k in range(n))] for r, z in top[1:]]
        rows_b = [[(cx + r * math.cos(a), cy + r * math.sin(a), cz - z) for a in (2 * math.pi * k / n for k in range(n))] for r, z in top[1:][::-1]]
        bm = self.bm
        vt = self.rings(rows_t, mat, True, True)
        vb = self.rings(rows_b, mat, True, True)
        # rim band (flat-shaded, own colour) between the top and the bottom shells
        for j in range(n):
            k = (j + 1) % n
            self.face([vt[-1][j], vb[0][j], vb[0][k], vt[-1][k]][::-1], band, False)
        ct = bm.verts.new((cx, cy, cz + hd))
        cb = bm.verts.new((cx, cy, cz - hd))
        for j in range(n):
            k = (j + 1) % n
            self.face([vt[0][j], vt[0][k], ct], mat, True)
            self.face([vb[-1][k], vb[-1][j], cb], mat, True)

    def finish(self):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        return self.bm


def fuselage(B, L, R, nose=0.12, tail=0.27, upsweep=0.55, belly=1.0, cz=None, n=28, nose_drop=0.18):
    cz = R if cz is None else cz
    secs = []
    for k in range(41):
        f = k / 40
        u = L / 2 - f * L
        if f < nose:
            g = f / nose
            r = R * max((1 - (1 - g) ** 2.2), 0) ** 0.5
            z = cz - R * nose_drop * (1 - g)
        elif f > 1 - tail:
            g = (f - (1 - tail)) / tail
            r = R * (1 - 0.82 * g ** 1.15)
            z = cz + R * upsweep * g ** 1.6
        else:
            r, z = R, cz
        secs.append((u, 0, z, max(r, 0.06), max(r * belly, 0.06)))
    B.loft(secs, 'body', n=n)
    return cz + R


def engine(B, u, v, z, r, l):
    secs = [(u, v, z, r * 0.86, r * 0.86), (u - 0.06 * l, v, z, r, r), (u - 0.65 * l, v, z, r * 0.96, r * 0.96),
            (u - 0.9 * l, v, z, r * 0.7, r * 0.7), (u - l, v, z, r * 0.45, r * 0.45)]
    B.loft(secs, 'nacelle', n=20, cap0='intake', cap1='exhaust')


def wing_engine(B, root_u, root_v, zw, dihedral, sweep, span, side, dv, r, l):
    s = dv / span
    le = root_u - sweep * s
    z = zw + dv * math.tan(math.radians(dihedral))
    y = side * (root_v + dv)
    engine(B, le + 0.5 * l, y, z - r - 0.45, r, l)
    B.block((le + 0.05 * l, y, z - 0.5), (le - 0.45 * l, y, z + 0.1), 0.26, 0.5, 'pylon')
    B.block((le + 0.15 * l, y, z - 0.55), (le + 0.1 * l, y, z - r * 0.7), 0.24, 0.55, 'pylon')


def rotodome(B, u, ztop, rd, hd, lift, struts, pedestal=False):
    cz = ztop + lift + hd * 0.6
    B.dome((u, 0, cz), rd, hd, 'dome', 'band')
    if pedestal:
        B.loft([(u + rd * 0.6, 0, ztop - 0.15, 0.15, 0.08), (u + rd * 0.25, 0, ztop + lift * 0.55, 0.45, lift * 0.55),
                (u - rd * 0.25, 0, ztop + lift * 0.55, 0.45, lift * 0.55), (u - rd * 0.65, 0, ztop - 0.15, 0.15, 0.08)],
               'pylon', n=16, smooth=False)
    for du in struts:
        B.block((u + du * 1.4, 0, ztop - 0.2), (u + du, 0, cz - hd * 0.3), 0.4, 0.85, 'pylon')
    return cz


def il76(B, L, R, tail_gun=False):
    top = fuselage(B, L, R, nose=0.1, tail=0.25, upsweep=0.35, belly=1.05, nose_drop=0.3)
    zw = 2 * R - 0.2
    for s in (1, -1):
        B.surface((5.0, s * R * 0.6, zw), (0, s, -math.tan(math.radians(3))), 23.5, 9.5, 3.2, 8.5, 0.13, 'wing')
        for dv in (6.0, 12.6):
            wing_engine(B, 5.0, R * 0.6, zw, -3, 8.5, 23.5, s, dv, 0.9, 5.0)
        B.loft([(1.5, s * (R - 0.15), 0.6, 0.05, 0.05), (0.0, s * (R + 0.15), 0.8, 0.5, 0.65),
                (-6.5, s * (R + 0.15), 0.8, 0.5, 0.65), (-8.5, s * (R - 0.15), 0.8, 0.05, 0.05)], 'body', n=12)
    fin_root = top - 0.3
    B.surface((-15.5, 0, fin_root), (0, 0, 1), 8.0, 8.0, 4.4, 5.0, 0.12, 'fin', up=(0, 1, 0))
    for s in (1, -1):
        B.surface((-19.0, 0, fin_root + 7.9), (0, s, 0), 8.6, 4.4, 1.8, 3.0, 0.1, 'tail')
    if tail_gun:
        B.loft([(-L / 2 + 2.2, 0, R + 0.95, 0.05, 0.05), (-L / 2 + 1.4, 0, R + 0.95, 0.75, 0.7), (-L / 2 + 0.3, 0, R + 0.95, 0.45, 0.4)], 'glass', n=14)
    return top


def usa(B):
    L, R = 46.6, 1.9
    top = fuselage(B, L, R, nose=0.1, tail=0.24, upsweep=0.5)
    zw = R * 0.55
    for s in (1, -1):
        B.surface((3.6, s * R * 0.8, zw), (0, s, math.tan(math.radians(6))), 20.5, 9.6, 2.6, 12.0, 0.12, 'wing')
        for dv in (6.6, 13.0):
            wing_engine(B, 3.6, R * 0.8, zw, 6, 12.0, 20.5, s, dv, 0.78, 4.4)
        B.surface((-18.0, s * R * 0.4, top - 0.4), (0, s, 0.12), 6.6, 5.0, 1.8, 3.8, 0.1, 'tail')
    B.surface((-15.5, 0, top - 0.35), (0, 0, 1), 7.6, 7.6, 2.4, 6.4, 0.11, 'fin', up=(0, 1, 0))
    rotodome(B, -6.0, top, 4.6, 0.95, 1.9, (1.4, -1.4))
    B.block((9.0, 0, top - 0.1), (8.4, 0, top + 0.5), 0.1, 0.5, 'antenna')
    return dict(top=top, R=R, L=L, fin_u=-17.5, nose_glaze=False, dome_u=-6.0)


def europe(B):
    L, R = 53.0, 2.75
    top = fuselage(B, L, R, nose=0.09, tail=0.26, upsweep=0.42)
    zw = R * 0.5
    for s in (1, -1):
        B.surface((5.5, s * R * 0.85, zw), (0, s, math.tan(math.radians(5.5))), 26.5, 11.0, 2.5, 15.5, 0.12, 'wing')
        tip = (5.5 - 15.5, s * (R * 0.85 + 26.5), zw + 26.5 * math.tan(math.radians(5.5)))
        B.surface(tip, (0, s * 0.25, 0.97), 2.6, 2.4, 1.0, 1.4, 0.1, 'accent', up=(0, 1, 0))
        wing_engine(B, 5.5, R * 0.85, zw, 5.5, 15.5, 26.5, s, 7.6, 1.45, 6.0)
        B.surface((-21.0, s * R * 0.3, top - 0.6), (0, s, 0.12), 9.0, 6.0, 2.0, 5.5, 0.1, 'tail')
    B.surface((-17.5, 0, top - 0.45), (0, 0, 1), 8.6, 8.8, 3.0, 7.4, 0.11, 'accent', up=(0, 1, 0))
    # Long, flat radome on a dorsal fairing.
    B.loft([(1.8, 0, top - 0.25, 0.2, 0.1), (-1.0, 0, top + 0.6, 0.55, 0.75), (-7.0, 0, top + 0.6, 0.55, 0.75), (-9.8, 0, top - 0.25, 0.2, 0.1)],
           'pylon', n=16, smooth=False)
    secs = [(2.4, 0, top + 1.55, 0.3, 0.15), (1.2, 0, top + 1.55, 2.0, 0.6), (-1.5, 0, top + 1.55, 3.3, 0.85),
            (-6.5, 0, top + 1.55, 3.3, 0.85), (-9.2, 0, top + 1.55, 2.0, 0.6), (-10.4, 0, top + 1.55, 0.3, 0.15)]
    B.loft(secs, 'dome', n=24)
    for du in (8.5, 12.0, -12.5):
        B.block((du, 0, top - 0.1), (du - 0.5, 0, top + 0.55), 0.1, 0.6, 'antenna')
    return dict(top=top, R=R, L=L, fin_u=-20.0, nose_glaze=False)


def china(B):
    top = il76(B, 46.6, 2.45)
    cz = rotodome(B, -3.5, top, 6.6, 1.15, 1.9, (), pedestal=True)
    # Fixed three-face array: three darker panels on the dome rim.
    for k in range(3):
        a = math.radians(90 + k * 120)
        c = Vector((-3.5 + 6.62 * math.cos(a), 6.62 * math.sin(a), cz))
        t = Vector((-math.sin(a), math.cos(a), 0))
        B.face([B.bm.verts.new(tuple(c + t * 2.6 * i + Vector((0, 0, 0.32 * j)))) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))], 'antenna')
    for du in (9.0, -8.0):
        B.block((du, 0, top - 0.1), (du - 0.5, 0, top + 0.6), 0.1, 0.6, 'antenna')
    return dict(top=top, R=2.45, L=46.6, fin_u=-17.0, nose_glaze=True)


def russia(B):
    top = il76(B, 46.6, 2.45, tail_gun=True)
    rotodome(B, -3.0, top, 5.2, 1.0, 2.2, (1.6, -1.6))
    for du in (10.5, 7.0):
        B.block((du, 0, top - 0.1), (du - 0.6, 0, top + 0.65), 0.1, 0.6, 'antenna')
    for s in (1, -1):
        B.loft([(14.0, s * 2.3, 2.6, 0.05, 0.05), (12.0, s * 2.45, 2.6, 0.3, 0.45), (6.0, s * 2.45, 2.6, 0.3, 0.45), (4.5, s * 2.3, 2.6, 0.05, 0.05)], 'pylon', n=10)
    B.loft([(21.0, 0.6, 2.9, 0.08, 0.08), (25.6, 0.6, 2.9, 0.08, 0.08)], 'antenna', n=6)  # refuelling probe
    return dict(top=top, R=2.45, L=46.6, fin_u=-17.0, nose_glaze=True, dome_u=-3.0)


def islamic(B):
    L, R = 44.0, 2.55
    top = fuselage(B, L, R, nose=0.13, tail=0.25, upsweep=0.45, belly=1.02)
    zw = 2 * R - 0.15
    for s in (1, -1):
        B.surface((4.5, s * R * 0.6, zw), (0, s, -math.tan(math.radians(1.5))), 22.0, 9.0, 3.4, 6.5, 0.14, 'wing')
        for dv in (5.6, 11.8):
            wing_engine(B, 4.5, R * 0.6, zw, -1.5, 6.5, 22.0, s, dv, 0.95, 4.8)
        B.surface((-15.0, s * R * 0.3, top - 0.3), (0, s, 0.05), 8.4, 5.2, 3.6, 2.2, 0.1, 'tail')
        B.surface((-17.6, s * (R * 0.3 + 8.2), top - 0.25), (0, -s * 0.12, 1), 6.2, 4.6, 2.6, 2.4, 0.11, 'fin', up=(0, 1, 0))
    B.loft([(L / 2 - 1.0, 0, R * 0.95, 1.1, 1.0), (L / 2 + 0.4, 0, R * 0.95, 0.85, 0.8), (L / 2 + 1.4, 0, R * 0.95, 0.35, 0.3)], 'radome', n=18)
    cz = top + 2.0 + 0.6
    B.dome((-4.0, 0, cz), 5.0, 0.95, 'dome', 'band')
    B.loft([(0.8, 0, top - 0.25, 0.15, 0.1), (-1.6, 0, top + 1.0, 0.45, 1.15), (-4.6, 0, top + 1.0, 0.45, 1.15), (-6.2, 0, top - 0.25, 0.15, 0.1)],
           'pylon', n=14, smooth=False)
    for du in (9.5, -9.0):
        B.block((du, 0, top - 0.1), (du - 0.5, 0, top + 0.6), 0.1, 0.6, 'antenna')
    return dict(top=top, R=R, L=L, fin_u=-19.0, nose_glaze=False)


# ------------------------------------------------------------------ decals (thin flat shapes laid on the skin by ray casts)

def star_pts(r, inner=0.42, points=5):
    pts = []
    for k in range(points * 2):
        a = math.pi / 2 + k * math.pi / points
        rr = r if k % 2 == 0 else r * inner
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


def circle_pts(r, n=20):
    return [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def rect_pts(w, h):
    return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]


class Decals:
    def __init__(self, B):
        self.B = B
        self.tree = BVHTree.FromBMesh(B.bm)
        self.layer = 0

    def put(self, origin, direction, pts, mat, axis_a=(1, 0, 0)):
        """Cast from `origin` along `direction`; lay the 2D outline `pts` (a: along axis_a, b: across) on the hit."""
        hit, nrm, _, _ = self.tree.ray_cast(Vector(origin), Vector(direction).normalized(), 200)
        if hit is None:
            return
        if nrm.dot(Vector(direction)) > 0:
            nrm = -nrm
        self.layer += 1
        off = 0.025 + 0.012 * self.layer
        a = Vector(axis_a)
        a = (a - nrm * a.dot(nrm)).normalized()
        b = nrm.cross(a)
        vs = [self.B.bm.verts.new(tuple(hit + nrm * off + a * x + b * y)) for x, y in pts]
        f = self.B.face(vs, mat)
        if f.normal.dot(nrm) < 0:
            f.normal_flip()


def decorate(f, B, info):
    D = Decals(B)
    top, R, L = info['top'], info['R'], info['L']
    nose = L / 2
    # Cockpit windscreen and side windows.
    for s in (1, -1):
        D.put((nose - 3.6, s * 8, top - 0.75), (0, -s, 0), rect_pts(1.7, 0.5), 'glass')
    D.put((nose + 4, 0, top + 1.2), (-1, 0, -0.55), rect_pts(0.6, 1.5), 'glass', axis_a=(0, 0, 1))
    if info['nose_glaze']:
        D.put((nose + 6, 0, R * 0.6), (-1, 0, 0), circle_pts(0.9, 14), 'glass', axis_a=(0, 0, 1))
    if f in ('usa', 'russia'):  # dark stripe across the rotodome top (E-3 / A-50)
        D.put((info['dome_u'], 0, 30), (0, 0, -1), rect_pts(1.9, 6.0), 'band')
    # Wing and fin markings.
    wing_v = {'usa': 14.0, 'europe': 20.0, 'china': 16.0, 'russia': 16.0, 'islamic': 15.0}[f]
    for s in (1, -1):
        cu = {'usa': -6.5, 'europe': -9.5, 'china': -1.5, 'russia': -1.5, 'islamic': -0.5}[f]
        o, d = (cu, s * wing_v, 30), (0, 0, -1)
        if f == 'usa':
            D.put(o, d, circle_pts(1.45), 'mark1')
            D.put(o, d, star_pts(1.25), 'mark2')
        elif f == 'europe':
            D.put(o, d, circle_pts(1.7), 'mark1')
            D.put(o, d, [p for p in circle_pts(1.15)], 'mark2')
            D.put(o, d, circle_pts(0.85), 'mark1')
        elif f == 'china':
            D.put(o, d, star_pts(1.5), 'mark1')
            D.put(o, d, rect_pts(0.7, 4.6), 'mark1')
        elif f == 'russia':
            D.put(o, d, star_pts(1.75), 'mark2')
            D.put(o, d, star_pts(1.4), 'mark1')
        elif f == 'islamic':
            D.put(o, d, circle_pts(1.55), 'mark1')
            D.put(o, d, [(x + 0.1, y) for x, y in circle_pts(0.95)], 'mark2')
            D.put(o, d, [(x + 0.42, y + 0.2) for x, y in circle_pts(0.82)], 'mark1')
        # fin / body side
        fu = info['fin_u']
        fz = top + 4.2 if f != 'islamic' else top + 3.2
        fv = 0 if f != 'islamic' else s * 8.4
        side = (0, -s, 0)
        o = (fu, fv + s * 12, fz)
        if f == 'usa':
            D.put(o, side, rect_pts(1.8, 1.1), 'mark1')
            D.put(o, side, rect_pts(1.8, 0.35), 'mark2')
        elif f == 'europe':
            D.put(o, side, circle_pts(1.3), 'mark2')
            D.put(o, side, circle_pts(0.9), 'mark1')
        elif f == 'china':
            D.put(o, side, star_pts(1.3), 'mark1')
        elif f == 'russia':
            D.put(o, side, star_pts(1.45), 'mark2')
            D.put(o, side, star_pts(1.15), 'mark1')
            D.put((-13, s * 8, 3.4), side, rect_pts(2.0, 1.2), 'mark2')
            D.put((-13, s * 8, 3.2), side, rect_pts(2.0, 0.4), 'flag_b')
            D.put((-13, s * 8, 2.95), side, rect_pts(2.0, 0.35), 'mark1')
        elif f == 'islamic':
            D.put(o, side, circle_pts(1.1), 'mark1')
            D.put(o, side, [(x + 0.2, y + 0.1) for x, y in circle_pts(0.7)], 'mark2')
    # Fuselage cheat line (Europe) / red stripe (China).
    if f in ('europe', 'china'):
        for s in (1, -1):
            for u in range(int(-L / 2 + 8), int(nose - 6), 2):
                D.put((u, s * 8, R * (1.15 if f == 'europe' else 1.3)), (0, -s, 0), rect_pts(2.05, 0.32), 'accent')


SCHEMES = {
    # base, underside, dome, band, accent, mark1, mark2, camo (+ second camo)
    'usa': dict(base=(178, 183, 190), under=(160, 166, 174), dome=(182, 186, 192), band=(36, 38, 42), accent=(150, 156, 164),
                mark1=(52, 60, 82), mark2=(222, 222, 218)),
    'europe': dict(base=(206, 210, 214), under=(56, 76, 126), dome=(222, 224, 228), band=(46, 64, 112), accent=(46, 64, 112),
                   mark1=(40, 60, 124), mark2=(238, 202, 40)),
    'china': dict(base=(186, 196, 208), under=(172, 182, 196), dome=(204, 212, 222), band=(140, 152, 168), accent=(198, 36, 30),
                  mark1=(206, 36, 30), mark2=(236, 200, 60)),
    'russia': dict(base=(194, 196, 198), under=(204, 206, 208), dome=(206, 206, 202), band=(50, 52, 56), accent=(128, 140, 158),
                   mark1=(200, 30, 30), mark2=(236, 236, 232), camo=(130, 142, 160)),
    'islamic': dict(base=(104, 112, 72), under=(218, 214, 198), dome=(222, 218, 204), band=(62, 76, 46), accent=(196, 172, 122),
                    mark1=(28, 112, 62), mark2=(236, 234, 224), camo=(196, 172, 122), camo2=(74, 66, 48)),
}


def materials(f):
    s = SCHEMES[f]
    M = {}
    M['body'] = mat_paint('body', s['base'], s['under'], s.get('camo'), s.get('camo2'), 0, 1.7, 1.3)
    M['wing'] = mat_paint('wing', s['base'], s['under'], s.get('camo'), s.get('camo2'), 1, 2.3, 1.3)
    M['tail'] = M['wing']
    M['fin'] = mat_paint('fin', s['base'], s['under'], s.get('camo'), s.get('camo2'), 2, 1.6, 1.3)
    M['nacelle'] = mat_paint('nacelle', tuple(min(255, c + 8) for c in s['base']) if f != 'islamic' else s['base'], s['under'], None, None, 0, 1.4)
    M['pylon'] = mat_paint('pylon', s['base'], s['under'], None, None, 0, 9.0)
    M['dome'] = mat_plain('dome', s['dome'], 0.15, 0.5)
    M['band'] = mat_plain('band', s['band'], 0.2, 0.55)
    M['accent'] = mat_plain('accent', s['accent'], 0.3, 0.45)
    M['glass'] = mat_plain('glass', (28, 40, 54), 0.6, 0.15)
    M['intake'] = mat_plain('intake', (30, 32, 36), 0.5, 0.6)
    M['exhaust'] = mat_plain('exhaust', (60, 52, 46), 0.7, 0.5)
    M['antenna'] = mat_plain('antenna', (66, 68, 72), 0.4, 0.5)
    M['radome'] = mat_plain('radome', (62, 64, 62), 0.1, 0.6)
    M['mark1'] = mat_plain('mark1', s['mark1'], 0.1, 0.55)
    M['mark2'] = mat_plain('mark2', s['mark2'], 0.1, 0.55)
    M['flag_b'] = mat_plain('flag_b', (40, 70, 160), 0.1, 0.55)
    return M


# ------------------------------------------------------------------ scene

def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = RES
    scene.render.film_transparent = True
    scene.render.filter_size = 0.9
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'Medium High Contrast' if 'Medium High Contrast' in [i.identifier for i in scene.view_settings.bl_rna.properties['look'].enum_items] else 'None'
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.55, 0.6, 0.68, 1)
    bg.inputs[1].default_value = 0.35
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    scene.collection.objects.link(sun)
    sun.data.energy = 4.2
    sun.data.angle = math.radians(2)
    # Game light (ground x right, ground y to the viewer, z up) = (-0.45, 0.35, 0.82); world y = -ground y.
    sun.rotation_euler = Vector((-0.45, -0.35, 0.82)).to_track_quat('Z', 'Y').to_euler()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = 'ORTHO'
    return scene, cam


def build(f):
    B = Builder()
    info = {'usa': usa, 'europe': europe, 'china': china, 'russia': russia, 'islamic': islamic}[f](B)
    B.finish()
    decorate(f, B, info)
    me = bpy.data.meshes.new(f)
    B.bm.to_mesh(me)
    B.bm.free()
    obj = bpy.data.objects.new(f, me)
    bpy.context.scene.collection.objects.link(obj)
    M = materials(f)
    for name in B.mats:
        me.materials.append(M[name])
    bev = obj.modifiers.new('bevel', 'BEVEL')
    bev.width = 0.07
    bev.segments = 2
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(35)
    bev.harden_normals = True
    lo = Vector([min(v.co[i] for v in me.vertices) for i in range(3)])
    hi = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    return obj, lo, hi


def pose_matrix(heading, pitch, roll, centre, flatten=False):
    gx, gy = math.sin(heading), -math.cos(heading) / SIN_E
    n = math.hypot(gx, gy)
    fx, fy = gx / n, gy / n
    H = Matrix(((fx, fy, 0, 0), (-fy, fx, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))  # columns: u → (fx, -fy), v → (fy, fx)
    cp, sp, cr, sr = math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    rp = Matrix(((cp, 0, -sp), (0, 1, 0), (sp, 0, cp)))
    rr = Matrix(((1, 0, 0), (0, cr, -sr), (0, sr, cr)))
    P = (rr @ rp).to_4x4()
    S = Matrix.Diagonal((1, 1, 0.001, 1)) if flatten else Matrix.Identity(4)
    return Matrix.Translation((0, 0, centre.z)) @ S @ H @ P @ Matrix.Translation(-centre)


def main():
    scene, cam = setup_scene()
    d = Vector((0, COS_E, -SIN_E))
    cam.rotation_euler = (-d).to_track_quat('Z', 'Y').to_euler()
    for f in FACTIONS:
        reset_objs = [o for o in scene.objects if o.type == 'MESH']
        for o in reset_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        obj, lo, hi = build(f)
        centre = (lo + hi) / 2
        length = hi.x - lo.x
        cam.data.ortho_scale = length / SPAN_FRAC
        cam.location = Vector((0, 0, centre.z)) - d * 120
        cam.data.clip_end = 400
        os.makedirs(os.path.join(OUT, f), exist_ok=True)
        print(f'{f}: length {length:.1f} m, span {hi.y - lo.y:.1f} m', flush=True)
        for name, (p, r) in POSES.items():
            if QUICK and name not in ('level', 'shadow'):
                continue
            for k in (range(0, DIRS, 2) if QUICK else range(DIRS)):
                obj.matrix_world = pose_matrix(k / DIRS * 2 * math.pi, math.radians(p), math.radians(r), centre, name == 'shadow')
                scene.render.filepath = os.path.join(OUT, f, f'{name}_{k:02d}.png')
                bpy.ops.render.render(write_still=True)


main()
