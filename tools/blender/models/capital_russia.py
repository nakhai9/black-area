"""Nordursia capital (5 x 4): the Moscow Kremlin seen from the Moskva — the Grand Kremlin Palace behind the red
river wall.

Front faces +v (the plot's "left" face in the game), as MoscowKremlin.ts expects.
- Grand Kremlin Palace (u 0.4..4.45, v 0.3..2.75): a long symmetrical palace of pale ochre walls with white trim —
  a rusticated ground floor with arched windows in white surrounds, a white string course, the upper floor with
  paired arched windows under kokoshnik (ogee) hoods, a hanging drop (girka) between the pair and small attic
  windows above, paired white pilasters between the bays, a crowning cornice. An end pavilion at each side stands a
  little proud and taller; the raised centre (risalit) has three arched portals, three tall arched windows and a row
  of white kokoshnik arches with gilded medallions.
- Roofs: low green painted-iron hip roofs with standing seams on every face, raised ridge and hip lines, a gutter
  board, a black iron railing round every eave and dormers on all four slopes; chimney stacks on the ridge.
- The belvedere on the centre: a white plinth, a square ochre drum with arched windows and a clock, a green ribbed
  dome, a gilded lantern and finial (the flag flies above it, drawn in the game).
- The river wall in front (v 3.5..3.72) and the side walls: red brick with mortar courses, a cap and swallowtail
  (Ghibelline) merlons with loopholes; round corner towers at the front, square towers at the back corners, the
  Taynitskaya-style gate tower in the middle — machicolations, a second stage and a green tent roof. No stars.
No trees or decoration (ART_GUIDE "Nothing extra").
Team colour (TEAM["russia"]): the band on the palace plinth (front and side), round the belvedere's base, round the
gate tower's upper stage and round every corner tower.

Plot: u 0..5 (along the front), v 0..4 (front at +v). Heights in art px. Own geometry only (kit primitives and
materials).
"""
import math

import bmesh

from kit import _obj, box, cylinder, dome, lathe, mat, render, rod, roof, zp, TEAM
from models._ruin import apply as ruin

W, D = 5, 4
G = 1.0  # top of the plot paving (sunk flush by kit.render)


def mats():
    return dict(
        yellow=mat("#d9bd78", 0.8, grain=0.07, scale=30),
        yellow_d=mat("#b89b5c", 0.85, grain=0.05, scale=30),
        white=mat("#ece7da", 0.75, grain=0.05, scale=30),
        white_d=mat("#cfc8b7", 0.8, grain=0.06, scale=30),
        roof=mat("#4b7a5f", 0.45, metal=0.25, grain=0.05, scale=40),
        roof_d=mat("#365a46", 0.5, metal=0.2, grain=0.04),
        seam=mat("#6a9a7c", 0.4, metal=0.3, grain=0),
        iron=mat("#26292c", 0.4, metal=0.7, grain=0),
        brick=mat("#9b3b2b", 0.9, grain=0.18, scale=45),
        brick_d=mat("#7a2c20", 0.9, grain=0.14, scale=45),
        mortar=mat("#b98a74", 0.95, grain=0.08),
        cap=mat("#86332a", 0.85, grain=0.12, scale=40),
        stone=mat("#ddd6c6", 0.85, grain=0.08, scale=30),
        glass=mat("#2e3c4d", 0.08, grain=0, glass=True),
        dark=mat("#1f1712", 0.9, grain=0),
        gold=mat("#d8a93c", 0.25, metal=1.0, grain=0.03),
        clock=mat("#f2efe6", 0.6, grain=0),
        paving=mat("#a39d92", 0.9, grain=0.15, scale=10),
        joint=mat("#7f7a71", 0.95, grain=0),
        team=mat(TEAM["russia"], 0.45, metal=0.3, grain=0),
    )


# ---------------------------------------------------------------- face plates


def face_poly(face, u, v, w, d, pts, m, t=0.012, off=0.0):
    """Flat plate on a box's visible face: "left" = the +v face (s along u from u), "right" = the +u face (s along -v
    from v + d); pts = [(s tiles, z px)], t tiles thick, standing off tiles proud of the face."""
    bm = bmesh.new()

    def P(s, z, k):
        if face == "left":
            return (u + s, v + d + off + k, zp(z))
        return (u + w + off + k, v + d - s, zp(z))

    a = [bm.verts.new(P(s, z, 0)) for s, z in pts]
    b = [bm.verts.new(P(s, z, t)) for s, z in pts]
    n = len(pts)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("plate", bm, m)


def strip(face, u, v, w, d, s0, s1, z, h, m, t=0.012, off=0.0):
    return face_poly(face, u, v, w, d, [(s0, z), (s1, z), (s1, z + h), (s0, z + h)], m, t, off)


