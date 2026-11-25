"""Paxamerica capital (5 x 3): the White House, Washington D.C. — the layout kept as it was (low East and West Wings
with balustraded flat roofs, the Executive Residence with a balustraded roof, a low hip roof and four chimneys, the
North Portico with four columns under a pediment and a lantern over the door), with the ART_GUIDE detail pass:
- windows set back behind frame jambs, a head and a glazing bar; sills; the State floor's windows under alternating
  triangular and segmental pediments;
- rusticated ground floor (horizontal joints), pilasters with bases and capitals, a dentilled entablature;
- the residence's hip roof with standing seams on every face, raised ridge and hips; the wings' flat roofs with
  membrane joints, skylights and vents; chimneys with caps and pots;
- portico: Ionic columns with bases and volute capitals, a tympanum with a round window, a fanlit door between lamps,
  steps;
Team colour (TEAM["usa"]): a band along the residence frieze (front and side) and along both wings' cornices, and on
the portico entablature.

Damage stages (WashingtonWhiteHouse.ts DAMAGE_FILES, CAPITAL_DAMAGE_STAGES.usa): the same building, same camera and
origin, rendered as capital-usa-d1 (80 % HP or less: scorch marks, broken panes with soot streaks, chipped cornice
and balustrade, a few rubble chunks), -d2 (50 % or less: HALF the building gone — the East Wing and the east half of
the residence blown open / collapsed with jagged breaks, floors and charred joists showing, a portico column snapped,
rubble; the west half still standing with lighter damage) and -d3 (20 % or less: completely collapsed — rubble mounds
over the footprint, low wall stubs, column bases, two broken corner fragments (the team band on one), charred beams,
scorched ground; the flag pole on a block in the rubble). Cuts are Boolean differences whose cut faces take a
charred interior material.

Laid out in 4 x 2.4 author units scaled by S = 1.25 to the 5 x 3 plot (the flag pole in WashingtonWhiteHouse.ts keeps
its coordinates). Own geometry only (kit primitives and materials).
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

from kit import _obj, box, cylinder, lathe, mat, render, rod, roof, zp, srgb, TEAM

S = 1.25


def B(u, v, w, d, z, h, m, bevel=0.0):
    return box(u * S, v * S, w * S, d * S, z * S, h * S, m, bevel)


def CYL(cu, cv, r, z, h, m, segs=32):
    return cylinder(cu * S, cv * S, r * S, z * S, h * S, m, segs)


def LATHE(cu, cv, z, prof, m, segs=48, **kw):
    return lathe(cu * S, cv * S, z * S, [(r * S, hz * S) for r, hz in prof], m, segs, **kw)


def ROOF(u, v, w, d, z, h, m, kind="hip", ridge="u", over=0.08):
    return roof(u * S, v * S, w * S, d * S, z * S, h * S, m, kind=kind, ridge=ridge, overhang=over * S)


def ROD(a, b, r, m, segs=6):
    return rod((a[0] * S, a[1] * S, zp(a[2] * S)), (b[0] * S, b[1] * S, zp(b[2] * S)), r * S, m, segs)


def facepoly(face, u, v, w, d, pts, m, depth=0.015):
    """Flat plate on a box face ("left" = +v face, s along u; "right" = +u face, s along v), pts [(s, z)]."""
    bm = bmesh.new()

    def P(s, z, t):
        if face == "left":
            return ((u + s) * S, (v + d + t) * S, zp(z * S))
        return ((u + w + t) * S, (v + s) * S, zp(z * S))

    a = [bm.verts.new(P(s, z, 0)) for s, z in pts]
    b = [bm.verts.new(P(s, z, depth)) for s, z in pts]
    n = len(pts)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("plate", bm, m)


def rect(face, u, v, w, d, s0, s1, z0, z1, m, depth):
    facepoly(face, u, v, w, d, [(s0, z0), (s1, z0), (s1, z1), (s0, z1)], m, depth)


def face_len(face, w, d):
    return w if face == "left" else d


def grid(face, u, v, w, d, z, h, cols, rows, glass, frame, fill=0.55, margin=0.08, sill=None, pediment=None):
    """Windows set back in frames: glass plate, then jambs / head / glazing bars proud of it; sills; pediments
    alternating triangular and segmental."""
    L = face_len(face, w, d)
    for c in range(cols):
        s0 = L * (margin + (1 - 2 * margin) * (c + (1 - fill) / 2) / cols)
        s1 = s0 + L * (1 - 2 * margin) * fill / cols
        for r in range(rows):
            t0 = z + h * (0.18 + r) / rows
            th = h * 0.6 / rows
            fw = (s1 - s0) * 0.14
            rect(face, u, v, w, d, s0, s1, t0, t0 + th, glass, 0.008)
            rect(face, u, v, w, d, s0 - fw, s0, t0 - 0.6, t0 + th + 0.6, frame, 0.02)
            rect(face, u, v, w, d, s1, s1 + fw, t0 - 0.6, t0 + th + 0.6, frame, 0.02)
            rect(face, u, v, w, d, s0 - fw, s1 + fw, t0 + th, t0 + th + 0.6, frame, 0.02)
            mid = (s0 + s1) / 2
            rect(face, u, v, w, d, mid - fw * 0.22, mid + fw * 0.22, t0, t0 + th, frame, 0.014)
            for k in (1, 2):  # sash bars
                zz = t0 + th * k / 3
                rect(face, u, v, w, d, s0, s1, zz - 0.15, zz + 0.15, frame, 0.013)
            if sill is not None:
                rect(face, u, v, w, d, s0 - fw * 2, s1 + fw * 2, t0 - 1.2, t0 - 0.5, sill, 0.03)
            if pediment is not None:
                rect(face, u, v, w, d, s0 - fw * 2, s1 + fw * 2, t0 + th + 0.7, t0 + th + 1.2, pediment, 0.03)
                if c % 2 == 0:
                    facepoly(face, u, v, w, d, [(s0 - fw * 2, t0 + th + 1.2), (s1 + fw * 2, t0 + th + 1.2), (mid, t0 + th + 3.2)], pediment, 0.03)
                else:
                    hw = (s1 - s0) / 2 + fw * 2
                    arc = [(mid + hw * math.cos(a * math.pi / 8), t0 + th + 1.2 + 1.6 * math.sin(a * math.pi / 8)) for a in range(9)]
                    facepoly(face, u, v, w, d, arc, pediment, 0.03)


def rustication(face, u, v, w, d, z0, z1, m, step=1.25):
    L = face_len(face, w, d)
    z = z0 + step
    while z < z1 - 0.3:
        rect(face, u, v, w, d, 0, L, z - 0.12, z + 0.12, m, 0.004)
        z += step


def dentils(face, u, v, w, d, z, m, step=0.05):
    L = face_len(face, w, d)
    for k in range(int(L / step)):
        s = 0.012 + k * step
        rect(face, u, v, w, d, s, s + 0.022, z, z + 0.6, m, 0.03)


def balustrade(u0, v0, u1, v1, z, h, m, step=0.07):
    """Rail on turned balusters along a straight line, with a plinth."""
    L = math.dist((u0, v0), (u1, v1))
    n = max(2, int(L / step))
    for i in range(n + 1):
        t = i / n
        cu, cv = u0 + (u1 - u0) * t, v0 + (v1 - v0) * t
        LATHE(cu, cv, z + h * 0.12, [(0.012, 0), (0.018, h * 0.18), (0.009, h * 0.4), (0.014, h * 0.62), (0.011, h * 0.68)], m, 8)
    t = 0.02
    B(min(u0, u1) - t, min(v0, v1) - t, abs(u1 - u0) + 2 * t, abs(v1 - v0) + 2 * t, z, h * 0.12, m)
    B(min(u0, u1) - t, min(v0, v1) - t, abs(u1 - u0) + 2 * t, abs(v1 - v0) + 2 * t, z + h * 0.8, h * 0.2, m)


def ring_balustrade(u, v, w, d, z, h, m, step=0.07):
    balustrade(u, v, u + w, v, z, h, m, step)
    balustrade(u, v + d, u + w, v + d, z, h, m, step)
    balustrade(u, v, u, v + d, z, h, m, step)
    balustrade(u + w, v, u + w, v + d, z, h, m, step)
    for cu, cv in ((u, v), (u + w, v), (u, v + d), (u + w, v + d)):  # piers at the corners
        B(cu - 0.03, cv - 0.03, 0.06, 0.06, z, h * 1.05, m)


def seamed_hip(u, v, w, d, z, h, m, seam, ridge_m, step=0.05):
    """Low hip roof (ridge along u) with standing seams on all four slopes, ridge and hip ribs."""
    ROOF(u, v, w, d, z, h, m, over=0)
    half = min(w, d) / 2

    def hz(pu, pv):
        return z + h * min(pu - u, u + w - pu, pv - v, v + d - pv, half) / half

    n = round(w / step)
    for k in range(1, n):
        pu = u + k * w / n
        r = min(pu - u, u + w - pu, half) - 0.005
        if r < 0.02:
            continue
        for e, sg in ((v, 1), (v + d, -1)):
            p, q = (pu, e + sg * 0.004), (pu, e + sg * r)
            ROD((p[0], p[1], hz(*p) + 0.2), (q[0], q[1], hz(*q) + 0.2), 0.0045, seam, 4)
    m2 = round(d / step)
    for k in range(1, m2):
        pv = v + k * d / m2
        r = min(pv - v, v + d - pv, half) - 0.005
        if r < 0.02:
            continue
        for e, sg in ((u, 1), (u + w, -1)):
            p, q = (e + sg * 0.004, pv), (e + sg * r, pv)
            ROD((p[0], p[1], hz(*p) + 0.2), (q[0], q[1], hz(*q) + 0.2), 0.0045, seam, 4)
    cv = v + d / 2
    r0, r1 = (u + half, cv), (u + w - half, cv)
    ROD((r0[0], r0[1], z + h + 0.25), (r1[0], r1[1], z + h + 0.25), 0.012, ridge_m, 6)
    for (pu, pv) in ((u, v), (u + w, v), (u, v + d), (u + w, v + d)):
        top = r0 if pu == u else r1
        ROD((pu, pv, z + 0.25), (top[0], top[1], z + h + 0.25), 0.009, ridge_m, 6)


def flat_roof(u, v, w, d, z, membrane, joint, vent, glass):
    B(u, v, w, d, z, 0.4, membrane)
    n = max(1, int(w / 0.18))
    for k in range(1, n):
        B(u + k * w / n - 0.003, v, 0.006, d, z + 0.4, 0.06, joint)
    m = max(1, int(d / 0.18))
    for k in range(1, m):
        B(u, v + k * d / m - 0.003, w, 0.006, z + 0.4, 0.06, joint)
    for k in range(3):  # skylights
        cv = v + d * (k + 1) / 4
        B(u + w * 0.3, cv - 0.06, w * 0.4, 0.12, z + 0.4, 0.8, joint)
        B(u + w * 0.32, cv - 0.045, w * 0.36, 0.09, z + 1.2, 0.2, glass)
    for cv in (v + d * 0.15, v + d * 0.85):  # vents
        CYL(u + w * 0.2, cv, 0.025, z + 0.4, 1.4, vent, 10)
        LATHE(u + w * 0.2, cv, z + 1.8, [(0.04, 0), (0.0, 0.7)], vent, 10, cap_bottom=True)


def white_house(damage=0):
    white = mat("#ebe8de", 0.75, grain=0.06, scale=30)
    white2 = mat("#dcd8cc", 0.8, grain=0.06, scale=30)
    joint = mat("#c4c0b4", 0.85, grain=0)
    stone = mat("#a29e92", 0.9, grain=0.12, scale=10)
    roofm = mat("#6c7076", 0.6, metal=0.3, grain=0.05)
    seam = mat("#868a90", 0.45, metal=0.5, grain=0)
    ridge_m = mat("#55595e", 0.5, metal=0.5, grain=0)
    membrane = mat("#5e6166", 0.85, grain=0.1, scale=20)
    mjoint = mat("#73767b", 0.9, grain=0)
    vent = mat("#9a9c9e", 0.45, metal=0.6, grain=0)
    glass = mat("#26303c", 0.1, grain=0, glass=True)
    frame = mat("#f6f3ea", 0.6, grain=0)
    dark = mat("#3b3a36", 0.8, grain=0)
    door = mat("#2c2a26", 0.6, grain=0.05)
    col = mat("#f8f5ee", 0.6, grain=0.04)
    brick = mat("#8a5a48", 0.9, grain=0.15, scale=40)
    team = mat(TEAM["usa"], 0.45, metal=0.3, grain=0)
    lamp = mat("#e8dfb8", 0.3, grain=0, emit="#ffe9a8")
    iron = mat("#2a2b2d", 0.5, metal=0.6, grain=0)
    D = 2.4
    B(0, 0, 4, D, 0, 3, stone)
    for k in range(1, 12):  # paving joints on the forecourt / terrace
        B(k * 4 / 12 - 0.003, 1.9, 0.006, 0.5, 3, 0.05, mjoint)
    B(0, 2.2, 4, 0.006, 3, 0.05, mjoint)
    if damage >= 3:
        ruins(locals())
        return finish(damage)

    # West and East Wings: low flat-roofed fronts with pilasters.
    for wu in (0.05, 3.25):
        B(wu, 0.1, 0.7, 2.2, 3, 12, white)
        rustication("left", wu, 0.1, 0.7, 2.2, 3, 8.5, joint)
        rustication("right", wu, 0.1, 0.7, 2.2, 3, 8.5, joint)
        grid("left", wu, 0.1, 0.7, 2.2, 3, 12, 3, 2, glass, frame, fill=0.45, sill=white)
        grid("right", wu, 0.1, 0.7, 2.2, 3, 12, 9, 2, glass, frame, fill=0.45, sill=white)
        for i in range(4):
            s = 0.02 + (0.7 - 0.04) * i / 3
            rect("left", wu, 0.1, 0.7, 2.2, s - 0.015, s + 0.015, 3, 15, white2, 0.012)
        for i in range(10):
            s = 0.02 + (2.2 - 0.04) * i / 9
            rect("right", wu, 0.1, 0.7, 2.2, s - 0.015, s + 0.015, 3, 15, white2, 0.012)
        B(wu - 0.02, 0.08, 0.74, 2.24, 13.0, 1.3, team)  # team line under the cornice
        dentils("left", wu - 0.03, 0.07, 0.76, 2.26, 14.4, white)
        dentils("right", wu - 0.03, 0.07, 0.76, 2.26, 14.4, white)
        B(wu - 0.03, 0.07, 0.76, 2.26, 15, 1.2, white2)
        flat_roof(wu, 0.1, 0.7, 2.2, 16.2, membrane, mjoint, vent, glass)
        ring_balustrade(wu + 0.02, 0.12, 0.66, 2.16, 16.2, 2.0, white, 0.09)

    # Executive Residence.
    u, v, w, d = 0.75, 0.1, 2.5, 1.75
    B(u, v, w, d, 3, 10, white2)
    rustication("left", u, v, w, d, 3, 13, joint)
    rustication("right", u, v, w, d, 3, 13, joint)
    grid("left", u, v, w, d, 3, 10, 12, 1, glass, frame, fill=0.42, sill=white)
    grid("right", u, v, w, d, 3, 10, 8, 1, glass, frame, fill=0.42, sill=white)
    B(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 13, 1, white2)
    B(u, v, w, d, 14, 14, white)
    grid("left", u, v, w, d, 14, 14, 12, 1, glass, frame, fill=0.5, sill=white, pediment=white)
    grid("right", u, v, w, d, 14, 14, 8, 1, glass, frame, fill=0.5, sill=white, pediment=white)
    # Pilasters between bays, with bases and capitals.
    for i in range(13):
        s = 0.08 + (w - 0.16) * i / 12
        B(u + s - 0.02, v + d, 0.04, 0.02, 3, 25, white)
        B(u + s - 0.028, v + d, 0.056, 0.03, 14, 0.8, white2)
        B(u + s - 0.028, v + d, 0.056, 0.03, 26.2, 0.9, white2)
    for i in range(9):
        s = 0.08 + (d - 0.16) * i / 8
        B(u + w, v + s - 0.02, 0.02, 0.04, 3, 25, white)
        B(u + w, v + s - 0.028, 0.03, 0.056, 14, 0.8, white2)
        B(u + w, v + s - 0.028, 0.03, 0.056, 26.2, 0.9, white2)
    B(u - 0.045, v - 0.045, w + 0.09, d + 0.09, 26.0, 1.3, team)  # team line along the frieze
    dentils("left", u - 0.05, v - 0.05, w + 0.1, d + 0.1, 27.4, white)
    dentils("right", u - 0.05, v - 0.05, w + 0.1, d + 0.1, 27.4, white)
    B(u - 0.05, v - 0.05, w + 0.1, d + 0.1, 28, 2.2, white)
    flat_roof(u, v, w, d, 30.2, membrane, mjoint, vent, glass)
    ring_balustrade(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 30.2, 2.6, white, 0.07)
    if damage < 3:
        seamed_hip(u + 0.18, v + 0.18, w - 0.36, d - 0.36, 30.65, 4, roofm, seam, ridge_m)
    for ci, cu in enumerate((u + 0.25, u + w - 0.25)):
        for cj, cv in enumerate((v + 0.4, v + d - 0.4)):
            if damage >= 2 and ci == 1:
                B(cu - 0.06, cv - 0.06, 0.12, 0.12, 30.7, 2.5 + ci, white2)  # broken-off stump
                continue
            B(cu - 0.06, cv - 0.06, 0.12, 0.12, 30.7, 8, white2)
            for k in range(1, 6):
                B(cu - 0.061, cv - 0.061, 0.122, 0.122, 30.7 + k * 1.3, 0.15, joint)
            B(cu - 0.07, cv - 0.07, 0.14, 0.14, 38.2, 0.8, white)
            for du in (-0.03, 0.03):  # chimney pots
                CYL(cu + du, cv, 0.016, 39, 1.2, brick, 8)

    # North Portico.
    pu, pw, pv = 1.55, 0.9, v + d
    B(pu - 0.05, pv, pw + 0.1, 0.55, 3, 2, white2)
    for k in range(3):
        B(pu + 0.1, pv + 0.5 + k * 0.03, pw - 0.2, 0.03, 3 - k * 0.7, 0.7, stone)
    # Door: dark opening, frame, fanlight, panelled leaves.
    facepoly("left", u, v, w, d, [(0.93, 3), (1.27, 3), (1.27, 12.4), (0.93, 12.4)], white, 0.008)
    facepoly("left", u, v, w, d, [(0.95, 3), (1.25, 3), (1.25, 10), (0.95, 10)], door, 0.012)
    fan = [(1.1 + 0.15 * math.cos(a * math.pi / 10), 10.2 + 1.8 * math.sin(a * math.pi / 10)) for a in range(11)]
    facepoly("left", u, v, w, d, fan, glass, 0.012)
    for k in range(5):  # fanlight spokes
        a = math.pi * (k + 1) / 6
        facepoly("left", u, v, w, d, [(1.1 - 0.004, 10.2), (1.1 + 0.004, 10.2), (1.1 + 0.15 * math.cos(a), 10.2 + 1.8 * math.sin(a))], frame, 0.016)
    facepoly("left", u, v, w, d, [(1.098, 3), (1.102, 3), (1.102, 10), (1.098, 10)], frame, 0.016)
    for zz in (5, 7.5):
        for s0 in (0.97, 1.12):
            facepoly("left", u, v, w, d, [(s0, zz), (s0 + 0.11, zz), (s0 + 0.11, zz + 1.6), (s0, zz + 1.6)], dark, 0.016)
    facepoly("left", u, v, w, d, [(0.98, 12.5), (1.22, 12.5), (1.1, 15)], white, 0.02)
    broken_cols = {3} if damage == 2 else ({0, 3} if damage >= 3 else set())
    for k in range(4):
        cu = pu + 0.1 + k * 0.233
        CYL(cu, pv + 0.42, 0.06, 5, 1.2, white)
        CYL(cu, pv + 0.42, 0.066, 5, 0.5, white2)
        if k in broken_cols:
            stump = 7.5 + 3 * k
            LATHE(cu, pv + 0.42, 6.2, [(0.05, 0), (0.047, stump - 6.2)], col, 20, cap_top=True)
            jag_cap(cu, pv + 0.42, stump, 0.047, char_mat())
            # The fallen drum lies across the steps.
            ROD((cu - 0.05, pv + 0.6, 4.2), (cu + 0.28 * (1 if k == 0 else -1), pv + 0.68, 4.0), 0.046, col, 20)
            continue
        LATHE(cu, pv + 0.42, 6.2, [(0.05, 0), (0.042, 21)], col, 20, cap_top=True)
        for j in range(12):  # flutes
            a = 2 * math.pi * j / 12
            ROD((cu + 0.046 * math.cos(a), pv + 0.42 + 0.046 * math.sin(a), 6.6), (cu + 0.041 * math.cos(a), pv + 0.42 + 0.041 * math.sin(a), 26.8), 0.004, white2, 4)
        B(cu - 0.055, pv + 0.365, 0.11, 0.11, 26.8, 0.5, white2)  # echinus
        for du in (-0.055, 0.055):  # Ionic volutes
            ROD((cu + du, pv + 0.38, 27.0), (cu + du, pv + 0.47, 27.0), 0.018, white, 10)
        B(cu - 0.06, pv + 0.36, 0.12, 0.12, 27.2, 0.9, white)
    if damage >= 3:
        # Pediment and portico roof down: the entablature survives only over the two inner columns.
        B(pu + 0.25, pv, pw - 0.5, 0.52, 28, 2.2, white)
        B(pu + 0.24, pv + 0.52, pw - 0.48, 0.012, 28.5, 0.7, team)
        fallen_lantern(1.99, pv, lamp, iron)
        damage_pass(damage, locals())
        return finish(damage)
    B(pu, pv, pw, 0.52, 28, 2.2, white)
    B(pu - 0.01, pv + 0.52, pw + 0.02, 0.012, 28.5, 0.7, team)  # team line on the portico entablature
    dentils("left", pu, pv, pw, 0.52, 27.4, white)
    seam_g = mat("#868a90", 0.45, metal=0.5, grain=0)
    ROOF(pu, pv - 0.05, pw, 0.57, 30.2, 7, roofm, kind="gable", ridge="u", over=0.03)
    for k in range(1, 18):  # seams down both slopes of the portico roof
        su = pu - 0.03 + k * (pw + 0.06) / 18
        for e, sg in ((pv - 0.08, 1), (pv + 0.55, -1)):
            ROD((su, e, 30.4), (su, pv + 0.235, 37.3), 0.004, seam_g, 4)
    facepoly("left", pu - 0.03, pv - 0.05, pw + 0.06, 0.57, [(0, 30.2), (pw + 0.06, 30.2), ((pw + 0.06) / 2, 37.2)], white, 0.04)
    facepoly("left", pu - 0.03, pv - 0.04, pw + 0.06, 0.57, [(0.1, 31), (pw - 0.04, 31), ((pw + 0.06) / 2, 35.8)], white2, 0.04)
    # Tympanum: round window with a garland band.
    oc = [((pw + 0.06) / 2 + 0.06 * math.cos(a * math.pi / 8), 32.8 + 1.2 * math.sin(a * math.pi / 8)) for a in range(16)]
    facepoly("left", pu - 0.03, pv - 0.03, pw + 0.06, 0.57, oc, glass, 0.03)
    facepoly("left", pu - 0.03, pv - 0.035, pw + 0.06, 0.57, [((pw + 0.06) / 2 + 0.075 * math.cos(a * math.pi / 8), 32.8 + 1.5 * math.sin(a * math.pi / 8)) for a in range(16)], frame, 0.03)
    # Lantern over the door, wall lamps either side.
    ROD((1.99, pv + 0.22, 28), (1.99, pv + 0.22, 21), 0.006, iron, 4)
    CYL(1.99, pv + 0.22, 0.035, 18, 3, lamp)
    CYL(1.99, pv + 0.22, 0.042, 21, 0.4, iron)
    for s in (0.85, 1.35):
        B(u + s - 0.02, v + d + 0.012, 0.04, 0.03, 8.5, 1.6, lamp)
        B(u + s - 0.025, v + d + 0.012, 0.05, 0.035, 10.1, 0.3, iron)
    damage_pass(damage, locals())
    finish(damage)


def finish(damage):
    render("capital-usa" + (f"-d{damage}" if damage else ""), (5, 3), 40 * S)


def fallen_lantern(cu, pv, lamp, iron):
    """The door lantern, fallen onto the steps."""
    CYL(cu + 0.12, pv + 0.62, 0.035, 3.3, 0.9, lamp, 10)
    ROD((cu + 0.08, pv + 0.6, 3.6), (cu + 0.3, pv + 0.5, 3.8), 0.006, iron, 4)


# ---------------------------------------------------------------- damage

_CHAR = {}


def char_mat():
    """Charred interior: soot-black with burnt-wood grain."""
    m = _CHAR.get("m")
    if not _alive(m):
        m = _CHAR["m"] = mat("#1d1814", 0.95, grain=0.45, scale=60)
    return m


def _alive(m):
    """A cached material still in this scene (kit.reset wipes every datablock between models)."""
    try:
        return m is not None and m.name in bpy.data.materials and bpy.data.materials[m.name] == m
    except ReferenceError:
        return False


def soot_mat(strength=0.75):
    """Soot film: dark, its alpha broken up by stretched noise so it fades into streaks, not a flat patch."""
    key = f"soot{strength}"
    m = _CHAR.get(key)
    if _alive(m):
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb("#16120f")
    bsdf.inputs["Roughness"].default_value = 0.95
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (3.0, 3.0, 0.6)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9
    noise.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (strength, strength, strength, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
    _CHAR[key] = m
    return m


def jag_cap(cu, cv, z, r, m, n=10):
    """Jagged broken top of a column: a ring of uneven spikes."""
    rng = random.Random(int(cu * 1000))
    bm = bmesh.new()
    ring, lo = [], []
    for k in range(n):
        a = 2 * math.pi * k / n
        pu, pv = cu + r * math.cos(a), cv + r * math.sin(a)
        ring.append(bm.verts.new((pu * S, pv * S, zp((z + rng.uniform(-0.6, 1.4)) * S))))
        lo.append(bm.verts.new((pu * S, pv * S, zp((z - 1.2) * S))))
    bm.faces.new(ring)
    bm.faces.new(list(reversed(lo)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], ring[j], ring[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("stump", bm, m)


def rock(rng, cu, cv, z, size, m):
    """One rubble chunk: an irregular faceted lump (author units, z in px), resting on z."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sx, sy = size * rng.uniform(0.7, 1.3), size * rng.uniform(0.7, 1.3)
    sz = size * rng.uniform(25, 45)  # px
    for vert in bm.verts:
        j = rng.uniform(0.75, 1.2)
        x, y, zz = vert.co.x * j, vert.co.y * j, vert.co.z * j
        vert.co.x = (cu + x * sx) * S
        vert.co.y = (cv + y * sy) * S
        vert.co.z = zp((z + (max(zz, -0.3) + 0.3) * sz * 0.7) * S)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("rubble", bm, m)


