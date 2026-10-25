#!/usr/bin/env python3
"""
Builds the five national AWACS (airborne early warning and control aircraft) as 3D models in code and renders them into
public/sprites/awacs-<faction>.png with the renderer and camera of tools/aircraft_model_sheet.py, in its 'bomber' layout
(the one AircraftSheets.ts reads): 16 columns (screen headings clockwise from N) by 9 rows — 0 parked, 1-2 flying,
3 ramp (= parked), 4 banked left, 5 banked right, 6-7 crashing, 8 shadow — at 128 px cells; side-on the aircraft spans
0.74 of a cell.
  usa      E-3 Sentry style: 707 airframe, low swept wing, four engines, rotodome on two struts, light grey.
  europe   A330 style: wide-body, two big turbofans, winglets, sleek radome on a fairing, grey and dark blue.
  china    KJ-2000 style: Il-76 airframe, high wing, T-tail, fixed radome on a pedestal, pale blue-grey, red markings.
  russia   A-50 style: Il-76 airframe, rotodome on struts, two-tone grey camouflage, red stars, tail gun position.
  islamic  original design: heavy high-wing transport, twin tail fins, nose radar, rotodome, olive / sand camouflage.
Usage: python -I tools/awacs_model_sheet.py [faction ...] [--preview out-dir]   (run from ui/)
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aircraft_model_sheet as am  # noqa: E402
import tank_model_sheet as tm  # noqa: E402

CELL = 128
am.CELL = CELL  # the shared renderer draws into cells of this size


# ------------------------------------------------------------------ mesh building (u forward, v left, z up; metres)

class Mesh:
    def __init__(self):
        self.v, self.t, self.m = [], [], []

    def tri(self, a, b, c, part):
        n = len(self.v)
        self.v += [a, b, c]
        self.t.append((n, n + 1, n + 2))
        self.m.append(part)

    def quad(self, a, b, c, d, part):
        self.tri(a, b, c, part)
        self.tri(a, c, d, part)

    def grid(self, rows, part, closed=False, out=None):
        """Quads between consecutive rows of points (each row a list of the same length). `out(point)`: the way the
        surface should face there — the rows are reversed when their winding faces the other way (the painter tells
        top from underside by the normals)."""
        if out is not None and len(rows) > 1 and len(rows[0]) > 1:
            i = (len(rows) - 1) // 2  # a middle row: the end rows of a dome or a cone can be a single point
            a, b, c = (np.array(p, float) for p in (rows[i][0], rows[i][1], rows[i + 1][1]))
            n = np.cross(b - a, c - a)
            if np.dot(n, out(a)) < 0:
                rows = [r[::-1] for r in rows]
        for i in range(len(rows) - 1):
            r0, r1 = rows[i], rows[i + 1]
            n = len(r0)
            for j in range(n if closed else n - 1):
                k = (j + 1) % n
                self.quad(r0[j], r0[k], r1[k], r1[j], part)

    def fan(self, ring, centre, part):
        for j in range(len(ring)):
            self.tri(centre, ring[j], ring[(j + 1) % len(ring)], part)


def ring(u, cv, cz, rv, rz, n=28):
    return [(u, cv + rv * math.cos(2 * math.pi * k / n), cz + rz * math.sin(2 * math.pi * k / n)) for k in range(n)]


def loft(m, sections, part, n=28, cap_front=None, cap_back=None):
    """sections: (u, centre v, centre z, half-width, half-height), nose first."""
    rings = [ring(u, cv, cz, rv, rz, n) for u, cv, cz, rv, rz in sections]
    u0, cv0, cz0 = sections[0][0], sections[0][1], sections[0][2]
    m.grid(rings, part, closed=True, out=lambda p: (0, p[1] - cv0, p[2] - cz0))
    if cap_front:
        u, cv, cz, _, _ = sections[0]
        m.fan(rings[0], (u, cv, cz), cap_front)
    if cap_back:
        u, cv, cz, _, _ = sections[-1]
        m.fan(rings[-1][::-1], (u, cv, cz), cap_back)


def surface(m, root, span_dir, span, c_root, c_tip, sweep, thick, part, ns=8, nc=8, up=(0, 0, 1)):
    """A wing-like surface: root leading edge `root`, out along `span_dir` (unit) for `span`, the leading edge moving
    back `sweep` metres by the tip, chord from c_root to c_tip, relative thickness `thick`, thickness along `up`."""
    root, sd, upv = np.array(root, float), np.array(span_dir, float), np.array(up, float)
    back = np.array((-1.0, 0, 0))
    top, bot = [], []
    for i in range(ns + 1):
        s = i / ns
        le = root + sd * span * s + back * sweep * s
        c = c_root + (c_tip - c_root) * s
        rt, rb = [], []
        for j in range(nc + 1):
            x = j / nc
            p = le + back * c * x
            h = thick * c * 2.6 * x * (1 - x) ** 1.4 + 0.004
            rt.append(tuple(p + upv * h * 0.6))
            rb.append(tuple(p - upv * h * 0.4))
        top.append(rt)
        bot.append(rb)
    m.grid(top, part, out=lambda p: upv)
    m.grid(bot, part, out=lambda p: -upv)
    m.grid([top[-1], bot[-1]], part)  # tip cap
    m.grid([top[0][::-1], bot[0][::-1]], part)  # root cap (hidden inside the body)


def box(m, a, b, w, h, part):
    """A strut / pylon from point a to point b, w wide (v) and h deep."""
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    d /= np.linalg.norm(d)
    side = np.cross(d, (0, 0, 1)) if abs(d[2]) < 0.9 else np.cross(d, (1, 0, 0))
    side /= np.linalg.norm(side)
    up = np.cross(side, d)
    corners = [side * w / 2 + up * h / 2, -side * w / 2 + up * h / 2, -side * w / 2 - up * h / 2, side * w / 2 - up * h / 2]
    ra = [tuple(a + c) for c in corners]
    rb = [tuple(b + c) for c in corners]
    m.grid([ra, rb], part, closed=True, out=lambda p: np.array(p) - a)


def ellipsoid(m, c, rx, ry, rz, part, n=40, k=14):
    rows = []
    for i in range(k + 1):
        a = -math.pi / 2 + math.pi * i / k
        rows.append([(c[0] + rx * math.cos(a) * math.cos(2 * math.pi * j / n), c[1] + ry * math.cos(a) * math.sin(2 * math.pi * j / n), c[2] + rz * math.sin(a)) for j in range(n)])
    m.grid(rows, part, closed=True, out=lambda p: np.array(p) - np.array(c))


def fuselage(m, L, R, nose=0.12, tail=0.27, upsweep=0.55, belly=1.0, cz=None, n=32):
    """Main body: ogive nose, straight barrel, tail cone tapering and sweeping up. Returns the body's top z at mid."""
    cz = R if cz is None else cz
    secs = []
    for k in range(41):
        f = k / 40  # 0 nose → 1 tail
        u = L / 2 - f * L
        if f < nose:
            g = f / nose
            r = R * (1 - (1 - g) ** 2.2) ** 0.5
            z = cz - R * 0.18 * (1 - g)
        elif f > 1 - tail:
            g = (f - (1 - tail)) / tail
            r = R * (1 - 0.82 * g ** 1.15)
            z = cz + R * upsweep * g ** 1.6
        else:
            r, z = R, cz
        secs.append((u, 0, z, max(r, 0.05), max(r * belly, 0.05)))
    loft(m, secs, 'body', n=n, cap_back='body')
    return cz + R


