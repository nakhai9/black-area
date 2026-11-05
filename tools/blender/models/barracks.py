"""Ministry of Defence (barracks) of usa (the Pentagon, 4 x 4), russia, china and islamic (5 x 3). Europe's is rendered elsewhere."""
import math

import bmesh

from kit import _obj, cylinder, dome, lathe, mat, render, rod, roof, zp, TEAM


# ---------------------------------------------------------------- batched geometry (one mesh per material)


class Batch:
    """Collects many boxes / extruded polygons per material and builds one mesh for each."""

    def __init__(self):
        self.parts = {}

    def poly(self, pts, z, h, material):
        self.parts.setdefault(id(material), (material, []))[1].append((list(pts), z, h))

    def box(self, u, v, w, d, z, h, material):
        self.poly([(u, v), (u + w, v), (u + w, v + d), (u, v + d)], z, h, material)

    def flush(self):
        for material, items in self.parts.values():
            bm = bmesh.new()
            for pts, z, h in items:
                lo = [bm.verts.new((a, b, zp(z))) for a, b in pts]
                hi = [bm.verts.new((a, b, zp(z + h))) for a, b in pts]
                n = len(pts)
                for i in range(n):
                    j = (i + 1) % n
                    bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
                bm.faces.new(list(reversed(lo)))
                bm.faces.new(hi)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            _obj("batch", bm, material)
        self.parts = {}


def edge_windows(B, a, b, z, h, cols, rows, glass, frame, out=1.0, margin=0.05, fill=0.5, wfill=0.55, sill=None):
    """Window grid on the vertical wall over the ground edge a -> b, pushed outward along its normal (out = +1 / -1)."""
    du, dv = b[0] - a[0], b[1] - a[1]
    L = math.hypot(du, dv)
    nu, nv = dv / L * out, -du / L * out
    eu, ev = du / L, dv / L

    def quad(t0, t1, off0, off1):
        p0 = (a[0] + du * t0, a[1] + dv * t0)
        p1 = (a[0] + du * t1, a[1] + dv * t1)
        return [(p0[0] + nu * off0, p0[1] + nv * off0), (p1[0] + nu * off0, p1[1] + nv * off0), (p1[0] + nu * off1, p1[1] + nv * off1), (p0[0] + nu * off1, p0[1] + nv * off1)]

    span = 1 - 2 * margin
    fw = 0.018 / L  # frame border along the wall
    for c in range(cols):
        t0 = margin + span * (c + (1 - wfill) / 2) / cols
        t1 = t0 + span * wfill / cols
        for r in range(rows):
            z0 = z + h * (r + (1 - fill) / 2) / rows
            zh = h * fill / rows
            B.poly(quad(t0, t1, -0.004, 0.012), z0, zh, glass)
            if frame is not None:
                B.poly(quad(t0 - fw, t1 + fw, -0.004, 0.008), z0 - 0.5, zh + 1.0, frame)
            if sill is not None:
                B.poly(quad(t0 - fw * 1.5, t1 + fw * 1.5, -0.004, 0.02), z0 - 0.9, 0.5, sill)


def rect_windows(B, u, v, w, d, z, h, cu, cv, rows, glass, frame, sides="lrfb", **kw):
    """Window grids on the four walls of a box: l = +v (front/left), r = +u, f = -v (back), b = -u."""
    if "l" in sides:
        edge_windows(B, (u, v + d), (u + w, v + d), z, h, cu, rows, glass, frame, out=-1, **kw)
    if "f" in sides:
        edge_windows(B, (u, v), (u + w, v), z, h, cu, rows, glass, frame, out=1, **kw)
    if "r" in sides:
        edge_windows(B, (u + w, v), (u + w, v + d), z, h, cv, rows, glass, frame, out=1, **kw)
    if "b" in sides:
        edge_windows(B, (u, v), (u, v + d), z, h, cv, rows, glass, frame, out=-1, **kw)


