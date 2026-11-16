"""
Embraer EMB 314 / A-29 Super Tucano (Brazil's light attack aircraft): self-contained Blender model + sprite sheet
(ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/a29_render.py -- <faction> [SAMPLES] [--preview]

    <faction>  usa | russia | china | europe | islamic   (team colour = kit.TEAM, on the fuselage side line)

Writes ui/public/sprites/a29-<faction>.png (then `python tools/to_webp.py`): 192 px cells, 32 RA2 facings (column 0 =
nose up the screen, clockwise) x 9 rows (airkit.ROWS: 0 parked, 1-2 flying, 3 "ramp" = parked, 4-5 banked, 6-7
crashing, 8 shadow), the propeller blades turned between rows 1 and 2.

Real numbers (the-blueprints.com three-view, cm): length 11.38 m, span 11.14 m, height 3.97 m. Low straight tapered
wing with ~6 deg dihedral; tandem two-seat cockpit under a long one-piece-look canopy with a frame between the seats;
PT6A-68C turboprop behind a pointed spinner and a five-blade propeller (~2.4 m); exhaust stubs on both cowling flanks,
chin intake; swept fin with a dorsal fillet, low tailplane, ventral strakes; tricycle gear (main legs in the wings).
Stores as on the photos: a drop tank under each inner pylon, a bomb on each outer pylon; wing .50 gun muzzles.
Paint: FAB two-tone camouflage, dark green over medium grey (art guide: real colours). Faction colour: a band along
each side of the fuselage, under the cockpit to the tail.
Drawn: fuselage 1.35x fuller than true (ART_GUIDE 5), the rest true scale.
Axes: u nose, v left, z up, metres.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import airkit  # noqa: E402
from airkit import Body, TEAM, box, lathe, loft, mat, rod, run, superellipse, surface  # noqa: E402

FACTION = next((a for a in airkit.ARGS if a in TEAM), 'europe')
LENGTH = 11.38
GREY = '#868d92'
GREEN = '#46594a'


def materials():
    M = dict(
        skin=mat('skin', GREY, 0.55, panels=True),
        green=mat('green', GREEN, 0.6, panels=True),
        black=mat('black', '#17191b', 0.55),
        frame=mat('frame', '#2f3438', 0.45, metal=0.4, ao=0.2),
        glass=mat('glass', '#1d2b30', 0.06, glass=True, ao=0),
        intake=mat('intake', '#0f1113', 0.9, ao=0.6),
        spinner=mat('spinner', '#202326', 0.35, metal=0.3),
        blade=mat('blade', '#1f2224', 0.5, metal=0.1),
        tip=mat('tip', '#d8b524', 0.5, ao=0),
        hot=mat('hot', '#5e5247', 0.45, metal=0.75),
        metal=mat('metal', '#8f8d88', 0.36, metal=0.85, ao=0.3),
        tyre=mat('tyre', '#1b1c1e', 0.85),
        strut=mat('strut', '#b5b8bc', 0.35, metal=0.8, ao=0.2),
        bomb=mat('bomb', '#4d5547', 0.55),
        team=mat('team', TEAM[FACTION], 0.5, ao=0),
        navred=mat('navred', '#ff2a2a', 0.4, emit=6.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=6.0, ao=0),
        beacon_off=mat('beacon_off', '#6a1414', 0.3, ao=0),
        beacon_on=mat('beacon_on', '#ff3020', 0.3, emit=40.0, ao=0),
    )
    bsdf = M['glass'].node_tree.nodes['Principled BSDF']
    for k, v in (('Thin Film Thickness', 380.0), ('Thin Film IOR', 1.8)):
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v
    return M


ZC = 1.65
NOSE = 5.05  # front of the cowling (the spinner runs on to 5.69)
STATIONS = [
    (NOSE, -0.08, 0.36, 0.4), (4.6, -0.04, 0.5, 0.53), (3.6, 0.0, 0.56, 0.62), (2.6, 0.04, 0.57, 0.66),
    (0.8, 0.06, 0.55, 0.66), (-0.8, 0.1, 0.5, 0.6), (-2.4, 0.2, 0.4, 0.48), (-3.8, 0.3, 0.28, 0.36),
    (-5.0, 0.4, 0.15, 0.22), (-5.6, 0.45, 0.05, 0.08),
]
# ART_GUIDE 5: a slim fuselage is drawn fuller (1.35x radius) so it reads at sprite size; wings stay true.
FULL = 1.35
STATIONS = [(u, dz, hw * FULL, hh * FULL) for u, dz, hw, hh in STATIONS]
N_SE = 2.3
B = Body(STATIONS, ZC, N_SE)


def top(u):
    dz, hw, hh = B.station(u)
    return ZC + dz + hh


def fuselage(M):
    us = sorted({round(x, 3) for x in np.linspace(NOSE, -5.6, 40)}, reverse=True)
    B.skin('fuselage', M['skin'], us)
    # Dark green over the top half (FAB two-tone): a second skin just proud of the grey, upper part only.
    rings = []
    for u in us:
        dz, hw, hh = B.station(u)
        ring = superellipse(u, 0, ZC + dz, hw + 0.008, hh + 0.008, N_SE, 56)
        rings.append([p if p[2] > ZC + dz - hh * 0.05 else (p[0], p[1], ZC + dz - hh * 0.05) for p in ring])
    loft('fuselage_green', rings, M['green'], smooth=40)
    # Faction band on each flank from under the cockpit to the tail.
    for s in (1, -1):
        B.patch(f'team{s}', 2.8, -4.3, ZC - 0.22, ZC - 0.06, s, M['team'], off=0.02, nu=12, nz=1)
    # Spinner and the five-blade propeller (two sets, half a blade apart: rows 1 / 2 flicker like a turning prop).
    lathe('spinner', [(0.0, 0.001), (0.12, 0.12), (0.32, 0.24), (0.58, 0.33), (0.66, 0.35)], (5.69, 0, ZC - 0.06), 'u', M['spinner'], segs=36, smooth=60)
    for grp, phase in (('propA', 0.0), ('propB', math.pi / 5)):
        propeller(M, grp, (5.08, 0, ZC - 0.06), phase)
    # Chin intake under the cowling, exhaust stubs on both flanks.
    lathe('chin', [(-0.02, 0.17), (0.0, 0.22), (0.2, 0.24), (1.2, 0.2), (1.7, 0.03)], (4.95, 0, ZC - 0.48), 'u', M['green'], segs=24)
    lathe('chin_duct', [(-0.01, 0.17), (0.2, 0.15), (0.21, 0.001)], (4.95, 0, ZC - 0.48), 'u', M['intake'], segs=24)
    for s in (1, -1):
        y = s * (B.half_width(4.15, ZC) - 0.05)
        rod(f'exhaust{s}', (4.3, y, ZC + 0.02), (3.85, y + s * 0.28, ZC + 0.02), 0.13, M['hot'], segs=16)
        rod(f'exhaust_in{s}', (3.84, y + s * 0.28, ZC + 0.02), (3.83, y + s * 0.29, ZC + 0.02), 0.1, M['intake'], segs=16)
    # Antennas, beacons
    box('antenna_top', (-1.6, 0, top(-1.6) + 0.12), (0.3, 0.04, 0.26), M['black'], rot=(0, math.radians(-25), 0))
    box('antenna_bot', (0.4, 0, ZC + 0.06 - 0.66 - 0.1), (0.3, 0.04, 0.22), M['black'], rot=(0, math.radians(25), 0))
    for z, nm in ((top(-2.6) + 0.02, 'top'), (ZC - 0.55, 'bot')):
        lathe(f'beacon_{nm}_off', [(0, 0.001), (0.0, 0.07), (0.06, 0.06), (0.09, 0.001)], (-2.6, 0, z), 'v', M['beacon_off'], 'beacon_off', 12)
        lathe(f'beacon_{nm}_on', [(0, 0.001), (0.0, 0.08), (0.07, 0.07), (0.1, 0.001)], (-2.6, 0, z), 'v', M['beacon_on'], 'beacon_on', 12)


def propeller(M, group, hub, phase):
    R = 1.19
    hub = np.array(hub, float)
    ax = np.array((1.0, 0, 0))
    for k in range(5):
        phi0 = phase + k * 2 * math.pi / 5
        secs = []
        for x in np.linspace(0.25, 1.0, 9):
            chord = (0.13 + 0.09 * math.sin(math.pi * min(1.0, (x - 0.15) / 0.8))) * (1 - 0.5 * x ** 8)
            radial = np.array((0.0, math.cos(phi0), math.sin(phi0)))
            tang = np.array((0.0, -math.sin(phi0), math.cos(phi0)))
            beta = math.radians(50 - 28 * x)
            d = -(math.cos(beta) * tang + math.sin(beta) * ax)
            p = hub + radial * R * x
            secs.append((tuple(p - d * chord * 0.4), tuple(d * chord), tuple(np.cross(d, radial)), 0.09 - 0.05 * x))
        surface(f'blade{group}{k}', secs, M['blade'], group, camber=0.03, smooth=40)
        # yellow tip warning band
        tipc = hub + np.array((0.0, math.cos(phi0), math.sin(phi0))) * R * 0.97
        rod(f'bladetip{group}{k}', tuple(tipc - np.array((0.0, math.cos(phi0), math.sin(phi0))) * 0.06), tuple(tipc + np.array((0.0, math.cos(phi0), math.sin(phi0))) * 0.03), 0.03, M['tip'], group, segs=6)


def cockpit(M):
    """Long tandem canopy: windscreen with a thick frame, a hoop between the seats, sill rails, the crew inside."""
    u0, u1 = 3.25, -0.75
    rings = []
    for u, hw, hh in ((u0, 0.06, 0.04), (2.95, 0.36, 0.3), (2.5, 0.44, 0.47), (1.6, 0.47, 0.56), (0.6, 0.46, 0.55), (-0.2, 0.42, 0.44), (u1, 0.2, 0.12)):
        z = top(u) - 0.06
        ring = superellipse(u, 0, z, hw, hh, 2.0, 40)
        rings.append([(p[0], p[1], max(p[2], z)) for p in ring])
    loft('canopy', rings, M['glass'], smooth=50)
    # frames: windscreen arch, the hoop between the cockpits, the rear arch, sill rails
    for u, hw, hh, w in ((2.88, 0.4, 0.36, 0.08), (1.05, 0.48, 0.57, 0.1), (-0.25, 0.43, 0.45, 0.07)):
        z = top(u) - 0.06
        arch = [p for p in superellipse(u, 0, z, hw + 0.012, hh + 0.012, 2.0, 32) if p[2] >= z]
        arch.sort(key=lambda p: math.atan2(p[2] - z, p[1]))
        for a, b in zip(arch, arch[1:]):
            rod(f'arch{u}{a[1]:.2f}', a, b, w / 2, M['frame'], segs=6)
    for s in (1, -1):
        rod(f'sill{s}', (3.0, s * 0.42, top(3.0) - 0.04), (-0.6, s * 0.36, top(-0.6) - 0.05), 0.035, M['frame'], segs=6)
    # crew: helmets and seat headrests (seen through the glass)
    for u in (2.0, 0.3):
        lathe(f'helmet{u}', [(-0.13, 0.001), (-0.12, 0.08), (0.0, 0.13), (0.12, 0.08), (0.13, 0.001)], (u, 0, top(u) + 0.22), 'u', M['black'], segs=16)
        box(f'seat{u}', (u - 0.35, 0, top(u) + 0.1), (0.12, 0.4, 0.5), M['frame'])


SPAN = 5.57
WROOT = 0.5


def wing_le(v):
    return 1.35 - (abs(v) - WROOT) * 0.07


def wing_chord(v):
    return 2.15 + (1.0 - 2.15) * (abs(v) - WROOT) / (SPAN - WROOT)


def wing_z(v):
    return ZC - 0.42 + (abs(v) - WROOT) * math.tan(math.radians(6))


def wings(M):
    for s in (1, -1):
        stations = (WROOT, 1.6, 3.2, 4.6, SPAN)
        secs = [((wing_le(v), s * v, wing_z(v)), (-wing_chord(v), 0, 0), (0, 0, 1), 0.15 - 0.03 * (v - WROOT) / (SPAN - WROOT)) for v in stations]
        surface(f'wing_grey{s}', secs, M['skin'], camber=0.03)
        # dark green on the wing top: a thin skin over the upper surface
        top_secs = [((wing_le(v) - 0.01, s * v, wing_z(v) + 0.012), (-wing_chord(v) + 0.02, 0, 0), (0, 0, 1), 0.13 - 0.03 * (v - WROOT) / (SPAN - WROOT)) for v in stations]
        surface(f'wing_green{s}', top_secs, M['green'], camber=0.06)
        lathe(f'nav{s}', [(0, 0.001), (0, 0.06), (0.1, 0.001)], (wing_le(SPAN) - 0.3, s * (SPAN + 0.03), wing_z(SPAN)), 'v', M['navred'] if s > 0 else M['navgreen'], segs=10)
        # .50 gun muzzle in the leading edge
        rod(f'gun{s}', (wing_le(1.9) + 0.1, s * 1.9, wing_z(1.9) - 0.05), (wing_le(1.9) - 0.4, s * 1.9, wing_z(1.9) - 0.05), 0.035, M['black'], segs=8)
        # pylons and stores: drop tank inboard, bomb outboard
        for v, store in ((2.1, 'tank'), (3.4, 'bomb')):
            le, c, z = wing_le(v), wing_chord(v), wing_z(v)
            box(f'pylon{s}{v}', (le - c * 0.45, s * v, z - 0.16), (c * 0.55, 0.06, 0.2), M['skin'])
            if store == 'tank':
                lathe(f'tank{s}', [(0, 0.001), (0.3, 0.16), (0.8, 0.22), (1.8, 0.22), (2.4, 0.13), (2.6, 0.001)], (le + 0.7, s * v, z - 0.45), 'u', M['skin'], segs=24)
            else:
                lathe(f'bomb{s}', [(0, 0.001), (0.2, 0.1), (0.5, 0.14), (1.4, 0.14), (1.8, 0.07), (1.85, 0.07)], (le + 0.4, s * v, z - 0.38), 'u', M['bomb'], segs=20)
                for k in range(4):
                    a = k * math.pi / 2 + math.pi / 4
                    box(f'bombfin{s}{k}', (le - 1.35, s * v + 0.12 * math.cos(a), z - 0.38 + 0.12 * math.sin(a)), (0.3, 0.02, 0.16), M['bomb'], rot=(a, 0, 0))
    # wing-root fairing under the fuselage
    loft('wing_fairing', [superellipse(u, 0, ZC - 0.48, w, h, 2.2, 32) for u, w, h in ((1.6, 0.1, 0.06), (1.0, 0.5, 0.18), (-0.6, 0.5, 0.18), (-1.4, 0.1, 0.06))], M['skin'])


def tail(M):
    root_u, rz = -3.55, top(-3.55) - 0.05
    h, sweep, c0, c1 = 1.75, 42, 1.85, 0.85
    tipu = root_u - h * math.tan(math.radians(sweep))
    surface('fin', [((root_u, 0, rz), (-c0, 0, 0), (0, 1, 0), 0.11), ((tipu, 0, rz + h), (-c1, 0, 0), (0, 1, 0), 0.1)], M['green'], camber=0.0)
    loft('dorsal', [superellipse(u, 0, top(u) - 0.02, w, hh, 2.0, 16) for u, w, hh in ((-1.4, 0.03, 0.02), (-2.6, 0.12, 0.12), (-3.6, 0.13, 0.3), (-3.9, 0.03, 0.03))], M['green'])
    for s in (1, -1):
        le0 = -4.2
        surface(f'tailplane{s}', [((le0, s * 0.15, ZC + 0.3), (-1.15, 0, 0), (0, 0, 1), 0.1), ((le0 - 0.55, s * 2.2, ZC + 0.36), (-0.6, 0, 0), (0, 0, 1), 0.09)], M['green'], camber=0.0)
        # ventral strakes under the rear fuselage
        box(f'strake{s}', (-4.3, s * 0.12, ZC - 0.1), (0.8, 0.03, 0.22), M['skin'], rot=(s * math.radians(35), 0, 0))


def gear(M):
    def wheel(name, c, r, w):
        lathe(name, [(-w / 2, 0.001), (-w / 2, r * 0.8), (-w / 2 + 0.03, r), (w / 2 - 0.03, r), (w / 2, r * 0.8), (w / 2, 0.001)], c, 'v', M['tyre'], 'gear', 24)
        lathe(name + 'hub', [(-w / 2 - 0.01, 0.001), (-w / 2 - 0.01, r * 0.5), (w / 2 + 0.01, r * 0.5), (w / 2 + 0.01, 0.001)], c, 'v', M['strut'], 'gear', 16)
    wheel('nosewheel', (3.95, 0, 0.22), 0.22, 0.14)
    rod('nosestrut', (3.95, 0, 0.22), (4.05, 0, ZC - 0.45), 0.05, M['strut'], 'gear')
    for s in (1, -1):
        wheel(f'main{s}', (0.45, s * 1.5, 0.3), 0.3, 0.18)
        rod(f'mainstrut{s}', (0.45, s * 1.5, 0.3), (0.55, s * 1.45, wing_z(1.45)), 0.06, M['strut'], 'gear')
        box(f'gear_door{s}', (0.55, s * 1.62, 0.75), (0.7, 0.02, 0.4), M['skin'], 'gear')


def build():
    M = materials()
    fuselage(M)
    cockpit(M)
    wings(M)
    tail(M)
    gear(M)


# --big: preview cells at 512 px to check the model up close (never for the game sheet).
if '--big' in airkit.ARGS:
    airkit.CELL = 512

_A = lambda g: tuple(g) + ('propA',)
airkit.ROWS = [
    (_A(airkit.ROWS[0][0]),) + airkit.ROWS[0][1:],
    (_A(airkit.ROWS[1][0]),) + airkit.ROWS[1][1:],
    (tuple(airkit.ROWS[2][0]) + ('propB',),) + airkit.ROWS[2][1:],
] + [(_A(r[0]),) + r[1:] for r in airkit.ROWS[3:]]

run(f'a29-{FACTION}', f'a29-{FACTION}', LENGTH, build)