def engine(m, u, v, z, r, l, part='nacelle', pylon_to=None):
    secs = [(u, v, z, r * 0.92, r * 0.92), (u - 0.1 * l, v, z, r, r), (u - 0.7 * l, v, z, r * 0.95, r * 0.95), (u - l, v, z, r * 0.6, r * 0.6)]
    loft(m, secs, part, n=20, cap_front='intake', cap_back='exhaust')
    if pylon_to is not None:
        box(m, (u - 0.35 * l, v, z + r * 0.8), (u - 0.55 * l, v, pylon_to), 0.18, l * 0.45, 'pylon')


def wing_engine(m, root_u, root_v, zw, dihedral, sweep, span, side, dv, r, l):
    """An engine slung under the wing `dv` metres out from the wing root: its intake well ahead of the leading edge,
    a pylon up into the wing."""
    s = dv / span
    le = root_u - sweep * s
    z = zw + dv * math.tan(math.radians(dihedral))
    engine(m, le + 0.45 * l, side * (root_v + dv), z - r - 0.35, r, l)
    box(m, (le + 0.1 * l, side * (root_v + dv), z - 0.35), (le - 0.5 * l, side * (root_v + dv), z + 0.05), 0.22, 0.6, 'pylon')
    box(m, (le + 0.1 * l, side * (root_v + dv), z - 0.4), (le + 0.2 * l, side * (root_v + dv), z - r * 0.6), 0.2, 0.5, 'pylon')


