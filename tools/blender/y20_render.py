"""
Xian Y-20A Kunpeng (China transport): self-contained Blender model + sprite sheet (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/y20_render.py -- [SAMPLES] [--preview]

Writes ui/public/sprites/y20-china.png (then `python tools/to_webp.py`): 192 px cells, 32 RA2 facings x 9 rows
(0 parked, 1-2 flying, 3 ramp, 4-5 banked, 6-7 crashing, 8 shadow; see airkit.ROWS).

Real numbers (Y-20A): length 47.0 m, span 50.0 m, height 15.0 m, fuselage ~5.8 m across; high wing, ~23 deg
quarter-chord sweep, ~3.5 deg anhedral, no winglets, five flap-track canoes a side; four D-30KP-2 turbofans on
pylons; T-tail with a bullet fairing; smooth rounded nose (no glazing) with a darker radome; big main-gear sponsons
(three axles of two wheels a side), twin nose wheels; rear ramp under the upswept tail.
Drawn: fuselage 1.12x fuller than true (ART_GUIDE: full body), the rest true scale. Axes: u nose, v left, z up, metres.
Paint (refs): PLAAF medium dark grey all over, darker radome; the game's China flag high on the fin (Flags.ts: red
field, big yellow star, four small ones in an arc); fin serial in TEAM yellow (kit.TEAM['china'], the real one is
yellow); PLAAF insignia (red star, yellow rim, red bars with yellow edges) on the rear flanks and the wing tops;
"中国空军" and the nose number as dark blocks.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from airkit import Body, TEAM, airfoil, box, flag_plate, lathe, loft, mat, obj, plate, rod, run, star_flat, star_plate, superellipse, surface  # noqa: E402

LENGTH = 47.0
GREY = '#5f666e'
RADOME = '#4a5058'


def materials():
    return dict(
        skin=mat('skin', GREY, 0.6, panels=True),
        radome=mat('radome', RADOME, 0.55),
        black=mat('black', '#16181b', 0.6),
        glass=mat('glass', '#1a2633', 0.07, glass=True, ao=0),
        intake=mat('intake', '#121416', 0.9, ao=0.6),
        lip=mat('lip', '#a9adb1', 0.35, metal=0.8, ao=0.2),
        metal=mat('metal', '#8f8d88', 0.36, metal=0.85, ao=0.3),
        hot=mat('hot', '#5b5248', 0.5, metal=0.7),
        tyre=mat('tyre', '#1b1c1e', 0.85),
        strut=mat('strut', '#b5b8bc', 0.35, metal=0.8, ao=0.2),
        hold=mat('hold', '#0c0d0f', 0.95, ao=0),
        letter=mat('letter', '#1c1f24', 0.6, ao=0),
        fred=mat('fred', '#dd1c18', 0.55, ao=0),
        fyellow=mat('fyellow', '#ffdd00', 0.55, ao=0),
        team=mat('team', TEAM['china'], 0.5, ao=0),
        navred=mat('navred', '#ff2a2a', 0.4, emit=6.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=6.0, ao=0),
        beacon_off=mat('beacon_off', '#6a1414', 0.3, ao=0),
        beacon_on=mat('beacon_on', '#ff3020', 0.3, emit=40.0, ao=0),
    )


ZC = 4.65
STATIONS = [
    (23.5, -0.75, 0.05, 0.05), (23.35, -0.72, 0.6, 0.6), (22.8, -0.6, 1.35, 1.4), (21.9, -0.42, 2.05, 2.15),
    (20.6, -0.22, 2.65, 2.75), (18.8, -0.05, 3.1, 3.18), (16.8, 0.0, 3.25, 3.3), (-7.5, 0.0, 3.25, 3.3),
    (-11.5, 0.5, 3.12, 2.85), (-15.0, 1.2, 2.7, 2.2), (-18.6, 1.85, 2.05, 1.5), (-21.6, 2.3, 1.25, 0.9),
    (-23.1, 2.5, 0.5, 0.42), (-23.5, 2.55, 0.1, 0.1),
]
B = Body(STATIONS, ZC, 2.3)
TOP = ZC + 3.3


def fuselage(M):
    us = sorted({round(x, 3) for x in list(np.linspace(23.5, 16.8, 16)) + list(np.linspace(16.8, -7.5, 12)) + list(np.linspace(-7.5, -23.5, 18))}, reverse=True)
    B.skin('fuselage', M['skin'], us)
    cone = []
    for u in np.linspace(23.51, 21.6, 7):
        dz, hw, hh = B.station(u)
        cone.append(superellipse(u + 0.01, 0, ZC + dz, hw + 0.012, hh + 0.012, 2.3, 56))
    loft('radome', cone, M['radome'], smooth=50)
    loft('wing_fairing', [superellipse(u, 0, TOP - 0.3, w, h, 2.2, 40) for u, w, h in
                          ((7.8, 0.2, 0.12), (6.2, 2.5, 0.55), (3.5, 3.0, 0.8), (-4.0, 3.0, 0.8), (-7.8, 2.5, 0.5), (-10.4, 0.25, 0.1))], M['skin'])
    for s in (1, -1):
        loft(f'sponson{s}', [superellipse(u, s * 2.7, ZC - 2.35, w, h, 2.6, 32) for u, w, h in
                             ((7.0, 0.15, 0.2), (5.6, 0.95, 1.15), (4.0, 1.1, 1.35), (-7.8, 1.1, 1.35), (-10.0, 0.9, 1.1), (-12.0, 0.15, 0.2))], M['skin'])
    for du in (13.0, 8.5, -2.0, -11.0):
        box(f'antenna{du}', (du, 0, TOP + 0.3), (0.7, 0.06, 0.55), M['black'], rot=(0, math.radians(-25), 0))
    # Satcom dome on the crown behind the wing (the photos).
    lathe('satcom', [(0, 0.001), (0, 0.75), (0.18, 0.62), (0.3, 0.001)], (-12.2, 0, TOP - 0.5), 'v', M['skin'], segs=24)
    for z, nm in ((TOP + 0.03, 'top'), (ZC - 3.32, 'bot')):
        lathe(f'beacon_{nm}_off', [(0, 0.001), (0.0, 0.2), (0.16, 0.16), (0.24, 0.001)], (-1.0, 0, z), 'v', M['beacon_off'], 'beacon_off', 16)
        lathe(f'beacon_{nm}_on', [(0, 0.001), (0.0, 0.22), (0.18, 0.18), (0.26, 0.001)], (-1.0, 0, z), 'v', M['beacon_on'], 'beacon_on', 16)


def cockpit(M):
    for s in (1, -1):
        B.patch(f'frame{s}', 21.15, 19.05, ZC + 1.45, ZC + 2.4, s, M['black'], off=0.025, nu=5, nz=3)
        for i, (a, b) in enumerate(((21.0, 20.4), (20.3, 19.75), (19.6, 19.15))):
            B.patch(f'pane{s}{i}', a, b, ZC + 1.6, ZC + 2.25, s, M['glass'], off=0.05, nu=2, nz=2)
        # Crew door and the forward escape hatch.
        B.patch(f'door{s}', 16.6, 15.6, ZC - 2.1, ZC + 0.2, s, M['letter'], off=0.028, nu=2, nz=3)
        B.patch(f'hatch{s}', 13.4, 12.8, ZC + 0.6, ZC + 1.3, s, M['letter'], off=0.028, nu=1, nz=1)
        # The four characters of the air force's name as dark blocks; the nose number "23" under the cockpit.
        u = 15.0
        for _ in range(4):
            B.patch(f'hanzi{s}{u:.2f}', u, u - 0.55, ZC + 1.2, ZC + 1.75, s, M['letter'], off=0.03, nu=1, nz=1)
            u -= 0.72
        for i in range(2):
            B.patch(f'nosenum{s}{i}', 19.9 - i * 0.55, 19.5 - i * 0.55, ZC + 0.1, ZC + 0.75, s, M['letter'], off=0.03, nu=1, nz=1)
    for k, (y0, y1) in enumerate(((-1.15, -0.05), (0.05, 1.15))):
        pts = []
        for y in (y0, y1):
            for z in (ZC + 1.6, ZC + 2.25):
                u = 19.0
                for uu in np.linspace(19.0, 23.2, 120):
                    if B.half_width(uu, z) >= abs(y) + 0.04:
                        u = uu
                pts.append((u + 0.06, y, z))
        obj(f'windscreen{k}', [pts[0], pts[2], pts[3], pts[1]], [(0, 1, 2, 3)], M['glass'], smooth=0)


def insignia_side(M, s, cu, cz, size):
    """PLAAF insignia on a flank: yellow-rimmed red star, red bars with yellow edges either side."""
    for nm, m, ro, ri, off in (('ins_y', M['fyellow'], size, size * 0.42, 0.03), ('ins_r', M['fred'], size * 0.8, size * 0.34, 0.045)):
        pts = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5
            r = ro if k % 2 == 0 else ri
            pts.append(B.point(cu + r * math.cos(a), s, cz + r * math.sin(a), off))
        plate(f'{nm}{s}', pts[::s], (0, s, 0), m, off=0.0)
    for side_u in (1, -1):
        a, b = cu + side_u * size * 0.75, cu + side_u * size * 2.3
        B.patch(f'barY{s}{side_u}', a, b, cz - size * 0.24, cz + size * 0.24, s, M['fyellow'], off=0.03, nu=3, nz=1)
        B.patch(f'barR{s}{side_u}', a + side_u * 0.06, b - side_u * 0.06, cz - size * 0.16, cz + size * 0.16, s, M['fred'], off=0.04, nu=3, nz=1)


def wing_le(v):
    return 5.0 - (abs(v) - 2.2) * math.tan(math.radians(26))


def wing_z(v):
    return TOP - 0.5 - (abs(v) - 2.2) * math.tan(math.radians(3.5))


def wing_chord(v):
    return 10.5 + (3.2 - 10.5) * (abs(v) - 2.2) / (25.0 - 2.2)


def wings(M):
    for s in (1, -1):
        secs = [((wing_le(v), s * v, wing_z(v)), (-wing_chord(v), 0, 0), (0, 0, 1), 0.14 + (0.1 - 0.14) * (v - 2.2) / 22.8) for v in (2.2, 6.0, 12.0, 18.0, 25.0)]
        surface(f'wing{s}', secs, M['skin'], camber=0.02)
        lathe(f'nav{s}', [(0, 0.001), (0, 0.14), (0.22, 0.001)], (wing_le(25.0) - 0.5, s * 25.05, wing_z(25.0)), 'v',
              M['navred'] if s > 0 else M['navgreen'], segs=12)
        for v in (4.6, 9.6, 15.8, 19.8, 22.8):
            le, c, z = wing_le(v), wing_chord(v), wing_z(v)
            te = le - c
            loft(f'flaptrack{s}{v}', [superellipse(u, s * v, z - 0.24 + d, w, h, 2.0, 16) for u, w, h, d in
                                       ((te + c * 0.45, 0.03, 0.03, 0.05), (te + c * 0.25, 0.2, 0.32, -0.12), (te - 0.5, 0.17, 0.26, -0.12), (te - 1.4, 0.03, 0.03, -0.02))], M['skin'])
        # PLAAF insignia on the outer wing top: yellow-rimmed red star and bars.
        v = 17.0
        u0 = wing_le(v) - wing_chord(v) * 0.42
        z = wing_z(v) + wing_chord(v) * 0.072 + 0.03
        star_flat(f'wsy{s}', u0, s * v, z, 1.1, 0.46, 5, M['fyellow'])
        star_flat(f'wsr{s}', u0, s * v, z + 0.012, 0.88, 0.37, 5, M['fred'])
        for side in (1, -1):
            vv = s * v + side * 1.85
            plate(f'wbarY{s}{side}', [(u0 + 0.28, vv - 1.0, z), (u0 + 0.28, vv + 1.0, z), (u0 - 0.28, vv + 1.0, z), (u0 - 0.28, vv - 1.0, z)], (0, 0, 1), M['fyellow'], off=0.0)
            plate(f'wbarR{s}{side}', [(u0 + 0.18, vv - 0.92, z), (u0 + 0.18, vv + 0.92, z), (u0 - 0.18, vv + 0.92, z), (u0 - 0.18, vv - 0.92, z)], (0, 0, 1), M['fred'], off=0.012)
        for vv in (7.0, 12.8):
            engine(M, s, vv)


def engine(M, s, v):
    le, z = wing_le(v), wing_z(v)
    ax = (le + 3.4, s * v, z - 2.05)
    t = f'{s}{v}'
    lathe(f'cowl{t}', [(-0.02, 0.92), (0.0, 1.0), (0.14, 1.09), (0.5, 1.13), (2.8, 1.13), (3.5, 1.06), (4.5, 0.92), (5.0, 0.83)], ax, 'u', M['skin'])
    lathe(f'lip{t}', [(-0.03, 0.9), (-0.03, 1.02), (0.1, 1.08), (0.1, 0.9)], ax, 'u', M['lip'])  # bare-metal intake lip (photos)
    lathe(f'intake{t}', [(-0.02, 0.92), (0.2, 0.86), (0.8, 0.84), (0.81, 0.001)], ax, 'u', M['intake'])
    lathe(f'spinner{t}', [(0.79, 0.32), (0.55, 0.17), (0.34, 0.001)], ax, 'u', M['metal'])
    lathe(f'cascade{t}', [(2.9, 1.145), (3.35, 1.13), (3.35, 1.1), (2.9, 1.12)], ax, 'u', M['black'], smooth=0)
    lathe(f'nozzle{t}', [(4.95, 0.84), (5.6, 0.7), (5.6, 0.58), (4.95, 0.64)], ax, 'u', M['metal'])
    lathe(f'plug{t}', [(5.2, 0.55), (5.85, 0.34), (6.3, 0.03), (6.31, 0.001)], ax, 'u', M['hot'])
    rings = []
    for le_, chord in (((ax[0] - 0.5, ax[1], ax[2] + 1.03), -4.4), ((le + 0.3, ax[1], z - 0.15), -3.8)):
        rings.append([(le_[0] + chord * x, le_[1] + s * y * abs(chord), le_[2]) for x, y in airfoil(0.07, 0)])
    loft(f'pylon{t}', rings, M['skin'], smooth=30)


def fin_half(chord, frac=0.4, tc=0.11):
    x = frac
    return tc * chord * 5 * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)


def tail(M):
    root = (-12.0, 0, TOP - 0.1)
    h, sweep, c0, c1 = 6.9, 40, 9.4, 5.4
    tipx = root[0] - h * math.tan(math.radians(sweep))
    surface('fin', [(root, (-c0, 0, 0), (0, 1, 0), 0.11), ((tipx, 0, root[2] + h), (-c1, 0, 0), (0, 1, 0), 0.1)], M['skin'], camber=0.0)
    loft('dorsal', [superellipse(u, 0, TOP - 0.05, w, hh, 2.0, 16) for u, w, hh in ((-8.0, 0.05, 0.05), (-10.5, 0.32, 0.42), (-12.8, 0.42, 0.85), (-13.8, 0.05, 0.05))], M['skin'])
    zt = root[2] + h - 0.05
    for s in (1, -1):
        le0 = tipx + 0.3
        tipu = le0 - 9.0 * math.tan(math.radians(30))
        surface(f'tailplane{s}', [((le0, s * 0.2, zt), (-5.2, 0, 0), (0, 0, 1), 0.09), ((tipu, s * 9.0, zt - 0.25), (-2.2, 0, 0), (0, 0, 1), 0.08)], M['skin'], camber=0.0)
    loft('bullet', [superellipse(u, 0, zt, r, r, 2.0, 24) for u, r in ((tipx + 1.8, 0.02), (tipx + 1.0, 0.42), (tipx - 1.0, 0.55), (tipx - 6.8, 0.48), (tipx - 7.8, 0.05))], M['skin'])
    return root, h, sweep, c0, c1


def fin_markings(M, root, h, sweep, c0, c1):
    at = lambda z: (root[0] - (z - root[2]) * math.tan(math.radians(sweep)), c0 + (c1 - c0) * (z - root[2]) / h)
    zf = root[2] + h * 0.72
    le, c = at(zf)
    fu = le - c * 0.42
    for s in (1, -1):
        y = s * (fin_half(c) + 0.03)
        W, H = 2.1, 1.4
        flag_plate(f'flag{s}', fu, y, zf, W, H, s, M['fred'])
        # Game China flag: big star at (0.5, 0.43) r 0.28 h, small ones on an arc below (r 0.075 h).
        star_plate(f'bigstar{s}', fu, y, zf + H * (0.5 - 0.43), H * 0.28, H * 0.28 * 0.38, 5, s, M['fyellow'], off=0.015)
        for i, (fx, fy) in enumerate(((0.31, 0.72), (0.43, 0.8), (0.57, 0.8), (0.69, 0.72))):
            star_plate(f'smallstar{s}{i}', fu + (fx - 0.5) * W, y, zf + H * (0.5 - fy), H * 0.075, H * 0.075 * 0.38, 5, s, M['fyellow'], off=0.015)
        # Five-digit serial below the flag, in TEAM yellow (the real ones are yellow).
        zn = zf - 1.75
        le2, c2 = at(zn)
        y2 = s * (fin_half(c2) + 0.03)
        for i in range(5):
            u0 = le2 - c2 * 0.22 - i * 0.6
            flag_plate(f'serial{s}{i}', u0, y2, zn, 0.4, 0.75, s, M['team'])
        insignia_side(M, s, -12.5, ZC - 0.2, 0.8)


def gear(M):
    def wheel(name, c, r=0.62, w=0.38):
        lathe(name, [(-w / 2, 0.001), (-w / 2, r * 0.8), (-w / 2 + 0.05, r), (w / 2 - 0.05, r), (w / 2, r * 0.8), (w / 2, 0.001)], c, 'v', M['tyre'], 'gear', 24)
        lathe(name + 'hub', [(-w / 2 - 0.01, 0.001), (-w / 2 - 0.01, r * 0.45), (w / 2 + 0.01, r * 0.45), (w / 2 + 0.01, 0.001)], c, 'v', M['strut'], 'gear', 16)
    for dy in (-0.3, 0.3):
        wheel(f'nosewheel{dy}', (18.6, dy, 0.52), 0.52, 0.3)
    rod('nosestrut', (18.6, 0, 0.52), (18.8, 0, ZC - 3.0), 0.13, M['strut'], 'gear')
    for s in (1, -1):
        for u in (2.2, -0.6, -3.4):
            for dy in (0.0, 0.45):
                wheel(f'main{s}{u}{dy}', (u, s * (2.4 + dy), 0.62))
            rod(f'mainstrut{s}{u}', (u, s * 2.62, 0.62), (u + 0.2, s * 2.7, ZC - 3.0), 0.16, M['strut'], 'gear')


def ramp(M):
    hinge_u = -12.0
    dz, hw, hh = B.station(hinge_u)
    hz = ZC + dz - hh + 0.1
    length = 6.0
    ang = math.asin(min(1.0, hz / length))
    end_u = hinge_u - length * math.cos(ang)
    w = 2.2
    pts = [(hinge_u, -w, hz), (hinge_u, w, hz), (end_u, w, 0.05), (end_u, -w, 0.05)]
    verts = pts + [(p[0], p[1], p[2] + 0.17) for p in pts]
    obj('ramp', verts, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['skin'], 'ramp', smooth=0)
    hold = []
    for u in np.linspace(hinge_u, -20.5, 8):
        d, ww, h2 = B.station(u)
        hold.append([(u, -ww * 0.7, ZC + d - h2 + 0.05), (u, ww * 0.7, ZC + d - h2 + 0.05)])
    verts = [p for pair in hold for p in pair]
    obj('hold', verts, [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(hold) - 1)], M['hold'], 'ramp', smooth=0)


def build():
    M = materials()
    fuselage(M)
    cockpit(M)
    wings(M)
    fin_markings(M, *tail(M))
    gear(M)
    ramp(M)


run('y20', 'y20-china', LENGTH, build)
