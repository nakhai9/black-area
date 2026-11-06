#!/usr/bin/env python3
"""
Russia's Il-76MD transport, its own model and paint after the blueprint and photos, rendered sharp like the bombers
(painted mesh, Blender Cycles, 192 px cells — tools/tu160_model_sheet.py render_sheet) into
public/sprites/il76-russia.png: 16 headings by 9 rows, the layout AircraftSheets.ts reads.
Airframe: the Il-76 of tools/awacs_model_sheet.py (high anhedral wing, four engines on pylons, T-tail, main-gear
fairings) on a fuller body, plus the glazed navigator's nose under the cockpit, wing fences and a tail cone.
Paint: white, a blue cheatline along the whole fuselage with a thin red one under it, light-grey belly, black
anti-glare and radome chin, red wing and tailplane tips, the Russian flag (the game's design) on the fin.
Usage: python -I tools/il76_model_sheet.py   (run from ui/, env TU160_SAMPLES)
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import awacs_model_sheet as aw  # noqa: E402
import tu160_model_sheet as base  # noqa: E402  (after awacs_model_sheet: sets the 192 px cell)
import aircraft_model_sheet as am  # noqa: E402
from awacs_model_sheet import Mesh, box, ellipsoid, star  # noqa: E402

am.CELL = base.CELL
OUTS = {'il76': dict(out='il76-russia')}
L = 46.6
R = 2.45 * 1.5  # drawn fuller than true scale


def build(_w=None):
    m = Mesh()
    top = aw.il76(m, L, R)
    # Glazed navigator's nose: a bulge under the cockpit, painted as a grid of panes.
    ellipsoid(m, (L / 2 - 2.2, 0, R * 0.62), 2.3, R * 0.62, R * 0.5, 'navnose', n=28, k=10)
    # Wing fences on the upper surface.
    zw = 2 * R - 0.2
    for s in (1, -1):
        for dv in (9.5, 16.5):
            le = 5.0 - 8.5 * dv / 23.5
            z = zw - (dv + R * 0.6) * math.tan(math.radians(3)) + 0.2
            box(m, (le + 0.3, s * (R * 0.6 + dv), z), (le - 5.0, s * (R * 0.6 + dv), z), 0.06, 0.35, 'wing')
    # Antennas on the crown.
    for du in (9.0, 2.0, -6.0):
        box(m, (du, 0, top), (du - 0.5, 0, top + 0.6), 0.1, 0.5, 'antenna')
    v = np.array(m.v, float)
    v[:, 2] -= v[:, 2].min()
    tris = np.arange(len(v)).reshape(-1, 3)
    return v, tris, np.array(m.m)


WHITE = (236, 238, 240)
GREY = (196, 201, 207)
BLUE = (34, 78, 160)
RED = (200, 36, 30)


def paint(pos, nrm, parts, col):
    u, v, z = pos[:, 0], pos[:, 1], pos[:, 2]
    col[:] = WHITE
    body = parts == 'body'
    zb = z[body]
    zmid = (zb.max() + zb.min()) / 2
    col[np.isin(parts, ('body', 'nacelle', 'pylon')) & (z < zmid - R * 0.45)] = GREY  # light-grey belly
    col[np.isin(parts, ('wing', 'tail')) & (nrm[:, 2] < -0.3)] = GREY
    col[parts == 'intake'] = (34, 36, 40)
    col[parts == 'exhaust'] = (70, 64, 58)
    col[parts == 'antenna'] = (60, 62, 66)
    col[parts == 'glass'] = (24, 32, 44)
    col[(parts == 'nacelle') & (u < u[parts == 'nacelle'].min() + 1.2)] = (150, 146, 140)
    nose = u[body].max()
    # Black anti-glare panel ahead of the windscreen and the dark radome chin.
    col[body & (u > nose - 4.0) & (u < nose - 1.6) & (nrm[:, 2] > 0.45)] = (30, 32, 36)
    nav = parts == 'navnose'
    col[nav] = WHITE
    col[nav & (nrm[:, 0] > 0.2)] = (28, 38, 52)  # glazed panes
    gu, gz = np.mod(u * 2.4, 1) < 0.16, np.mod(z * 2.4, 1) < 0.16
    col[nav & (nrm[:, 0] > 0.2) & (gu | gz | (np.mod(np.abs(v) * 2.4, 1) < 0.16))] = (225, 228, 232)  # frames
    col[body & (u > nose - 1.0) & (z < zmid)] = (40, 42, 46)
    # Cheatline: a broad blue band along the whole fuselage at window height, a thin red line under it.
    side = body & (np.abs(nrm[:, 1]) > 0.35)
    zl = zmid + R * 0.12
    col[side & (np.abs(z - zl) < R * 0.13) & (u < nose - 2.5)] = BLUE
    col[side & (np.abs(z - (zl - R * 0.2)) < R * 0.035) & (u < nose - 3.0)] = RED
    # Windows along the cheatline (white dots on the blue band) and the crew door.
    col[side & (np.abs(z - zl) < R * 0.05) & (np.mod(u, 2.2) < 0.35) & (u < nose - 9) & (u > -12)] = (230, 232, 236)
    col[side & (np.abs(u - (nose - 7.0)) < 0.5) & (z < zl - R * 0.25) & (z > zl - R * 0.95)] *= 0.82
    # Blue sweep on the wing tops near the root, red tips on wings and tailplane.
    wing_top = (parts == 'wing') & (nrm[:, 2] > 0.4)
    col[wing_top & (np.abs(v) < R * 0.6 + 3.0) & (np.abs(v) > R * 0.6 + 0.8)] = BLUE
    for p in ('wing', 'tail'):
        sel = parts == p
        if sel.any():
            col[sel & (np.abs(v) > np.abs(v[sel]).max() - 0.7)] = RED
    # Russian flag (the game's design: white inside a blue border, red star) high on the fin.
    fin = (parts == 'fin') & (np.abs(nrm[:, 1]) > 0.6)
    if fin.any():
        fz1 = z[fin].max()
        fu = u[fin & (z > fz1 - 3.5)].mean() + 0.5
        fz = fz1 - 3.0
        flag = fin & (np.abs(u - fu) < 1.0) & (np.abs(z - fz) < 0.62)
        col[flag] = (10, 58, 154)
        col[flag & (np.abs(u - fu) < 0.88) & (np.abs(z - fz) < 0.5)] = (240, 240, 238)
        col[flag & star(u - fu, z - fz, 0.42)] = (201, 34, 22)
    # Panel lines and a little weathering.
    seam = (body & (np.mod(u, 1.7) < 0.04)) | (np.isin(parts, ('wing', 'tail')) & (np.mod(np.abs(v), 2.0) < 0.04))
    col[seam] *= 0.88
    col *= (0.97 + 0.03 * np.clip(aw.noise(pos, 1.5, 6.1), -1, 1))[:, None]
    return np.clip(col, 0, 255)


def main():
    base.render_sheet('il76', None, build=build, paint=paint, outs=OUTS)


if __name__ == '__main__':
    main()