def pile(rng, cu, cv, z, radius, count, mats, size=0.045):
    for _ in range(count):
        a = rng.uniform(0, 2 * math.pi)
        r = radius * math.sqrt(rng.random())
        heap = (1 - r / radius) * 4.0  # px, higher in the middle
        rock(rng, cu + r * math.cos(a), cv + r * math.sin(a), z + rng.uniform(0, heap), rng.uniform(size * 0.5, size * 1.6), rng.choice(mats))


def cutter(cu, cv, cz, ru, rv, rz, seed):
    """Irregular blast void (an ellipsoid with a ragged surface), author units, z / rz in px."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for vert in bm.verts:
        n = vert.co.normalized()
        k = 1 + rng.uniform(-0.2, 0.2) + 0.15 * math.sin(7 * n.x + 3 * n.y) * math.cos(5 * n.z)
        vert.co.x = (cu + n.x * ru * k) * S
        vert.co.y = (cv + n.y * rv * k) * S
        vert.co.z = zp((cz + n.z * rz * k) * S)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("cutter", bm, char_mat())
    ob.hide_render = True
    ob.hide_viewport = True
    return ob


def _bounds(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb))),
            Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb))))


def _closed(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    ok = all(e.is_manifold for e in bm.edges)
    bm.free()
    return ok


def _inside(p, clo, chi):
    """Is p inside the ellipsoid inscribed in the cutter's box (shrunk a little: its surface is ragged)?"""
    c = (clo + chi) / 2
    r = (chi - clo) / 2 * 0.9
    return sum(((p[i] - c[i]) / max(r[i], 1e-6)) ** 2 for i in range(3)) <= 1


