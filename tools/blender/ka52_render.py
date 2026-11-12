"""
Ka-52 "Alligator" (Russia attack helicopter): self-contained Blender model + body sprite sheet (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/ka52_render.py -- [SAMPLES] [--preview]

The coaxial main rotors are NOT in this sheet: they are the separate rotor sheet (tools/blender/rotor_render.py
--name ka52 --coax 1.2 -> rotor-ka52.png), centred midway between the two hubs (HUB_Z), drawn on top of the body.
The mast sits exactly at u = 0, so the rotor column is straight above the cell centre for every facing.

Writes ui/public/sprites/heli-ka52-russia.png (then `python tools/to_webp.py`): 192 px cells, 32 RA2 facings x 7 rows
  0 parked    1-2 flying (no tail rotor: same picture)    3 crashing (pitched, dark)    4 wreck (burnt)
  5 cap (empty: nothing above the rotors)                  6 shadow (flat black; the game sets its opacity)

Ka-52 shape (from the 3-views / scale-model refs, NOT an Apache): blunt rounded radome nose (pale blue-grey) with a
black anti-glare band behind it; wide SIDE-BY-SIDE cockpit with big flat side panes and a centre post; chin sensor
ball; tall gearbox hump carrying the coaxial mast; TV3-117 engines high on the shoulders with round dark dust-protector
domes in front and out-turned exhausts; straight stub wings (slight anhedral) with 2 pylons each (B-8V20 rocket pod
inboard, 6-tube Vikhr launcher outboard) and countermeasure pods on the tips; 2A42 30 mm cannon on the RIGHT side of
the fuselage; tricycle gear; long tapered boom; NO tail rotor; tall swept fin; tailplane with end-plate fins.

Real numbers (approx., [Unverified] public figures): fuselage length 13.53 m, rotor diameter 14.5 m (2 x 3 blades,
counter-rotating), height 4.93 m, stub-wing span ~7.3 m with tip pods. Drawn: LENGTH 13.4 m radome tip (u 5.95) to
fin trailing edge (u -7.45); lower hub z 3.55, upper hub z 4.75 (separation 1.2 m), HUB_Z = 4.15 (rotor sheet centre).
Axes: u nose, v left, z up, metres, ground z = 0. Side-on LENGTH spans 0.74 of a cell (same rule as airkit.run).
Paint: Russian olive green with a dark-green / khaki / brown camouflage (noise patches, not saturated), panel lines,
light grime; TEAM red band round the tail boom.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from airkit import (CELL, DIRS, PARTS, PREVIEW, SIN_E, SPRITES, TEAM, box, grab, lathe, loft, mat, plate, pose, rod,  # noqa: E402
                    shadow_material, show, srgb, stage, superellipse, surface)

LENGTH = 13.4
SCALE = CELL * 0.74 / LENGTH   # sheet px per metre (rotor_render.py must use the same: --length 13.4)
SEP = 1.2                       # coaxial hub separation
HUB_Z = 4.15                    # midway between the hubs (rotor sheet centre)

OLIVE = '#5f6a3c'
CAMO = ('#39442a', '#5f6a3c', '#5f6a3c', '#7b7d52', '#5a4d34')  # dark green, olive (x2 = dominant), khaki, brown


def camo_mat(name, base, scale=0.3):
    """airkit.mat (panel lines, grime, AO) with the flat base colour swapped for noise camouflage patches."""
    m = mat(name, base, 0.62, panels=True)
    nt = m.node_tree
    rgb = next(n for n in nt.nodes if n.type == 'RGB')
    coord = next(n for n in nt.nodes if n.type == 'TEX_COORD')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 1.5
    noise.inputs['Distortion'].default_value = 0.6
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    el = ramp.color_ramp.elements
    stops = (0.0, 0.43, 0.5, 0.57, 0.63)
    el[0].position, el[0].color = stops[0], srgb(CAMO[0])
    el[1].position, el[1].color = stops[1], srgb(CAMO[1])
    for p, c in zip(stops[2:], CAMO[2:]):
        e = el.new(p)
        e.color = srgb(c)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    for link in list(nt.links):
        if link.from_node == rgb:
            nt.links.new(ramp.outputs['Color'], link.to_socket)
    return m


def materials():
    return dict(
        skin=camo_mat('skin', OLIVE),
        plain=mat('plain', OLIVE, 0.65),
        dark=mat('dark', '#2b2f27', 0.7),
        black=mat('black', '#1a1c1a', 0.6),
        radome=mat('radome', '#8c9ca2', 0.5, ao=0.2),
        frame=mat('frame', '#22261f', 0.55, ao=0.1),
        glass=mat('glass', '#3c5466', 0.06, glass=True, ao=0),
        sensor=mat('sensor', '#1c2c38', 0.05, glass=True, ao=0),
        intake=mat('intake', '#0d0e0d', 0.9, ao=0.6),
        dome=mat('dome', '#1d201d', 0.45, ao=0.2),
        hot=mat('hot', '#4a4540', 0.45, metal=0.7),
        metal=mat('metal', '#7c7f81', 0.38, metal=0.85, ao=0.3),
        tyre=mat('tyre', '#18191a', 0.85),
        strut=mat('strut', '#9da1a4', 0.35, metal=0.8, ao=0.2),
        pod=mat('pod', '#4a5233', 0.6),
        tube=mat('tube', '#3f4630', 0.6),
        team=mat('team', TEAM['russia'], 0.5, ao=0),
        navred=mat('navred', '#ff2a2a', 0.4, emit=5.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=5.0, ao=0),
    )


# ------------------------------------------------------------------------------------------------ fuselage

# (u, axis height zc, half width, half height, superellipse n): round radome joint -> boxy cockpit -> tapered boom.
STATIONS = [
    (4.92, 1.52, 0.60, 0.60, 2.0), (4.60, 1.55, 0.72, 0.72, 2.4), (4.00, 1.62, 0.82, 0.86, 2.8),
    (2.80, 1.68, 0.86, 0.92, 3.0), (1.80, 1.72, 0.86, 0.95, 3.0), (0.50, 1.76, 0.80, 0.97, 3.0),
    (-1.00, 1.80, 0.70, 0.90, 3.0), (-2.20, 1.88, 0.52, 0.70, 2.8), (-3.40, 1.97, 0.38, 0.50, 2.6),
    (-5.00, 2.06, 0.30, 0.38, 2.5), (-6.40, 2.13, 0.25, 0.32, 2.5), (-7.00, 2.16, 0.18, 0.24, 2.5),
    (-7.25, 2.16, 0.05, 0.06, 2.5),
]


def station(u):
    s = STATIONS
    if u >= s[0][0]:
        return s[0][1:]
    for (u0, *a), (u1, *b) in zip(s, s[1:]):
        if u1 <= u <= u0:
            f = (u0 - u) / (u0 - u1)
            return tuple(x + (y - x) * f for x, y in zip(a, b))
    return s[-1][1:]


def ring_at(u, grow=0.0, segs=48):
    zc, hw, hh, n = station(u)
    return superellipse(u, 0, zc, hw + grow, hh + grow, n, segs)


def fuselage(M):
    us = sorted({round(x, 3) for x in list(np.linspace(4.92, 1.8, 12)) + list(np.linspace(1.8, -7.25, 26))}, reverse=True)
    loft('fuselage', [ring_at(u) for u in us], M['skin'])
    # Blunt radome (Arbalet radar), pale blue-grey; black anti-glare band right behind it.
    lathe('radome', [(0, 0.0), (0.05, 0.2), (0.18, 0.4), (0.42, 0.54), (0.75, 0.6), (1.06, 0.605)], (5.95, 0, 1.52), 'u', M['radome'], segs=40)
    loft('antiglare', [ring_at(u, 0.012) for u in np.linspace(4.9, 4.35, 5)], M['black'], cap=False)
    # Belly keel, a strake down each side and access-panel seams.
    loft('keel', [superellipse(u, 0, 0.84, w, 0.1, 2.5, 20) for u, w in ((3.6, 0.05), (3.2, 0.45), (-1.4, 0.45), (-2.0, 0.05))], M['skin'])
    for s in (1, -1):
        for u in (3.3, 2.2, 0.9, -0.4, -1.6):
            hw = station(u)[1]
            box(f'seam{s}{u}', (u, s * (hw * 0.96), 1.55), (0.03, 0.02, 0.9), M['dark'])
        box(f'step{s}', (3.0, s * 0.87, 1.05), (0.4, 0.06, 0.05), M['strut'])
    # Gearbox hump behind the cockpit carrying the coaxial mast.
    loft('hump', [superellipse(u, 0, zc, w, h, 2.8, 40) for u, zc, w, h in
                  ((2.0, 2.62, 0.25, 0.1), (1.55, 2.8, 0.6, 0.36), (0.4, 2.95, 0.66, 0.44), (-1.6, 2.85, 0.6, 0.36), (-2.7, 2.5, 0.22, 0.1))], M['skin'])
    loft('mast_fairing', [superellipse(0, 0, z, r, r, 2.0, 32, axis='z') for z, r in
                          ((3.2, 0.5), (3.32, 0.44), (3.42, 0.3), (3.48, 0.18))], M['plain'])
    rod('mast', (0, 0, 3.4), (0, 0, HUB_Z - SEP / 2 - 0.08), 0.14, M['metal'])
    # Antennas / roof fits.
    rod('whip', (-1.4, 0, 3.15), (-2.0, 0, 3.55), 0.015, M['dark'])
    box('roof_ant', (1.0, 0.3, 3.37), (0.35, 0.06, 0.06), M['dark'])
    # Team band round the tail boom.
    loft('team_band', [ring_at(u, 0.012) for u in (-4.2, -4.6)], M['team'], cap=False)


def canopy_ring(u, zt, ht):
    zc, hw, hh, _ = station(u)
    zs, hb = zc + hh * 0.5, hw * 0.955
    zm, hm = zs + (zt - zs) * 0.5, hb * 0.96
    return [(u, -hb, zs), (u, -hm, zm), (u, -ht, zt), (u, ht, zt), (u, hm, zm), (u, hb, zs)]


# (u, roof z or None = on the fuselage skin, roof half width): wide side-by-side cockpit, flat-ish panes.
CANOPY = [(4.58, None, 0.42), (4.35, 2.5, 0.5), (4.0, 2.86, 0.56), (3.5, 3.0, 0.58), (2.4, 3.05, 0.58),
          (1.95, 2.96, 0.54), (1.7, None, 0.44)]


def canopy(M):
    def zskin(u):
        zc, _, hh, _ = station(u)
        return zc + hh - 0.02

    prof = [(u, zt if zt is not None else zskin(u), ht) for u, zt, ht in CANOPY]
    loft('canopy', [canopy_ring(*p) for p in prof], M['glass'], smooth=0)
    zt_at = lambda u: np.interp(-u, [-p[0] for p in prof], [p[1] for p in prof])
    ht_at = lambda u: np.interp(-u, [-p[0] for p in prof], [p[2] for p in prof])
    # Cross frames (windscreen arch, door split, rear arch) and the long rails.
    for u in (4.35, 4.0, 3.0, 1.95):
        r = [(x, y * 1.02, z + 0.01) for x, y, z in canopy_ring(u, zt_at(u), ht_at(u))]
        for a, b in zip(r, r[1:]):
            rod(f'frame{u}{a[1]:.2f}', a, b, 0.045 if u in (4.0, 3.0) else 0.032, M['frame'], segs=6)
    for idx in (0, 1, 2, 3, 4, 5):
        pts = [canopy_ring(u, zt_at(u), ht_at(u))[idx] for u in np.linspace(4.5, 1.8, 12)]
        pts = [(x, y * 1.02, z + 0.01) for x, y, z in pts]
        for a, b in zip(pts, pts[1:]):
            rod(f'rail{idx}{a[0]:.2f}', a, b, 0.035, M['frame'], segs=6)
    # Windscreen centre post and the roof centre frame (two crew side by side).
    rod('post', (4.6, 0, zskin(4.6) + 0.02), (4.0, 0, 2.87), 0.04, M['frame'], segs=6)
    rod('roof_spine', (4.0, 0, 2.87), (1.95, 0, 2.97), 0.04, M['frame'], segs=6)
    # Seats / headrests seen through the glass.
    for s in (1, -1):
        box(f'seat{s}', (2.55, s * 0.38, 2.55), (0.25, 0.4, 0.55), M['dark'])
        box(f'panel{s}', (3.95, s * 0.38, 2.35), (0.3, 0.45, 0.2), M['dark'])


def nose(M):
    """GOES-451 sensor ball under the chin, pitot / sensor fits."""
    rod('ball_mount', (4.55, 0, 0.95), (4.55, 0, 0.7), 0.16, M['dark'])
    lathe('ball', [(0, 0.0), (0.05, 0.17), (0.17, 0.28), (0.3, 0.3), (0.43, 0.28), (0.55, 0.17), (0.6, 0.0)], (4.85, 0, 0.62), 'u', M['dark'], segs=32)
    box('ball_window', (4.82, 0, 0.62), (0.03, 0.2, 0.16), M['sensor'])
    rod('pitot', (4.4, 0.55, 2.2), (5.1, 0.55, 2.25), 0.02, M['metal'], segs=6)
    rod('pitot_r', (4.4, -0.55, 2.2), (5.1, -0.55, 2.25), 0.02, M['metal'], segs=6)


def engines(M):
    for s in (1, -1):
        v = s * 0.98
        loft(f'nacelle{s}', [superellipse(u, v, 2.55, w, h, 2.4, 36) for u, w, h in
                             ((1.15, 0.3, 0.3), (1.0, 0.42, 0.42), (0.6, 0.44, 0.44), (-1.6, 0.44, 0.42), (-2.0, 0.38, 0.36), (-2.15, 0.3, 0.28))], M['skin'])
        # Round dust-protector dome in front (the dark "balls" of the photos).
        lathe(f'dust{s}', [(0, 0.0), (0.06, 0.22), (0.18, 0.36), (0.32, 0.42), (0.36, 0.42)], (1.48, v, 2.55), 'u', M['dome'], segs=32)
        lathe(f'dust_ring{s}', [(0, 0.44), (0.08, 0.44), (0.08, 0.38), (0.0, 0.38)], (1.18, v, 2.55), 'u', M['frame'], segs=32)
        for u in (0.2, -0.9):
            box(f'nacelle_seam{s}{u}', (u, v + s * 0.43, 2.55), (0.03, 0.03, 0.6), M['dark'])
        box(f'grille{s}', (-0.4, v + s * 0.42, 2.72), (0.7, 0.03, 0.2), M['intake'])
        # Exhaust turned out and slightly down, dark mouth outboard.
        rod(f'exhaust{s}', (-1.95, v + s * 0.05, 2.52), (-2.6, v + s * 0.45, 2.42), 0.27, M['hot'], segs=20)
        rod(f'exhaust_mouth{s}', (-2.6, v + s * 0.45, 2.42), (-2.615, v + s * 0.46, 2.418), 0.22, M['intake'], segs=20)


def wings(M):
    an = math.radians(4)
    zr, root, tip = 1.95, 0.72, 3.25
    zat = lambda v: zr - math.tan(an) * (abs(v) - root)
    for s in (1, -1):
        surface(f'wing{s}', [((0.55, s * root, zr), (-1.35, 0, 0), (0, 0, 1), 0.14),
                             ((0.35, s * tip, zat(tip)), (-1.1, 0, 0), (0, 0, 1), 0.11)], M['skin'], camber=0.0)
        # Wing-tip countermeasure (UV-26 / President-S) pod.
        zt = zat(tip)
        lathe(f'tippod{s}', [(0, 0.0), (0.12, 0.12), (0.35, 0.17), (1.35, 0.17), (1.55, 0.1), (1.62, 0.0)], (0.75, s * (tip + 0.12), zt), 'u', M['plain'], segs=24)
        box(f'tip_window{s}', (0.66, s * (tip + 0.12), zt + 0.05), (0.1, 0.16, 0.1), M['sensor'])
        box(f'navlight{s}', (-0.75, s * (tip + 0.12), zt + 0.18), (0.08, 0.05, 0.05), M['navred'] if s < 0 else M['navgreen'])
        # Inner pylon: B-8V20 rocket pod (20 x 80 mm).
        vi = s * 1.55
        zi = zat(1.55)
        box(f'pylon_in{s}', (-0.15, vi, zi - 0.18), (0.8, 0.1, 0.3), M['dark'])
        lathe(f'b8{s}', [(0, 0.0), (0.0, 0.25), (0.08, 0.28), (2.0, 0.28), (2.15, 0.22), (2.2, 0.0)], (1.0, vi, zi - 0.6), 'u', M['pod'], segs=32)
        plate(f'b8_face{s}', [(1.01, vi + 0.22 * math.cos(t), zi - 0.6 + 0.22 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 20, endpoint=False)],
              (1, 0, 0), M['intake'], off=0.0)
        for dv, dz in ((0, 0), (0.12, 0.07), (-0.12, 0.07), (0.12, -0.07), (-0.12, -0.07), (0, 0.14), (0, -0.14)):
            lathe(f'b8_tube{s}{dv}{dz}', [(0, 0.045), (0.03, 0.045), (0.03, 0.035), (0.0, 0.035)], (1.03, vi + dv, zi - 0.6 + dz), 'u', M['metal'], segs=10)
        # Outer pylon: 6-tube Vikhr ATGM launcher (two rows of three).
        vo = s * 2.55
        zo = zat(2.55)
        box(f'pylon_out{s}', (-0.15, vo, zo - 0.16), (0.8, 0.1, 0.26), M['dark'])
        box(f'rail{s}', (-0.1, vo, zo - 0.32), (2.0, 0.42, 0.08), M['dark'])
        for dv in (-0.14, 0.0, 0.14):
            for dz in (-0.46, -0.62):
                lathe(f'vikhr{s}{dv}{dz}', [(0, 0.0), (0.0, 0.07), (0.02, 0.075), (2.1, 0.075), (2.1, 0.0)], (0.95, vo + dv, zo + dz), 'u', M['tube'], segs=14)
                plate(f'vikhr_cap{s}{dv}{dz}', [(0.96, vo + dv + 0.055 * math.cos(t), zo + dz + 0.055 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 12, endpoint=False)],
                      (1, 0, 0), M['intake'], off=0.0)


def cannon(M):
    """2A42 30 mm on the RIGHT side (v < 0) under the wing root, firing forward past the cockpit."""
    v = -0.92
    box('gun_mount', (0.1, v + 0.05, 1.25), (1.6, 0.28, 0.32), M['skin'])
    box('gun_box', (-0.2, v - 0.05, 1.08), (1.0, 0.3, 0.3), M['dark'])
    rod('gun_body', (0.9, v, 1.18), (-0.5, v, 1.18), 0.11, M['dark'], segs=14)
    rod('gun_barrel', (0.9, v, 1.18), (3.3, v, 1.18), 0.045, M['metal'], segs=12)
    rod('gun_muzzle', (3.15, v, 1.18), (3.42, v, 1.18), 0.07, M['dark'], segs=12)
    rod('gun_jacket', (0.9, v, 1.18), (1.6, v, 1.18), 0.075, M['dark'], segs=12)


def gear(M):
    def wheel(name, c, r, w):
        lathe(name, [(0, 0.0), (0.0, r * 0.8), (w * 0.1, r), (w * 0.9, r), (w, r * 0.8), (w, 0.0)], (c[0], c[1] - w / 2, c[2]), 'v', M['tyre'], segs=28)
        lathe(name + '_hub', [(0, 0.0), (0.0, r * 0.45), (w + 0.01, r * 0.45), (w + 0.01, 0.0)], (c[0], c[1] - w / 2 - 0.005, c[2]), 'v', M['strut'], segs=16)

    # Nose gear: single wheel under the cockpit, on a leg with a drag strut.
    wheel('nosewheel', (3.75, 0, 0.27), 0.27, 0.16)
    rod('nose_leg', (3.65, 0, 0.9), (3.75, 0, 0.27), 0.05, M['strut'])
    rod('nose_drag', (3.25, 0, 0.88), (3.72, 0, 0.35), 0.035, M['strut'])
    # Main gear: one wheel each side behind the wings.
    for s in (1, -1):
        c = (-0.9, s * 1.05, 0.33)
        wheel(f'main{s}', c, 0.33, 0.2)
        rod(f'main_leg{s}', (-0.7, s * 0.62, 1.0), (c[0], c[1] - s * 0.08, c[2]), 0.06, M['strut'])
        rod(f'main_drag{s}', (-1.6, s * 0.6, 0.95), (c[0], c[1] - s * 0.08, c[2] + 0.06), 0.045, M['strut'])
        rod(f'main_shock{s}', (-0.4, s * 0.62, 0.95), (c[0], c[1] - s * 0.08, c[2] + 0.1), 0.04, M['metal'])


def tail(M):
    # Tall swept fin with a dark top cap; small ventral fin with a bumper.
    surface('fin', [((-5.6, 0, 2.3), (-1.75, 0, 0), (0, 1, 0), 0.13), ((-6.85, 0, 4.25), (-0.65, 0, 0), (0, 1, 0), 0.1)], M['skin'], camber=0.0)
    box('fin_cap', (-7.17, 0, 4.25), (0.66, 0.08, 0.06), M['dark'])
    box('fin_light', (-7.45, 0, 3.9), (0.05, 0.06, 0.08), M['navred'])
    surface('ventral', [((-6.0, 0, 1.95), (-0.9, 0, 0), (0, 1, 0), 0.1), ((-6.45, 0, 1.25), (-0.55, 0, 0), (0, 1, 0), 0.1)], M['skin'], camber=0.0)
    rod('bumper', (-6.5, 0, 1.3), (-6.8, 0, 1.2), 0.04, M['strut'])
    # Tailplane with angled end-plate fins.
    surface('tailplane', [((-5.55, -1.75, 2.25), (-0.85, 0, 0), (0, 0, 1), 0.11), ((-5.4, 0, 2.25), (-1.05, 0, 0), (0, 0, 1), 0.12),
                          ((-5.55, 1.75, 2.25), (-0.85, 0, 0), (0, 0, 1), 0.11)], M['skin'], camber=0.0)
    for s in (1, -1):
        surface(f'endplate{s}', [((-5.45, s * 1.78, 1.85), (-0.9, 0, 0), (0, 1, 0), 0.1), ((-5.7, s * 1.82, 2.85), (-0.7, 0, 0), (0, 1, 0), 0.1)],
                M['skin'], camber=0.0)


def build():
    M = materials()
    fuselage(M)
    canopy(M)
    nose(M)
    engines(M)
    wings(M)
    cannon(M)
    gear(M)
    tail(M)


# Rendered rows: (visible groups, pitch, roll, tint) -> sheet rows
ROWS = [
    ((('always',), 0, 0, 1.0), (0, 1, 2)),     # parked = flying (no tail rotor)
    ((('always',), -15, 20, 0.6), (3,)),       # crashing
    ((('always',), 0, 6, 0.35), (4,)),         # wreck
]
SHEET_ROWS = 7


def main():
    out = os.path.join(SPRITES, 'heli-ka52-preview.png' if PREVIEW else 'heli-ka52-russia.png')
    sc = stage(SCALE)
    build()
    plane = bpy.data.objects.new('plane', None)
    sc.collection.objects.link(plane)
    rig = bpy.data.objects.new('rig', None)
    sc.collection.objects.link(rig)
    plane.parent = rig
    zs = [(ob.matrix_world @ v.co).z for ob, g in PARTS for v in ob.data.vertices]
    zmid = (max(zs) + min(zs)) / 2
    for ob, _ in PARTS:
        ob.parent = plane
        ob.location.z -= zmid
    tmp = os.path.join(os.environ.get('TEMP', os.path.dirname(out)), 'ka52-render.tmp.png')
    rows = ROWS[:1] if PREVIEW else ROWS
    dirs = list(range(0, DIRS, 4)) if PREVIEW else list(range(DIRS))
    nrows = 1 if PREVIEW else SHEET_ROWS
    sheet = np.zeros((CELL * nrows, CELL * len(dirs), 4), np.float32)
    heading = lambda k: (0, 0, math.atan2(math.cos(k / DIRS * 2 * math.pi) / SIN_E, math.sin(k / DIRS * 2 * math.pi)))
    for (groups, pitch, roll, tint), targets in rows:
        show(groups)
        pose(plane, pitch, roll)
        for ci, k in enumerate(dirs):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] *= tint
            for r in targets[:nrows]:
                sheet[r * CELL:(r + 1) * CELL, ci * CELL:(ci + 1) * CELL] = cell
            print(f'[ka52] rows {targets} facing {k + 1}/{DIRS}', flush=True)
    if not PREVIEW:
        show(('always',))
        sh = shadow_material()
        for ob, _ in PARTS:
            ob.data.materials.clear()
            ob.data.materials.append(sh)
        plane.matrix_basis = Matrix.Diagonal((1, 1, 0.001, 1))
        sc.cycles.samples = 4
        sc.cycles.use_denoising = False
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
        r = SHEET_ROWS - 1
        for k in range(DIRS):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] = 0
            sheet[r * CELL:(r + 1) * CELL, k * CELL:(k + 1) * CELL] = cell
            print(f'[ka52] shadow {k + 1}/{DIRS}', flush=True)
    os.remove(tmp)
    H, W = sheet.shape[:2]
    img = bpy.data.images.new('sheet', W, H, alpha=True)
    img.pixels.foreach_set(np.clip(sheet[::-1], 0, 1).astype(np.float32).ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    k = SCALE * math.cos(math.radians(30))
    print(f'[ka52] wrote {out} ({W}x{H}); px/m {SCALE:.4f}; zmid {zmid:.3f} m; '
          f'groundDrop {zmid * k:.2f} px; hubLift {(HUB_Z - zmid) * k:.2f} px', flush=True)


main()
