"""
C-17A Globemaster III (USA transport): self-contained Blender model + sprite sheet (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/c17_render.py -- [SAMPLES] [--preview]

Writes ui/public/sprites/c17-usa.png (then run `python tools/to_webp.py`): 192 px cells, 32 RA2 facings (column 0 =
nose up the screen, clockwise) x 9 rows: 0 parked (gear down) . 1-2 flying (2 = beacon lit) . 3 ramp down . 4-5 banked
left / right . 6-7 crashing . 8 ground shadow. --preview renders 4 facings of rows 0, 1, 3, 4 at 1 sample per pixel
into c17-preview.png beside the sheet instead.

Real numbers (Boeing C-17A): length 53.04 m, span 51.75 m, height 16.79 m, fuselage 6.85 m wide; wing 25 deg quarter-chord
sweep, ~3.5 deg anhedral, upturned winglets; four F117-PW-100 turbofans (nacelle ~6.2 m long) on pylons well ahead of
the leading edge; T-tail; main-gear sponsons on the lower flanks; upswept rear fuselage with the cargo ramp.
Drawn: fuselage 1.15x fuller than true (ART_GUIDE: full round body), everything else true scale. Model axes: u (x) to
the nose, v (y) to the left, z up, metres, ground at z = 0 with the gear down.
Paint: gunship grey FS 36118-like dark blue-grey, low-visibility markings, the game's US flag on the fin (Flags.ts:
navy field, red band, white six-pointed star), "U.S. AIR FORCE" as dark blocks, AMC fin band, TEAM blue on the
tail bullet fairing (kit.TEAM['usa']).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from airkit import Body, PREVIEW, TEAM, airfoil, box, lathe, loft, mat, obj, plate, rod, run, superellipse, surface  # noqa: E402

LENGTH = 53.04

GREY = '#5d646e'       # FS 36118-like gunship grey, a touch blue
GREY_DARK = '#454b54'  # radome, anti-glare, low-vis markings



def materials():
    return dict(
        skin=mat('skin', GREY, 0.62, panels=True),
        dark=mat('dark', GREY_DARK, 0.6),
        glass=mat('glass', '#1a2430', 0.07, glass=True, ao=0),
        frame=mat('frame', '#3a4048', 0.5),
        intake=mat('intake', '#121416', 0.9, ao=0.6),
        metal=mat('metal', '#8b8a86', 0.38, metal=0.85, ao=0.3),
        hot=mat('hot', '#5e554b', 0.5, metal=0.7),
        tyre=mat('tyre', '#1b1c1e', 0.85),
        strut=mat('strut', '#b9bcc0', 0.35, metal=0.8, ao=0.2),
        hold=mat('hold', '#0c0d0f', 0.95, ao=0),
        letter=mat('letter', '#262a31', 0.6, ao=0),
        navy=mat('navy', '#062a63', 0.55, ao=0),
        red=mat('red', '#a50b2e', 0.55, ao=0),
        white=mat('white', '#e8eaec', 0.55, ao=0),
        amc=mat('amc', '#2b6e48', 0.55, ao=0),
        team=mat('team', TEAM['usa'], 0.5),
        navred=mat('navred', '#ff2a2a', 0.4, emit=6.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=6.0, ao=0),
        beacon_off=mat('beacon_off', '#6a1414', 0.3, ao=0),
        beacon_on=mat('beacon_on', '#ff3020', 0.3, emit=40.0, ao=0),
        shadow=None,
    )


# ---------------------------------------------------------------------------------------------- the aircraft

ZC = 5.2  # fuselage axis height (gear down): belly 1.25 m above the ground amidships
N_SE = 2.4
# Fuselage stations: u, axis offset dz, half width, half height (1.15x true girth). Flat crown, blunt round Boeing-like
# nose with the cockpit roof, long parallel body, belly sweeping up to the tail.
STATIONS = [
    (26.55, -0.55, 0.05, 0.05), (26.42, -0.52, 0.85, 0.9), (26.0, -0.42, 1.65, 1.75), (25.2, -0.28, 2.45, 2.6),
    (24.0, -0.12, 3.15, 3.3), (22.3, 0.0, 3.65, 3.75), (19.8, 0.0, 3.95, 3.95), (-9.0, 0.0, 3.95, 3.95),
    (-13.0, 0.55, 3.82, 3.4), (-17.0, 1.35, 3.38, 2.6), (-20.5, 2.0, 2.72, 1.9), (-23.5, 2.55, 1.92, 1.25),
    (-25.8, 2.95, 1.0, 0.68), (-26.5, 3.1, 0.3, 0.28),
]


B = Body(STATIONS, ZC, N_SE)
station = B.station
body_point = B.point
body_patch = B.patch


def fuselage(M):
    us = sorted({round(x, 3) for x in list(np.linspace(26.55, 19.8, 16)) + list(np.linspace(19.8, -9.0, 14)) + list(np.linspace(-9.0, -26.5, 18))}, reverse=True)
    rings = []
    for u in us:
        dz, hw, hh = station(u)
        rings.append(superellipse(u, 0, ZC + dz, hw, hh, N_SE, 56))
    loft('fuselage', rings, M['skin'], smooth=40)
    # Nose radome cap (darker), just proud of the skin.
    rr = []
    for u in np.linspace(26.56, 25.0, 6):
        dz, hw, hh = station(u)
        rr.append(superellipse(u + 0.012, 0, ZC + dz, hw + 0.012, hh + 0.012, N_SE, 56))
    loft('radome', rr, M['dark'], smooth=50)
    # Wing-to-body fairing on the crown (where the high wing sits).
    fr = []
    for u, hw, hh in ((8.6, 0.2, 0.12), (7.0, 2.6, 0.55), (4.0, 3.2, 0.75), (-4.0, 3.2, 0.75), (-8.0, 2.8, 0.55), (-10.8, 0.3, 0.12)):
        fr.append(superellipse(u, 0, ZC + 3.65, hw, hh, 2.2, 40))
    loft('wing_fairing', fr, M['skin'])
    # Main-gear sponsons, low on both flanks.
    for s in (1, -1):
        sp = []
        for u, hw, hh in ((6.5, 0.15, 0.2), (5.2, 0.9, 1.15), (3.5, 1.05, 1.35), (-7.5, 1.05, 1.35), (-9.4, 0.85, 1.1), (-11.2, 0.15, 0.2)):
            sp.append(superellipse(u, s * 3.15, ZC - 2.55, hw, hh, 2.6, 32))
        loft(f'sponson{s}', sp, M['skin'])
    # Air-refuelling receptacle hump behind the cockpit, antennas on the crown, belly blade.
    loft('refuel_hump', [superellipse(u, 0, ZC + 3.92, w, 0.22, 2.2, 24) for u, w in ((18.4, 0.05), (17.6, 0.55), (16.2, 0.55), (15.4, 0.05))], M['dark'])
    for du in (11.0, 1.0, -12.5):
        box(f'antenna{du}', (du, 0, ZC + 3.95 + 0.33), (0.9, 0.07, 0.6), M['dark'], rot=(0, math.radians(-25), 0))
    # Anti-collision beacons: crown and belly (row 2 lit).
    for z, nm in ((ZC + 3.98, 'top'), (ZC - 3.98, 'bot')):
        lathe(f'beacon_{nm}_off', [(0, 0.001), (0.0, 0.22), (0.18, 0.18), (0.26, 0.001)], (0.0, 0, z), 'v', M['beacon_off'], 'beacon_off', 16)
        lathe(f'beacon_{nm}_on', [(0, 0.001), (0.0, 0.24), (0.2, 0.2), (0.28, 0.001)], (0.0, 0, z), 'v', M['beacon_on'], 'beacon_on', 16)


def cockpit(M):
    """Wrap-round windscreen: real panes proud of the skin in dark frames, eyebrow windows above, crew door."""
    for s in (1, -1):
        # Front + side panes along the cockpit (u ranges), one row; frames as slightly larger dark plates under them.
        panes = [(24.95, 24.3), (24.25, 23.45), (23.4, 22.55), (22.45, 21.75)]
        z0, z1 = ZC + 1.55, ZC + 2.55
        for i, (a, b) in enumerate(panes):
            body_patch(f'frame{s}{i}', a + 0.05, b - 0.05, z0 - 0.08, z1 + 0.08, s, M['frame'], off=0.03, nu=3, nz=2)
            body_patch(f'pane{s}{i}', a, b, z0, z1, s, M['glass'], off=0.06, nu=3, nz=2)
        # Eyebrow windows above the windscreen.
        for i, (a, b) in enumerate(((24.0, 23.5), (23.3, 22.8))):
            body_patch(f'eyebrow{s}{i}', a, b, ZC + 2.8, ZC + 3.1, s, M['glass'], off=0.05, nu=2, nz=1)
        # Crew entry door (outline) and two small cabin windows aft of it.
        body_patch(f'door{s}', 19.4, 18.4, ZC - 2.2, ZC + 0.4, s, M['letter'], off=0.025, nu=2, nz=3)
        for i, du in enumerate((16.5, 6.0, -6.0)):
            body_patch(f'port{s}{i}', du + 0.22, du - 0.22, ZC + 0.6, ZC + 1.05, s, M['glass'], off=0.03, nu=1, nz=1)
    # Centre windscreen panes across the nose front (nearly upright faces round u 25.1).
    for k, (y0, y1) in enumerate(((-1.25, -0.05), (0.05, 1.25))):
        pts = []
        for y in (y0, y1):
            for z in (ZC + 1.55, ZC + 2.4):
                dz, hw, hh = station(25.0)
                # Find u on the nose where the half width reaches |y| at this height: march forward.
                u = 25.0
                for uu in np.linspace(24.0, 26.4, 100):
                    d2, w2, h2 = station(uu)
                    s_ = max(-0.999, min(0.999, (z - ZC - d2) / h2))
                    if w2 * (1 - abs(s_) ** N_SE) ** (1 / N_SE) >= abs(y) + 0.05:
                        u = uu
                pts.append((u + 0.06, y, z))
        quad = [pts[0], pts[2], pts[3], pts[1]]
        obj(f'windscreen{k}', quad, [(0, 1, 2, 3)], M['glass'], smooth=0)


def wing_le(v):
    return 5.0 - (abs(v) - 2.6) * math.tan(math.radians(28))


def wing_z(v):
    return ZC + 3.5 - (abs(v) - 2.6) * math.tan(math.radians(3.5))


def wing_chord(v):
    f = (abs(v) - 2.6) / (25.85 - 2.6)
    return 12.0 + (3.6 - 12.0) * f


def wings(M):
    for s in (1, -1):
        secs = []
        for v in (2.6, 6.0, 12.0, 18.0, 25.85):
            f = (v - 2.6) / (25.85 - 2.6)
            secs.append(((wing_le(v), s * v, wing_z(v)), (-wing_chord(v), 0, 0), (0, 0, 1), 0.14 + (0.10 - 0.14) * f))
        surface(f'wing{s}', secs if s > 0 else secs, M['skin'], camber=0.02)
        # Upturned winglet: canted 12 deg out, leading edge swept 35 deg, chord 3.2 -> 1.2 m, 2.9 m tall.
        tip = (wing_le(25.85) - 0.3, s * 25.75, wing_z(25.85) + 0.1)
        h = 2.9
        cant = math.radians(12)
        top = (tip[0] - h * math.tan(math.radians(35)), tip[1] + s * h * math.sin(cant), tip[2] + h * math.cos(cant))
        surface(f'winglet{s}', [(tip, (-3.2, 0, 0), (0, s, 0), 0.09), (top, (-1.2, 0, 0), (0, s, 0), 0.08)], M['skin'], camber=0.0)
        # Wingtip navigation light (left red, right green).
        lathe(f'nav{s}', [(0, 0.001), (0, 0.16), (0.25, 0.001)], (wing_le(25.85) - 0.4, s * 25.95, wing_z(25.85)), 'v',
              M['navred'] if s > 0 else M['navgreen'], segs=12)
        # Flap-track fairings: canoes under the trailing edge.
        for v in (5.0, 10.0, 16.5, 21.0):
            le, c, z = wing_le(v), wing_chord(v), wing_z(v)
            te = le - c
            rings = [superellipse(u, s * v, z - 0.25 + dzz, w, hh, 2.0, 16) for u, w, hh, dzz in
                     ((te + c * 0.45, 0.03, 0.03, 0.05), (te + c * 0.25, 0.2, 0.32, -0.12), (te - 0.3, 0.17, 0.26, -0.12), (te - 1.2, 0.03, 0.03, -0.02))]
            loft(f'flaptrack{s}{v}', rings, M['skin'])
        # Four F117 turbofans on pylons, well ahead of the leading edge.
        for v in (7.4, 13.8):
            engine(M, s, v)


def engine(M, s, v):
    le, z = wing_le(v), wing_z(v)
    ax = (le + 3.9, s * v, z - 2.35)  # nacelle front lip centre
    tag = f'{s}{v}'
    # Outer cowl: round lip, fat fan cowl, tapering core cowl.
    lathe(f'cowl{tag}', [(-0.02, 1.08), (0.0, 1.2), (0.12, 1.31), (0.5, 1.37), (2.9, 1.37), (3.6, 1.3), (4.5, 1.1), (5.25, 0.92)], ax, 'u', M['skin'])
    # Inner lip and dark intake duct with depth, fan face and spinner.
    lathe(f'intake{tag}', [(-0.02, 1.08), (0.2, 1.02), (0.85, 0.99), (0.86, 0.001)], ax, 'u', M['intake'])
    lathe(f'spinner{tag}', [(0.84, 0.36), (0.6, 0.2), (0.38, 0.001)], ax, 'u', M['metal'])
    # Thrust-reverser seam ring and bare-metal core nozzle with its plug.
    lathe(f'reverser{tag}', [(2.95, 1.385), (3.05, 1.385), (3.05, 1.36), (2.95, 1.36)], ax, 'u', M['dark'], smooth=0)
    lathe(f'nozzle{tag}', [(5.2, 0.93), (5.9, 0.76), (5.9, 0.62), (5.2, 0.7)], ax, 'u', M['metal'])
    lathe(f'plug{tag}', [(5.4, 0.6), (6.2, 0.4), (6.75, 0.04), (6.76, 0.001)], ax, 'u', M['hot'])
    # Pylon: a slim blade from the cowl crown up into the wing underside, swept.
    pz0 = ax[2] + 1.25
    pz1 = z - 0.15
    secs = [((ax[0] - 0.6, ax[1], pz0), (-5.0, 0, 0), (0, s, 0), 0.07), ((le + 0.4, ax[1], pz1), (-4.2, 0, 0), (0, s, 0), 0.07)]
    rings = []
    for le_, chord, up, tc in secs:
        le_, chord, up = np.array(le_), np.array(chord, float), np.array(up, float)
        rings.append([tuple(le_ + chord * x + up * y * np.linalg.norm(chord)) for x, y in airfoil(tc, 0)])
    # Pylon sections are horizontal (chord along u, thickness along v): stack them vertically.
    loft(f'pylon{tag}', rings, M['skin'], smooth=30)


def tail(M):
    # Fin: rises from the upswept tail, leading edge swept 40 deg, root chord 10 m -> 6.2 m, 7.4 m tall.
    root = (-14.5, 0, ZC + 3.8)
    h = 7.4
    tipx = root[0] - h * math.tan(math.radians(40))
    surface('fin', [(root, (-10.0, 0, 0), (0, 1, 0), 0.11), ((tipx, 0, root[2] + h), (-6.2, 0, 0), (0, 1, 0), 0.10)], M['skin'], camber=0.0)
    # Dorsal fillet ahead of the fin root.
    loft('dorsal', [superellipse(u, 0, ZC + 3.85, w, hh, 2.0, 16) for u, w, hh in ((-10.5, 0.05, 0.05), (-13.0, 0.35, 0.45), (-15.5, 0.45, 0.9), (-17.0, 0.05, 0.05))], M['skin'])
    # T-tail: tailplane on top (span 19.8 m, LE sweep 32 deg, chord 5.8 -> 2.4 m), bullet fairing at the junction.
    zt = root[2] + h - 0.1
    for s in (1, -1):
        le0 = tipx + 0.4
        tipu = le0 - 9.9 * math.tan(math.radians(32))
        surface(f'tailplane{s}', [((le0, s * 0.2, zt), (-5.8, 0, 0), (0, 0, 1), 0.09), ((tipu, s * 9.9, zt + 0.15), (-2.4, 0, 0), (0, 0, 1), 0.08)], M['skin'], camber=0.0)
    loft('bullet', [superellipse(u, 0, zt, r, r, 2.0, 24) for u, r in ((tipx + 1.6, 0.02), (tipx + 0.8, 0.42), (tipx - 1.5, 0.58), (tipx - 7.5, 0.5), (tipx - 8.6, 0.05))], M['skin'])
    # TEAM identity band: the bullet fairing's nose cone.
    loft('team_cap', [superellipse(u, 0, zt, r + 0.015, r + 0.015, 2.0, 24) for u, r in ((tipx + 1.62, 0.02), (tipx + 0.8, 0.42), (tipx + 0.1, 0.52))], M['team'])
    return root, h, tipx


def markings(M, root, h, tipx):
    fin_t = lambda chord_frac, chord: 0.11 * chord * 5 * (0.2969 * math.sqrt(chord_frac) - 0.126 * chord_frac - 0.3516 * chord_frac ** 2 + 0.2843 * chord_frac ** 3 - 0.1036 * chord_frac ** 4)
    zf = root[2] + h * 0.68  # flag height
    lef = root[0] - (zf - root[2]) * math.tan(math.radians(40))
    chord = 10.0 + (6.2 - 10.0) * (zf - root[2]) / h
    fu = lef - chord * 0.55
    half = fin_t(0.4, chord) + 0.03
    for s in (1, -1):
        y = s * half
        nrm = (0, s, 0)
        W, H = 2.3, 1.45
        plate(f'flag{s}', [(fu + W / 2, y, zf - H / 2), (fu - W / 2, y, zf - H / 2), (fu - W / 2, y, zf + H / 2), (fu + W / 2, y, zf + H / 2)][::s], nrm, M['navy'], off=0.0)
        plate(f'band{s}', [(fu + W / 2, y, zf - H * 0.045), (fu - W / 2, y, zf - H * 0.045), (fu - W / 2, y, zf + H * 0.045), (fu + W / 2, y, zf + H * 0.045)][::s], nrm, M['red'], off=0.012)
        star = []
        ro, ri = H * 0.32, H * 0.32 * 0.56
        for k in range(12):
            a = math.pi / 2 + k * math.pi / 6
            r = ro if k % 2 == 0 else ri
            star.append((fu + r * math.cos(a), y, zf + r * math.sin(a)))
        plate(f'star{s}', star[::s], nrm, M['white'], off=0.024)
        # Air Mobility Command band and the tail number (dark blocks) below the flag.
        zb = zf - 1.45
        lb = root[0] - (zb - root[2]) * math.tan(math.radians(40))
        cb = 10.0 + (6.2 - 10.0) * (zb - root[2]) / h
        yb = s * (fin_t(0.4, cb) + 0.03)
        plate(f'amc{s}', [(lb - 0.6, yb, zb - 0.16), (lb - cb * 0.9, yb, zb - 0.16), (lb - cb * 0.9, yb, zb + 0.16), (lb - 0.6, yb, zb + 0.16)][::s], (0, s, 0), M['amc'], off=0.0)
        zn = zb - 0.75
        ln = root[0] - (zn - root[2]) * math.tan(math.radians(40))
        cn = 10.0 + (6.2 - 10.0) * (zn - root[2]) / h
        yn = s * (fin_t(0.45, cn) + 0.03)
        for i in range(5):
            u0 = ln - cn * 0.3 - i * 0.5
            plate(f'serial{s}{i}', [(u0, yn, zn - 0.2), (u0 - 0.32, yn, zn - 0.2), (u0 - 0.32, yn, zn + 0.2), (u0, yn, zn + 0.2)][::s], (0, s, 0), M['letter'], off=0.0)
        # "U.S. AIR FORCE" on the forward fuselage: dark blocks along the line of text.
        zl = ZC + 1.0
        u = 16.0
        for word in (4, 3, 5):  # U.S. / AIR / FORCE
            for _ in range(word):
                body_patch(f'letter{s}{u:.2f}', u, u - 0.38, zl - 0.26, zl + 0.26, s, M['letter'], off=0.03, nu=1, nz=1)
                u -= 0.55
            u -= 0.6
        # Low-visibility star-and-bar on the rear flank: a dark disc with bars.
        cu, cz = -9.5, ZC + 0.6
        ring = []
        for k in range(20):
            a = k / 20 * 2 * math.pi
            ring.append(body_point(cu + 0.85 * math.cos(a), s, cz + 0.85 * math.sin(a), 0.03))
        plate(f'roundel{s}', ring[::s], (0, s, 0), M['dark'], off=0.0)
        body_patch(f'bar{s}', cu + 2.0, cu - 2.0, cz - 0.3, cz + 0.3, s, M['dark'], off=0.025, nu=6, nz=1)
        # USAF on the right wing top / U.S. AIR FORCE blocks there are too small to read: only a walkway line.
    # Wing-top 'USAF' (right wing, the photos): four dark blocks.
    for i in range(4):
        v = -16.5 + i * 1.3
        u0 = wing_le(v) - wing_chord(v) * 0.35
        z = wing_z(v) + wing_chord(v) * 0.075 + 0.04
        plate(f'usaf{i}', [(u0 + 0.8, v - 0.45, z), (u0 + 0.8, v + 0.45, z), (u0 - 0.8, v + 0.45, z), (u0 - 0.8, v - 0.45, z)], (0, 0, 1), M['letter'], off=0.0)


def gear(M):
    """Gear down (parked / ramp rows): twin nose wheels, two struts of three wheels per side under the sponsons."""
    def wheel(name, c, r=0.62, w=0.38):
        lathe(name, [(-w / 2, 0.001), (-w / 2, r * 0.8), (-w / 2 + 0.05, r), (w / 2 - 0.05, r), (w / 2, r * 0.8), (w / 2, 0.001)], (c[0], c[1] - 0, c[2]), 'v', M['tyre'], 'gear', 24)
        lathe(name + 'hub', [(-w / 2 - 0.01, 0.001), (-w / 2 - 0.01, r * 0.45), (w / 2 + 0.01, r * 0.45), (w / 2 + 0.01, 0.001)], c, 'v', M['strut'], 'gear', 16)
    for dy in (0.32, -0.32):
        wheel(f'nosewheel{dy}', (20.0, dy, 0.55), 0.55, 0.3)
    rod('nosestrut', (20.0, 0, 0.55), (20.3, 0, ZC - 3.6), 0.13, M['strut'], 'gear')
    box('nosedoor', (20.6, 0.62, ZC - 3.3), (2.2, 0.05, 0.9), M['skin'], 'gear')
    for s in (1, -1):
        for u in (1.2, -3.0):
            for dy in (0.0, 0.45, 0.9):
                wheel(f'main{s}{u}{dy}', (u, s * (2.55 + dy), 0.62))
            rod(f'mainstrut{s}{u}', (u, s * 3.0, 0.62), (u + 0.2, s * 3.1, ZC - 3.3), 0.16, M['strut'], 'gear')


def ramp(M):
    """Cargo ramp lowered to the ground under the upswept tail, the dark hold behind it, and the open aft door."""
    hinge_u = -13.6
    dz, hw, hh = station(hinge_u)
    hz = ZC + dz - hh + 0.1
    length = 6.4
    ang = math.asin(min(1.0, hz / length))
    end_u = hinge_u - length * math.cos(ang)
    w = 2.75
    pts = [(hinge_u, -w, hz), (hinge_u, w, hz), (end_u, w, 0.05), (end_u, -w, 0.05)]
    verts = pts + [(p[0], p[1], p[2] + 0.18) for p in pts]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    obj('ramp', verts, faces, M['skin'], 'ramp', smooth=0)
    # Ramp toes and the dark open hold under the tail.
    box('toes', (end_u + 0.2, 0, 0.12), (0.4, w * 2, 0.12), M['metal'], 'ramp')
    hold = []
    for u in np.linspace(hinge_u, -22.5, 8):
        d, ww, hh2 = station(u)
        hold.append([(u, -ww * 0.72, ZC + d - hh2 + 0.08), (u, ww * 0.72, ZC + d - hh2 + 0.08)])
    verts = [p for pair in hold for p in pair]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(hold) - 1)]
    obj('hold', [(x, y, z - 0.03) for x, y, z in verts], faces, M['hold'], 'ramp', smooth=0)



def build():
    M = materials()
    fuselage(M)
    cockpit(M)
    wings(M)
    root, h, tipx = tail(M)
    markings(M, root, h, tipx)
    gear(M)
    ramp(M)


run('c17', 'c17-usa', LENGTH, build)
