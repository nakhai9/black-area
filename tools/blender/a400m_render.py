"""
Airbus A400M Atlas (Europe transport): self-contained Blender model + sprite sheet (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/a400m_render.py -- [SAMPLES] [--preview]

Writes ui/public/sprites/a400m-europe.png (then `python tools/to_webp.py`): 192 px cells, 32 RA2 facings (column 0 =
nose up the screen, clockwise) x 9 rows (0 parked, 1-2 flying, 3 ramp, 4-5 banked, 6-7 crashing, 8 shadow; airkit.ROWS,
with the propeller blades turned between rows 1 and 2).

Real numbers (Airbus A400M, three-view + blueprint): length 45.1 m, span 42.4 m, height 14.7 m, fuselage ~5.6 m
across; high wing, ~15 deg leading-edge sweep, slight anhedral; four Europrop TP400-D6 turboprops in long underslung
nacelles with a chin intake under the spinner; eight-blade scimitar propellers (FH386, 5.33 m), the two on each wing
turning opposite ways ("down between engines": the blades sweep back against their own rotation); T-tail with a
bullet fairing; blunt round nose with a black radome, six-pane wrap-round windscreen in thick bolted frames, wipers,
refuelling probe over the cockpit; main-gear sponsons (three axles of two wheels a side), twin nose wheels; rear ramp
under the upswept tail.
Drawn: fuselage 1.12x fuller than true (ART_GUIDE: full body), the rest true scale. Axes: u nose, v left, z up, metres.
Paint (photos): light military grey all over, black radome and spinners, dark-grey blades, the yellow propeller-plane
warning line on the flanks; the game's Europe flag on the fin (Flags.ts: blue field, yellow dodecagon); blue roundel
with the yellow dodecagon on the wing tops and rear flanks; TEAM purple on the bullet fairing's nose cone
(kit.TEAM['europe']); the air-force name as dark blocks.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import airkit  # noqa: E402
from airkit import Body, TEAM, airfoil, box, flag_plate, lathe, loft, mat, obj, plate, rod, run, superellipse, surface  # noqa: E402

LENGTH = 45.1
GREY = '#8a9096'      # light military grey (Luftwaffe photos)
BLACK = '#17191c'     # radome, spinners
BLADE = '#2d3034'     # propeller blades


def materials():
    M = dict(
        skin=mat('skin', GREY, 0.58, panels=True),
        radome=mat('radome', BLACK, 0.42),
        black=mat('black', '#16181b', 0.6),
        frame=mat('frame', '#3b4046', 0.45, metal=0.5, ao=0.2),
        glass=mat('glass', '#1c2e2c', 0.06, glass=True, ao=0),
        wiper=mat('wiper', '#0e0f11', 0.5, metal=0.3, ao=0),
        intake=mat('intake', '#101214', 0.9, ao=0.6),
        spinner=mat('spinner', BLACK, 0.35, metal=0.2),
        blade=mat('blade', BLADE, 0.5, metal=0.1),
        metal=mat('metal', '#8f8d88', 0.36, metal=0.85, ao=0.3),
        hot=mat('hot', '#5b5248', 0.5, metal=0.7),
        tyre=mat('tyre', '#1b1c1e', 0.85),
        strut=mat('strut', '#b5b8bc', 0.35, metal=0.8, ao=0.2),
        hold=mat('hold', '#0c0d0f', 0.95, ao=0),
        letter=mat('letter', '#30353b', 0.6, ao=0),
        yellow=mat('yellow', '#e2b81c', 0.55, ao=0),
        eblue=mat('eblue', '#003399', 0.55, ao=0),
        eyellow=mat('eyellow', '#ffcc00', 0.55, ao=0),
        team=mat('team', TEAM['europe'], 0.5, ao=0),
        navred=mat('navred', '#ff2a2a', 0.4, emit=6.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=6.0, ao=0),
        beacon_off=mat('beacon_off', '#6a1414', 0.3, ao=0),
        beacon_on=mat('beacon_on', '#ff3020', 0.3, emit=40.0, ao=0),
    )
    # Windscreen coating: a thin film gives the gold / violet anti-glare and heating-layer sheen of the real panes.
    bsdf = M['glass'].node_tree.nodes['Principled BSDF']
    for k, v in (('Thin Film Thickness', 420.0), ('Thin Film IOR', 1.9)):
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v
    return M


ZC = 4.5
# Fuselage stations (u, axis dz, half width, half height): blunt round nose sloping up to the cockpit, long parallel
# hold, belly sweeping up to the tail.
STATIONS = [
    (22.55, -0.95, 0.05, 0.05), (22.45, -0.93, 0.62, 0.62), (22.05, -0.82, 1.38, 1.42), (21.3, -0.62, 2.05, 2.12),
    (20.2, -0.36, 2.62, 2.7), (18.7, -0.12, 3.0, 3.12), (16.8, 0.0, 3.15, 3.3), (-6.5, 0.0, 3.15, 3.3),
    (-10.0, 0.5, 3.02, 2.88), (-13.5, 1.2, 2.62, 2.25), (-17.0, 1.9, 2.02, 1.55), (-20.2, 2.38, 1.25, 0.92),
    (-22.0, 2.58, 0.5, 0.4), (-22.55, 2.62, 0.1, 0.1),
]
N_SE = 2.3
B = Body(STATIONS, ZC, N_SE)
TOP = ZC + 3.3


def fuselage(M):
    us = sorted({round(x, 3) for x in list(np.linspace(22.55, 16.8, 22)) + list(np.linspace(16.8, -6.5, 12)) + list(np.linspace(-6.5, -22.55, 18))}, reverse=True)
    B.skin('fuselage', M['skin'], us)
    # Radome: a smooth round black cap just proud of the skin (dense rings: no facets on the curve).
    cone = []
    for u in np.linspace(22.56, 20.9, 12):
        dz, hw, hh = B.station(u)
        cone.append(superellipse(u + 0.012, 0, ZC + dz, hw + 0.014, hh + 0.014, N_SE, 64))
    loft('radome', cone, M['radome'], smooth=60)
    loft('wing_fairing', [superellipse(u, 0, TOP - 0.3, w, h, 2.2, 40) for u, w, h in
                          ((7.0, 0.2, 0.12), (5.6, 2.4, 0.55), (3.2, 2.9, 0.78), (-3.0, 2.9, 0.78), (-6.0, 2.4, 0.5), (-8.2, 0.25, 0.1))], M['skin'])
    for s in (1, -1):
        loft(f'sponson{s}', [superellipse(u, s * 2.6, ZC - 2.3, w, h, 2.6, 32) for u, w, h in
                             ((5.0, 0.15, 0.2), (3.8, 0.9, 1.1), (2.4, 1.05, 1.3), (-6.4, 1.05, 1.3), (-8.4, 0.85, 1.05), (-10.2, 0.15, 0.2))], M['skin'])
    # Refuelling probe over the cockpit (left of the crown), reaching past the nose.
    rod('probe', (16.6, 0.55, TOP + 0.05), (24.4, 0.55, ZC + 2.35), 0.09, M['metal'])
    rod('probe_base', (16.0, 0.55, TOP - 0.1), (18.2, 0.55, TOP + 0.02), 0.2, M['skin'])
    for du in (12.5, 8.0, -3.0, -10.5):
        box(f'antenna{du}', (du, 0, TOP + 0.28), (0.65, 0.06, 0.5), M['black'], rot=(0, math.radians(-25), 0))
    lathe('satcom', [(0, 0.001), (0, 0.7), (0.16, 0.58), (0.28, 0.001)], (-9.8, 0, TOP - 0.45), 'v', M['skin'], segs=24)
    for z, nm in ((TOP + 0.03, 'top'), (ZC - 3.32, 'bot')):
        lathe(f'beacon_{nm}_off', [(0, 0.001), (0.0, 0.2), (0.16, 0.16), (0.24, 0.001)], (-1.0, 0, z), 'v', M['beacon_off'], 'beacon_off', 16)
        lathe(f'beacon_{nm}_on', [(0, 0.001), (0.0, 0.22), (0.18, 0.18), (0.26, 0.001)], (-1.0, 0, z), 'v', M['beacon_on'], 'beacon_on', 16)


def nose_u(y, z):
    """Most-forward u where the skin reaches half width |y| at height z (the windscreen sits on the nose slope)."""
    u = 17.0
    for uu in np.linspace(17.0, 22.4, 220):
        if B.half_width(uu, z) >= abs(y) + 0.02:
            u = uu
    return u


def front_pane(name, y0, y1, z0, z1, off, material, ny=4, nz=3):
    """A curved pane across the nose front: grid of skin points pushed `off` forward / outward."""
    verts, faces = [], []
    for i in range(ny + 1):
        for j in range(nz + 1):
            y = y0 + (y1 - y0) * i / ny
            z = z0 + (z1 - z0) * j / nz
            u = nose_u(y, z)
            dz, hw, hh = B.station(u)
            # Outward: mostly forward on the slope, a little up and to the side.
            n = np.array((1.0, 0.35 * y / max(hw, 0.1), 0.45 * (z - ZC - dz) / max(hh, 0.1)))
            n /= np.linalg.norm(n)
            verts.append(tuple(np.array((u, y, z)) + n * off))
    for i in range(ny):
        for j in range(nz):
            a = i * (nz + 1) + j
            faces.append((a, a + 1, a + nz + 2, a + nz + 1))
    return obj(name, verts, faces, material, smooth=0)


def cockpit(M):
    """Six-pane wrap-round windscreen: thick bolted frames under real panes, two wipers, crew door, small windows."""
    z0, z1 = ZC + 1.3, ZC + 2.25
    # Front pair: frame first (larger, just proud), then the glass inset in it, then the wipers along the lower edge.
    front_pane('frame_front', -1.3, 1.3, z0 - 0.12, z1 + 0.1, 0.03, M['frame'], ny=8)
    for k, (a, b) in enumerate(((-1.18, -0.07), (0.07, 1.18))):
        front_pane(f'windscreen{k}', a, b, z0, z1, 0.07, M['glass'])
        za = z0 + 0.08
        p0 = np.array((nose_u(a + 0.12, za) + 0.1, a + 0.12, za))
        p1 = np.array((nose_u(b - 0.12, za) + 0.1, b - 0.12, za + 0.05))
        rod(f'wiper{k}', tuple(p0), tuple(p1), 0.045, M['wiper'], segs=6)
        hub = p0 if abs(a) < abs(b) else p1
        rod(f'wiper_arm{k}', tuple(hub + np.array((0.05, 0, -0.14))), tuple(hub), 0.06, M['wiper'], segs=6)
    for s in (1, -1):
        # Corner and side panes along the cockpit flanks, each in its own frame (frames overlap into one bar).
        panes = [(20.85, 20.15), (20.05, 19.35)]
        for i, (a, b) in enumerate(panes):
            B.patch(f'frame{s}{i}', a + 0.12, b - 0.12, z0 - 0.12, z1 + 0.1, s, M['frame'], off=0.03, nu=3, nz=3)
            B.patch(f'pane{s}{i}', a, b, z0, z1, s, M['glass'], off=0.065, nu=3, nz=3)
        # Crew door with its window, the cabin portholes, the yellow propeller-plane warning line.
        B.patch(f'door{s}', 16.4, 15.4, ZC - 2.25, ZC + 0.2, s, M['letter'], off=0.028, nu=2, nz=3)
        B.patch(f'doorwin{s}', 16.1, 15.7, ZC - 0.5, ZC - 0.05, s, M['glass'], off=0.04, nu=1, nz=1)
        for i, du in enumerate((12.0, 6.5, -4.5)):
            B.patch(f'port{s}{i}', du + 0.22, du - 0.22, ZC + 0.4, ZC + 0.85, s, M['glass'], off=0.03, nu=1, nz=1)
        B.patch(f'propline{s}', 10.9, 10.72, ZC - 2.6, ZC + 2.6, s, M['yellow'], off=0.03, nu=1, nz=8)
        # Air-force name as dark blocks along the forward fuselage.
        u = 15.0
        for _ in range(9):
            B.patch(f'letter{s}{u:.2f}', u, u - 0.34, ZC + 0.95, ZC + 1.45, s, M['letter'], off=0.03, nu=1, nz=1)
            u -= 0.46


def roundel_side(M, s, cu, cz, r):
    disc, dodec = [], []
    for k in range(24):
        a = k / 24 * 2 * math.pi
        disc.append(B.point(cu + r * math.cos(a), s, cz + r * math.sin(a), 0.03))
    for k in range(12):
        a = -math.pi / 2 + k * math.pi / 6
        dodec.append(B.point(cu + r * 0.6 * math.cos(a), s, cz + r * 0.6 * math.sin(a), 0.045))
    plate(f'roundel{s}', disc[::s], (0, s, 0), M['eblue'], off=0.0)
    plate(f'dodec{s}', dodec[::s], (0, s, 0), M['eyellow'], off=0.0)


V_ROOT, V_TIP = 2.1, 21.2


def wing_le(v):
    return 4.4 - (abs(v) - V_ROOT) * math.tan(math.radians(15))


def wing_z(v):
    return TOP - 0.45 - (abs(v) - V_ROOT) * math.tan(math.radians(1.5))


def wing_chord(v):
    return 7.6 + (2.6 - 7.6) * (abs(v) - V_ROOT) / (V_TIP - V_ROOT)


ENGINES = (7.0, 12.6)


def wings(M):
    for s in (1, -1):
        secs = [((wing_le(v), s * v, wing_z(v)), (-wing_chord(v), 0, 0), (0, 0, 1), 0.15 + (0.11 - 0.15) * (v - V_ROOT) / (V_TIP - V_ROOT))
                for v in (V_ROOT, 6.0, 10.0, 15.0, V_TIP)]
        surface(f'wing{s}', secs, M['skin'], camber=0.025)
        lathe(f'nav{s}', [(0, 0.001), (0, 0.13), (0.2, 0.001)], (wing_le(V_TIP) - 0.4, s * (V_TIP + 0.05), wing_z(V_TIP)), 'v',
              M['navred'] if s > 0 else M['navgreen'], segs=12)
        for v in (4.4, 9.8, 15.4, 18.6):
            le, c, z = wing_le(v), wing_chord(v), wing_z(v)
            te = le - c
            loft(f'flaptrack{s}{v}', [superellipse(u, s * v, z - 0.22 + d, w, h, 2.0, 16) for u, w, h, d in
                                       ((te + c * 0.4, 0.03, 0.03, 0.05), (te + c * 0.22, 0.17, 0.28, -0.1), (te - 0.4, 0.15, 0.23, -0.1), (te - 1.1, 0.03, 0.03, -0.02))], M['skin'])
        # Wing-top roundel (blue disc, yellow dodecagon).
        v = 17.0
        u0 = wing_le(v) - wing_chord(v) * 0.45
        z = wing_z(v) + wing_chord(v) * 0.08 + 0.03
        disc = [(u0 + 1.0 * math.cos(a), s * v + 1.0 * math.sin(a), z) for a in np.linspace(0, 2 * math.pi, 24, endpoint=False)]
        plate(f'wroundel{s}', disc, (0, 0, 1), M['eblue'], off=0.0)
        dod = [(u0 + 0.6 * math.cos(a), s * v + 0.6 * math.sin(a), z + 0.012) for a in (math.pi / 2 + k * math.pi / 6 for k in range(12))]
        plate(f'wdodec{s}', dod, (0, 0, 1), M['eyellow'], off=0.0)
        for i, v in enumerate(ENGINES):
            # Inner and outer propellers turn opposite ways; the pair on the other wing mirrors them.
            engine(M, s, v, s * (1 if i == 0 else -1))


def nacelle_z(v):
    return wing_z(v) - 0.85


def engine(M, s, v, spin):
    """TP400 nacelle hanging under and ahead of the wing, chin intake, exhaust over the wing, 8-blade propeller."""
    le, c, zw = wing_le(v), wing_chord(v), wing_z(v)
    zn = nacelle_z(v)
    up = le + 3.9  # propeller plane
    y = s * v
    t = f'{s}{v}'
    # Long nacelle: rounder at the front, deeper than wide, tapering under the trailing edge.
    rings = []
    for u, hw, hh, dz in ((up - 0.15, 0.5, 0.52, 0.05), (up - 0.6, 0.7, 0.85, 0.0), (up - 1.8, 0.82, 1.08, 0.0), (le, 0.82, 1.1, 0.05),
                          (le - c * 0.55, 0.66, 0.82, 0.2), (le - c - 0.6, 0.32, 0.36, 0.35), (le - c - 1.5, 0.06, 0.06, 0.4)):
        rings.append(superellipse(u, y, zn + dz, hw, hh, 2.3, 40))
    loft(f'nacelle{t}', rings, M['skin'], smooth=40)
    # Chin intake under the spinner: a lipped scoop with a dark duct.
    lathe(f'chin{t}', [(-0.02, 0.32), (0.0, 0.4), (0.25, 0.44), (1.6, 0.38), (2.4, 0.06)], (up - 0.35, y, zn - 0.78), 'u', M['skin'], segs=24)
    lathe(f'chinduct{t}', [(-0.01, 0.32), (0.3, 0.29), (0.31, 0.001)], (up - 0.35, y, zn - 0.78), 'u', M['intake'], segs=24)
    # Exhaust stub on the outboard upper side, angled back over the wing.
    ex = np.array((le + 0.9, y + s * 0.55 * (1 if spin * s > 0 else -1), zn + 0.75))
    lathe(f'exhaust{t}', [(0, 0.24), (0.55, 0.26), (0.56, 0.18), (0.0, 0.17)], tuple(ex), 'u', M['hot'], segs=18)
    # Spinner: black, pointed, ahead of the blades.
    lathe(f'spinner{t}', [(0.0, 0.001), (0.18, 0.2), (0.5, 0.38), (0.9, 0.5), (1.25, 0.52)], (up + 1.05, y, zn + 0.05), 'u', M['spinner'], segs=36, smooth=60)
    for grp, phase in (('propA', 0.0), ('propB', math.pi / 8)):
        propeller(M, f'{t}{grp}', (up, y, zn + 0.05), spin, phase, grp)


def propeller(M, name, hub, spin, phase, group):
    """Eight scimitar blades: the tips sweep back against the rotation `spin` (+1 / -1 seen from the front)."""
    R = 2.66
    hub = np.array(hub, float)
    ax = np.array((1.0, 0, 0))
    for k in range(8):
        phi0 = phase + k * math.pi / 4
        secs = []
        for x in np.linspace(0.18, 1.0, 11):
            r = R * x
            chord = (0.24 + 0.26 * math.sin(math.pi * min(1.0, (x - 0.1) / 0.85))) * (1 - 0.55 * x ** 8)
            phi = phi0 - spin * 0.42 * x ** 2.3  # scimitar sweep, trailing the rotation
            radial = np.array((0.0, math.cos(phi), math.sin(phi)))
            tang = spin * np.array((0.0, -math.sin(phi), math.cos(phi)))  # rotation direction
            beta = math.radians(52 - 30 * x)  # blade twist
            d = -(math.cos(beta) * tang + math.sin(beta) * ax)  # leading edge -> trailing edge
            p = hub + radial * r - ax * 0.08 * x
            le = p - d * chord * 0.4
            upv = np.cross(d, radial)
            secs.append((tuple(le), tuple(d * chord), tuple(upv), 0.08 - 0.045 * x))
        surface(f'blade{name}{k}', secs, M['blade'], group, camber=0.03, smooth=40)


def fin_half(chord, frac=0.4, tc=0.11):
    x = frac
    return tc * chord * 5 * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)


def tail(M):
    root = (-11.2, 0, TOP - 0.1)
    h, sweep, c0, c1 = 6.6, 38, 8.8, 5.0
    tipx = root[0] - h * math.tan(math.radians(sweep))
    surface('fin', [(root, (-c0, 0, 0), (0, 1, 0), 0.11), ((tipx, 0, root[2] + h), (-c1, 0, 0), (0, 1, 0), 0.1)], M['skin'], camber=0.0)
    loft('dorsal', [superellipse(u, 0, TOP - 0.05, w, hh, 2.0, 16) for u, w, hh in ((-7.5, 0.05, 0.05), (-9.8, 0.3, 0.4), (-12.0, 0.4, 0.8), (-13.0, 0.05, 0.05))], M['skin'])
    zt = root[2] + h - 0.05
    for s in (1, -1):
        le0 = tipx + 0.3
        tipu = le0 - 9.6 * math.tan(math.radians(30))
        surface(f'tailplane{s}', [((le0, s * 0.2, zt), (-5.0, 0, 0), (0, 0, 1), 0.09), ((tipu, s * 9.6, zt + 0.2), (-2.2, 0, 0), (0, 0, 1), 0.08)], M['skin'], camber=0.0)
    loft('bullet', [superellipse(u, 0, zt, r, r, 2.0, 24) for u, r in ((tipx + 1.7, 0.02), (tipx + 0.9, 0.4), (tipx - 1.0, 0.52), (tipx - 6.4, 0.46), (tipx - 7.4, 0.05))], M['skin'])
    loft('team_cap', [superellipse(u, 0, zt, r + 0.015, r + 0.015, 2.0, 24) for u, r in ((tipx + 1.72, 0.02), (tipx + 0.9, 0.4), (tipx + 0.2, 0.5))], M['team'])
    return root, h, sweep, c0, c1


def fin_markings(M, root, h, sweep, c0, c1):
    at = lambda z: (root[0] - (z - root[2]) * math.tan(math.radians(sweep)), c0 + (c1 - c0) * (z - root[2]) / h)
    zf = root[2] + h * 0.66
    le, c = at(zf)
    fu = le - c * 0.42
    for s in (1, -1):
        y = s * (fin_half(c) + 0.03)
        W, H = 2.2, 1.45
        flag_plate(f'flag{s}', fu, y, zf, W, H, s, M['eblue'])
        dod = [(fu + H * 0.32 * math.cos(a), y, zf + H * 0.32 * math.sin(a)) for a in (math.pi / 2 + k * math.pi / 6 for k in range(12))]
        plate(f'flagdodec{s}', dod[::s], (0, s, 0), M['eyellow'], off=0.015)
        zn = zf - 1.6
        le2, c2 = at(zn)
        y2 = s * (fin_half(c2) + 0.03)
        for i in range(5):
            flag_plate(f'serial{s}{i}', le2 - c2 * 0.25 - i * 0.55, y2, zn, 0.36, 0.6, s, M['letter'])
        roundel_side(M, s, -10.0, ZC - 0.1, 0.9)


def gear(M):
    def wheel(name, c, r=0.6, w=0.36):
        lathe(name, [(-w / 2, 0.001), (-w / 2, r * 0.8), (-w / 2 + 0.05, r), (w / 2 - 0.05, r), (w / 2, r * 0.8), (w / 2, 0.001)], c, 'v', M['tyre'], 'gear', 24)
        lathe(name + 'hub', [(-w / 2 - 0.01, 0.001), (-w / 2 - 0.01, r * 0.45), (w / 2 + 0.01, r * 0.45), (w / 2 + 0.01, 0.001)], c, 'v', M['strut'], 'gear', 16)
    for dy in (-0.3, 0.3):
        wheel(f'nosewheel{dy}', (17.6, dy, 0.5), 0.5, 0.28)
    rod('nosestrut', (17.6, 0, 0.5), (17.8, 0, ZC - 2.9), 0.13, M['strut'], 'gear')
    for s in (1, -1):
        for u in (1.0, -1.7, -4.4):
            for dy in (0.0, 0.42):
                wheel(f'main{s}{u}{dy}', (u, s * (2.3 + dy), 0.6))
            rod(f'mainstrut{s}{u}', (u, s * 2.5, 0.6), (u + 0.2, s * 2.6, ZC - 2.9), 0.15, M['strut'], 'gear')


def ramp(M):
    hinge_u = -10.2
    dz, hw, hh = B.station(hinge_u)
    hz = ZC + dz - hh + 0.1
    length = 5.8
    ang = math.asin(min(1.0, hz / length))
    end_u = hinge_u - length * math.cos(ang)
    w = 2.1
    pts = [(hinge_u, -w, hz), (hinge_u, w, hz), (end_u, w, 0.05), (end_u, -w, 0.05)]
    verts = pts + [(p[0], p[1], p[2] + 0.17) for p in pts]
    obj('ramp', verts, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['skin'], 'ramp', smooth=0)
    hold = []
    for u in np.linspace(hinge_u, -19.5, 8):
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


# The blades stand still in a picture: rows 1 and 2 show them half a blade apart, so the flying loop flickers like a
# turning propeller; every other row uses the first set.
_A = lambda g: tuple(g) + ('propA',)
airkit.ROWS = [
    (_A(airkit.ROWS[0][0]),) + airkit.ROWS[0][1:],
    (_A(airkit.ROWS[1][0]),) + airkit.ROWS[1][1:],
    (tuple(airkit.ROWS[2][0]) + ('propB',),) + airkit.ROWS[2][1:],
] + [(_A(r[0]),) + r[1:] for r in airkit.ROWS[3:]]

run('a400m', 'a400m-europe', LENGTH, build)