def ring(cu, cv, r, sides, turn=0.0):
    return [(cu + math.cos(turn - math.pi / 2 + i * 2 * math.pi / sides) * r, cv + math.sin(turn - math.pi / 2 + i * 2 * math.pi / sides) * r) for i in range(sides)]


def annulus(B, cu, cv, r0, r1, z, h, material, sides=5):
    """Polygonal ring between radii r0 < r1, as one prism per side."""
    o, n = ring(cu, cv, r1, sides), ring(cu, cv, r0, sides)
    for i in range(sides):
        j = (i + 1) % sides
        B.poly([o[i], o[j], n[j], n[i]], z, h, material)


def tree(B, u, v, z, s, trunk, leaf):
    B.box(u - 0.02, v - 0.02, 0.04, 0.04, z, 3 * s, trunk)
    dome(u, v, 0.13 * s, z + 2 * s, 7 * s, leaf, segs=12, rings=5)


def disc(u, v, z, r, depth, material, axis="v"):
    """Flat disc standing on a wall (normal along +v or +u), centred at (u, v, art z)."""
    if axis == "v":
        rod((u, v, zp(z)), (u, v + depth, zp(z)), r, material, 24)
    else:
        rod((u, v, zp(z)), (u + depth, v, zp(z)), r, material, 24)


# ---------------------------------------------------------------- USA: the Pentagon