def arch_pts(s0, s1, z, h, rise=0.3, n=10):
    """Round-headed opening: straight jambs, then a half-round head taking `rise` of the height."""
    spring = z + h * (1 - rise)
    mid, hw = (s0 + s1) / 2, (s1 - s0) / 2
    pts = [(s0, z), (s1, z), (s1, spring)]
    for i in range(1, n):
        a = math.pi * i / n
        pts.append((mid + hw * math.cos(a), spring + h * rise * math.sin(a)))
    pts.append((s0, spring))
    return pts


def ogee_pts(s0, s1, z, h, n=8):
    """Kokoshnik / ogee hood: a band rising from both ends to a pointed top."""
    mid = (s0 + s1) / 2
    right = [(s1 - (s1 - mid) * i / n, z + h * math.sin(math.pi / 2 * i / n) ** 1.7) for i in range(n)]
    left = [(2 * mid - x, y) for x, y in reversed(right[1:])]
    return [(s0, z)] + right + [(mid, z + h)] + left


def window_arched(M, face, u, v, w, d, c, ww, z, h):
    """Arched window set back in a white surround: surround plate, glass proud of it, then jambs and sill proud of
    the glass (so the pane reads as recessed) and a keystone."""
    face_poly(face, u, v, w, d, arch_pts(c - ww / 2 - 0.016, c + ww / 2 + 0.016, z - 0.7, h + 1.5), M["white"], 0.008)
    face_poly(face, u, v, w, d, arch_pts(c - ww / 2, c + ww / 2, z, h), M["glass"], 0.006, 0.008)
    for s in (c - ww / 2 - 0.016, c + ww / 2):
        strip(face, u, v, w, d, s, s + 0.016, z - 0.7, h * 0.72 + 0.7, M["white"], 0.02)
    strip(face, u, v, w, d, c - ww / 2 - 0.03, c + ww / 2 + 0.03, z - 1.1, 0.8, M["white_d"], 0.026)  # sill
    strip(face, u, v, w, d, c - 0.01, c + 0.01, z + h + 0.1, 1.2, M["white"], 0.022)  # keystone


# ---------------------------------------------------------------- palace


def facade(M, face, u, v, w, d, z0, h, bays):
    """Rusticated ground floor, string course, upper floor with paired arches under kokoshnik hoods, attic windows."""
    L = w if face == "left" else d
    bw = L / bays
    gf = h * 0.36
    for k in range(1, 5):  # rustication joints
        strip(face, u, v, w, d, 0, L, z0 + gf * k / 5 - 0.2, 0.4, M["yellow_d"], 0.004)
    strip(face, u, v, w, d, -0.01, L + 0.01, z0 + gf, 1.4, M["white"], 0.022)  # string course
    zu = z0 + gf + 1.4
    hu = h - gf - 1.4
    for k in range(bays + 1):  # pilasters: single on the ground floor, paired above
        s = min(max(k * bw, 0.022), L - 0.022)
        strip(face, u, v, w, d, s - 0.018, s + 0.018, z0, gf, M["yellow_d"], 0.014)
        for ds in (-0.026, 0.01):
            strip(face, u, v, w, d, s + ds, s + ds + 0.016, zu, hu, M["white"], 0.016)
    for k in range(bays):
        c = (k + 0.5) * bw
        window_arched(M, face, u, v, w, d, c, bw * 0.34, z0 + gf * 0.24, gf * 0.56)
        # Upper floor: paired arched windows in one surround, a girka between them, a kokoshnik hood above.
        pw = bw * 0.44
        t0, th = zu + hu * 0.1, hu * 0.52
        face_poly(face, u, v, w, d, arch_pts(c - pw / 2 - 0.016, c + pw / 2 + 0.016, t0 - 0.7, th + 1.4), M["white"], 0.008)
        for sc in (c - pw / 4 - 0.004, c + pw / 4 + 0.004):
            face_poly(face, u, v, w, d, arch_pts(sc - pw / 4 + 0.006, sc + pw / 4 - 0.006, t0, th, 0.34), M["glass"], 0.006, 0.008)
        strip(face, u, v, w, d, c - 0.008, c + 0.008, t0 + th * 0.55, th * 0.2, M["white"], 0.024)  # girka
        strip(face, u, v, w, d, c - pw / 2 - 0.035, c + pw / 2 + 0.035, t0 - 1.1, 0.8, M["white_d"], 0.026)
        face_poly(face, u, v, w, d, ogee_pts(c - pw / 2 - 0.02, c + pw / 2 + 0.02, t0 + th + 0.9, 2.2), M["white"], 0.02)
        # Small attic window.
        aw, az = bw * 0.22, zu + hu * 0.78
        strip(face, u, v, w, d, c - aw / 2 - 0.012, c + aw / 2 + 0.012, az - 0.5, hu * 0.13 + 1.0, M["white"], 0.008)
        strip(face, u, v, w, d, c - aw / 2, c + aw / 2, az, hu * 0.13, M["glass"], 0.006, 0.008)


