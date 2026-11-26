"""
Ilyushin Il-76MD (Russia transport): self-contained Blender model + sprite sheet (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/il76_render.py -- [SAMPLES] [--preview]

Writes ui/public/sprites/il76-russia.png (then `python tools/to_webp.py`): 192 px cells, 32 RA2 facings x 9 rows
(0 parked, 1-2 flying, 3 ramp, 4-5 banked, 6-7 crashing, 8 shadow; see airkit.ROWS).

Real numbers (Il-76MD): length 46.59 m, span 50.50 m, height 14.76 m, fuselage ~4.8 m across; high wing, 25 deg
quarter-chord sweep, ~3 deg anhedral, no winglets, big flap-track canoes; four D-30KP turbofans on pylons; T-tail with
a long bullet fairing; glazed navigator's nose under a grey weather-radar cone, ground-mapping radar in a chin
fairing; long main-gear pods low on the flanks (16 main wheels, 4 nose wheels); rear ramp and clamshell doors.
Drawn: fuselage 1.2x fuller than true (ART_GUIDE: full body), the rest true scale. Axes: u nose, v left, z up, metres.
Paint (refs: Aeroflot / VKS scheme): white upper body, light gull-grey belly and sponsons, navy cheatline with thin
pinstripes along the windows, aluminium wings, tailplane and nacelles; grey nose cone, black anti-glare frame; red
stars (white rim) on the wings; the game's Russia flag on the fin (Flags.ts: blue border, white field, red star);
"RF-78653" and "ИЛ-76МД" as dark blocks; wing and tailplane tips in TEAM red (kit.TEAM['russia']).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from airkit import Body, TEAM, airfoil, box, flag_plate, lathe, loft, mat, obj, plate, rod, run, star_flat, star_plate, superellipse, surface  # noqa: E402

LENGTH = 46.59
WHITE = '#eef0f1'
BELLY = '#c3c9cf'
ALU = '#c9ccd0'


def materials():
    return dict(
        skin=mat('skin', WHITE, 0.5, panels=True),
        belly=mat('belly', BELLY, 0.55, panels=True),
        alu=mat('alu', ALU, 0.42, metal=0.35, panels=True),
        cone=mat('cone', '#8f969d', 0.5),
        black=mat('black', '#15171a', 0.6),
        glass=mat('glass', '#2a4058', 0.06, glass=True, ao=0),  # blue-black with a sky sheen: reads as glass at sprite size
        intake=mat('intake', '#121416', 0.9, ao=0.6),
        metal=mat('metal', '#8f8d88', 0.36, metal=0.85, ao=0.3),
        hot=mat('hot', '#5b5248', 0.5, metal=0.7),
        tyre=mat('tyre', '#1b1c1e', 0.85),
        strut=mat('strut', '#7d8a6c', 0.45, metal=0.4, ao=0.2),  # Soviet green gear legs
        hold=mat('hold', '#0c0d0f', 0.95, ao=0),
        navy=mat('navy', '#1f3f93', 0.5, ao=0),
        letter=mat('letter', '#2a2f3a', 0.6, ao=0),
        fblue=mat('fblue', '#0a3a9a', 0.55, ao=0),
        fwhite=mat('fwhite', '#ffffff', 0.55, ao=0),
        fred=mat('fred', '#c92216', 0.55, ao=0),
        team=mat('team', '#c8c8c8', 0.5),
        navred=mat('navred', '#ff2a2a', 0.4, emit=6.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=6.0, ao=0),
        beacon_off=mat('beacon_off', '#6a1414', 0.3, ao=0),
        beacon_on=mat('beacon_on', '#ff3020', 0.3, emit=40.0, ao=0),
    )


ZC = 4.45  # fuselage axis height with the gear down: belly 1.5 m above the ground
R = 2.9
STATIONS = [
    (23.3, -0.9, 0.05, 0.05), (23.12, -0.88, 0.5, 0.5), (22.6, -0.78, 1.15, 1.2), (21.8, -0.58, 1.8, 1.9),
    (20.6, -0.32, 2.35, 2.45), (19.0, -0.1, 2.78, 2.84), (17.2, 0.0, R, 2.95), (-7.5, 0.0, R, 2.95),
    (-11.5, 0.5, 2.76, 2.5), (-15.0, 1.15, 2.36, 1.9), (-18.5, 1.7, 1.76, 1.3), (-21.5, 2.1, 1.06, 0.8),
    (-23.0, 2.3, 0.46, 0.4), (-23.4, 2.35, 0.1, 0.1),
]
B = Body(STATIONS, ZC, 2.2)
TOP = ZC + 2.95


def fuselage(M):
    us = sorted({round(x, 3) for x in list(np.linspace(23.3, 17.2, 16)) + list(np.linspace(17.2, -7.5, 12)) + list(np.linspace(-7.5, -23.4, 18))}, reverse=True)
    B.skin('fuselage', M['skin'], us)
    # Light-grey belly: a second skin just proud of the lower half (below the cheatline).
    for s in (1, -1):
        pass
    rings = []
    for u in us[2:-2]:
        dz, hw, hh = B.station(u)
        ring = []
        for k in range(29):
            t = math.pi + k / 28 * math.pi  # lower half, right to left
            c, sn = math.cos(t), math.sin(t)
            a = math.copysign(abs(c) ** (2 / 2.2), c)
            b = math.copysign(abs(sn) ** (2 / 2.2), sn)
            zz = hh * b
            if zz > 0.2 * hh:
                zz = 0.2 * hh
            ring.append((u, (hw + 0.012) * a, ZC + dz + min(zz, hh * 0.2) - 0.0))
        rings.append(ring)
    # Open strip (no caps): quads between rings.
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = [(i * n + j, i * n + j + 1, (i + 1) * n + j + 1, (i + 1) * n + j) for i in range(len(rings) - 1) for j in range(n - 1)]
    obj('belly', verts, faces, M['belly'], smooth=40)
    # Grey weather-radar nose cone.
    B_cone = []
    for u in np.linspace(23.31, 22.25, 6):
        dz, hw, hh = B.station(u)
        B_cone.append(superellipse(u + 0.01, 0, ZC + dz, hw + 0.012, hh + 0.012, 2.2, 56))
    loft('cone', B_cone, M['cone'], smooth=50)
    # Chin fairing of the ground-mapping radar, under the navigator's glazing.
    loft('chin', [superellipse(u, 0, ZC - 2.45, w, h, 2.0, 32) for u, w, h in ((21.9, 0.1, 0.1), (21.2, 1.1, 0.55), (19.5, 1.6, 0.75), (16.5, 1.6, 0.75), (14.8, 0.1, 0.1))], M['belly'])
    # Big wing-centre-box fairing on the crown.
    loft('wing_fairing', [superellipse(u, 0, TOP - 0.25, w, h, 2.2, 40) for u, w, h in
                          ((7.4, 0.2, 0.12), (6.0, 2.2, 0.55), (3.5, 2.6, 0.8), (-3.5, 2.6, 0.8), (-7.0, 2.2, 0.5), (-9.6, 0.25, 0.1))], M['skin'])
    # Main-gear pods, long and low on both flanks.
    for s in (1, -1):
        loft(f'pod{s}', [superellipse(u, s * 2.35, ZC - 2.0, w, h, 2.6, 32) for u, w, h in
                         ((6.5, 0.15, 0.2), (5.2, 0.85, 1.05), (3.6, 1.0, 1.25), (-8.0, 1.0, 1.25), (-10.3, 0.8, 1.0), (-12.3, 0.15, 0.2))], M['belly'])
    for du in (13.5, 9.0, -3.0, -10.5):
        box(f'antenna{du}', (du, 0, TOP + 0.3), (0.7, 0.06, 0.55), M['black'], rot=(0, math.radians(-25), 0))
    for z, nm in ((TOP + 0.03, 'top'), (ZC - 2.97, 'bot')):
        lathe(f'beacon_{nm}_off', [(0, 0.001), (0.0, 0.2), (0.16, 0.16), (0.24, 0.001)], (-1.0, 0, z), 'v', M['beacon_off'], 'beacon_off', 16)
        lathe(f'beacon_{nm}_on', [(0, 0.001), (0.0, 0.22), (0.18, 0.18), (0.26, 0.001)], (-1.0, 0, z), 'v', M['beacon_on'], 'beacon_on', 16)


# ---- glazing and lines laid out along the skin outline (arc length round the nose at each height): every pane hugs the
# skin, both sides mirror exactly and the front panes meet on the centre line with no gap or overlap.

_OUTLINE = {}


def outline(z):
    """Plan outline of the skin at height z from the centre line at the nose aft to the tail: (arc length, u, |v|).
    Only where the fuselage ring really reaches height z (the nose falls away near the tip)."""
    key = round(z, 3)
    if key in _OUTLINE:
        return _OUTLINE[key]
    us, ys = [], []
    for u in np.concatenate((np.linspace(23.29, 19.0, 700), np.linspace(18.99, -23.0, 260))):
        dz, hw, hh = B.station(u)
        sz = (z - ZC - dz) / hh if hh > 0 else 2.0
        if abs(sz) >= 0.999:
            continue
        us.append(u)
        ys.append(hw * (1 - abs(sz) ** 2.2) ** (1 / 2.2))
    us = np.array([us[0]] + us)
    ys = np.array([0.0] + ys)
    lam = np.concatenate(([0.0], np.cumsum(np.hypot(np.diff(us), np.diff(ys)))))
    _OUTLINE[key] = (lam, us, ys)
    return _OUTLINE[key]


def lam_at(u, z):
    """Arc length (m from the centre line) where the outline at height z reaches station u."""
    lam, us, _ = outline(z)
    return float(np.interp(-u, -us, lam))


def _skin(l, z, side):
    lam, us, ys = outline(z)
    return np.array((float(np.interp(l, lam, us)), side * float(np.interp(l, lam, ys)), z))


def skin_point(l, z, side, off):
    """Skin point `l` m round from the centre line at height z on `side`, `off` m out along the true surface normal."""
    p = _skin(l, z, side)
    n = np.cross(_skin(l + 0.03, z, side) - _skin(max(0.0, l - 0.03), z, side), _skin(l, z + 0.03, side) - _skin(l, z - 0.03, side))
    n = n / (float(np.linalg.norm(n)) or 1.0)
    dz, _, _ = B.station(float(p[0]))
    if float(np.dot(n, p - np.array((p[0], 0.0, ZC + dz)))) < 0:
        n = -n
    q = p + n * off
    return (float(q[0]), float(q[1]), float(q[2]))


def skin_patch(name, l0, l1, z0, z1, side, material, off, nl=6, nz=3, top=None, low=None):
    """Pane / band on the skin between arc lengths l0..l1 and heights z0..z1 (top(l) / low(l) override them)."""
    verts, faces = [], []
    for i in range(nl + 1):
        l = l0 + (l1 - l0) * i / nl
        zb = low(l) if low else z0
        zt = top(l) if top else z1
        for j in range(nz + 1):
            verts.append(skin_point(l, zb + (zt - zb) * j / nz, side, off))
    for i in range(nl):
        for j in range(nz):
            a = i * (nz + 1) + j
            q = (a, a + nz + 1, a + nz + 2, a + 1)
            faces.append(q if side < 0 else q[::-1])
    return obj(name, verts, faces, material, smooth=0)


# Pilots' windscreen (Il-76MD): centre and corner panes a side in front, two side panes, two small eyebrow windows
# above; arc lengths per pane, 0.12 m mullions. The top edge falls slightly towards the rear.
SCREEN_Z0 = ZC + 1.25
PANES = ((0.06, 0.95), (1.07, 1.9), (2.02, 2.75), (2.87, 3.5))
EYEBROWS = ((1.2, 1.8), (1.95, 2.5))


def screen_top(l):
    return ZC + 2.08 - 0.12 * min(1.0, l / 3.5)


def cockpit(M):
    """Windscreen in a black anti-glare frame, the navigator's glazed nose, crew door and cabin windows."""
    for s in (1, -1):
        skin_patch(f'frame{s}', 0.0, PANES[-1][1] + 0.12, SCREEN_Z0 - 0.14, 0, s, M['black'], 0.03, nl=24, nz=3,
                   top=lambda l: screen_top(l) + 0.14)
        for i, (a, b) in enumerate(PANES):
            skin_patch(f'pane{s}{i}', a, b, SCREEN_Z0, 0, s, M['glass'], 0.06, nl=8, nz=3, top=screen_top)
        for i, (a, b) in enumerate(EYEBROWS):
            skin_patch(f'eyebrow_frame{s}{i}', a - 0.06, b + 0.06, ZC + 2.22, ZC + 2.56, s, M['black'], 0.03, nl=6, nz=1)
            skin_patch(f'eyebrow{s}{i}', a, b, ZC + 2.28, ZC + 2.5, s, M['glass'], 0.06, nl=6, nz=1)
        # Navigator's glazed nose aft of the radar cone: a lattice of panes (3 rows x 5) in a black frame.
        rows = ((ZC - 1.55, ZC - 1.17), (ZC - 1.07, ZC - 0.69), (ZC - 0.59, ZC - 0.25))
        start = max(lam_at(22.1, z) for z, _ in rows)
        skin_patch(f'navframe{s}', start - 0.08, start + 2.55, ZC - 1.63, ZC - 0.17, s, M['black'], 0.03, nl=16, nz=4)
        for j, (z0, z1) in enumerate(rows):
            for i in range(5):
                a = start + i * 0.5
                skin_patch(f'nav{s}{i}{j}', a, a + 0.4, z0, z1, s, M['glass'], 0.055, nl=3, nz=2)
        # Crew door, cabin windows.
        B.patch(f'door{s}', 16.3, 15.3, ZC - 1.9, ZC + 0.3, s, M['letter'], off=0.03, nu=2, nz=3)
        for i, du in enumerate((13.6, 12.6, 4.5)):
            B.patch(f'port{s}{i}', du + 0.2, du - 0.2, ZC + 0.95, ZC + 1.3, s, M['glass'], off=0.035, nu=1, nz=1)