def pentagon():
    B = Batch()
    team = mat(TEAM["usa"], 0.5, grain=0)
    lime = mat("#cfc7b0", 0.85, grain=0.1, scale=25)
    lime_d = mat("#b4ac96", 0.9, grain=0.1, scale=25)
    trim = mat("#e6dfcc", 0.7, grain=0.06)
    slate = mat("#5a5f66", 0.75, grain=0.14, scale=14)
    well = mat("#3a3d40", 0.95, grain=0.05)
    glass = mat("#26333d", 0.15, grain=0, glass=True)
    frame = mat("#e8e4da", 0.6, grain=0)
    grass = mat("#6d8a46", 0.95, grain=0.25, scale=10)
    asphalt = mat("#4f5255", 0.9, grain=0.12, scale=20)
    paint = mat("#ecebe4", 0.6, grain=0)
    leaf = mat("#3f6a34", 0.9, grain=0.3, scale=20)
    trunk = mat("#4a3a28", 0.9, grain=0)
    roofred = mat("#7a4a32", 0.8, grain=0.1)

    PW = PD = 4
    CU = CV = 2.0
    Z, H = 1.2, 15.0
    TOP = Z + H
    R, RC = 1.72, 0.66
    # Ground: lawn on a soil plinth, ring road, parking lots at the back corners, heliport.
    B.box(0, 0, PW, PD, 0, 1, mat("#5f6e40", 0.95, grain=0.15))
    B.box(0.02, 0.02, PW - 0.04, PD - 0.04, 1, 0.2, grass)
    annulus(B, CU, CV, R + 0.03, R + 0.2, 1.0, 0.3, asphalt)
    for u0, v0 in ((0.1, 0.1), (PW - 1.05, 0.1)):
        B.box(u0, v0, 0.95, 0.55, 1.0, 0.3, asphalt)
        for i in range(1, 8):
            B.box(u0 + i * 0.118 - 0.006, v0 + 0.05, 0.012, 0.45, 1.3, 0.05, paint)
    B.box(PW - 0.62, PD - 1.4, 0.5, 0.5, 1.0, 0.35, asphalt)
    lathe(PW - 0.37, PD - 1.15, 1.36, [(0.17, 0), (0.2, 0)], paint, segs=32, thickness=0.0)
    cylinder(PW - 0.37, PD - 1.15, 0.2, 1.3, 0.1, paint, 32)
    cylinder(PW - 0.37, PD - 1.15, 0.17, 1.32, 0.12, asphalt, 32)
    B.box(PW - 0.43, PD - 1.25, 0.03, 0.2, 1.4, 0.1, paint)
    B.box(PW - 0.34, PD - 1.25, 0.03, 0.2, 1.4, 0.1, paint)
    B.box(PW - 0.43, PD - 1.165, 0.12, 0.03, 1.4, 0.1, paint)
    for u, v in ((0.3, PD - 0.3), (0.62, PD - 0.18), (PW - 0.3, 0.95), (0.22, 1.2), (0.2, PD - 0.65), (PW - 0.22, PD - 0.3)):
        tree(B, u, v, 1.2, 1.0, trunk, leaf)

    # Building: five ring blocks (E outer .. A inner) with four light wells between them over a lower floor.
    annulus(B, CU, CV, RC, R, Z, H - 5, lime_d)
    rings = [(1.5, R), (1.29, 1.46), (1.08, 1.25), (0.87, 1.04), (RC, 0.83)]
    for r0, r1 in rings:
        annulus(B, CU, CV, r0, r1, Z, H, lime)
        annulus(B, CU, CV, r0 - 0.01, r1 + 0.01, TOP, 0.6, trim)
        annulus(B, CU, CV, r0 + 0.02, r1 - 0.02, TOP + 0.6, 1.6, slate)
    for r in (1.48, 1.27, 1.06, 0.85):
        annulus(B, CU, CV, r - 0.02, r + 0.02, Z + H - 5, 0.1, well)
    # The ten corridors crossing the wells (roof ridges): at every corner and mid-side.
    outer, court = ring(CU, CV, R, 5), ring(CU, CV, RC, 5)
    for i in range(5):
        j = (i + 1) % 5
        for a, b in ((outer[i], court[i]), (((outer[i][0] + outer[j][0]) / 2, (outer[i][1] + outer[j][1]) / 2), ((court[i][0] + court[j][0]) / 2, (court[i][1] + court[j][1]) / 2))):
            du, dv = b[0] - a[0], b[1] - a[1]
            L = math.hypot(du, dv)
            pu, pv = -dv / L * 0.035, du / L * 0.035
            B.poly([(a[0] + pu, a[1] + pv), (b[0] + pu, b[1] + pv), (b[0] - pu, b[1] - pv), (a[0] - pu, a[1] - pv)], Z + H - 5, 5.6, lime)
            B.poly([(a[0] + pu, a[1] + pv), (b[0] + pu, b[1] + pv), (b[0] - pu, b[1] - pv), (a[0] - pu, a[1] - pv)], TOP + 0.6, 0.8, slate)
    # Outer façades: plinth course, five storeys of framed windows, cornice; courtyard walls too.
    annulus(B, CU, CV, R - 0.02, R + 0.012, Z, 1.6, lime_d)
    annulus(B, CU, CV, R - 0.02, R + 0.015, TOP - 0.9, 0.9, trim)
    for i in range(5):
        j = (i + 1) % 5
        # ring() runs clockwise on screen (counter-clockwise in u, v): out = +1 points away from the centre.
        edge_windows(B, outer[i], outer[j], Z + 1.8, H - 2.8, 30, 5, glass, frame, out=1, margin=0.03, fill=0.45, wfill=0.5)
        edge_windows(B, court[i], court[j], Z + 1, H - 2, 10, 5, glass, frame, out=-1, margin=0.08, fill=0.45, wfill=0.5)
    # Courtyard: lawn, crossing paths, trees, the little pavilion in the middle.
    B.poly(ring(CU, CV, RC, 5), 1.0, 0.25, grass)
    for c in court:
        du, dv = c[0] - CU, c[1] - CV
        L = math.hypot(du, dv)
        pu, pv = -dv / L * 0.015, du / L * 0.015
        B.poly([(CU + pu, CV + pv), (c[0] + pu, c[1] + pv), (c[0] - pu, c[1] - pv), (CU - pu, CV - pv)], 1.25, 0.05, mat("#d8d2c0", 0.8, grain=0.05))
    for u, v in ring(CU, CV, RC * 0.6, 5, math.pi / 5):
        tree(B, u, v, 1.2, 0.7, trunk, leaf)
    B.box(CU - 0.07, CV - 0.07, 0.14, 0.14, 1.2, 2.2, paint)
    roof(CU - 0.07, CV - 0.07, 0.14, 0.14, 3.4, 1.6, roofred, kind="pyramid", overhang=0.02)
    # Rooftop plant boxes over the outer corners.
    for u, v in ring(CU, CV, 1.6, 5):
        B.box(u - 0.05, v - 0.05, 0.1, 0.1, TOP + 2.2, 1.4, mat("#a9adb2", 0.5, metal=0.4, grain=0.05))

    # Mall entrance on the front (+v) façade: steps, columned portico, pediment, team-colour banner.
    f0, f1 = outer[2], outer[3]
    mu, mv = (f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2
    for k in range(3):
        B.box(mu - 0.38 + k * 0.02, mv - 0.01, 0.76 - k * 0.04, 0.3 - k * 0.04, Z - 0.1 + k * 0.4, 0.5, trim)
    B.box(mu - 0.32, mv - 0.05, 0.64, 0.05, Z + 1.2, 9, lime_d)
    B.box(mu - 0.06, mv - 0.005, 0.12, 0.01, Z + 1.2, 4, mat("#1e1f22", 0.6, grain=0))
    col = mat("#f4f0e6", 0.6, grain=0.04)
    for k in range(8):
        u = mu - 0.28 + k * 0.08
        cylinder(u, mv + 0.17, 0.018, Z + 1.2, 8.5, col, 12)
    B.box(mu - 0.33, mv - 0.05, 0.66, 0.27, Z + 9.7, 1.4, trim)
    roof(mu - 0.33, mv - 0.05, 0.66, 0.27, Z + 11.1, 3, slate, kind="gable", ridge="v", overhang=0.02)
    B.box(mu - 0.25, mv + 0.22, 0.5, 0.01, Z + 9.9, 1.0, team)
    B.flush()
    render("barracks-usa-pentagon", (4, 4), 40)


# ---------------------------------------------------------------- Russia: Frunzenskaya Ministry of Defence

W, D, MU = 5, 3, 2.5


def stalinist():
    B = Batch()
    team = mat(TEAM["russia"], 0.5, grain=0)
    stone = mat("#dcd2bb", 0.85, grain=0.1, scale=25)
    base = mat("#a59a80", 0.9, grain=0.12, scale=20)
    trim = mat("#ece5d2", 0.7, grain=0.05)
    roofm = mat("#7e786c", 0.8, grain=0.15, scale=14)
    glass = mat("#2a2f33", 0.2, grain=0, glass=True)
    frame = mat("#efe9d8", 0.6, grain=0)
    domem = mat("#5d8a94", 0.35, metal=0.6, grain=0.05)
    gold = mat("#d9b23e", 0.3, metal=0.9, grain=0)
    dark = mat("#26282a", 0.7, grain=0)
    pave = mat("#8f846c", 0.95, grain=0.15, scale=10)
    B.box(0, 0, W, D, 0, 2, pave)

    def tiered(u, v, w, d, z, h, cols_u, cols_v, rows):
        B.box(u, v, w, d, z, h, stone)
        rect_windows(B, u, v, w, d, z + 1, h - 2, cols_u, cols_v, rows, glass, frame, fill=0.55, wfill=0.45)
        B.box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, z + h, 1.2, trim)

    # Two tall stepped towers at the back, each crowned with a spire and a star.
    for u in (0.7, W - 0.7 - 0.75):
        B.box(u, 0.1, 0.75, 0.75, 2, 2.5, base)
        tiered(u, 0.1, 0.75, 0.75, 4.5, 31.5, 5, 5, 9)
        tiered(u + 0.1, 0.2, 0.55, 0.55, 37.2, 7, 4, 4, 2)
        tiered(u + 0.2, 0.3, 0.35, 0.35, 45.4, 4, 2, 2, 1)
        roof(u + 0.2, 0.3, 0.35, 0.35, 50.6, 6, roofm, kind="pyramid", overhang=0.03)
        lathe(u + 0.375, 0.475, 56, [(0.03, 0), (0.005, 9)], gold, segs=12, cap_bottom=True)
        for k in range(4):  # corner pinnacles on the first tier
            pu = u + (0.04 if k % 2 == 0 else 0.67)
            pv = 0.14 + (0 if k < 2 else 0.63)
            B.box(pu, pv, 0.04, 0.04, 37.2, 3, trim)
    # Teal domes on drums between the towers and the centre.
    for u in (1.85, W - 1.85):
        cylinder(u, 0.95, 0.3, 20, 4, stone, 32)
        cylinder(u, 0.95, 0.33, 24, 0.8, trim, 32)
        dome(u, 0.95, 0.31, 24.8, 9, domem)
        lathe(u, 0.95, 33.5, [(0.02, 0), (0.004, 4)], gold, segs=8, cap_bottom=True)

    C0, CW = 1.75, W - 3.5
    # Long low wings either side, an arched gateway beside the centre.
    for u, w, gate_u in ((0.08, C0 - 0.08, C0 - 0.4), (W - C0, C0 - 0.08, W - C0 + 0.4)):
        B.box(u, 1.0, w, 1.95, 2, 2.4, base)
        B.box(u, 1.0, w, 1.95, 4.4, 15.6, stone)
        rect_windows(B, u, 1.0, w, 1.95, 5, 14.5, 9, 10, 4, glass, frame, fill=0.55, wfill=0.42)
        B.box(u - 0.02, 0.98, w + 0.04, 1.99, 20, 1.4, trim)
        roof(u, 1.0, w, 1.95, 21.4, 3, roofm, kind="hip", ridge="u", overhang=0.02)
        B.box(gate_u - 0.12, 2.94, 0.24, 0.03, 2, 10, trim)
        B.box(gate_u - 0.08, 2.95, 0.16, 0.03, 2, 8, dark)
        rod((gate_u - 0.08, 2.965, zp(10)), (gate_u + 0.08, 2.965, zp(10)), 0.015, dark, 8)
    # Central block: rusticated base, giant pilasters, team band, attic with the crest, crowning pavilion.
    B.box(C0, 0.6, CW, 2.35, 2, 3, base)
    B.box(C0, 0.6, CW, 2.35, 5, 25, stone)
    rect_windows(B, C0, 0.6, CW, 2.35, 6, 22, 7, 11, 6, glass, frame, fill=0.6, wfill=0.4)
    for k in range(8):
        u = C0 + 0.02 + k * (CW - 0.06) / 7
        B.box(u, 2.95, 0.04, 0.035, 5, 25, trim)
    B.box(C0 - 0.01, 2.95, CW + 0.02, 0.03, 27, 1.2, team)
    B.box(C0 + 0.6, 2.95, CW - 1.2, 0.04, 2, 7, dark)
    for k in range(3):
        B.box(C0 + 0.5 + k * 0.03, 2.95 + k * 0.08 + 0.04, CW - 1.0 - k * 0.06, 0.08, 2 - k * 0.6, 0.6, trim)
    B.box(C0 - 0.03, 0.57, CW + 0.06, 2.41, 30, 1.6, trim)
    for k in range(12):  # balustrade posts
        B.box(C0 + 0.02 + k * (CW - 0.06) / 11, 2.93, 0.03, 0.03, 31.6, 1.8, trim)
    B.box(C0 - 0.03, 2.93, CW + 0.06, 0.05, 33.2, 0.5, trim)
    B.box(C0 + 0.2, 0.8, CW - 0.4, 1.95, 31.6, 6, stone)
    rect_windows(B, C0 + 0.2, 0.8, CW - 0.4, 1.95, 32.5, 4.5, 6, 8, 1, glass, frame, sides="frb", fill=0.6, wfill=0.4)
    disc(MU, 2.75, 34.6, 0.13, 0.02, gold)
    disc(MU, 2.76, 34.6, 0.06, 0.02, mat("#b8231c", 0.5, grain=0))
    B.box(C0 + 0.18, 0.78, CW - 0.36, 1.99, 37.6, 0.8, trim)
    B.box(C0 + 0.4, 1.1, CW - 0.8, 1.3, 38.4, 2.2, mat("#3c3a36", 0.8, grain=0.1))
    B.flush()
    render("barracks-russia", (W, D), 66)