def rotodome(m, u, ztop, rd, hd, lift, struts, pedestal=False):
    """Radar dome lifted `lift` over the body top: two struts or a fairing pedestal."""
    cz = ztop + lift + hd
    ellipsoid(m, (u, 0, cz), rd, rd, hd, 'dome')
    if pedestal:
        loft(m, [(u + rd * 0.55, 0, ztop - 0.1, 0.12, 0.05), (u + rd * 0.25, 0, ztop + lift * 0.5, 0.35, lift * 0.5),
                 (u - rd * 0.25, 0, ztop + lift * 0.5, 0.35, lift * 0.5), (u - rd * 0.6, 0, ztop - 0.1, 0.12, 0.05)], 'pylon', n=16)
    for du in struts:
        box(m, (u + du * 1.35, 0, ztop - 0.15), (u + du, 0, cz - hd * 0.6), 0.32, 0.75, 'pylon')
    return cz


# ------------------------------------------------------------------ the five aircraft

def usa():
    m, L, R = Mesh(), 46.6, 1.9
    top = fuselage(m, L, R, nose=0.1, tail=0.24, upsweep=0.5)
    zw = R * 0.55
    for s in (1, -1):
        surface(m, (3.6, s * R * 0.8, zw), (0, s, math.tan(math.radians(6))), 20.5, 9.6, 2.6, 12.0, 0.12, 'wing')
        for dv in (6.6, 13.0):
            wing_engine(m, 3.6, R * 0.8, zw, 6, 12.0, 20.5, s, dv, 0.78, 4.4)
        surface(m, (-18.0, s * R * 0.4, top - 0.4), (0, s, 0.12), 6.6, 5.0, 1.8, 3.8, 0.09, 'tail')
    surface(m, (-15.5, 0, top - 0.3), (0, 0, 1), 7.6, 7.6, 2.4, 6.4, 0.1, 'fin', up=(0, 1, 0))
    rotodome(m, -6.0, top, 4.6, 0.95, 1.9, (1.4, -1.4))
    box(m, (9.0, 0, top), (8.4, 0, top + 0.45), 0.08, 0.5, 'antenna')
    box(m, (-2.0, 0, 0.05), (-2.6, 0, -0.45), 0.08, 0.4, 'antenna')
    return m


def europe():
    m, L, R = Mesh(), 53.0, 2.75
    top = fuselage(m, L, R, nose=0.09, tail=0.26, upsweep=0.42)
    zw = R * 0.5
    for s in (1, -1):
        surface(m, (5.5, s * R * 0.85, zw), (0, s, math.tan(math.radians(5.5))), 26.5, 11.0, 2.5, 15.5, 0.11, 'wing')
        # Winglet at the tip.
        tip = (5.5 - 15.5, s * (R * 0.85 + 26.5), zw + 26.5 * math.tan(math.radians(5.5)))
        surface(m, tip, (0, s * 0.25, 0.97), 2.6, 2.4, 1.0, 1.4, 0.08, 'winglet', up=(0, 1, 0))
        wing_engine(m, 5.5, R * 0.85, zw, 5.5, 15.5, 26.5, s, 7.6, 1.45, 6.0)
        surface(m, (-21.0, s * R * 0.3, top - 0.6), (0, s, 0.12), 9.0, 6.0, 2.0, 5.5, 0.09, 'tail')
    surface(m, (-17.5, 0, top - 0.4), (0, 0, 1), 8.6, 8.8, 3.0, 7.4, 0.1, 'fin', up=(0, 1, 0))
    # A long, low radome on an aerodynamic fairing: sleeker than the round domes.
    cz = top + 1.5
    ellipsoid(m, (-4.0, 0, cz), 6.4, 3.4, 0.9, 'dome')
    loft(m, [(1.6, 0, top - 0.2, 0.2, 0.1), (-1.0, 0, top + 0.6, 0.55, 0.7), (-7.0, 0, top + 0.6, 0.55, 0.7), (-9.6, 0, top - 0.2, 0.2, 0.1)], 'pylon', n=16)
    for du in (8.5, 12.0, -12.5):
        box(m, (du, 0, top), (du - 0.5, 0, top + 0.5), 0.1, 0.6, 'antenna')
    return m