def cheatline(M):
    """Navy band along the windows, nose to tail, edged by thin pinstripes in TEAM red (the faction identity line,
    ART_GUIDE: the exact TEAM colour, recoloured on capture), both sides."""
    for s in (1, -1):
        for z0, z1, nm, m in ((0.42, 0.8, 'band', M['navy']), (0.92, 1.01, 'pin_hi', M['team']), (0.21, 0.3, 'pin_lo', M['team'])):
            l0 = lam_at(21.9, ZC + z0)
            l1 = lam_at(-21.0, ZC + z0)
            skin_patch(f'{nm}{s}', l0, l1, ZC + z0, ZC + z1, s, m, 0.022, nl=120, nz=1)
        # "ИЛ-76МД" above the band, forward: dark blocks.
        u = 14.2
        for _ in range(7):
            B.patch(f'type{s}{u:.2f}', u, u - 0.3, ZC + 1.0, ZC + 1.35, s, M['letter'], off=0.03, nu=1, nz=1)
            u -= 0.42


def wing_le(v):
    return 4.5 - (abs(v) - 1.8) * math.tan(math.radians(27))


def wing_z(v):
    return TOP - 0.45 - (abs(v) - 1.8) * math.tan(math.radians(3))


def wing_chord(v):
    return 9.2 + (3.0 - 9.2) * (abs(v) - 1.8) / (25.25 - 1.8)


