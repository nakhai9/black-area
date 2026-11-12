"""
Reusable helicopter MAIN ROTOR sheet (ART_GUIDE.md): blades + hub only, rendered on its own so the game can draw it
on top of any helicopter body, standing still on the ground and spinning in flight.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/rotor_render.py -- \
        --name ah64 --blades 4 --radius 7.315 --chord 0.53 --length 17.4 [--sweep 20] [--colour #2a2d2f] [--coax SEP] [SAMPLES] [--preview]

`--coax SEP`: two counter-rotating rotors (Kamov), SEP metres apart, the sheet centred midway between the hubs; the
lower rotor turns +step per phase, the upper -step (offset half a blade spacing), joined by the mast column.

`--length` is the body sheet's LENGTH (same px per metre: CELL * 0.74 / length), so rotor and body line up 1:1.
The hub is at the cell centre. Writes ui/public/sprites/rotor-<name>.png: 192 px cells, PHASES columns x 4 rows
  0 still blades: column p = rotor turned p / PHASES of one blade spacing (2 pi / blades) about the mast,
    blade 0 along the body's nose (+u) at p = 0 (world yaw 0 = the body sheet's rig yaw frame)
  1 spinning: motion-blurred disc with faint blade ghosts, cycled in time by the game
  2 shadow of row 0, 3 shadow of row 1 (flat black; the game sets the opacity)
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from airkit import ARGS, CELL, PARTS, PREVIEW, SPRITES, grab, loft, mat, obj, rod, shadow_material, show, stage, superellipse  # noqa: E402

PHASES = 16


def arg(name, default):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


NAME = arg('--name', 'ah64')
BLADES = int(arg('--blades', 4))
RADIUS = float(arg('--radius', 7.315))
CHORD = float(arg('--chord', 0.53))
LENGTH = float(arg('--length', 17.4))
SWEEP = math.radians(float(arg('--sweep', 20)))
COLOUR = arg('--colour', '#2a2d2f')
COAX = float(arg('--coax', 0))
SCALE = CELL * 0.74 / LENGTH


def blade(i, M, z0=0.0, a0=0.0, mirror=1):
    """One blade along +x then turned to its slot: root cuff, constant chord, swept tip; thin airfoil-ish slab.
    `mirror` -1: leading edge on the other side (the counter-rotating upper rotor of a coax)."""
    a = a0 + i * 2 * math.pi / BLADES
    c, s = math.cos(a), math.sin(a)
    rot = lambda x, y, z: (x * c - mirror * y * s, x * s + mirror * y * c, z + z0)
    r0, rt = 0.75, RADIUS - 0.55
    th = CHORD * 0.11
    # Planform outline (x along the span, y across the chord, leading edge at +y), tip swept back.
    lead = [(r0, CHORD * 0.45), (rt, CHORD * 0.45), (RADIUS, CHORD * 0.45 - math.tan(SWEEP) * 0.55)]
    trail = [(RADIUS, -CHORD * 0.25 - math.tan(SWEEP) * 0.55), (rt, -CHORD * 0.55), (r0, -CHORD * 0.55)]
    out = lead + trail
    n = len(out)
    droop = lambda x: -0.012 * max(0.0, x - r0)  # a slight static droop toward the tip
    verts = [rot(x, y, droop(x) + th / 2 * (1 if y > -CHORD * 0.2 else 0.4)) for x, y in out] + [rot(x, y, droop(x) - th / 2) for x, y in out]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    obj(f'blade{i}', verts, faces, M['blade'], smooth=0)
    # Root cuff and pitch horn into the hub.
    rod(f'cuff{i}', rot(0.25, 0, 0.02), rot(r0 + 0.25, 0, 0.0), 0.09, M['hub'], segs=10)
    rod(f'horn{i}', rot(0.35, -0.12, -0.02), rot(0.35, -0.12, -0.3), 0.025, M['metal'], segs=6)
    # Tip cap (lighter abrasion strip on the leading edge).
    lx, ly = RADIUS - 0.3, CHORD * 0.45 - math.tan(SWEEP) * 0.25
    rod(f'tip{i}', rot(rt - 0.6, CHORD * 0.45, droop(rt - 0.6)), rot(lx, ly, droop(lx)), 0.02, M['strip'], segs=6)


def hub(M, z0=0.0, tag=''):
    loft('hub' + tag, [superellipse(0, 0, z0 + z, r, r, 2.0, 32, axis='z') for z, r in
                       ((-0.28, 0.12), (-0.2, 0.3), (-0.08, 0.36), (0.06, 0.36), (0.14, 0.3), (0.2, 0.12))], M['hub'], smooth=50)
    loft('swashplate' + tag, [superellipse(0, 0, z0 + z, r, r, 2.0, 32, axis='z') for z, r in
                              ((-0.5, 0.36), (-0.42, 0.4), (-0.36, 0.36))], M['metal'], smooth=50)


def main():
    out = os.path.join(SPRITES, f'rotor-{NAME}-preview.png' if PREVIEW else f'rotor-{NAME}.png')
    sc = stage(SCALE)
    M = dict(blade=mat('blade', COLOUR, 0.55), hub=mat('hub', '#2b2e30', 0.5, metal=0.4),
             metal=mat('metal', '#7c7f81', 0.38, metal=0.85, ao=0.2), strip=mat('strip', '#8a8d8f', 0.35, metal=0.8, ao=0))
    rotor = bpy.data.objects.new('rotor', None)
    sc.collection.objects.link(rotor)
    upper = None
    if COAX:
        hub(M, -COAX / 2, 'lo')
        for i in range(BLADES):
            blade(i, M, -COAX / 2)
        rod('column', (0, 0, -COAX / 2 + 0.15), (0, 0, COAX / 2 - 0.45), 0.13, M['metal'])
        lower_parts = len(PARTS)
        hub(M, COAX / 2, 'up')
        loft('upper_cap', [superellipse(0, 0, COAX / 2 + z, r, r, 2.0, 24, axis='z') for z, r in ((0.2, 0.14), (0.3, 0.12), (0.36, 0.04))], M['hub'], smooth=50)
        for i in range(BLADES):
            blade(i + BLADES, M, COAX / 2, math.pi / BLADES, mirror=-1)
        upper = bpy.data.objects.new('upper', None)
        sc.collection.objects.link(upper)
        for n, (ob, _) in enumerate(PARTS):
            ob.parent = rotor if n < lower_parts else upper
    else:
        hub(M)
        for i in range(BLADES):
            blade(i, M)
        for ob, _ in PARTS:
            ob.parent = rotor

    def turn(a, flat=None):
        f = flat if flat is not None else Matrix.Identity(4)
        rotor.matrix_basis = Matrix.Rotation(a, 4, 'Z') @ f
        if upper is not None:
            upper.matrix_basis = Matrix.Rotation(-a, 4, 'Z') @ f
    show(('always',))
    step = 2 * math.pi / BLADES / PHASES
    tmp = out + '.tmp.png'

    def sweep():
        cells = []
        for p in range(PHASES):
            turn(p * step)
            cells.append(grab(sc, tmp)[::-1])
            print(f'[rotor-{NAME}] phase {p + 1}/{PHASES}', flush=True)
        return cells

    def spin(cells):
        """Blur: the whole-turn average (the disc, alpha boosted) plus a short trailing smear of the blades."""
        pm = [np.dstack([c[..., :3] * c[..., 3:4], c[..., 3:4]]) for c in cells]
        disc = np.mean(pm, axis=0)
        frames = []
        for p in range(PHASES):
            smear = np.mean([pm[(p - j) % PHASES] for j in range(4)], axis=0)
            f = disc * 1.5 * 0.65 + smear * 0.35
            a = np.clip(f[..., 3:4], 0, 1)
            frames.append(np.dstack([f[..., :3] / np.maximum(f[..., 3:4], 1e-6), a]))
        return frames

    still = sweep()
    rows = [still, spin(still)]
    if not PREVIEW:
        sh = shadow_material()
        for ob, _ in PARTS:
            ob.data.materials.clear()
            ob.data.materials.append(sh)
        sc.cycles.samples = 4
        sc.cycles.use_denoising = False
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
        cells = []
        for p in range(PHASES):
            turn(p * step, Matrix.Diagonal((1, 1, 0.001, 1)))
            c = grab(sc, tmp)[::-1]
            c[..., :3] = 0
            cells.append(c)
        rows += [cells, spin(cells)]
    os.remove(tmp)
    sheet = np.zeros((CELL * len(rows), CELL * PHASES, 4), np.float32)
    for r, cells in enumerate(rows):
        for p, c in enumerate(cells):
            sheet[r * CELL:(r + 1) * CELL, p * CELL:(p + 1) * CELL] = c
    H, W = sheet.shape[:2]
    img = bpy.data.images.new('sheet', W, H, alpha=True)
    img.pixels.foreach_set(np.clip(sheet[::-1], 0, 1).astype(np.float32).ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    print(f'[rotor-{NAME}] wrote {out} ({W}x{H}); px/m {SCALE:.4f}', flush=True)


main()