# ---------------------------------------------------------------- China: August 1st Building


def bayi():
    B = Batch()
    team = mat(TEAM["china"], 0.5, grain=0)
    stone = mat("#ece5d4", 0.85, grain=0.08, scale=25)
    trim = mat("#f7f3e8", 0.7, grain=0.04)
    tile = mat("#4f5458", 0.75, grain=0.15, scale=30)
    glass = mat("#1f2c36", 0.15, grain=0, glass=True)
    frame = mat("#cfc6ae", 0.6, grain=0)
    pave = mat("#b8b2a4", 0.9, grain=0.12, scale=12)
    red = mat("#b8231c", 0.55, grain=0.04)
    gold = mat("#e2b23a", 0.3, metal=0.9, grain=0)
    star = mat("#f2c94c", 0.3, metal=0.8, grain=0)
    B.box(0, 0, W, D, 0, 1.2, pave)

    M0, MW = 0.45, W - 0.9
    # Main block: base course, eight floors of square windows, dark top band, cornice, grey hip roof.
    B.box(M0 + 0.6, 0.1, MW - 1.2, 1.5, 1.2, 40, stone)
    B.box(M0 + 0.59, 0.09, MW - 1.18, 1.52, 1.2, 2.5, frame)
    rect_windows(B, M0 + 0.6, 0.1, MW - 1.2, 1.5, 4, 32, 14, 8, 8, glass, frame, sides="lf", fill=0.55, wfill=0.5)
    for vv in (0.1 - 0.005, 1.6 - 0.005):
        B.box(M0 + 0.6, vv, MW - 1.2, 0.01, 36.5, 3.5, glass)
    B.box(M0 - 0.06, 0.04, MW + 0.12, 1.62, 41.2, 1.4, trim)
    roof(M0, 0.1, MW, 1.5, 42.6, 8, tile, kind="hip", ridge="u", overhang=0.14)
    # Corner bays at both ends, a little taller with their own roofs.
    for u in (M0, M0 + MW - 0.6):
        B.box(u, 0.1, 0.6, 1.5, 1.2, 44, stone)
        B.box(u - 0.01, 0.09, 0.62, 1.52, 1.2, 2.5, frame)
        rect_windows(B, u, 0.1, 0.6, 1.5, 4, 38, 3, 6, 9, glass, frame, fill=0.55, wfill=0.5)
        B.box(u - 0.06, 0.04, 0.72, 1.62, 45.2, 1.4, trim)
        roof(u, 0.1, 0.6, 1.5, 46.6, 6, tile, kind="hip", ridge="v", overhang=0.12)
    # Two low pavilion wings in front, with a set-back upper storey.
    for u in (0.2, W - 0.2 - 1.75):
        v, w, d = 1.85, 1.75, 1.05
        B.box(u, v, w, d, 1.2, 12, stone)
        rect_windows(B, u, v, w, d, 2.2, 10, 9, 5, 1, glass, frame, fill=0.8, wfill=0.45)
        B.box(u - 0.05, v - 0.05, w + 0.1, d + 0.1, 13.2, 1, trim)
        roof(u, v, w, d, 14.2, 3, tile, kind="hip", ridge="u", overhang=0.1)
        k = 0.18
        B.box(u + k, v + k, w - 2 * k, d - 2 * k, 14, 7.5, stone)
        rect_windows(B, u + k, v + k, w - 2 * k, d - 2 * k, 15.5, 5, 6, 3, 1, glass, frame, fill=0.8, wfill=0.5)
        roof(u + k, v + k, w - 2 * k, d - 2 * k, 21.5, 4, tile, kind="hip", ridge="u", overhang=0.1)
    # Pillared entrance between the wings: dark hall behind white columns, red lintel with the emblem, steps.
    E0, EW = 2.05, W - 4.1
    B.box(E0, 1.6, EW, 1.0, 1.2, 16, stone)
    B.box(E0 + 0.04, 2.6, EW - 0.08, 0.01, 1.2, 10.5, mat("#1c1c1a", 0.7, grain=0))
    col = mat("#fbf8f0", 0.6, grain=0.03)
    for i in range(5):
        cylinder(E0 + 0.04 + i * (EW - 0.08) / 4, 2.72, 0.035, 1.2, 10.6, col, 16)
    B.box(E0 - 0.02, 1.6, EW + 0.04, 1.2, 11.8, 4.4, red)
    B.box(E0 - 0.05, 1.56, EW + 0.1, 1.28, 16.2, 1.0, trim)
    roof(E0, 1.6, EW, 1.2, 17.2, 3.5, tile, kind="hip", ridge="u", overhang=0.1)
    disc(MU, 2.8, 14, 0.12, 0.015, gold)
    disc(MU, 2.81, 14, 0.1, 0.015, red)
    B.box(MU - 0.04, 2.825, 0.08, 0.01, 13.2, 1.8, star)
    for i in range(3):
        B.box(E0 - 0.15 + i * 0.04, 2.8 + i * 0.06, EW + 0.3 - i * 0.08, 0.2 - i * 0.06, 1.2 - 0.0, 0.9 - i * 0.3, trim)
    B.box(0.05, 2.92, W - 0.1, 0.05, 1.2, 0.3, team)
    B.flush()
    render("barracks-china", (W, D), 62)