def wings(M):
    for s in (1, -1):
        secs = [((wing_le(v), s * v, wing_z(v)), (-wing_chord(v), 0, 0), (0, 0, 1), 0.14 + (0.1 - 0.14) * (v - 1.8) / 23.45) for v in (1.8, 6.0, 12.0, 18.0, 24.6)]
        surface(f'wing{s}', secs, M['alu'], camber=0.02)
        # TEAM-red wingtip cap (the real one is red / orange).
        v0, v1 = 24.6, 25.25
        surface(f'tip{s}', [((wing_le(v0), s * v0, wing_z(v0)), (-wing_chord(v0), 0, 0), (0, 0, 1), 0.1),
                            ((wing_le(v1) - 0.25, s * v1, wing_z(v1)), (-wing_chord(v1) + 0.5, 0, 0), (0, 0, 1), 0.06)], M['team'], camber=0.0)
        lathe(f'nav{s}', [(0, 0.001), (0, 0.14), (0.22, 0.001)], (wing_le(v1) - 0.5, s * (v1 + 0.02), wing_z(v1)), 'v',
              M['navred'] if s > 0 else M['navgreen'], segs=12)
        for v in (4.2, 8.8, 15.5, 19.5, 22.6):
            le, c, z = wing_le(v), wing_chord(v), wing_z(v)
            te = le - c
            loft(f'flaptrack{s}{v}', [superellipse(u, s * v, z - 0.22 + d, w, h, 2.0, 16) for u, w, h, d in
                                       ((te + c * 0.45, 0.03, 0.03, 0.05), (te + c * 0.25, 0.18, 0.3, -0.1), (te - 0.5, 0.15, 0.24, -0.1), (te - 1.4, 0.03, 0.03, -0.02))], M['alu'])
        # Red star (white rim) on the outer wing top and bottom.
        v = 18.5
        u0 = wing_le(v) - wing_chord(v) * 0.42
        z = wing_z(v) + wing_chord(v) * 0.072 + 0.03
        star_flat(f'wstar_w{s}', u0, s * v, z, 1.15, 0.46, 5, M['fwhite'])
        star_flat(f'wstar_r{s}', u0, s * v, z + 0.012, 0.95, 0.38, 5, M['fred'])
        for vv in (6.9, 12.4):
            engine(M, s, vv)