def palace_block(M, u, v, w, d, h, bays_l, bays_r):
    box(u, v, w, d, G, h, M["yellow"])
    box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, G, 2.4, M["white_d"])  # plinth
    box(u - 0.022, v + d + 0.02, w + 0.044, 0.012, G + 2.4, 0.8, M["team"])  # team line, front
    box(u + w + 0.02, v - 0.022, 0.012, d + 0.044, G + 2.4, 0.8, M["team"])  # team line, side
    facade(M, "left", u, v, w, d, G + 3.2, h - 5.4, bays_l)
    facade(M, "right", u, v, w, d, G + 3.2, h - 5.4, bays_r)
    box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, G + h - 2.2, 1.0, M["white_d"])  # frieze
    box(u - 0.05, v - 0.05, w + 0.1, d + 0.1, G + h - 1.2, 1.2, M["white"])  # crowning cornice
    for k in range(int(w / 0.06)):  # dentils under the cornice, front
        box(u + 0.01 + k * 0.06, v + d + 0.03, 0.025, 0.012, G + h - 2.0, 0.7, M["white"])
    for k in range(int(d / 0.06)):  # and side
        box(u + w + 0.03, v + 0.01 + k * 0.06, 0.012, 0.025, G + h - 2.0, 0.7, M["white"])


def seamed_roof(M, u, v, w, d, z, h, over=0.05, dormers=(0, 0), railing=True, kind="hip"):
    """Painted-iron hip roof: standing seams down every slope, raised ridge and hips, gutter board, iron railing round
    the eaves and dormers on all four slopes (dormers = (per long slope, per short slope))."""
    a0, a1, b0, b1 = u - over, u + w + over, v - over, v + d + over
    ridge = "u" if (a1 - a0) >= (b1 - b0) else "v"
    roof(u, v, w, d, z, h, M["roof"], kind="pyramid" if kind == "pyramid" else "hip", ridge=ridge, overhang=over)
    half = min(a1 - a0, b1 - b0) / 2

    def hz(pu, pv):
        return z + h * min(pu - a0, a1 - pu, pv - b0, b1 - pv, half) / half

    step = 0.05
    n = max(2, round((a1 - a0) / step))
    for k in range(1, n):
        pu = a0 + k * (a1 - a0) / n
        r = min(pu - a0, a1 - pu, half) - 0.006
        if r < 0.02:
            continue
        for e, sg in ((b0, 1), (b1, -1)):
            p, q = (pu, e + sg * 0.004), (pu, e + sg * r)
            rod((p[0], p[1], zp(hz(*p) + 0.3)), (q[0], q[1], zp(hz(*q) + 0.3)), 0.0055, M["seam"], 4)
    m = max(2, round((b1 - b0) / step))
    for k in range(1, m):
        pv = b0 + k * (b1 - b0) / m
        r = min(pv - b0, b1 - pv, half) - 0.006
        if r < 0.02:
            continue
        for e, sg in ((a0, 1), (a1, -1)):
            p, q = (e + sg * 0.004, pv), (e + sg * r, pv)
            rod((p[0], p[1], zp(hz(*p) + 0.3)), (q[0], q[1], zp(hz(*q) + 0.3)), 0.0055, M["seam"], 4)
    # Ridge and hip lines.
    cu, cv = (a0 + a1) / 2, (b0 + b1) / 2
    if ridge == "u":
        r0, r1 = (a0 + half, cv), (a1 - half, cv)
    else:
        r0, r1 = (cu, b0 + half), (cu, b1 - half)
    if math.dist(r0, r1) > 0.01:
        rod((r0[0], r0[1], zp(z + h + 0.4)), (r1[0], r1[1], zp(z + h + 0.4)), 0.014, M["roof_d"], 6)
    for (pu, pv) in ((a0, b0), (a1, b0), (a0, b1), (a1, b1)):
        top = min((r0, r1), key=lambda r: math.dist(r, (pu, pv)))
        rod((pu, pv, zp(z + 0.4)), (top[0], top[1], zp(z + h + 0.4)), 0.011, M["roof_d"], 6)
    # Gutter board.
    for bx in ((a0, b0, a1 - a0, 0.02), (a0, b1 - 0.02, a1 - a0, 0.02), (a0, b0, 0.02, b1 - b0), (a1 - 0.02, b0, 0.02, b1 - b0)):
        box(*bx, z - 0.6, 0.8, M["roof_d"])
    if railing:
        for (pu, pv, qu, qv) in ((a0, b0, a1, b0), (a0, b1, a1, b1), (a0, b0, a0, b1), (a1, b0, a1, b1)):
            L = math.hypot(qu - pu, qv - pv)
            n = max(2, round(L / 0.07))
            for k in range(n + 1):
                t = k / n
                box(pu + (qu - pu) * t - 0.006, pv + (qv - pv) * t - 0.006, 0.012, 0.012, z, 2.6, M["iron"])
            rod((pu, pv, zp(z + 2.6)), (qu, qv, zp(z + 2.6)), 0.005, M["iron"], 4)
            rod((pu, pv, zp(z + 1.4)), (qu, qv, zp(z + 1.4)), 0.003, M["iron"], 4)
    # Dormers: evenly on the long slopes and the short slopes alike.
    long_n, short_n = dormers
    for side in ("-v", "+v", "-u", "+u"):
        along_u = side in ("-v", "+v")
        cnt = (long_n if (along_u == (ridge == "u")) else short_n)
        if not cnt:
            continue
        lo, hi = (a0, a1) if along_u else (b0, b1)
        for k in range(cnt):
            inset = min(0.2, half * 0.5)
            s = lo + inset + 0.08 + (hi - lo - 2 * inset - 0.16) * (k + 0.5) / cnt
            if side == "-v":
                pu, pv = s, b0 + inset
            elif side == "+v":
                pu, pv = s, b1 - inset
            elif side == "-u":
                pu, pv = a0 + inset, s
            else:
                pu, pv = a1 - inset, s
            dormer(M, pu, pv, side, hz(pu, pv) - 1.2)