def apply_cuts(cutters, ground_top):
    """Boolean every structure mesh the blasts reach; the cut faces take the charred material."""
    boxes = [(c, *_bounds(c)) for c in cutters]
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH" or ob in cutters:
            continue
        lo, hi = _bounds(ob)
        if hi.z <= ground_top + 1e-4:
            continue  # the plot paving and its joints stay whole
        hits = [(c, clo, chi) for c, clo, chi in boxes if lo.x < chi.x and hi.x > clo.x and lo.y < chi.y and hi.y > clo.y and lo.z < chi.z and hi.z > clo.z]
        if not hits:
            continue
        if not _closed(ob):
            # Open shells (turned balusters, uncapped lathes) cannot be cut cleanly: blown away when inside a blast.
            mid = (lo + hi) / 2
            if any(_inside(mid, clo, chi) if c.get("half_u") is None else hi.y > (c["half_u"] + 0.15) * S for c, clo, chi in hits):
                bpy.data.objects.remove(ob, do_unlink=True)
            continue
        for c, clo, chi in hits:
            if True:
                mod = ob.modifiers.new("blast", "BOOLEAN")
                mod.operation = "DIFFERENCE"
                mod.solver = "EXACT"
                mod.object = c
                mod.material_mode = "TRANSFER"


def floors_in(cu, cv, ru, rv, rect_, levels, white2, charm, rng):
    """Exposed floor slabs and charred joists inside a blast, clipped to the building's footprint."""
    u0, v0, u1, v1 = rect_
    a0, a1 = max(u0 + 0.03, cu - ru * 0.8), min(u1 - 0.03, cu + ru * 0.8)
    b0, b1 = max(v0 + 0.03, cv - rv * 0.8), min(v1 - 0.03, cv + rv * 0.8)
    if a1 - a0 < 0.05 or b1 - b0 < 0.05:
        return
    for z in levels:
        for _ in range(3):  # broken slab: overlapping pieces, some sagging
            pa = a0 + (a1 - a0) * rng.uniform(0, 0.25)
            pb = b0 + (b1 - b0) * rng.uniform(0, 0.25)
            B(pa, pb, (a1 - pa) * rng.uniform(0.55, 0.95), (b1 - pb) * rng.uniform(0.55, 0.95), z + rng.uniform(-0.3, 0.2), 0.7, rng.choice([white2, charm, charm]))
        n = max(2, int((a1 - a0) / 0.07))
        for k in range(n):
            ju = a0 + (k + 0.5) * (a1 - a0) / n
            ROD((ju, b0, z - 0.4), (ju, b1 - rng.uniform(0, (b1 - b0) * 0.4), z - 0.4 - rng.uniform(0, 1.5)), 0.012, charm, 5)