def engine(M, s, v):
    le, z = wing_le(v), wing_z(v)
    ax = (le + 3.2, s * v, z - 1.9)
    t = f'{s}{v}'
    # D-30KP: short fan cowl, then the core cowl with the reverser cascade, metal nozzle and mixer cone.
    lathe(f'cowl{t}', [(-0.02, 0.84), (0.0, 0.92), (0.12, 1.0), (0.45, 1.04), (2.6, 1.04), (3.3, 0.98), (4.3, 0.86), (4.8, 0.78)], ax, 'u', M['alu'])
    lathe(f'intake{t}', [(-0.02, 0.84), (0.2, 0.78), (0.75, 0.76), (0.76, 0.001)], ax, 'u', M['intake'])
    lathe(f'spinner{t}', [(0.74, 0.3), (0.5, 0.16), (0.3, 0.001)], ax, 'u', M['metal'])
    lathe(f'cascade{t}', [(2.7, 1.055), (3.15, 1.04), (3.15, 1.01), (2.7, 1.03)], ax, 'u', M['black'], smooth=0)
    lathe(f'nozzle{t}', [(4.75, 0.79), (5.35, 0.66), (5.35, 0.55), (4.75, 0.6)], ax, 'u', M['metal'])
    lathe(f'plug{t}', [(5.0, 0.52), (5.6, 0.32), (6.0, 0.03), (6.01, 0.001)], ax, 'u', M['hot'])
    rings = []
    for le_, chord in (((ax[0] - 0.5, ax[1], ax[2] + 0.95), -4.2), ((le + 0.3, ax[1], z - 0.15), -3.6)):
        rings.append([(le_[0] + chord * -x * -1 if False else le_[0] + chord * x, le_[1] + s * y * abs(chord), le_[2]) for x, y in airfoil(0.07, 0)])
    loft(f'pylon{t}', rings, M['alu'], smooth=30)