def dormer(M, cu, cv, side, z):
    s = 0.035
    box(cu - s, cv - s, 2 * s, 2 * s, z, 4.4, M["white"])
    roof(cu - s, cv - s, 2 * s, 2 * s, z + 4.4, 2.2, M["roof"], kind="gable", ridge="v" if side in ("-v", "+v") else "u", overhang=0.008)
    gw = 0.022
    if side == "+v":
        box(cu - gw, cv + s, 2 * gw, 0.006, z + 0.8, 2.8, M["glass"])
    elif side == "-v":
        box(cu - gw, cv - s - 0.006, 2 * gw, 0.006, z + 0.8, 2.8, M["glass"])
    elif side == "+u":
        box(cu + s, cv - gw, 0.006, 2 * gw, z + 0.8, 2.8, M["glass"])
    else:
        box(cu - s - 0.006, cv - gw, 0.006, 2 * gw, z + 0.8, 2.8, M["glass"])


def chimney(M, cu, cv, z):
    box(cu - 0.035, cv - 0.025, 0.07, 0.05, z, 6, M["yellow"])
    box(cu - 0.042, cv - 0.032, 0.084, 0.064, z + 6, 0.8, M["white"])
    box(cu - 0.02, cv - 0.012, 0.04, 0.024, z + 6.8, 0.6, M["dark"])


def risalit(M, u, v, w, d, h):
    """The raised centre: three arched portals, three tall arched windows, a row of kokoshnik arches with gilded
    medallions in the attic."""
    box(u, v, w, d, G, h, M["yellow"])
    box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, G, 2.4, M["white_d"])
    box(u - 0.022, v + d + 0.02, w + 0.044, 0.012, G + 2.4, 0.8, M["team"])
    box(u + w + 0.02, v - 0.022, 0.012, d + 0.044, G + 2.4, 0.8, M["team"])
    gf = 12.0
    for k in range(1, 5):
        strip("left", u, v, w, d, 0, w, G + 3.2 + gf * k / 5 - 0.2, 0.4, M["yellow_d"], 0.004)
    strip("left", u, v, w, d, -0.01, w + 0.01, G + 3.2 + gf, 1.4, M["white"], 0.022)
    for k in range(3):
        c = w * (k + 0.5) / 3
        face_poly("left", u, v, w, d, arch_pts(c - 0.1, c + 0.1, G + 2.4, gf - 0.4), M["white"], 0.01)
        face_poly("left", u, v, w, d, arch_pts(c - 0.075, c + 0.075, G + 2.4, gf - 1.8), M["dark"], 0.006, 0.01)
        window_arched(M, "left", u, v, w, d, c, 0.13, G + 19, 14)
    for k in range(4):  # paired pilasters between the big windows
        s = w * k / 3
        for ds in (-0.03, 0.006):
            strip("left", u, v, w, d, min(max(s + ds, 0), w - 0.024), min(max(s + ds, 0), w - 0.024) + 0.024, G + 16.6, h - 18.8, M["white"], 0.018)
    # Attic: kokoshnik arches and gilded medallions.
    for k in range(5):
        s0 = 0.03 + k * (w - 0.06) / 5
        s1 = s0 + (w - 0.06) / 5 - 0.015
        face_poly("left", u, v, w, d, arch_pts(s0, s1, G + h - 9, 7, 0.5), M["white"], 0.024)
        face_poly("left", u, v, w, d, [((s0 + s1) / 2 + 0.032 * math.cos(a * math.pi / 8), G + h - 5 + 1.5 * math.sin(a * math.pi / 8)) for a in range(16)], M["gold"], 0.01, 0.024)
    # Side face: pilasters and one window per floor.
    facade(M, "right", u, v, w, d, G + 3.2, h - 5.4, 9)
    box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, G + h - 1.2, 1.2, M["white"])