# ---------------------------------------------------------------- Islamic: mud-brick fortress


def islamic_fort():
    B = Batch()
    team = mat(TEAM["islamic"], 0.5, grain=0)
    brick = mat("#b59670", 0.95, grain=0.18, scale=22)
    top = mat("#c7ab84", 0.95, grain=0.15, scale=22)
    keep = mat("#cdb994", 0.9, grain=0.12, scale=22)
    plaster = mat("#e4d2a8", 0.85, grain=0.08)
    green = mat("#1f6b45", 0.5, grain=0.05)
    gdome = mat("#2e8c5a", 0.3, metal=0.3, grain=0.04)
    tilem = mat("#2f6f9a", 0.4, grain=0.05)
    dark = mat("#2b2219", 0.9, grain=0)
    gold = mat("#e2b23a", 0.3, metal=0.9, grain=0)
    yard = mat("#a68c66", 0.95, grain=0.2, scale=10)
    Z, WH, T = 2, 18, 0.22
    B.box(0, 0, W, D, 0, Z, mat("#8f7a58", 0.95, grain=0.15))
    B.box(0.05, 0.05, W - 0.1, D - 0.1, Z, 0.2, yard)
    # Curtain walls (hollow fortress), slit windows, a green tile band, merlons.
    walls = [(0.05, 0.05, W - 0.1, T), (0.05, D - 0.05 - T, W - 0.1, T), (0.05, 0.05 + T, T, D - 0.1 - 2 * T), (W - 0.05 - T, 0.05 + T, T, D - 0.1 - 2 * T)]
    for u, v, w, d in walls:
        B.box(u, v, w, d, Z, WH, brick)
        B.box(u - 0.01, v - 0.01, w + 0.02, d + 0.02, Z + WH - 4.5, 1.0, green)
    rect_windows(B, 0.05, 0.05, W - 0.1, D - 0.1, Z + 8, 6, 16, 10, 1, dark, None, margin=0.22, fill=0.7, wfill=0.25)
    for u, v, w, d in walls:
        n = max(2, round(max(w, d) / 0.18))
        for i in range(n):
            s = (i + 0.2) * max(w, d) / n
            if w >= d:
                B.box(u + s, v, max(w, d) / n * 0.6, d, Z + WH, 3, top)
            else:
                B.box(u, v + s, w, max(w, d) / n * 0.6, Z + WH, 3, top)
    # Round towers: four corners and two mid-wall towers at the back and front.
    for u, v in ((0.3, 0.3), (MU, 0.3), (W - 0.3, 0.3), (0.3, D - 0.3), (W - 0.3, D - 0.3)):
        B.poly(ring(u, v, 0.28, 32), Z, 26, brick)
        cylinder(u, v, 0.3, Z + 21, 1.0, green, 32)
        cylinder(u, v, 0.3, Z + 26, 3, top, 32)
        for i in range(10):
            a = 2 * math.pi * i / 10
            B.box(u + math.cos(a) * 0.25 - 0.04, v + math.sin(a) * 0.25 - 0.04, 0.08, 0.08, Z + 29, 3, top)
    # The keep in the middle with green domes, set back in the courtyard.
    KZ = Z + WH
    B.box(1.2, 0.5, W - 2.4, 1.5, Z, WH + 12, keep)
    rect_windows(B, 1.2, 0.5, W - 2.4, 1.5, Z + 6, WH + 3, 8, 5, 3, dark, plaster, fill=0.5, wfill=0.35)
    B.box(1.18, 0.48, W - 2.36, 1.54, KZ + 9, 1.2, green)
    B.box(1.17, 0.47, W - 2.34, 1.56, KZ + 12, 1, top)
    for u in (1.45, W - 1.45):
        cylinder(u, 1.25, 0.16, KZ + 13, 3, plaster, 24)
        dome(u, 1.25, 0.18, KZ + 16, 7, gdome)
    cylinder(MU, 1.25, 0.34, KZ + 13, 4, plaster, 40)
    dome(MU, 1.25, 0.38, KZ + 17, 14, gdome, onion=False)
    lathe(MU, 1.25, KZ + 31, [(0.02, 0), (0.005, 5)], gold, segs=8, cap_bottom=True)
    # The iwan gateway in the middle of the front: tall portal, pointed arch, blue tile frame, team band.
    gu, gw, gv = MU - 0.45, 0.9, D - 0.4
    B.box(gu, gv, gw, 0.38, Z, 30, keep)
    B.box(gu + 0.04, gv + 0.38, gw - 0.08, 0.01, Z + 1, 27, tilem)
    B.box(gu + 0.2, gv + 0.385, gw - 0.4, 0.01, Z, 16, dark)
    disc(MU, gv + 0.385, Z + 16, 0.25, 0.01, dark)
    B.box(gu - 0.01, gv - 0.01, gw + 0.02, 0.4, Z + 28, 1.2, team)
    for i in range(9):
        B.box(gu + 0.02 + i * (gw - 0.08) / 8, gv, 0.04, 0.38, Z + 30, 2.5, top)
    for u in (gu - 0.04, gu + gw - 0.04):
        cylinder(u + 0.04, gv + 0.2, 0.06, Z, 33, keep, 16)
        dome(u + 0.04, gv + 0.2, 0.07, Z + 33, 4, gdome, segs=16)
    B.flush()
    render("barracks-islamic", (W, D), 54)


MODELS = {
    "barracks-usa-pentagon": pentagon,
    "barracks-russia": stalinist,
    "barracks-china": bayi,
    "barracks-islamic": islamic_fort,
}
