#!/usr/bin/env python3
"""
Builds the USA's B-1 Lancer as a 3D model in code (after its three-view blueprint) and renders it, like the Tu-160
(tools/tu160_model_sheet.py: painted mesh, Blender Cycles with the tank sheets' lighting, 192 px cells), into
public/sprites/b1-usa.png (wings spread, 15°) and b1-usa-turbo.png (wings swept, 67.5°, drawn while the turbo runs).
Layout as AircraftSheets.ts reads it: 16 headings by 9 rows (0 parked, 1-2 flying, 3 ramp, 4-5 banked, 6-7 crashing,
8 shadow).
Blueprint features: 44.5 m blended body — sharp nose with the cockpit close behind it, a wide flat underside flowing
into the wing gloves; variable-sweep outer wings pivoting close to the body; two twin-engine nacelles under the body
either side of the centre line, square intakes behind the wing leading edge, four nozzles at the back; tall swept fin
with large swept tailplanes low on it; dorsal spine. Painted dark grey, low-visibility markings.
Usage: python -I tools/b1_model_sheet.py [spread|swept] [--preview out.png]   (run from ui/, env TU160_SAMPLES)
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tu160_model_sheet as base  # noqa: E402
from tu160_model_sheet import nose_profile  # noqa: E402  (outline -> loft rows: infrastructure, no shapes)
from awacs_model_sheet import Mesh, box, ellipsoid, glazing_paint, loft, pane, radome_cap, sections_at, star, surface, wiper  # noqa: E402

L = 44.5
NOSE = L / 2
CZ = 2.9
WING_Z = 3.0
PIVOT_V = 6.8
WINGS = {
    'spread': dict(span=41.8 / 2 - PIVOT_V, sweep=lambda span: span * math.tan(math.radians(15)), out='b1-usa'),
    'swept': dict(span=24.1 / 2 - PIVOT_V + 1.0, sweep=lambda span: span * math.tan(math.radians(67.5)) * 0.6, out='b1-usa-turbo'),
}


# B-1B nose off the three-view (metres from the tip: crown z, belly z, half width; z from the axis CZ).
NOSE_KEYS = [
    (0.0, -0.30, -0.30, 0.02), (0.4, -0.18, -0.45, 0.18), (1.5, 0.00, -0.70, 0.45), (3.0, 0.22, -0.95, 0.78),
    (4.5, 0.45, -1.15, 1.05), (6.0, 0.75, -1.35, 1.32), (7.4, 1.05, -1.50, 1.55),  # windscreen base
    (8.4, 1.65, -1.62, 1.75), (9.6, 1.95, -1.70, 1.98), (11.5, 2.00, -1.75, 2.35), (0.30 * L, 1.90, -1.80, 2.70),
]


def fuselage(m):
    # f along the length (0 nose, 1 tail), half-width, half-height, axis z offset — drawn full (AWACS-like) so the body
    # reads clearly at sprite size; wide and flat-bottomed through the blended middle.
    profile = [
        # Blueprint nose: long pointed, slightly drooped radome, crown rising to the steep four-pane windscreen,
        # the flight-deck roof flowing back into the blended body.
        *nose_profile(NOSE_KEYS, L),
        (0.300, 2.70, 1.85, 0.05),
        (0.450, 2.95, 1.80, 0.00),
        (0.650, 2.85, 1.75, 0.05),
        (0.780, 2.30, 1.60, 0.20),
        (0.880, 1.55, 1.30, 0.45),
        (0.950, 0.85, 0.90, 0.70),
        (1.000, 0.20, 0.30, 0.90),
    ]
    secs = [(NOSE - f * L, 0, CZ + dz, rv, rz) for f, rv, rz, dz in profile]
    loft(m, secs, 'body', n=36, cap_back='body')
    radome_cap(m, secs, NOSE - 4.3, n=36)
    # Structural mode control vanes (B-1B): small swept fins low on the nose sides, canted 30 deg down.
    for s in (1, -1):
        c30, s30 = math.cos(math.radians(30)), math.sin(math.radians(30))
        surface(m, (NOSE - 4.9, s * 1.05, CZ - 0.75), (0, s * c30, -s30), 1.3, 1.1, 0.55, 0.65, 0.06, 'body', ns=3, nc=5, up=(0, s * s30, c30))
    cockpit(m, sections_at(secs))
    # Pitot / refuelling probe at the nose tip.
    box(m, (NOSE, 0, CZ - 0.3), (NOSE + 1.2, 0, CZ - 0.32), 0.1, 0.1, 'probe')
    # Dorsal spine from behind the cockpit into the fin.
    loft(m, [(NOSE - 0.24 * L, 0, CZ + 1.9, 0.05, 0.05), (NOSE - 0.29 * L, 0, CZ + 1.88, 0.8, 0.35),
             (NOSE - 0.82 * L, 0, CZ + 1.9, 0.8, 0.35), (NOSE - 0.88 * L, 0, CZ + 1.95, 0.05, 0.05)], 'body', n=14)


def cockpit(m, at):
    """Four-man flight deck: two front windscreen panes with wipers, framed side windows behind them."""
    for t0, t1 in ((62, 88), (92, 118)):
        pane(m, at, NOSE - 7.45, NOSE - 8.35, t0, t1)
        wiper(m, at, NOSE - 7.5, t0 + 5, t1 - 5)
    for t0, t1 in ((30, 56), (124, 150)):
        pane(m, at, NOSE - 8.45, NOSE - 9.5, t0, t1)
    for t0, t1 in ((36, 54), (126, 144)):
        pane(m, at, NOSE - 9.6, NOSE - 10.3, t0, t1)


def glove(m):
    for s in (1, -1):
        surface(m, (9.0, s * 2.2, WING_Z), (0, s, 0), PIVOT_V - 2.2 + 0.4, 17.0, 7.0, 11.5, 0.08, 'glove', ns=6, nc=10)


def outer_wings(m, pos):
    span = WINGS[pos]['span']
    sweep = WINGS[pos]['sweep'](span)
    for s in (1, -1):
        surface(m, (-1.0, s * (PIVOT_V - 0.3), WING_Z + 0.05), (0, s, 0), span + 0.3, 5.4, 1.9, sweep, 0.09, 'wing', ns=8, nc=8)


def nacelles(m):
    zc, h, w = 1.2, 1.5, 2.7
    front, back = -1.5, -12.8
    for s in (1, -1):
        cv = s * 3.3
        box(m, (front, cv, zc), (back, cv, zc), w, h, 'nacelle')
        for half in (-1, 1):
            v0, v1 = cv + half * 0.07, cv + half * (w / 2 - 0.05)
            m.quad((front + 0.02, v0, zc - h / 2 + 0.05), (front + 0.02, v1, zc - h / 2 + 0.05),
                   (front + 0.02, v1, zc + h / 2 - 0.05), (front + 0.02, v0, zc + h / 2 - 0.05), 'intake')
        box(m, (front + 0.8, cv, zc), (front - 0.2, cv, zc), 0.1, h * 0.98, 'nacelle')
        # Fairing up into the body.
        box(m, (front - 0.5, cv, zc + h / 2), (back + 0.8, cv, CZ - 0.6), w * 0.8, 0.6, 'nacelle')
        for half in (-1, 1):
            nv = cv + half * 0.68
            loft(m, [(back + 0.2, nv, zc, 0.64, 0.64), (back - 1.0, nv, zc, 0.6, 0.6), (back - 2.0, nv, zc, 0.52, 0.52)],
                 'nozzle', n=18, cap_back='exhaust')


def tail(m):
    root_u, root_z = -13.6, CZ + 1.6
    surface(m, (root_u, 0, root_z), (0, 0, 1), 6.3, 8.6, 3.4, 6.0, 0.08, 'fin', ns=6, nc=10, up=(0, 1, 0))
    for s in (1, -1):
        surface(m, (root_u - 2.6, s * 0.35, root_z + 0.6), (0, s, 0), 6.9, 5.8, 1.9, 5.0, 0.07, 'tail', ns=6, nc=8)
    loft(m, [(root_u - 1.5, 0, root_z + 0.6, 0.05, 0.05), (root_u - 3.0, 0, root_z + 0.6, 0.4, 0.4),
             (root_u - 8.0, 0, root_z + 0.6, 0.4, 0.4), (root_u - 9.0, 0, root_z + 0.6, 0.05, 0.05)], 'fin', n=12)


def build(pos):
    m = Mesh()
    fuselage(m)
    glove(m)
    outer_wings(m, pos)
    nacelles(m)
    tail(m)
    v = np.array(m.v, float)
    v[:, 2] -= v[:, 2].min()
    tris = np.arange(len(v)).reshape(-1, 3)
    return v, tris, np.array(m.m)


GREY = (78, 82, 90)
LOWVIS = (58, 61, 68)


def paint(pos, nrm, parts, col):
    """Dark grey all over (as the blueprint), darker radome, low-visibility markings."""
    u, v, z = pos[:, 0], pos[:, 1], pos[:, 2]
    col[:] = GREY
    col[parts == 'intake'] = (22, 24, 27)
    col[parts == 'nozzle'] = (88, 84, 80)
    col[parts == 'exhaust'] = (34, 30, 28)
    col[parts == 'probe'] = (60, 62, 66)
    col[parts == 'radome'] = (62, 66, 72)  # radome a shade darker
    nose = u[parts == 'body'].max()
    # Panel lines a shade darker, a few lighter access panels.
    seam = ((parts == 'body') & (np.mod(u, 1.6) < 0.05)) | (np.isin(parts, ('wing', 'glove', 'tail', 'nacelle')) & (np.mod(np.abs(v), 1.8) < 0.05))
    col[seam] *= 0.82
    panel = (parts == 'body') & (np.mod(u + 0.4, 4.8) < 1.1) & (np.mod(np.abs(v) + 0.3, 2.6) < 0.8) & (nrm[:, 2] > 0.5)
    col[panel] *= 1.08
    # Low-visibility star-and-bar on the left wing top and the forward fuselage sides; tail code band on the fin.
    wing_top = (parts == 'wing') & (nrm[:, 2] > 0.5) & (v > 0)
    if wing_top.any():
        cv = np.abs(v[wing_top]).max() - 3.0
        near = wing_top & (np.abs(v - cv) < 0.5)
        cu = (u[near].max() + u[near].min()) / 2 if near.any() else 0
        col[wing_top & star(v - cv, u - cu, 1.1)] = LOWVIS
        col[wing_top & (np.abs(u - cu) < 0.25) & (np.abs(v - cv) < 2.0)] = LOWVIS
    side = (parts == 'body') & (np.abs(nrm[:, 1]) > 0.55) & (u < nose - 10) & (u > nose - 13)
    zs = z[parts == 'body'].max() - 1.6
    col[side & star(u - (nose - 11.5), z - zs, 0.8)] = LOWVIS
    fin_side = (parts == 'fin') & (np.abs(nrm[:, 1]) > 0.6) & (z > np.percentile(z[parts == 'body'], 90))
    if fin_side.any():
        fz1 = z[fin_side].max()
        col[fin_side & (z > fz1 - 1.4) & (z < fz1 - 0.9)] = (104, 108, 116)
    glazing_paint(parts, col)
    return np.clip(col, 0, 255)


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    only = [a for a in sys.argv[1:] if a in WINGS]
    for wings in only or WINGS:
        base.render_sheet(wings, preview, build=build, paint=paint, outs=WINGS)


if __name__ == '__main__':
    main()