def belvedere(M, cu, cv, z):
    """Square drum with arched windows and a clock, green ribbed dome, gilded lantern. Returns the finial top z."""
    s = 0.36
    box(cu - s - 0.05, cv - s - 0.05, 2 * s + 0.1, 2 * s + 0.1, z, 2.2, M["white"])
    box(cu - s - 0.052, cv - s - 0.052, 2 * s + 0.104, 2 * s + 0.104, z + 2.2, 0.8, M["team"])  # team band
    z += 3.0
    box(cu - s, cv - s, 2 * s, 2 * s, z, 11, M["yellow"])
    for face in ("left", "right"):
        for k in range(3):
            window_arched(M, face, cu - s, cv - s, 2 * s, 2 * s, 0.14 + k * 0.22, 0.09, z + 1.6, 6.6)
        for k in range(4):
            sp = min(max(k * 2 * s / 3 - 0.02, 0), 2 * s - 0.04)
            strip(face, cu - s, cv - s, 2 * s, 2 * s, sp, sp + 0.04, z, 11, M["white"], 0.016)
    # Clock on the front, above the middle window.
    ring = [(s + 0.075 * math.cos(a * math.pi / 12), z + 9.6 + 1.9 * math.sin(a * math.pi / 12)) for a in range(24)]
    face_poly("left", cu - s, cv - s, 2 * s, 2 * s, ring, M["gold"], 0.012)
    face_poly("left", cu - s, cv - s, 2 * s, 2 * s, [(s + 0.06 * math.cos(a * math.pi / 12), z + 9.6 + 1.5 * math.sin(a * math.pi / 12)) for a in range(24)], M["clock"], 0.006, 0.012)
    face_poly("left", cu - s, cv - s, 2 * s, 2 * s, [(s - 0.004, z + 9.6), (s + 0.004, z + 9.6), (s + 0.004, z + 10.8), (s - 0.004, z + 10.8)], M["dark"], 0.004, 0.018)
    z += 11
    box(cu - s - 0.04, cv - s - 0.04, 2 * s + 0.08, 2 * s + 0.08, z, 1.5, M["white"])
    z += 1.5
    r, dh = 0.33, 11.5
    dome(cu, cv, r, z, dh, M["roof"], segs=40)
    for k in range(16):  # ribs
        a = 2 * math.pi * k / 16
        prev = None
        for i in range(9):
            t = i / 8 * 0.94
            rr = r * math.cos(t * math.pi / 2) + 0.004
            p = (cu + rr * math.cos(a), cv + rr * math.sin(a), zp(z + dh * math.sin(t * math.pi / 2) + 0.2))
            if prev:
                rod(prev, p, 0.007, M["seam"], 4)
            prev = p
    cylinder(cu, cv, r + 0.01, z - 0.3, 0.8, M["roof_d"], 40)
    z += dh - 0.8
    cylinder(cu, cv, 0.1, z, 4.5, M["gold"], 16)
    for k in range(8):  # lantern openings
        a = 2 * math.pi * (k + 0.5) / 8
        rod((cu + 0.098 * math.cos(a), cv + 0.098 * math.sin(a), zp(z + 1.2)), (cu + 0.098 * math.cos(a), cv + 0.098 * math.sin(a), zp(z + 3.4)), 0.012, M["dark"], 4)
    dome(cu, cv, 0.11, z + 4.5, 4, M["gold"], segs=20)
    lathe(cu, cv, z + 8.3, [(0.02, 0), (0.035, 0.8), (0.0, 2.2)], M["gold"], segs=12, cap_bottom=True)
    return z + 10.5


# ---------------------------------------------------------------- Kremlin wall and towers


def merlon(M, cu, cv, along_u, z, mw=0.07, mh=3.2, th=0.22):
    """Swallowtail (Ghibelline) merlon, extruded across the wall."""
    prof = [(-mw / 2, 0), (mw / 2, 0), (mw / 2, mh), (0, mh * 0.62), (-mw / 2, mh)]
    bm = bmesh.new()

    def P(s, h, k):
        return (cu + s, cv + k, zp(z + h)) if along_u else (cu + k, cv + s, zp(z + h))

    a = [bm.verts.new(P(s, h, -th / 2)) for s, h in prof]
    b = [bm.verts.new(P(s, h, th / 2)) for s, h in prof]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(5):
        j = (i + 1) % 5
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("merlon", bm, M["cap"])


def wall(M, u, v, w, d, h=10.0):
    """Red brick wall: dark footing, mortar courses on the outer faces, a cap and swallowtail merlons with loopholes."""
    along_u = w >= d
    box(u, v, w, d, G, h, M["brick"])
    box(u - 0.012, v - 0.012, w + 0.024, d + 0.024, G, 1.6, M["brick_d"])
    for k in range(1, 6):
        zz = G + 1.6 + k * (h - 1.6) / 6
        if along_u:
            box(u, v + d, w, 0.003, zz, 0.25, M["mortar"])
        else:
            box(u + w, v, 0.003, d, zz, 0.25, M["mortar"])
            box(u - 0.003, v, 0.003, d, zz, 0.25, M["mortar"])
    box(u - 0.015, v - 0.015, w + 0.03, d + 0.03, G + h, 0.8, M["cap"])
    L = w if along_u else d
    n = max(1, round(L / 0.13))
    for k in range(n):
        t = (k + 0.5) * L / n
        if along_u:
            merlon(M, u + t, v + d / 2, True, G + h + 0.8, th=d)
            box(u + t - 0.008, v + d, 0.016, 0.004, G + h + 1.4, 1.1, M["dark"])  # loophole
        else:
            merlon(M, u + w / 2, v + t, False, G + h + 0.8, th=w)
            box(u + w, v + t - 0.008, 0.004, 0.016, G + h + 1.4, 1.1, M["dark"])
            box(u - 0.004, v + t - 0.008, 0.004, 0.016, G + h + 1.4, 1.1, M["dark"])