def fin_half(chord, frac=0.4, tc=0.11):
    x = frac
    return tc * chord * 5 * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)


def tail(M):
    root = (-11.2, 0, TOP - 0.1)
    h, sweep, c0, c1 = 6.6, 43, 8.6, 4.6
    tipx = root[0] - h * math.tan(math.radians(sweep))
    surface('fin', [(root, (-c0, 0, 0), (0, 1, 0), 0.11), ((tipx, 0, root[2] + h), (-c1, 0, 0), (0, 1, 0), 0.1)], M['skin'], camber=0.0)
    loft('dorsal', [superellipse(u, 0, TOP - 0.05, w, hh, 2.0, 16) for u, w, hh in ((-7.0, 0.05, 0.05), (-9.5, 0.3, 0.4), (-12.0, 0.4, 0.8), (-13.0, 0.05, 0.05))], M['skin'])
    zt = root[2] + h - 0.05
    for s in (1, -1):
        le0 = tipx + 0.2
        tipu = le0 - 8.7 * math.tan(math.radians(32))
        surface(f'tailplane{s}', [((le0, s * 0.2, zt), (-4.8, 0, 0), (0, 0, 1), 0.09), ((tipu, s * 8.3, zt - 0.2), (-2.2, 0, 0), (0, 0, 1), 0.08)], M['alu'], camber=0.0)
        surface(f'tailtip{s}', [((tipu, s * 8.3, zt - 0.2), (-2.2, 0, 0), (0, 0, 1), 0.08), ((tipu - 0.3, s * 8.75, zt - 0.22), (-1.7, 0, 0), (0, 0, 1), 0.05)], M['team'], camber=0.0)
    # Long bullet fairing reaching well ahead of the fin top.
    loft('bullet', [superellipse(u, 0, zt, r, r, 2.0, 24) for u, r in ((tipx + 3.6, 0.02), (tipx + 2.6, 0.36), (tipx + 0.5, 0.5), (tipx - 5.0, 0.45), (tipx - 6.0, 0.05))], M['skin'])
    return root, h, sweep, c0, c1