def il76(m, L, R, tail_gun=False):
    """Il-76 style heavy airlifter: high anhedral wing, four engines on pylons, T-tail, glazed navigator's nose."""
    top = fuselage(m, L, R, nose=0.1, tail=0.25, upsweep=0.35, belly=1.05)
    zw = 2 * R - 0.2
    for s in (1, -1):
        surface(m, (5.0, s * R * 0.6, zw), (0, s, -math.tan(math.radians(3))), 23.5, 9.5, 3.2, 8.5, 0.12, 'wing')
        for dv in (6.0, 12.6):
            wing_engine(m, 5.0, R * 0.6, zw, -3, 8.5, 23.5, s, dv, 0.9, 5.0)
        # Main gear fairings along the belly.
        loft(m, [(1.5, s * (R - 0.15), 0.6, 0.05, 0.05), (0.0, s * (R + 0.15), 0.8, 0.5, 0.65), (-6.5, s * (R + 0.15), 0.8, 0.5, 0.65), (-8.5, s * (R - 0.15), 0.8, 0.05, 0.05)], 'body', n=12)
    fin_root = top - 0.2
    surface(m, (-15.5, 0, fin_root), (0, 0, 1), 8.0, 8.0, 4.4, 5.0, 0.11, 'fin', up=(0, 1, 0))
    for s in (1, -1):  # T-tail
        surface(m, (-19.0, 0, fin_root + 7.9), (0, s, 0), 8.6, 4.4, 1.8, 3.0, 0.09, 'tail')
    if tail_gun:
        ellipsoid(m, (-L / 2 + 0.8, 0, R + 0.9), 0.9, 0.7, 0.8, 'glass')
    return top


def china():
    m = Mesh()
    top = il76(m, 46.6, 2.45)
    rotodome(m, -3.5, top, 6.6, 1.15, 1.9, (), pedestal=True)  # fixed radome on a broad pedestal
    for du in (9.0, -8.0):
        box(m, (du, 0, top), (du - 0.5, 0, top + 0.55), 0.1, 0.6, 'antenna')
    return m


def russia():
    m = Mesh()
    top = il76(m, 46.6, 2.45, tail_gun=True)
    rotodome(m, -3.0, top, 5.2, 1.0, 2.2, (1.6, -1.6))
    for du in (10.5, 7.0):
        box(m, (du, 0, top), (du - 0.6, 0, top + 0.6), 0.1, 0.6, 'antenna')
    for s in (1, -1):  # cheek antenna fairings
        loft(m, [(14.0, s * 2.3, 2.6, 0.05, 0.05), (12.0, s * 2.45, 2.6, 0.3, 0.45), (6.0, s * 2.45, 2.6, 0.3, 0.45), (4.5, s * 2.3, 2.6, 0.05, 0.05)], 'pylon', n=10)
    return m


def islamic():
    """Original design: a heavy high-wing airlifter with twin tail fins on a broad tailplane, a thimble nose radar and a
    rotodome on a single swept pylon."""
    m, L, R = Mesh(), 44.0, 2.55
    top = fuselage(m, L, R, nose=0.13, tail=0.25, upsweep=0.45, belly=1.02)
    zw = 2 * R - 0.15
    for s in (1, -1):
        surface(m, (4.5, s * R * 0.6, zw), (0, s, -math.tan(math.radians(1.5))), 22.0, 9.0, 3.4, 6.5, 0.13, 'wing')
        for dv in (5.6, 11.8):
            wing_engine(m, 4.5, R * 0.6, zw, -1.5, 6.5, 22.0, s, dv, 0.95, 4.8)
        surface(m, (-15.0, s * R * 0.3, top - 0.3), (0, s, 0.05), 8.4, 5.2, 3.6, 2.2, 0.09, 'tail')
        # Twin fins at the tailplane tips, toed in.
        surface(m, (-15.6 - 2.0, s * (R * 0.3 + 8.2), top - 0.2), (0, -s * 0.12, 1), 6.2, 4.6, 2.6, 2.4, 0.1, 'fin', up=(0, 1, 0))
    ellipsoid(m, (L / 2 + 0.3, 0, R * 0.95), 1.2, 0.85, 0.85, 'radome')
    cz = top + 2.0 + 0.95
    ellipsoid(m, (-4.0, 0, cz), 5.0, 5.0, 0.95, 'dome')
    loft(m, [(0.8, 0, top - 0.2, 0.15, 0.1), (-1.6, 0, top + 1.0, 0.45, 1.1), (-4.6, 0, top + 1.0, 0.45, 1.1), (-6.2, 0, top - 0.2, 0.15, 0.1)], 'pylon', n=14)
    for du in (9.5, -9.0):
        box(m, (du, 0, top), (du - 0.5, 0, top + 0.55), 0.1, 0.6, 'antenna')
    return m