def tent(M, cu, cv, r, z, h, ribs=12):
    """Green tent (cone) roof with seams and a gilded finial."""
    lathe(cu, cv, z, [(r, 0), (0.0005, h)], M["roof"], 32, cap_bottom=True)
    for k in range(ribs):
        a = 2 * math.pi * k / ribs
        rod((cu + (r + 0.003) * math.cos(a), cv + (r + 0.003) * math.sin(a), zp(z + 0.2)), (cu, cv, zp(z + h)), 0.006, M["seam"], 4)
    cylinder(cu, cv, r + 0.01, z - 0.4, 0.8, M["roof_d"], 32)
    lathe(cu, cv, z + h - 0.5, [(0.022, 0), (0.03, 0.8), (0.02, 1.6), (0.004, 4.5)], M["gold"], 12, cap_bottom=True)


def round_tower(M, cu, cv, r=0.19):
    cylinder(cu, cv, r + 0.012, G, 1.8, M["brick_d"], 40)
    cylinder(cu, cv, r, G, 14, M["brick"], 40)
    for k in range(1, 6):
        cylinder(cu, cv, r + 0.002, G + 1.8 + k * 2.1, 0.25, M["mortar"], 40)
    for k in range(4):  # loopholes facing out
        a = math.pi * (0.1 + k * 0.27)
        a = a if cu > 2.5 else math.pi - a
        box(cu + r * math.cos(a) - 0.01, cv + r * math.sin(a) - 0.01, 0.02, 0.02, G + 6, 2.2, M["dark"])
    cylinder(cu, cv, r + 0.004, G + 11.4, 0.8, M["team"], 40)  # team band
    cylinder(cu, cv, r + 0.03, G + 14, 1.6, M["cap"], 40)  # machicolation ring
    for k in range(20):
        a = 2 * math.pi * (k + 0.5) / 20
        box(cu + (r + 0.012) * math.cos(a) - 0.01, cv + (r + 0.012) * math.sin(a) - 0.01, 0.02, 0.02, G + 12.6, 1.4, M["cap"])
    for k in range(12):
        a = 2 * math.pi * k / 12
        mc, ms = math.cos(a), math.sin(a)
        for off in (-0.022, 0.022):  # two prongs of each swallowtail merlon
            pu, pv = cu + (r + 0.01) * mc - off * ms, cv + (r + 0.01) * ms + off * mc
            box(pu - 0.014, pv - 0.014, 0.028, 0.028, G + 15.6, 2.8, M["cap"])
        box(cu + (r + 0.01) * mc - 0.03, cv + (r + 0.01) * ms - 0.03, 0.06, 0.06, G + 15.6, 1.5, M["cap"])
    cylinder(cu, cv, r * 0.66, G + 15.6, 7, M["brick"], 32)
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        box(cu + r * 0.66 * math.cos(a) - 0.012, cv + r * 0.66 * math.sin(a) - 0.012, 0.024, 0.024, G + 18.4, 2.6, M["dark"])
    cylinder(cu, cv, r * 0.72, G + 22.6, 1.0, M["stone"], 32)
    tent(M, cu, cv, r * 0.74, G + 23.6, 15)


def square_tower(M, u, v, s=0.34):
    box(u - 0.01, v - 0.01, s + 0.02, s + 0.02, G, 1.8, M["brick_d"])
    box(u, v, s, s, G, 15, M["brick"])
    for face in ("left", "right"):
        for k in range(1, 6):
            strip(face, u, v, s, s, 0, s, G + 1.8 + k * 2.2, 0.25, M["mortar"], 0.003)
        face_poly(face, u, v, s, s, arch_pts(s / 2 - 0.025, s / 2 + 0.025, G + 8, 3.2, 0.5), M["dark"], 0.006)
    box(u - 0.006, v - 0.006, s + 0.012, s + 0.012, G + 12.4, 0.8, M["team"])
    box(u - 0.03, v - 0.03, s + 0.06, s + 0.06, G + 15, 1.2, M["cap"])
    for k in range(3):
        t = (k + 0.5) * s / 3
        for vv in (v - 0.015, v + s + 0.015):
            merlon(M, u + t, vv, True, G + 16.2, mw=0.06, mh=2.8, th=0.04)
        for uu in (u - 0.015, u + s + 0.015):
            merlon(M, uu, v + t, False, G + 16.2, mw=0.06, mh=2.8, th=0.04)
    seamed_roof(M, u + 0.03, v + 0.03, s - 0.06, s - 0.06, G + 16.2, 11, over=0.02, railing=False, kind="pyramid")
    lathe(u + s / 2, v + s / 2, G + 26.8, [(0.02, 0), (0.028, 0.8), (0.003, 3.5)], M["gold"], 12, cap_bottom=True)