def soot_over_windows(glass, frac, rng, broken_m, gone_u=None):
    """Breaks a share of the panes (dark, the glass gone) and streaks soot up the wall above them. Panes east of
    gone_u (author u) went with their wall: no soot is hung where there is no wall."""
    panes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.materials and o.data.materials[0] == glass]
    if gone_u is not None:
        panes = [o for o in panes if _bounds(o)[1].y < gone_u * S]
    panes.sort(key=lambda o: o.name)
    for ob in panes:
        if rng.random() >= frac:
            continue
        ob.data.materials[0] = broken_m
        lo, hi = _bounds(ob)
        h = hi.z - lo.z
        if h <= 0:
            continue
        up = h * rng.uniform(1.0, 2.2)
        bm = bmesh.new()
        if hi.x - lo.x < hi.y - lo.y:  # pane on the +v front (Blender x normal)
            xs, wy = hi.x + 0.006, hi.y - lo.y
            pts = [(xs, lo.y - wy * 0.1, hi.z - h * 0.2), (xs, hi.y + wy * 0.1, hi.z - h * 0.2), (xs, hi.y + wy * 0.35, hi.z + up), (xs, lo.y - wy * 0.35, hi.z + up)]
        else:  # the +u side
            ys, wx = hi.y + 0.006, hi.x - lo.x
            pts = [(lo.x - wx * 0.1, ys, hi.z - h * 0.2), (hi.x + wx * 0.1, ys, hi.z - h * 0.2), (hi.x + wx * 0.35, ys, hi.z + up), (lo.x - wx * 0.35, ys, hi.z + up)]
        bm.faces.new([bm.verts.new(p) for p in pts])
        me = bpy.data.meshes.new("soot")
        bm.to_mesh(me)
        bm.free()
        so = bpy.data.objects.new("soot", me)
        bpy.context.collection.objects.link(so)
        me.materials.append(soot_mat())