# ------------------------------------------------------------------ paint

def noise(p, scale, seed):
    x, y, z = p[:, 0] / scale, p[:, 1] / scale, p[:, 2] / scale
    return (np.sin(x * 1.7 + seed) * np.cos(y * 2.3 - seed * 0.7) + np.sin((x + y) * 1.1 + z * 0.9 + seed * 1.3) * 0.7
            + np.sin(x * 3.1 - y * 2.7 + seed * 2.1) * 0.35)


def star(px, py, r, points=5, inner=0.4):
    a = np.arctan2(py, px) + math.pi / 2
    d = np.hypot(px, py)
    k = (np.mod(a * points / (2 * math.pi), 1) - 0.5) * 2
    edge = r * (inner + (1 - inner) * np.abs(k) ** 1.6)
    return d < edge


SCHEMES = {
    # base, underside, dome, dome band, accent (fin / belly stripe)
    'usa': dict(base=(176, 181, 188), under=(168, 173, 180), dome=(176, 181, 188), band=(38, 40, 44), accent=(150, 156, 164)),
    'europe': dict(base=(196, 200, 205), under=(46, 64, 112), dome=(214, 216, 220), band=(46, 64, 112), accent=(46, 64, 112)),
    'china': dict(base=(184, 192, 202), under=(176, 186, 198), dome=(196, 204, 214), band=(150, 160, 174), accent=(196, 34, 30)),
    'russia': dict(base=(190, 192, 194), under=(196, 198, 200), dome=(200, 200, 198), band=(52, 54, 56), accent=(128, 140, 158)),
    'islamic': dict(base=(102, 110, 70), under=(224, 220, 206), dome=(222, 218, 204), band=(62, 76, 46), accent=(196, 172, 122)),
}


def paint(faction, pos, nrm, parts, col):
    s = SCHEMES[faction]
    u, v, z = pos[:, 0], pos[:, 1], pos[:, 2]
    body = np.isin(parts, ('body', 'tail', 'fin', 'wing', 'winglet', 'nacelle', 'pylon'))
    col[:] = s['base']
    # Underside a shade apart (or a different colour), the dome its own.
    zmid = (z.max() + z.min()) / 2
    low = body & (nrm[:, 2] < -0.35) & (z < zmid + 1)
    col[low] = s['under']
    col[parts == 'dome'] = s['dome']
    col[parts == 'radome'] = (60, 62, 60)
    col[parts == 'antenna'] = (70, 72, 76)
    col[parts == 'intake'] = (34, 36, 40)
    col[parts == 'exhaust'] = (58, 50, 44)
    col[parts == 'glass'] = (40, 58, 74)
    if faction == 'russia':
        camo = body & (noise(pos, 3.2, 1.7) > 0.35) & ~low
        col[camo] = s['accent']
    if faction == 'islamic':
        camo = body & ~low
        c = noise(pos, 3.6, 4.2)
        col[camo & (c > 0.25)] = s['accent']
        col[camo & (c < -0.55)] = (70, 62, 46)
    if faction == 'europe':
        col[parts == 'fin'] = s['accent']
        col[(parts == 'body') & (np.abs(z - (z[parts == 'body'].max() * 0.42)) < 0.18)] = s['accent']  # cheat line
    # The dome band: dark (or coloured) round its rim.
    dome = parts == 'dome'
    if dome.any():
        dz = z[dome]
        mid = (dz.max() + dz.min()) / 2
        rim = dome & (np.abs(z - mid) < (dz.max() - dz.min()) * 0.22)
        col[rim] = s['band']
        if faction == 'usa':  # E-3's dark band reaches over the top as a wide stripe
            col[dome & (np.abs(v) < 0.9)] = s['band']
    # Cockpit glazing and the anti-glare panel; the Il-76 types also get the glazed navigator's nose.
    bz = z[parts == 'body']
    nose = u[parts == 'body'].max()
    top_b = bz.max() if faction in ('usa', 'europe') else np.percentile(bz[u[parts == 'body'] > nose - 6], 95)
    win = (parts == 'body') & (u > nose - 4.4) & (u < nose - 2.7) & (z > top_b - 1.25) & (z < top_b - 0.55) & (np.abs(v) > 0.25)
    col[win] = (34, 44, 58)
    col[win & (np.mod(u * 2.2, 1) < 0.18)] = (90, 96, 104)  # window frames
    if faction in ('china', 'russia'):
        glaze = (parts == 'body') & (u > nose - 2.2) & (z < top_b - 1.6) & (z > top_b - 3.2)
        col[glaze] = (52, 70, 86)
    # Passenger-style window row on the airliner frames.
    if faction in ('usa', 'europe'):
        row = (parts == 'body') & (np.abs(z - (top_b - 0.95)) < 0.12) & (u < nose - 7) & (u > -14) & (np.mod(u, 1.2) < 0.35)
        col[row] = (52, 60, 70)
    # Panel lines: thin darker seams round the body and along the wings, rivet lines a touch lighter.
    seam = ((parts == 'body') & (np.mod(u, 1.7) < 0.07)) | (np.isin(parts, ('wing', 'tail')) & (np.mod(np.abs(v), 2.3) < 0.08))
    col[seam] *= 0.82
    col[(parts == 'body') & (np.mod(u + 0.85, 1.7) < 0.03)] *= 1.06
    # Weathering: soft grime noise, darker near the engines' exhaust.
    col *= (0.94 + 0.06 * np.clip(noise(pos, 1.3, 9.1), -1, 1))[:, None]
    insignia(faction, pos, nrm, parts, col)
    return np.clip(col, 0, 255)


