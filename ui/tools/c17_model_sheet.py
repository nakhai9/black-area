#!/usr/bin/env python3
"""
The USA's C-17 Globemaster III transport, its own model built in code after the three-view blueprint and photos, and
rendered sharp like the bombers (painted mesh, Blender Cycles with the tank sheets' lighting, 192 px cells — see
tools/tu160_model_sheet.py render_sheet) into public/sprites/c17-usa.png: 16 headings by 9 rows, the 'bomber' layout
AircraftSheets.ts reads (0 parked, 1-2 flying, 3 ramp, 4-5 banked, 6-7 crashing, 8 shadow).
Features: 53 m fat fuselage (drawn full) with a blunt round nose and wrap-round windscreen; high-mounted 25° swept
wing with slight anhedral, upturned winglets and flap-track fairings; four big turbofans on pylons hung well ahead of
the leading edge; T-tail (tall swept fin, tailplane on top); main-gear sponsons low on the flanks; upswept rear with
the loading ramp. Dark blue-grey all over, low-visibility markings, the US flag (the game's design) on the fin and
"U.S. AIR FORCE" lettering on the forward fuselage.
Usage: python -I tools/c17_model_sheet.py   (run from ui/, env TU160_SAMPLES)
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import awacs_model_sheet as aw  # noqa: E402
import tu160_model_sheet as base  # noqa: E402  (after awacs_model_sheet: sets the 192 px cell)
import aircraft_model_sheet as am  # noqa: E402
from awacs_model_sheet import Mesh, box, engine, loft, star, surface  # noqa: E402

am.CELL = base.CELL
OUTS = {'c17': dict(out='c17-usa')}

L = 53.0
R = 3.45 * 1.25  # fuselage radius, drawn a little fuller than true scale


def build(_w=None):
    m = Mesh()
    top = aw.fuselage(m, L, R, nose=0.13, tail=0.3, upsweep=0.62, belly=0.98)
    cz = R
    # High wing: root on the crown, slight anhedral, 25° sweep, big flap-track fairings under the trailing edge.
    zw = top - 0.25
    span, sweep, root_u = 25.9 - R * 0.55, 25.9 * math.tan(math.radians(25)) * 0.9, 5.5
    for s in (1, -1):
        surface(m, (root_u, s * R * 0.55, zw), (0, s, -math.tan(math.radians(3))), span, 10.5, 3.2, sweep, 0.12, 'wing', ns=10, nc=10)
        tip_u = root_u - sweep
        tip_v = s * (R * 0.55 + span)
        tip_z = zw - span * math.tan(math.radians(3))
        surface(m, (tip_u - 0.2, tip_v, tip_z), (0, s * 0.18, 0.98), 2.9, 2.8, 1.0, 1.6, 0.08, 'winglet', up=(0, 1, 0))
        for dv in (4.0, 9.5, 15.0, 19.5):  # flap-track fairings
            le = root_u - sweep * dv / span
            c = 10.5 + (3.2 - 10.5) * dv / span
            z = zw - dv * math.tan(math.radians(3)) - 0.15
            loft(m, [(le - c * 0.55, s * (R * 0.55 + dv), z, 0.05, 0.05), (le - c * 0.8, s * (R * 0.55 + dv), z - 0.15, 0.22, 0.3),
                     (le - c * 1.12, s * (R * 0.55 + dv), z - 0.05, 0.05, 0.05)], 'wing', n=8)
        # Four turbofans on pylons, hung well ahead of the leading edge.
        for dv in (7.0, 13.2):
            aw.wing_engine(m, root_u, R * 0.55, zw, -3, sweep, span, s, dv, 1.25, 6.4)
        # Main-gear sponsons along the lower flanks.
        loft(m, [(4.5, s * (R * 0.82), cz - R * 0.55, 0.1, 0.1), (2.5, s * (R * 0.95), cz - R * 0.55, 0.8, 1.05),
                 (-8.5, s * (R * 0.95), cz - R * 0.55, 0.8, 1.05), (-11.5, s * (R * 0.82), cz - R * 0.5, 0.1, 0.1)], 'body', n=14)
    # Wing-to-body fairing on the crown.
    loft(m, [(root_u + 2.5, 0, top - 0.3, 0.1, 0.1), (root_u, 0, top + 0.15, R * 0.6, 0.55), (root_u - 10.5, 0, top + 0.15, R * 0.6, 0.55),
             (root_u - 13.5, 0, top - 0.3, 0.1, 0.1)], 'body', n=16)
    # T-tail: tall swept fin rising from the upswept tail, tailplane across its top.
    fin_root_u, fin_root_z = -L / 2 + 11.0, top + 0.5
    fin_h = 8.6
    surface(m, (fin_root_u, 0, fin_root_z), (0, 0, 1), fin_h, 9.5, 5.6, 6.8, 0.1, 'fin', ns=8, nc=10, up=(0, 1, 0))
    for s in (1, -1):
        surface(m, (fin_root_u - 6.8 - 0.4, s * 0.3, fin_root_z + fin_h - 0.4), (0, s, -0.04), 9.6, 5.4, 2.2, 4.6, 0.09, 'tail', ns=8, nc=8)
    # Fairing where the tailplane meets the fin top.
    loft(m, [(fin_root_u - 5.6, 0, fin_root_z + fin_h, 0.05, 0.05), (fin_root_u - 7.0, 0, fin_root_z + fin_h, 0.45, 0.45),
             (fin_root_u - 12.5, 0, fin_root_z + fin_h, 0.45, 0.45), (fin_root_u - 13.6, 0, fin_root_z + fin_h, 0.05, 0.05)], 'fin', n=12)
    # Antennas on the crown, refuelling receptacle hump behind the cockpit.
    for du in (8.0, -2.0, -14.0):
        box(m, (du, 0, top + 0.1), (du - 0.5, 0, top + 0.7), 0.1, 0.5, 'antenna')
    loft(m, [(L / 2 - 8.5, 0, top - 0.1, 0.05, 0.05), (L / 2 - 9.3, 0, top + 0.15, 0.6, 0.3), (L / 2 - 11.0, 0, top - 0.1, 0.05, 0.05)], 'body', n=10)
    v = np.array(m.v, float)
    v[:, 2] -= v[:, 2].min()
    tris = np.arange(len(v)).reshape(-1, 3)
    return v, tris, np.array(m.m)


BASE = (74, 84, 98)  # dark blue-grey
DARK = (52, 59, 70)
NAVY, RED, WHITE = (6, 42, 99), (165, 11, 46), (232, 234, 236)


def paint(pos, nrm, parts, col):
    u, v, z = pos[:, 0], pos[:, 1], pos[:, 2]
    col[:] = BASE
    skin = np.isin(parts, ('body', 'wing', 'winglet', 'tail', 'fin', 'nacelle', 'pylon'))
    col[skin & (nrm[:, 2] < -0.4)] = (82, 92, 106)  # belly a touch lighter
    col[parts == 'glass'] = (22, 30, 42)
    col[parts == 'intake'] = (28, 30, 34)
    col[parts == 'exhaust'] = (60, 54, 48)
    col[parts == 'antenna'] = (40, 44, 50)
    col[(parts == 'nacelle') & (u < u[parts == 'nacelle'].min() + 1.4)] = (110, 108, 104)  # bare-metal nozzles
    body = parts == 'body'
    nose = u[body].max()
    zb = z[body]
    top = zb.max()
    # Nose radome a shade darker; anti-glare panel ahead of the windscreen.
    col[body & (u > nose - 1.6)] = DARK
    # Panel lines round the fuselage and along the wings; walkway lines on the wing tops.
    seam = (body & (np.mod(u, 1.6) < 0.05)) | (np.isin(parts, ('wing', 'tail')) & (np.mod(np.abs(v), 1.9) < 0.05))
    col[seam] *= 0.8
    # Cargo ramp and the clamshell door outline under the upswept tail.
    ramp = body & (u < -L / 2 + 12.5) & (u > -L / 2 + 4.5) & (nrm[:, 2] < -0.3) & (np.abs(v) < R * 0.65)
    col[ramp & ((np.abs(np.abs(v) - R * 0.6) < 0.08) | (np.abs(u - (-L / 2 + 12.4)) < 0.08))] = (34, 38, 44)
    # Crew door and "U.S. AIR FORCE" lettering on the forward flanks (dark blocks along a line).
    side = body & (np.abs(nrm[:, 1]) > 0.55)
    zl = top - R * 0.55
    letters = side & (u < nose - 7.0) & (u > nose - 15.5) & (np.abs(z - zl) < 0.32)
    col[letters & (np.mod((nose - 7.0 - u) / 0.55, 1) < 0.6)] = (28, 32, 40)
    col[side & (np.abs(u - (nose - 5.2)) < 0.45) & (z < zl - 0.4) & (z > zl - 2.6)] *= 0.75  # crew door
    # Low-visibility star-and-bar on the rear flanks.
    sb_u, sb_z = -L / 2 + 15.0, R * 1.1
    col[side & star(u - sb_u, z - sb_z, 0.75)] = DARK
    col[side & (np.abs(z - sb_z) < 0.18) & (np.abs(u - sb_u) < 1.6)] = DARK
    # The US flag (the game's design) high on the fin: navy, red band, white six-pointed star.
    fin = (parts == 'fin') & (np.abs(nrm[:, 1]) > 0.6)
    if fin.any():
        fz1 = z[fin].max()
        fu = u[fin & (z > fz1 - 3.0)].mean() + 0.6
        fz = fz1 - 2.6
        flag = fin & (np.abs(u - fu) < 0.95) & (np.abs(z - fz) < 0.6)
        col[flag] = NAVY
        col[flag & (np.abs(z - fz) < 0.07)] = RED
        col[flag & star(u - fu, z - fz, 0.38, points=6, inner=0.56)] = WHITE
        # Air Mobility Command tail band.
        col[fin & (np.abs(z - (fz1 - 4.6)) < 0.22)] = (40, 112, 70)
    col *= (0.96 + 0.04 * np.clip(aw.noise(pos, 1.6, 2.2), -1, 1))[:, None]
    return np.clip(col, 0, 255)


def main():
    base.render_sheet('c17', None, build=build, paint=paint, outs=OUTS)


if __name__ == '__main__':
    main()