def fin_markings(M, root, h, sweep, c0, c1):
    at = lambda z: (root[0] - (z - root[2]) * math.tan(math.radians(sweep)), c0 + (c1 - c0) * (z - root[2]) / h)
    zf = root[2] + h * 0.62
    le, c = at(zf)
    fu = le - c * 0.5
    for s in (1, -1):
        y = s * (fin_half(c) + 0.03)
        W, H = 2.2, 1.35
        flag_plate(f'flagb{s}', fu, y, zf, W, H, s, M['fblue'])
        flag_plate(f'flagw{s}', fu, y, zf, W - 2 * 0.06 * H, H - 2 * 0.06 * H, s, M['fwhite'], off=0.01)
        star_plate(f'flagstar{s}', fu, y, zf + 0.01 * H, H * 0.335, H * 0.335 * 0.4, 5, s, M['fred'], off=0.02)
        # "RF-78653" below the flag: dark blocks.
        zn = zf - 1.35
        le2, c2 = at(zn)
        y2 = s * (fin_half(c2) + 0.03)
        for i in range(8):
            u0 = le2 - c2 * 0.18 - i * 0.42
            flag_plate(f'serial{s}{i}', u0, y2, zn, 0.28, 0.36, s, M['letter'])


def gear(M):
    def wheel(name, c, r=0.6, w=0.36):
        lathe(name, [(-w / 2, 0.001), (-w / 2, r * 0.8), (-w / 2 + 0.05, r), (w / 2 - 0.05, r), (w / 2, r * 0.8), (w / 2, 0.001)], c, 'v', M['tyre'], 'gear', 24)
        lathe(name + 'hub', [(-w / 2 - 0.01, 0.001), (-w / 2 - 0.01, r * 0.45), (w / 2 + 0.01, r * 0.45), (w / 2 + 0.01, 0.001)], c, 'v', M['strut'], 'gear', 16)
    for du in (0.0, 0.0):
        pass
    for dy in (-0.75, -0.3, 0.3, 0.75):
        wheel(f'nosewheel{dy}', (17.2, dy, 0.5), 0.5, 0.3)
    rod('nosestrut', (17.2, 0, 0.5), (17.4, 0, ZC - 2.7), 0.13, M['strut'], 'gear')
    for s in (1, -1):
        for u in (1.6, -2.4):
            for du in (0.65, -0.65):
                for dy in (0.0, 0.42):
                    wheel(f'main{s}{u}{du}{dy}', (u + du, s * (2.05 + dy), 0.6))
            rod(f'mainstrut{s}{u}', (u, s * 2.26, 0.6), (u + 0.2, s * 2.35, ZC - 2.7), 0.16, M['strut'], 'gear')


def ramp(M):
    hinge_u = -11.6
    dz, hw, hh = B.station(hinge_u)
    hz = ZC + dz - hh + 0.1
    length = 5.6
    ang = math.asin(min(1.0, hz / length))
    end_u = hinge_u - length * math.cos(ang)
    w = 1.75
    pts = [(hinge_u, -w, hz), (hinge_u, w, hz), (end_u, w, 0.05), (end_u, -w, 0.05)]
    verts = pts + [(p[0], p[1], p[2] + 0.16) for p in pts]
    obj('ramp', verts, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['belly'], 'ramp', smooth=0)
    hold = []
    for u in np.linspace(hinge_u, -20.0, 8):
        d, ww, h2 = B.station(u)
        hold.append([(u, -ww * 0.7, ZC + d - h2 + 0.05), (u, ww * 0.7, ZC + d - h2 + 0.05)])
    verts = [p for pair in hold for p in pair]
    obj('hold', verts, [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(hold) - 1)], M['hold'], 'ramp', smooth=0)


def build():
    M = materials()
    fuselage(M)
    cockpit(M)
    cheatline(M)
    wings(M)
    fin_markings(M, *tail(M))
    gear(M)
    ramp(M)


def closeup(path):
    """Close look at the cockpit (IL76_CLOSEUP=<file.png>): checks the windscreen, nothing written to the sheet."""
    import bpy
    from mathutils import Vector
    import airkit

    sc = airkit.stage(1.0)
    build()
    sc.render.resolution_x, sc.render.resolution_y = 1200, 800
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    for name, loc in (('front', (37.0, 13.0, 13.0)), ('side', (20.0, 20.0, 11.0))):
        cam = bpy.data.cameras.new(name)
        cam.type = 'ORTHO'
        cam.ortho_scale = 10
        co = bpy.data.objects.new(name, cam)
        sc.collection.objects.link(co)
        co.location = loc
        target = Vector((20.5, 0, ZC + 0.5))
        co.rotation_euler = (target - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = co
        sc.render.filepath = path.replace('.png', f'-{name}.png')
        bpy.ops.render.render(write_still=True)


if os.environ.get('IL76_CLOSEUP'):
    closeup(os.environ['IL76_CLOSEUP'])
else:
    run('il76', 'il76-russia', LENGTH, build, team_mask=True)