def insignia(f, pos, nrm, parts, col):
    u, v, z = pos[:, 0], pos[:, 1], pos[:, 2]
    wing_top = (parts == 'wing') & (nrm[:, 2] > 0.5)
    fin_side = (parts == 'fin') & (np.abs(nrm[:, 1]) > 0.6)
    body_side = (parts == 'body') & (np.abs(nrm[:, 1]) > 0.55)
    wu = np.where(wing_top, u, 0)
    span = np.abs(v[wing_top]).max() if wing_top.any() else 20
    cv = span * 0.72
    # Wing centre line at that span (leading edge moves back with the sweep): use the samples' own spread.
    near = wing_top & (np.abs(np.abs(v) - cv) < 1.0)
    cu = (u[near].max() + u[near].min()) / 2 if near.any() else 0
    du, dv = u - cu, np.abs(v) - cv
    fins = fin_side
    fu = (u[fins].max() + u[fins].min()) / 2 if fins.any() else 0
    fz = z[fins].min() + (z[fins].max() - z[fins].min()) * 0.62 if fins.any() else 0
    if f == 'usa':
        disc = wing_top & (np.hypot(du, dv) < 1.45)
        col[disc] = (50, 58, 78)
        col[disc & star(dv, du, 1.25)] = (214, 214, 210)
        bar = body_side & (np.abs(u + 9) < 1.8) & (np.abs(z - 2.4) < 0.42)
        col[bar] = (214, 214, 210)
        col[bar & (np.abs(z - 2.4) < 0.15)] = (50, 58, 78)
        flag = fin_side & (np.abs(u - fu - 0.6) < 0.9) & (np.abs(z - fz) < 0.55)
        col[flag] = (176, 46, 46)
        col[flag & (np.mod((z - fz) * 5, 1) < 0.5)] = (214, 214, 210)
        col[flag & (u - fu - 0.6 > 0) & (z - fz > 0)] = (50, 58, 90)
    elif f == 'europe':
        disc = wing_top & (np.hypot(du, dv) < 1.7)
        col[disc] = (40, 60, 120)
        a = np.arctan2(du, dv)
        ring_ = disc & (np.abs(np.hypot(du, dv) - 1.05) < 0.22) & (np.mod(a * 12 / (2 * math.pi), 1) < 0.5)
        col[ring_] = (236, 200, 40)
        circ = fin_side & (np.hypot(u - fu, z - fz) < 1.3)
        col[circ] = (236, 200, 40)
        col[circ & (np.hypot(u - fu, z - fz) < 0.9)] = (40, 60, 120)
    elif f == 'china':
        mark = wing_top & star(dv, du, 1.5)
        col[wing_top & (np.abs(du) < 0.35) & (np.abs(dv) < 2.4)] = (200, 40, 34)
        col[mark] = (200, 40, 34)
        col[fin_side & star(u - fu, z - fz, 1.3)] = (200, 40, 34)
        col[fin_side & (np.abs(z - fz + 2.0) < 0.25)] = (200, 40, 34)
        stripe = body_side & (np.abs(z - 2.9) < 0.12)
        col[stripe] = (200, 40, 34)
    elif f == 'russia':
        out = wing_top & star(dv, du, 1.75)
        col[out] = (230, 230, 226)
        col[out & star(dv, du, 1.4)] = (196, 30, 30)
        st = fin_side & star(u - fu, z - fz, 1.45)
        col[st] = (230, 230, 226)
        col[st & star(u - fu, z - fz, 1.15)] = (196, 30, 30)
        flag = body_side & (np.abs(u + 13) < 1.0) & (np.abs(z - 3.4) < 0.6)
        col[flag] = (232, 232, 230)
        col[flag & (z < 3.2)] = (40, 70, 160)
        col[flag & (z < 3.0)] = (196, 30, 30)
    elif f == 'islamic':
        disc = wing_top & (np.hypot(du, dv) < 1.55)
        col[disc] = (28, 110, 60)
        cres = disc & (np.hypot(du, dv) < 1.0) & (np.hypot(du - 0.35, dv - 0.2) > 0.82)
        col[cres] = (232, 230, 220)
        fd = fin_side & (np.hypot(u - fu, z - fz) < 1.1)
        col[fd] = (28, 110, 60)
        col[fd & (np.hypot(u - fu, z - fz) < 0.7) & (np.hypot(u - fu - 0.28, z - fz - 0.15) > 0.58)] = (232, 230, 220)