def scorch(rng, cu, cv, r, z=3.06):
    """Scorched patch on the ground: a ragged dark film."""
    bm = bmesh.new()
    vs = []
    for k in range(14):
        a = 2 * math.pi * k / 14
        rr = r * rng.uniform(0.6, 1.15)
        vs.append(bm.verts.new(((cu + rr * math.cos(a)) * S, (cv + rr * math.sin(a)) * S, zp(z * S))))
    bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("scorch", bm, soot_mat(0.9))


def damage_pass(damage, L):
    """Adds the stage's damage to the finished building (L = white_house's locals)."""
    if not damage:
        return
    rng = random.Random(1600)
    white, white2, stone, glass = L["white"], L["white2"], L["stone"], L["glass"]
    charm = char_mat()
    broken = mat("#0d0c0b", 0.9, grain=0.2, scale=40)
    debris = [white, white, white2, stone, charm]
    cuts, plans = [], []
    res = (0.75, 0.1, 3.25, 1.85)
    west, east = (0.05, 0.1, 0.75, 2.3), (3.25, 0.1, 3.95, 2.3)
    # Stage 1 on: chipped cornice and balustrade, gaps along the parapets.
    chips = [(1.05, 1.86, 31.5), (2.9, 1.86, 30.5), (3.26, 0.7, 31.0), (3.94, 1.4, 17.0), (0.2, 2.3, 17.2), (3.3, 2.3, 16.8)]
    for i, (cu, cv, cz) in enumerate(chips[: 4 if damage == 1 else 6]):
        cuts.append(cutter(cu, cv, cz, 0.09, 0.07, 2.4, 10 + i))
    if damage >= 2:
        # HALF the building gone: the East Wing and the east half of the residence blown open / collapsed with
        # jagged breaks; the west half stands with lighter damage.
        cuts.append(half_cutter(2.55, 35))  # everything east of a ragged vertical break is gone
        # Roof seams, ridges and hips reaching past the break tore off with the roof sheets.
        for ob in list(bpy.context.scene.objects):
            if ob.type == "MESH" and ob.data.materials and ob.data.materials[0] in (L["seam"], L["ridge_m"]):
                if _bounds(ob)[1].y > 2.2 * S:
                    bpy.data.objects.remove(ob, do_unlink=True)
    apply_cuts(cuts, zp(3.05 * S))
    for cu, cv, ru, rv, rect_, levels in plans:
        floors_in(cu, cv, ru, rv, rect_, levels, white2, charm, rng)
    soot_over_windows(glass, (0.0, 0.35, 0.6, 0.9)[damage], random.Random(77), broken, 2.1 if damage >= 2 else None)
    if damage == 2:
        east_ruin(rng, L, charm, debris)
    piles = [(1.9, 2.22, 0.12, 8), (3.4, 2.34, 0.1, 6)] if damage == 1 else [(0.5, 2.35, 0.12, 8), (1.9, 2.3, 0.15, 10)]
    for p in piles:
        pile(rng, p[0], p[1], p[4] if len(p) > 4 else 3.0, p[2], p[3], debris)
    marks = [(2.3, 2.2, 0.18)] if damage == 1 else [(2.3, 2.2, 0.25), (0.6, 2.3, 0.2)]
    for cu, cv, r in marks:
        scorch(rng, cu, cv, r)
    for k in range(6 + 4 * damage):  # scorch blooms on the residence and wing walls
        sz = rng.uniform(5, 20)
        hw = rng.uniform(0.12, 0.22)
        face, (bu, bv, bw, bd) = rng.choice([("left", (0.75, 0.1, 2.5, 1.75)), ("left", (0.75, 0.1, 2.5, 1.75)), ("right", (0.75, 0.1, 2.5, 1.75)), ("left", (3.25, 0.1, 0.7, 2.2)), ("right", (3.25, 0.1, 0.7, 2.2))])
        L_ = bw if face == "left" else bd
        sc = rng.uniform(hw, L_ - hw)
        top = 27 if bw > 1 else 15
        if damage >= 2 and (bu > 3 or (face == "left" and bu + sc > 2.4) or face == "right"):
            continue  # that wall is gone
        rect(face, bu, bv, bw, bd, sc - hw, sc + hw, min(sz, top - 4), min(sz + rng.uniform(5, 10), top), soot_mat(0.7), 0.034)