def gate_tower(M, u, v, w, d):
    """Taynitskaya-style gate tower: gateway in a white-stone surround, icon niche, machicolations, merlons, a second
    stage with arched openings, a watch lantern and a green tent roof."""
    box(u - 0.012, v - 0.012, w + 0.024, d + 0.024, G, 1.8, M["brick_d"])
    box(u, v, w, d, G, 18, M["brick"])
    for face in ("left", "right"):
        for k in range(1, 7):
            strip(face, u, v, w, d, 0, w if face == "left" else d, G + 1.8 + k * 2.2, 0.25, M["mortar"], 0.003)
    face_poly("left", u, v, w, d, arch_pts(w / 2 - 0.15, w / 2 + 0.15, G, 11.5, 0.32), M["stone"], 0.012)
    face_poly("left", u, v, w, d, arch_pts(w / 2 - 0.11, w / 2 + 0.11, G, 9.8, 0.34), M["dark"], 0.006, 0.012)
    face_poly("left", u, v, w, d, arch_pts(w / 2 - 0.045, w / 2 + 0.045, G + 12.6, 3.6, 0.5), M["stone"], 0.012)
    face_poly("left", u, v, w, d, arch_pts(w / 2 - 0.03, w / 2 + 0.03, G + 13, 2.8, 0.5), M["dark"], 0.006, 0.012)
    face_poly("right", u, v, w, d, arch_pts(d / 2 - 0.03, d / 2 + 0.03, G + 9, 3.2, 0.5), M["dark"], 0.006)
    box(u - 0.035, v - 0.035, w + 0.07, d + 0.07, G + 18, 1.8, M["cap"])  # machicolation
    for k in range(9):
        box(u + 0.02 + k * (w - 0.04) / 8 - 0.01, v + d + 0.008, 0.02, 0.025, G + 16.6, 1.4, M["cap"])
    for k in range(5):
        box(u + w + 0.008, v + 0.02 + k * (d - 0.04) / 4 - 0.01, 0.025, 0.02, G + 16.6, 1.4, M["cap"])
    for k in range(6):
        t = (k + 0.5) * (w + 0.06) / 6 - 0.03
        for vv in (v - 0.02, v + d + 0.02):
            merlon(M, u + t, vv, True, G + 19.8, mw=0.065, mh=3.0, th=0.04)
    for k in range(4):
        t = (k + 0.5) * (d + 0.06) / 4 - 0.03
        for uu in (u - 0.02, u + w + 0.02):
            merlon(M, uu, v + t, False, G + 19.8, mw=0.065, mh=3.0, th=0.04)
    # Second stage.
    su, sv, sw, sd = u + 0.12, v + 0.08, w - 0.24, d - 0.16
    box(su, sv, sw, sd, G + 19.8, 8, M["brick"])
    for face in ("left", "right"):
        L = sw if face == "left" else sd
        face_poly(face, su, sv, sw, sd, arch_pts(L / 2 - 0.04, L / 2 + 0.04, G + 21.4, 4.6, 0.5), M["stone"], 0.01)
        face_poly(face, su, sv, sw, sd, arch_pts(L / 2 - 0.028, L / 2 + 0.028, G + 21.8, 3.8, 0.5), M["dark"], 0.006, 0.01)
    box(su - 0.006, sv - 0.006, sw + 0.012, sd + 0.012, G + 26.4, 0.8, M["team"])  # team band
    box(su - 0.025, sv - 0.025, sw + 0.05, sd + 0.05, G + 27.8, 1.0, M["stone"])
    seamed_roof(M, su, sv, sw, sd, G + 28.8, 14, over=0.025, railing=False, kind="pyramid")
    cu, cv = su + sw / 2, sv + sd / 2
    box(cu - 0.045, cv - 0.045, 0.09, 0.09, G + 40, 3.2, M["stone"])  # watch lantern
    for k in range(4):
        a = math.pi / 2 * k
        box(cu + 0.046 * math.cos(a) - 0.012, cv + 0.046 * math.sin(a) - 0.012, 0.024, 0.024, G + 40.8, 1.8, M["dark"])
    lathe(cu, cv, G + 43.2, [(0.06, 0), (0.0005, 6)], M["roof"], 16, cap_bottom=True)
    lathe(cu, cv, G + 48.6, [(0.016, 0), (0.024, 0.7), (0.003, 3.5)], M["gold"], 12, cap_bottom=True)


