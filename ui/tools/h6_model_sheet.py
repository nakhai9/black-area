#!/usr/bin/env python3
"""
Builds China's Xian H-6K bomber as a 3D model in code (after its painting & marking guide) and renders it like the
Tu-160 (tools/tu160_model_sheet.py: painted mesh, Blender Cycles with the tank sheets' lighting, 192 px cells) into
public/sprites/h6-china.png — 16 headings by 9 rows, the layout AircraftSheets.ts reads. Fixed wings: one sheet only.
Features: 34.8 m fuselage (drawn full, AWACS-like) with the black radome nose and the cockpit windows behind it;
mid-set 35° swept wing with slight anhedral, wing fences and the main-gear pods trailing past the trailing edge;
two big turbofans buried in the wing roots, intakes on the fuselage sides with the red chevrons; swept fin, low
tailplane, tail cone; dorsal blister; six YJ-63 style missiles under the wings. Light grey, PLAAF red star-and-bar
on the wings and the rear fuselage, red bort number on the nose.
Usage: python -I tools/h6_model_sheet.py [--preview out.png]   (run from ui/, env TU160_SAMPLES)
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tu160_model_sheet as base  # noqa: E402
from awacs_model_sheet import Mesh, box, ellipsoid, glazing_paint, loft, pane, radome_cap, sections_at, star, surface, wiper  # noqa: E402

L = 34.8
NOSE = L / 2
CZ = 2.7
WING_Z = 2.35
OUTS = {'fixed': dict(out='h6-china')}


def fuselage(m):
    profile = [
        # Big blunt bullet radome (the H-6K's solid nose), densely ringed so it stays smooth.
        *[(0.12 * x, 0.06 + 1.74 * (1 - (1 - x) ** 2) ** 0.5, 0.06 + 1.69 * (1 - (1 - x) ** 2) ** 0.5, -0.30 + 0.30 * x ** 1.3)
          for x in (k / 16 for k in range(16))],
        (0.120, 1.80, 1.75, 0.00),
        (0.200, 2.05, 2.00, 0.00),
        (0.700, 2.05, 2.00, 0.00),
        (0.800, 1.75, 1.75, 0.10),
        (0.900, 1.20, 1.25, 0.28),
        (0.970, 0.65, 0.70, 0.40),
        (1.000, 0.25, 0.30, 0.45),
    ]
    secs = [(NOSE - f * L, 0, CZ + dz, rv, rz) for f, rv, rz, dz in profile]
    loft(m, secs, 'body', n=36, cap_back='body')
    radome_cap(m, secs, NOSE - 2.3, n=36)
    cockpit(m, sections_at(secs))
    # Dorsal blister (sensor) and a small one under the tail.
    ellipsoid(m, (-4.5, 0, CZ + 1.95), 1.1, 0.75, 0.45, 'body', n=20, k=8)
    ellipsoid(m, (-11.5, 0, CZ - 1.55), 1.0, 0.7, 0.4, 'body', n=20, k=8)


def cockpit(m, at):
    """Flight deck behind the radome: two front windscreen panes with wipers, corner and side windows, all framed."""
    for t0, t1 in ((58, 88), (92, 122)):
        pane(m, at, NOSE - 2.65, NOSE - 3.45, t0, t1)
        wiper(m, at, NOSE - 2.7, t0 + 5, t1 - 5)
    for t0, t1 in ((30, 56), (124, 150)):
        pane(m, at, NOSE - 3.55, NOSE - 4.35, t0, t1)
    for t0, t1 in ((34, 52), (128, 146)):
        pane(m, at, NOSE - 7.4, NOSE - 8.4, t0, t1)


def wings(m):
    sweep_deg, span = 35, 15.0
    for s in (1, -1):
        surface(m, (3.4, s * 1.7, WING_Z), (0, s, -0.05), span, 8.0, 2.7, span * math.tan(math.radians(sweep_deg)), 0.11, 'wing', ns=10, nc=10)
        # Wing fences on the upper surface.
        for dv in (6.5, 10.5):
            frac = dv / span
            le = 3.4 - span * math.tan(math.radians(sweep_deg)) * frac
            c = 8.0 + (2.7 - 8.0) * frac
            z = WING_Z - 0.05 * dv + 0.18
            box(m, (le + 0.2, s * (1.7 + dv), z), (le - c * 0.85, s * (1.7 + dv), z), 0.06, 0.35, 'wing')
        # Main-gear pod, trailing well past the trailing edge.
        dv = 7.4
        le = 3.4 - span * math.tan(math.radians(sweep_deg)) * dv / span
        loft(m, [(le + 0.8, s * (1.7 + dv), WING_Z - 0.35, 0.1, 0.1), (le - 0.6, s * (1.7 + dv), WING_Z - 0.35, 0.62, 0.62),
                 (le - 6.5, s * (1.7 + dv), WING_Z - 0.35, 0.58, 0.58), (le - 9.0, s * (1.7 + dv), WING_Z - 0.3, 0.1, 0.1)], 'body', n=18)


def engines(m):
    """The two turbofans in the wing roots: long nacelles hugging the fuselage, intakes on its flanks."""
    for s in (1, -1):
        cv = s * 2.75
        loft(m, [(5.6, cv, WING_Z + 0.15, 1.05, 1.05), (5.0, cv, WING_Z + 0.15, 1.2, 1.2), (-3.0, cv, WING_Z + 0.2, 1.25, 1.2),
                 (-8.5, cv, WING_Z + 0.2, 0.95, 0.95), (-9.6, cv, WING_Z + 0.2, 0.85, 0.85)], 'nacelle', n=24, cap_front='intake', cap_back='exhaust')
        # Bypass fairing over the nacelle (the H-6K's bulged engine bays).
        loft(m, [(3.5, cv, WING_Z + 0.9, 0.1, 0.1), (1.5, cv, WING_Z + 0.95, 0.8, 0.55), (-5.5, cv, WING_Z + 0.95, 0.8, 0.55),
                 (-7.5, cv, WING_Z + 0.85, 0.1, 0.1)], 'nacelle', n=16)


def tail(m):
    root_u, root_z = -10.6, CZ + 1.4
    surface(m, (root_u, 0, root_z), (0, 0, 1), 5.8, 6.4, 2.2, 6.2, 0.09, 'fin', ns=6, nc=10, up=(0, 1, 0))
    for s in (1, -1):
        surface(m, (-12.6, s * 0.6, CZ + 0.35), (0, s, 0), 5.6, 3.8, 1.4, 3.9, 0.08, 'tail', ns=6, nc=8)


def missiles(m):
    """Six YJ-63 style cruise missiles on pylons under the wings (three a side)."""
    span = 15.0
    for s in (1, -1):
        for dv in (3.4, 5.6, 11.0):
            le = 3.4 - span * math.tan(math.radians(35)) * dv / span
            z = WING_Z - 0.05 * dv - 0.95
            u0 = le + 1.6
            loft(m, [(u0, s * (1.7 + dv), z, 0.05, 0.05), (u0 - 0.9, s * (1.7 + dv), z, 0.33, 0.33), (u0 - 5.2, s * (1.7 + dv), z, 0.33, 0.33),
                     (u0 - 5.5, s * (1.7 + dv), z, 0.2, 0.2)], 'missile', n=14)
            box(m, (u0 - 1.6, s * (1.7 + dv), z + 0.3), (u0 - 3.4, s * (1.7 + dv), z + 0.85), 0.12, 0.6, 'pylon')
            for k in range(4):  # tail fins
                a = k * math.pi / 2 + math.pi / 4
                box(m, (u0 - 4.6, s * (1.7 + dv), z), (u0 - 5.4, s * (1.7 + dv) + math.cos(a) * 0.6, z + math.sin(a) * 0.6), 0.04, 0.4, 'missile')


def build(_pos=None):
    m = Mesh()
    fuselage(m)
    wings(m)
    engines(m)
    tail(m)
    missiles(m)
    v = np.array(m.v, float)
    v[:, 2] -= v[:, 2].min()
    tris = np.arange(len(v)).reshape(-1, 3)
    return v, tris, np.array(m.m)


GREY = (196, 202, 210)
RED = (206, 34, 30)
YELLOW = (236, 196, 40)


def paint(pos, nrm, parts, col):
    u, v, z = pos[:, 0], pos[:, 1], pos[:, 2]
    col[:] = GREY
    col[parts == 'intake'] = (34, 36, 40)
    col[parts == 'exhaust'] = (40, 36, 34)
    col[parts == 'missile'] = (176, 190, 184)
    col[parts == 'pylon'] = (170, 176, 184)
    col[(parts == 'nacelle') & (u < -8.0)] = (150, 146, 140)  # bare-metal jet pipes
    nose = u[parts == 'body'].max()
    col[parts == 'radome'] = (24, 26, 30)  # black radome
    zb = z[(parts == 'body') & (u > nose - 6) & (u < nose - 3)]
    top = zb.max() if zb.size else z.max()
    side = (parts == 'body') & (np.abs(nrm[:, 1]) > 0.55)
    # Red chevrons round the intakes.
    chev = side & (np.abs(u - 6.6) < 1.6) & (np.abs(np.abs(z - (WING_Z + 0.2)) - (1.6 - np.abs(u - 6.6))) < 0.12)
    col[chev] = RED
    # Bort number "11098" on the nose sides: five red digit blocks.
    numz = top - 1.55
    digits = side & (u < nose - 5.2) & (u > nose - 9.0) & (np.abs(z - numz) < 0.42)
    col[digits & (np.mod((nose - 5.2 - u) / 0.76, 1) < 0.62)] = RED
    # Panel lines.
    seam = ((parts == 'body') & (np.mod(u, 1.7) < 0.05)) | (np.isin(parts, ('wing', 'tail')) & (np.mod(np.abs(v), 2.0) < 0.05))
    col[seam] *= 0.86
    # PLAAF insignia: red star (yellow ring) with red bars on the wing tops near the tips and on the rear fuselage sides.
    def star_bar(sel, a, b, r):
        col[sel & (np.abs(b) < r * 0.28) & (np.abs(a) < r * 2.3)] = RED
        disc = sel & (np.hypot(a, b) < r)
        col[disc] = YELLOW
        col[disc & star(a, b, r * 0.92)] = RED
    wing_top = (parts == 'wing') & (nrm[:, 2] > 0.5)
    cv = 12.6
    near = wing_top & (np.abs(np.abs(v) - cv) < 0.5)
    cu = (u[near].max() + u[near].min()) / 2 if near.any() else 0
    star_bar(wing_top, np.abs(v) - cv, u - cu, 0.75)
    star_bar(side & (u < -8.0) & (u > -14.0), u + 10.8, z - (CZ + 0.4), 0.7)
    fin_side = (parts == 'fin') & (np.abs(nrm[:, 1]) > 0.6)
    if fin_side.any():
        fz1 = z[fin_side].max()
        col[fin_side & (z > fz1 - 0.8)] = (214, 218, 224)  # light fin cap
    glazing_paint(parts, col)
    return np.clip(col, 0, 255)


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    base.render_sheet('fixed', preview, build=build, paint=paint, outs=OUTS)


if __name__ == '__main__':
    main()