def half_cutter(u_break, seed):
    """A blast volume taking everything east of a ragged, roughly vertical break near u_break (falling back further
    near the top, as a collapse does)."""
    rng = random.Random(seed)
    vs = [-0.3 + 3.1 * i / 14 for i in range(15)]
    zs = [-2 + 64 * j / 12 for j in range(13)]
    bm = bmesh.new()

    def ub(v, z):
        return u_break - 0.28 * min(1.0, max(0.0, (z - 12) / 22)) + 0.18 * math.sin(v * 5.3 + z * 0.21) + rng.uniform(-0.09, 0.09)

    W = [[bm.verts.new((ub(v, z) * S, v * S, zp(z * S))) for z in zs] for v in vs]
    E = [[bm.verts.new((4.4 * S, v * S, zp(z * S))) for z in zs] for v in vs]
    nv, nz = len(vs), len(zs)
    for i in range(nv - 1):
        for j in range(nz - 1):
            bm.faces.new((W[i][j], W[i + 1][j], W[i + 1][j + 1], W[i][j + 1]))
            bm.faces.new((E[i][j], E[i][j + 1], E[i + 1][j + 1], E[i + 1][j]))
    for i in range(nv - 1):  # bottom and top strips
        bm.faces.new((W[i][0], E[i][0], E[i + 1][0], W[i + 1][0]))
        bm.faces.new((W[i][-1], W[i + 1][-1], E[i + 1][-1], E[i][-1]))
    for j in range(nz - 1):  # back and front strips
        bm.faces.new((W[0][j], W[0][j + 1], E[0][j + 1], E[0][j]))
        bm.faces.new((W[-1][j], E[-1][j], E[-1][j + 1], W[-1][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # The broken faces of the solid masonry read as rough, smoke-stained rubble rather than a black void.
    ob = _obj("cutter", bm, mat("#5e5852", 0.95, grain=0.5, scale=70))
    ob.hide_render = True
    ob.hide_viewport = True
    ob["half_u"] = u_break - 0.3
    return ob


def east_ruin(rng, L, charm, debris):
    """Stage 2: what is left east of the break — low wall stubs, slab ends and joists hanging off the break,
    rubble mounds, charred beams, scorched ground."""
    white, white2, roofm = L["white"], L["white2"], L["roofm"]
    G = 3.0
    for (u0, v0, u1, v1) in ((3.25, 0.1, 3.95, 2.3), (2.6, 0.1, 3.25, 1.85)):
        for (a, b, c, d) in ((u0, v1 - 0.06, u1, v1), (u0, v0, u1, v0 + 0.06), (u1 - 0.06, v0, u1, v1)):
            along_u = (c - a) > (d - b)
            L_ = (c - a) if along_u else (d - b)
            n = max(2, int(L_ / 0.11))
            for k in range(n):
                if rng.random() < 0.3:
                    continue
                h = rng.uniform(1.5, 9.0)
                if along_u:
                    B(a + k * L_ / n, b, L_ / n - 0.005, d - b, G, h, rng.choice([white, white2]))
                else:
                    B(a, b + k * L_ / n, c - a, L_ / n - 0.005, G, h, rng.choice([white, white2]))
    for z in (13.5, 29.5) if True else ():  # slab ends and joists sticking out of the break
        for k in range(5):
            sv = 0.25 + k * 0.33
            ub = 2.5 - 0.28 * min(1.0, max(0.0, (z - 12) / 22))
            B(ub - 0.12, sv, rng.uniform(0.12, 0.3), 0.28, z + rng.uniform(-0.6, 0.2), 0.7, rng.choice([white2, charm]))
            ROD((ub - 0.05, sv + 0.1, z - 0.4), (ub + rng.uniform(0.25, 0.5), sv + rng.uniform(0, 0.25), z - rng.uniform(2, 8)), 0.014, charm, 5)
    for k in range(10):  # rafters hanging off the roof break
        rv = 0.25 + k * 0.15
        ROD((2.3, rv, 30.8), (2.3 + rng.uniform(0.3, 0.7), rv + rng.uniform(-0.1, 0.1), 30.8 - rng.uniform(5, 16)), 0.016, charm, 5)
    for (cu, cv, r, n, hz) in ((3.6, 1.2, 0.5, 70, 2.0), (3.6, 0.5, 0.35, 40, 1.0), (3.6, 1.9, 0.35, 40, 1.0),
                               (2.9, 1.0, 0.55, 70, 3.5), (2.85, 1.7, 0.35, 40, 2.0), (2.8, 2.2, 0.3, 24, 0.0), (2.6, 0.4, 0.3, 30, 2.0)):
        pile(rng, cu, cv, G + rng.uniform(0, hz), r, n, debris, size=0.055)
    for k in range(12):
        cu, cv = rng.uniform(2.6, 3.9), rng.uniform(0.2, 2.2)
        a = rng.uniform(0, math.pi)
        L_ = rng.uniform(0.25, 0.55)
        z0 = G + rng.uniform(2, 6)
        ROD((cu, cv, z0), (cu + L_ * math.cos(a), cv + L_ * math.sin(a), z0 + rng.uniform(-3, 3)), 0.016, charm, 5)
    for k in range(4):
        B(rng.uniform(2.7, 3.7), rng.uniform(0.3, 1.8), rng.uniform(0.15, 0.3), rng.uniform(0.08, 0.15), G + rng.uniform(4, 7), 0.4, roofm)
    for cu, cv, r in ((3.6, 1.2, 0.6), (2.9, 1.2, 0.5), (3.3, 2.4, 0.35), (3.9, 2.3, 0.3)):
        scorch(rng, cu, cv, r)


def ruins(L):
    """Stage 3: completely collapsed — rubble mounds over the footprint, low wall stubs, a few column bases and two
    broken corner fragments (the front-left one still carrying the team band), charred beams, scorched ground. The
    flag pole stands on the rubble at WashingtonWhiteHouse.ts FLAG_POLE (ground z RUIN_POLE_Z)."""
    rng = random.Random(3300)
    white, white2, stone, glass, team, joint = L["white"], L["white2"], L["stone"], L["glass"], L["team"], L["joint"]
    roofm, col = L["roofm"], L["col"]
    charm = char_mat()
    debris = [white, white, white2, white2, stone, charm, roofm]
    G = 3.0
    rects = [(0.75, 0.1, 3.25, 1.85), (0.05, 0.1, 0.75, 2.3), (3.25, 0.1, 3.95, 2.3)]
    # Low jagged wall stubs along every outer wall.
    for (u0, v0, u1, v1) in rects:
        for (a, b, c, d) in ((u0, v1 - 0.06, u1, v1), (u0, v0, u1, v0 + 0.06), (u0, v0, u0 + 0.06, v1), (u1 - 0.06, v0, u1, v1)):
            along_u = (c - a) > (d - b)
            L_ = (c - a) if along_u else (d - b)
            n = max(2, int(L_ / 0.11))
            for k in range(n):
                if rng.random() < 0.25:
                    continue  # breach
                h = rng.uniform(1.5, 8.0)
                if along_u:
                    B(a + k * L_ / n, b, L_ / n - 0.005, d - b, G, h, rng.choice([white, white2]))
                else:
                    B(a, b + k * L_ / n, c - a, L_ / n - 0.005, G, h, rng.choice([white, white2]))
    # Two broken corner fragments: the residence's front-left corner (team band, a blown-out window) and the East
    # Wing's back corner.
    fu, fv = 0.75, 1.85
    B(fu, fv - 0.08, 0.42, 0.08, G, 17, white2)
    B(fu, fv - 0.5, 0.08, 0.5, G, 13, white2)
    B(fu + 0.3, fv - 0.08, 0.12, 0.08, G, 11, white2)
    rustication("left", fu, fv - 0.08, 0.42, 0.0, G, G + 7, joint)
    B(fu - 0.005, fv + 0.002, 0.43, 0.012, G + 9.5, 1.3, team)  # team line on the surviving fragment
    rect("left", fu, fv - 0.08, 0.42, 0.08, 0.12, 0.24, G + 11.5, G + 15.5, charm, 0.006)  # window, blown out
    rect("left", fu, fv - 0.08, 0.42, 0.08, 0.1, 0.26, G + 11.0, G + 11.4, white, 0.02)  # its sill
    jag = [(fu + 0.42 * t, fv - 0.04, G + 17 - rng.uniform(0, 6) * t) for t in (0, 0.3, 0.6, 1.0)]
    for x, y, z in jag:
        rock(rng, x, y, z, 0.04, white2)
    B(3.87, 0.1, 0.08, 0.38, G, 10, white2)
    B(3.55, 0.1, 0.4, 0.08, G, 7, white2)
    # Portico: four column bases, two short broken shafts, drums fallen across the steps.
    pv = 1.85
    for k, h in enumerate((2.2, 6.5, 1.4, 4.0)):
        cu = 1.55 + 0.1 + k * 0.233
        CYL(cu, pv + 0.42, 0.066, G, 1.2, white2)
        LATHE(cu, pv + 0.42, G + 1.2, [(0.05, 0), (0.048, h)], col, 20, cap_top=True)
        jag_cap(cu, pv + 0.42, G + 1.2 + h, 0.048, charm)
    for k in range(3):
        cu = 1.6 + k * 0.3
        ROD((cu, pv + 0.55 + rng.uniform(0, 0.1), G + 0.9), (cu + rng.uniform(0.2, 0.35), pv + 0.62 + rng.uniform(0, 0.12), G + 0.8), 0.046, col, 20)
    B(1.55, pv + 0.5, 0.9, 0.1, G - 1, 1.2, stone)  # the steps, broken
    # Chimney stubs.
    for cu, cv in ((1.0, 0.5), (3.0, 1.45)):
        B(cu - 0.06, cv - 0.06, 0.12, 0.12, G, rng.uniform(4, 7), white2)
    # Rubble mounds covering the footprint (higher over the residence), charred beams lying across them.
    for (u0, v0, u1, v1), n, rr, hz in ((rects[0], 18, 0.42, 3.5), (rects[1], 6, 0.35, 1.5), (rects[2], 6, 0.35, 1.5)):
        for k in range(n):
            cu, cv = rng.uniform(u0 + 0.15, u1 - 0.15), rng.uniform(v0 + 0.15, v1 - 0.15)
            pile(rng, cu, cv, G + rng.uniform(0, hz), rr, 26, debris, size=0.055)
    for k in range(22):
        cu, cv = rng.uniform(0.3, 3.7), rng.uniform(0.2, 2.0)
        a = rng.uniform(0, math.pi)
        L_ = rng.uniform(0.25, 0.6)
        z0 = G + rng.uniform(2, 7)
        ROD((cu, cv, z0), (cu + L_ * math.cos(a), cv + L_ * math.sin(a), z0 + rng.uniform(-3, 4)), 0.016, charm, 5)
    for k in range(5):  # roof sheets folded in the rubble
        cu, cv = rng.uniform(1.0, 3.0), rng.uniform(0.3, 1.6)
        B(cu, cv, rng.uniform(0.15, 0.3), rng.uniform(0.08, 0.15), G + rng.uniform(5, 8), 0.4, roofm)
    # The pole stands on a block of masonry in the rubble.
    pu_, pv_ = 2.5 / S, 1.19 / S
    B(pu_ - 0.07, pv_ - 0.07, 0.14, 0.14, G, RUIN_POLE_Z / S - G, white2)
    for cu, cv, r in ((2.0, 1.0, 0.8), (1.0, 2.2, 0.4), (3.0, 2.2, 0.45), (0.4, 1.2, 0.35), (3.6, 1.2, 0.4), (2.0, 2.4, 0.3)):
        scorch(rng, cu, cv, r)
    scorch_extra = [(0.3, 0.05, 0.25), (3.7, 0.05, 0.3)]
    for cu, cv, r in scorch_extra:
        scorch(rng, cu, cv, r)


RUIN_POLE_Z = 9.0  # plot px: top of the masonry block the flag pole stands on in the ruins (WashingtonWhiteHouse.ts)


MODELS = {"capital-usa": lambda: white_house(0)}
for _d in (1, 2, 3):
    MODELS[f"capital-usa-d{_d}"] = (lambda d=_d: white_house(d))