# ------------------------------------------------------------------ render

BUILDERS = dict(usa=usa, europe=europe, china=china, russia=russia, islamic=islamic)


def build(faction):
    m = BUILDERS[faction]()
    v = np.array(m.v, float)
    v[:, 2] -= v[:, 2].min()  # wheels on the ground
    tris = np.arange(len(v)).reshape(-1, 3)
    mats = np.array(m.m)
    return v, tris, mats


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    if preview in args:
        args.remove(preview)
    for faction in args or list(BUILDERS):
        v, tris, mats = build(faction)
        ext = v.max(0) - v.min(0)
        scale = CELL * 0.74 / ext[0]
        zmid = (v[:, 2].max() + v[:, 2].min()) / 2
        density = (scale * am.SS * 1.6) ** 2
        kd = {p: np.ones(3) for p in np.unique(mats)}
        pos, col, nrm, ti = tm.sample(v, np.zeros((1, 2)), tris, np.zeros_like(tris), mats, {}, kd, density, (255, 255, 255))
        col = paint(faction, pos, nrm, mats[ti], col.astype(np.float64))
        deg = math.radians
        rows = [(0, 0, 1, False), (0, 0, 1, False), (0, 0, 1, False), (0, 0, 1, False), (0, deg(-25), 1, False), (0, deg(25), 1, False),
                (deg(-20), deg(10), 0.6, False), (deg(-35), deg(30), 0.4, False), (0, 0, 1, True)]
        dirs = 16
        sheet = Image.new('RGBA', (CELL * dirs, CELL * len(rows)))
        for r, (pitch, roll, tint, shadow) in enumerate(rows):
            rp, rn = am.pose(pos, nrm, pitch, roll) if (pitch or roll) else (pos, nrm)
            for d in range(dirs):
                sheet.alpha_composite(am.render(rp, col, rn, d / dirs * 2 * math.pi, scale, zmid, tint, shadow), (d * CELL, r * CELL))
        out = f'public/sprites/awacs-{faction}.png'
        sheet.save(out, optimize=True)
        print(f'{faction}: {out}  length {ext[0]:.1f} m, span {ext[1]:.1f} m')
        if preview:
            os.makedirs(preview, exist_ok=True)
            pv = Image.new('RGBA', (CELL * 8, CELL * 3), (96, 116, 74, 255))
            for i, r in enumerate((1, 4, 8)):
                for c in range(8):
                    pv.alpha_composite(sheet.crop((c * 2 * CELL, r * CELL, (c * 2 + 1) * CELL, (r + 1) * CELL)), (c * CELL, i * CELL))
            pv.save(os.path.join(preview, f'awacs-{faction}.png'))


if __name__ == '__main__':
    main()