# ---------------------------------------------------------------- the model


def capital_russia(damage=0):
    M = mats()
    box(0, 0, W, D, 0, G, M["paving"])  # plot paving (sunk flush by kit.render)
    for k in range(1, 8):  # paving joints in the forecourt
        box(0.35, 2.75 + k * 0.1, 4.3, 0.006, G, 0.1, M["joint"])
    for k in range(1, 22):
        box(0.35 + k * 0.2, 2.75, 0.006, 0.75, G, 0.1, M["joint"])

    # Grand Kremlin Palace: main body, end pavilions, raised centre.
    u0, u1, v0, v1 = 0.4, 4.45, 0.3, 2.75
    body_h, pav_h, cen_h = 32.0, 35.0, 46.0
    palace_block(M, u0, v0, u1 - u0, v1 - v0, body_h, 19, 11)
    pw = 0.62
    for pu in (u0 - 0.04, u1 - pw + 0.04):
        palace_block(M, pu, v0 - 0.04, pw, v1 - v0 + 0.1, pav_h, 3, 11)
    cw = 0.94
    cu0 = (u0 + u1) / 2 - cw / 2
    risalit(M, cu0, v0 + 0.25, cw, v1 - v0 - 0.15, cen_h)
    for k in range(5):  # steps up to the portals
        box(cu0 + 0.08, v1 + 0.1 + k * 0.045, cw - 0.16, 0.045, G, 2.4 - k * 0.48, M["stone"])

    # Roofs.
    seamed_roof(M, pw + u0 - 0.04, v0, u1 - u0 - 2 * pw + 0.08, v1 - v0, G + body_h, 8, over=0.04, dormers=(6, 0))
    for pu in (u0 - 0.04, u1 - pw + 0.04):
        seamed_roof(M, pu, v0 - 0.04, pw, v1 - v0 + 0.1, G + pav_h, 9, over=0.04, dormers=(2, 1))
        chimney(M, pu + pw / 2 - 0.08, (v0 + v1) / 2 - 0.3, G + pav_h + 7)
        chimney(M, pu + pw / 2 + 0.08, (v0 + v1) / 2 + 0.3, G + pav_h + 7)
    for cu in (1.35, 1.75, 3.25, 3.65):
        chimney(M, cu, (v0 + v1) / 2 + 0.1, G + body_h + 6.6)
    cv0, cd = v0 + 0.25, v1 - v0 - 0.15
    seamed_roof(M, cu0, cv0, cw, cd, G + cen_h, 5, over=0.04, dormers=(0, 1))
    fu, fv = cu0 + cw / 2, cv0 + cd / 2
    top = belvedere(M, fu, fv, G + cen_h + 4.0)

    # The river wall, side walls and towers.
    gu0, gw = 2.15, 0.7
    wall(M, 0.38, 3.5, gu0 - 0.38, 0.22)
    wall(M, gu0 + gw, 3.5, 4.62 - gu0 - gw, 0.22)
    wall(M, 0.09, 0.42, 0.22, 3.0)
    wall(M, 4.69, 0.42, 0.22, 3.0)
    round_tower(M, 0.22, 3.62)
    round_tower(M, 4.78, 3.62)
    square_tower(M, 0.03, 0.08)
    square_tower(M, 4.63, 0.08)
    gate_tower(M, gu0, 3.4, gw, 0.44)

    ruin(damage, dict(
        ground=G, top=G + 88, seed=11, split=2.95,
        blocks=[("box", 0.36, 0.26, 4.49, 2.85, G + 41), ("box", 1.955, 0.55, 2.895, 2.75, G + 51), ("cyl", fu, fv, 0.3, G + 70),
                ("box", 0.38, 3.5, 4.62, 3.72, G + 14), ("box", 2.15, 3.4, 2.85, 3.84, G + 40), ("cyl", 0.22, 3.62, 0.19, G + 30),
                ("cyl", 4.78, 3.62, 0.19, G + 30)],
        frags=[(0.45, 2.75, 0.28, G + 26), (4.4, 0.35, 0.22, G + 20), (2.3, 3.62, 0.22, G + 22), (0.22, 3.62, 0.16, G + 14)],
        mount=(fu, fv, RUIN_POLE_Z, M["stone"]), mount2=None,
        debris=[M["yellow"], M["yellow_d"], M["white"], M["white_d"], M["brick"], M["roof_d"]], glass=[M["glass"]], slab=M["white_d"]), W, D)
    render("capital-russia" + (f"-d{damage}" if damage else ""), (W, D), 100)
    print(f"[kremlin] flag at u={fu:.3f} v={fv:.3f} z={top:.2f}")


RUIN_POLE_Z = 12.0  # art px: top of the masonry block the flag pole stands on at damage stage 3 (MoscowKremlin.ts)

MODELS = {"capital-russia": capital_russia}
for _d in (1, 2, 3):
    MODELS[f"capital-russia-d{_d}"] = (lambda d=_d: capital_russia(d))
