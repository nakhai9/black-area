"""Nordursia Allied Building / Embassy (4 x 4; also shown as the Parallel Government). The design is kept as it was —
a low office wing over the whole plot, the brown stone main block on it and the stepped light tower with a pyramid
roof, a gilded spire and the team-colour star — with the ART_GUIDE detail pass:
- windows set back behind frame jambs with a lintel and a sill, lesenes between the bays, floor bands;
- cornices with dentils, a granite plinth with rustication joints, string courses;
- every flat roof (wing, main block, tower terraces): tar membrane with joint lines and patches, a coping round the
  parapet, brick chimneys, louvred ventilation boxes, mushroom vents and a radio mast;
- the pyramid roof: standing seams on all four faces, raised hip ribs and a finial ring;
- the entrances: framed glass doors with a canopy, lamps and steps.
Team colour (TEAM["russia"]): the band under the pyramid roof (as before), the star, bands under the main block and
the tower cornices, the entrance canopy edge and the mast light. The two flags at the front are drawn in code.

Plot: u 0..4, v 0..4 (front at +v). Heights in art px. Own geometry only (kit primitives and materials).
"""
import math
import random

import bmesh

from models.allied import ruin_and_render
from kit import _obj, box, cylinder, lathe, mat, render, rod, roof, zp, TEAM

TEAMC = TEAM["russia"]
WING_H = 6
HEIGHT = 120


def mats():
    return dict(
        stone=mat("#86604e", 0.85, grain=0.1),
        stone_d=mat("#6e4e40", 0.85, grain=0.08),
        light=mat("#c2ae94", 0.8, grain=0.08),
        light2=mat("#e0d4bc", 0.8, grain=0.06),
        trim=mat("#b5a28a", 0.8, grain=0.08),
        granite=mat("#6a6460", 0.8, grain=0.2, scale=40),
        granite_d=mat("#4e4a46", 0.85, grain=0.15, scale=40),
        glass=mat("#2c3a46", 0.1, grain=0, glass=True),
        door=mat("#2a2622", 0.5, grain=0),
        tar=mat("#4a4642", 0.97, grain=0.25, scale=8),
        tar_d=mat("#36332f", 0.98, grain=0.2, scale=12),
        tar_j=mat("#5a5550", 0.95, grain=0),
        roof_j=mat("#6e4e40", 0.7, grain=0),
        brick=mat("#8b3b2c", 0.9, grain=0.25, scale=50),
        cap=mat("#3a3634", 0.9, grain=0.1),
        shaft=mat("#9a948a", 0.85, grain=0.12),
        louvre=mat("#45474a", 0.5, metal=0.5, grain=0),
        steel=mat("#c7c9c4", 0.5, metal=0.6, grain=0),
        gold=mat("#c9a646", 0.35, metal=0.9, grain=0),
        lamp=mat("#e8d690", 0.4, grain=0, emit="#ffd890"),
        paving=mat("#8f8c84", 0.95, grain=0.18, scale=6),
        team=mat(TEAMC, 0.55, grain=0.05),
        team_lit=mat(TEAMC, 0.4, emit=TEAMC),
    )


# ---------------------------------------------------------------- facades


def plate(face, u, v, w, d, s0, s1, z, h, m, t, off=0.0):
    """Plate on a visible face: "left" = +v (s along u), "right" = +u (s along v)."""
    if face == "left":
        box(u + s0, v + d + off, s1 - s0, t, z, h, m)
    else:
        box(u + w + off, v + s0, t, s1 - s0, z, h, m)


def windows(M, face, u, v, w, d, z, h, cols, rows, frame, fill=0.5, margin=0.08, lesenes=True):
    """Window grid: glass behind jambs, a lintel and a sill; lesenes between every two bays."""
    L = w if face == "left" else d
    span = L * (1 - 2 * margin)
    bw = span / cols
    fw = min(0.014, bw * fill * 0.18)
    for c in range(cols):
        s0 = L * margin + bw * (c + (1 - fill) / 2)
        s1 = s0 + bw * fill
        for r in range(rows):
            z0 = z + h * (r + 0.22) / rows
            zh = h * 0.56 / rows
            plate(face, u, v, w, d, s0, s1, z0, zh, M["glass"], 0.004)
            plate(face, u, v, w, d, s0 - fw, s0, z0, zh, frame, 0.012)
            plate(face, u, v, w, d, s1, s1 + fw, z0, zh, frame, 0.012)
            plate(face, u, v, w, d, s0 - fw, s1 + fw, z0 + zh, 0.5, frame, 0.016)
            plate(face, u, v, w, d, (s0 + s1) / 2 - 0.004, (s0 + s1) / 2 + 0.004, z0, zh, frame, 0.008)
            plate(face, u, v, w, d, s0 - fw * 1.8, s1 + fw * 1.8, z0 - 0.5, 0.45, frame, 0.022)
    if lesenes:
        for c in range(0, cols + 1, 2):
            s = L * margin + bw * c
            plate(face, u, v, w, d, s - 0.012, s + 0.012, z, h, frame, 0.008)
    for r in range(1, rows):  # floor bands
        plate(face, u, v, w, d, 0, L, z + h * r / rows - 0.15, 0.3, frame, 0.006)


def cornice(M, u, v, w, d, z, h, m, over=0.04, dentils=True):
    """Two-step cornice (lower step slightly in), dentils below on the visible faces."""
    box(u - over * 0.5, v - over * 0.5, w + over, d + over, z, h * 0.45, m)
    box(u - over, v - over, w + 2 * over, d + 2 * over, z + h * 0.45, h * 0.55, m)
    if dentils:
        for k in range(int(w / 0.05)):
            box(u + 0.012 + k * 0.05, v + d + 0.004, 0.022, 0.012, z - 0.6, 0.6, m)
        for k in range(int(d / 0.05)):
            box(u + w + 0.004, v + 0.012 + k * 0.05, 0.012, 0.022, z - 0.6, 0.6, m)


def parapet(u, v, w, d, z, h, m, coping, t=0.05):
    for bx in ((u, v, w, t), (u, v + d - t, w, t), (u, v + t, t, d - 2 * t), (u + w - t, v + t, t, d - 2 * t)):
        box(*bx, z, h, m)
    for bx in ((u - 0.006, v - 0.006, w + 0.012, t + 0.012), (u - 0.006, v + d - t - 0.006, w + 0.012, t + 0.012),
               (u - 0.006, v + t + 0.006, t + 0.012, d - 2 * t - 0.012), (u + w - t - 0.006, v + t + 0.006, t + 0.012, d - 2 * t - 0.012)):
        box(*bx, z + h, 0.4, coping)


def plinth(M, u, v, w, d, z, h):
    box(u - 0.012, v - 0.012, w + 0.024, d + 0.024, z, h, M["granite"])
    for k in range(1, 3):
        box(u - 0.016, v - 0.016, w + 0.032, d + 0.032, z + h * k / 3 - 0.12, 0.24, M["granite_d"])


# ---------------------------------------------------------------- roofs


def deck(M, rng, u, v, w, d, z, avoid=(), mast=False):
    """Tar deck: membrane with joint lines and patches, chimneys, louvred shafts, vents, optional radio mast."""
    box(u, v, w, d, z, 0.3, M["tar"])
    for k in range(1, max(2, int(w / 0.3))):
        box(u + k * w / max(2, int(w / 0.3)) - 0.004, v, 0.008, d, z + 0.3, 0.06, M["tar_j"])
    for k in range(1, max(2, int(d / 0.3))):
        box(u, v + k * d / max(2, int(d / 0.3)) - 0.004, w, 0.008, z + 0.3, 0.06, M["tar_j"])
    for _ in range(max(3, int(w * d * 2))):
        pw, pd = 0.12 + rng.random() * 0.3, 0.1 + rng.random() * 0.25
        box(u + 0.05 + rng.random() * max(0.01, w - pw - 0.1), v + 0.05 + rng.random() * max(0.01, d - pd - 0.1), pw, pd, z + 0.3, 0.06, M["tar_d"])
    rects = [tuple(a) for a in avoid]

    def spot(sw, sd):
        if sw > w - 0.16 or sd > d - 0.16:
            return None
        for _ in range(40):
            pu = u + 0.08 + rng.random() * (w - 0.16 - sw)
            pv = v + 0.08 + rng.random() * (d - 0.16 - sd)
            if all(pu > a + c + 0.04 or a > pu + sw + 0.04 or pv > b + e + 0.04 or b > pv + sd + 0.04 for a, b, c, e in rects):
                rects.append((pu, pv, sw, sd))
                return pu, pv
        return None

    zt = z + 0.3
    for _ in range(max(2, int(w * d * 0.8))):
        s = 0.1 + rng.random() * 0.05
        p = spot(s, s)
        if p:
            h = 4 + rng.random() * 3
            box(p[0], p[1], s, s, zt, h, M["brick"])
            box(p[0] - 0.01, p[1] - 0.01, s + 0.02, s + 0.02, zt + h, 0.8, M["cap"])
            box(p[0] + 0.02, p[1] + s, s - 0.04, 0.004, zt + h - 1.8, 0.3, M["trim"])
    for _ in range(max(1, int(w * d * 0.5))):
        p = spot(0.26, 0.18)
        if p:
            box(p[0], p[1], 0.26, 0.18, zt, 2.6, M["shaft"])
            box(p[0] - 0.02, p[1] - 0.02, 0.3, 0.22, zt + 2.6, 0.5, mat("#5f6a5c", 0.6, metal=0.3, grain=0.05))
            for k in range(5):
                box(p[0] + 0.03 + k * 0.045, p[1] + 0.18, 0.025, 0.004, zt + 0.5, 1.6, M["louvre"])
    for _ in range(max(1, int(w * d * 0.6))):
        p = spot(0.08, 0.08)
        if p:
            cylinder(p[0] + 0.04, p[1] + 0.04, 0.025, zt, 1.8, M["steel"], 10)
            lathe(p[0] + 0.04, p[1] + 0.04, zt + 1.8, [(0.05, 0), (0.0, 0.9)], M["steel"], 10, cap_bottom=True)
    if mast:
        p = spot(0.1, 0.1)
        if p:
            cu, cv = p[0] + 0.03, p[1] + 0.017
            for du, dv in ((0, 0), (0.06, 0), (0.03, 0.05)):
                rod((p[0] + du, p[1] + dv, zp(zt)), (cu, cv, zp(zt + 18)), 0.006, M["steel"])
            for k in range(1, 5):
                f = 1 - k / 5
                rod((cu - 0.03 * f, cv - 0.017 * f, zp(zt + 18 * k / 5)), (cu + 0.03 * f, cv - 0.017 * f, zp(zt + 18 * k / 5)), 0.004, M["steel"])
            cylinder(cu, cv, 0.018, zt + 18, 1.2, M["team_lit"], 8)


def seamed_pyramid(M, u, v, w, d, z, h):
    """Pyramid roof with standing seams on all four faces and raised hip ribs."""
    roof(u, v, w, d, z, h, M["stone"], kind="pyramid", overhang=0.0)
    cu, cv = u + w / 2, v + d / 2
    hu, hv = w / 2, d / 2

    def hz(pu, pv):
        return z + h * min((pu - u) / hu, (u + w - pu) / hu, (pv - v) / hv, (v + d - pv) / hv, 1.0)

    n = round(w / 0.05)
    for k in range(1, n):
        pu = u + k * w / n
        r = min(pu - u, u + w - pu) / hu * hv - 0.004
        if r < 0.015:
            continue
        for e, sg in ((v, 1), (v + d, -1)):
            p, q = (pu, e + sg * 0.003), (pu, e + sg * r)
            rod((p[0], p[1], zp(hz(*p) + 0.25)), (q[0], q[1], zp(hz(*q) + 0.25)), 0.0045, M["roof_j"], 4)
    m = round(d / 0.05)
    for k in range(1, m):
        pv = v + k * d / m
        r = min(pv - v, v + d - pv) / hv * hu - 0.004
        if r < 0.015:
            continue
        for e, sg in ((u, 1), (u + w, -1)):
            p, q = (e + sg * 0.003, pv), (e + sg * r, pv)
            rod((p[0], p[1], zp(hz(*p) + 0.25)), (q[0], q[1], zp(hz(*q) + 0.25)), 0.0045, M["roof_j"], 4)
    for pu, pv in ((u, v), (u + w, v), (u, v + d), (u + w, v + d)):
        rod((pu, pv, zp(z + 0.3)), (cu, cv, zp(z + h + 0.3)), 0.012, M["stone_d"], 6)


def star(M, cu, cv, z, r, h):
    """Five-pointed star standing upright facing +v (h thick in tiles)."""
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((cu + math.cos(a) * rr, z + math.sin(a) * rr * 27))
    bm = bmesh.new()
    front = [bm.verts.new((x, cv + h, zp(zz))) for x, zz in pts]
    back = [bm.verts.new((x, cv - h, zp(zz))) for x, zz in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("star", bm, M["team_lit"])


def entrance(M, face, u, v, w, d, z, s0, s1, h, frame):
    """Framed glass door with mullions, a canopy with a team edge, lamps either side."""
    L = w if face == "left" else d
    a, b = s0 * L, s1 * L
    plate(face, u, v, w, d, a - 0.03, b + 0.03, z, h + 1, frame, 0.015)
    plate(face, u, v, w, d, a, b, z, h, M["door"], 0.02)
    plate(face, u, v, w, d, a + 0.01, b - 0.01, z + 0.4, h - 0.8, M["glass"], 0.006, 0.02)
    for k in range(1, 4):
        s = a + (b - a) * k / 4
        plate(face, u, v, w, d, s - 0.005, s + 0.005, z, h, frame, 0.008, 0.02)
    plate(face, u, v, w, d, a - 0.06, b + 0.06, z + h + 1, 0.8, frame, 0.12)  # canopy
    plate(face, u, v, w, d, a - 0.06, b + 0.06, z + h + 0.7, 0.4, M["team"], 0.006, 0.12)  # team edge
    for s in (a - 0.05, b + 0.03):
        plate(face, u, v, w, d, s, s + 0.02, z + h * 0.6, 1.0, M["lamp"], 0.02)


# ---------------------------------------------------------------- the model


def allied_russia(damage=0):
    M = mats()
    rng = random.Random("allied-russia")
    box(0, 0, 4, 4, 0, 2, M["paving"])

    # Low office wing over the whole plot.
    U, V, S = 0.03, 0.03, 3.94
    box(U, V, S, S, 2, WING_H, mat("#86604e", 0.85, grain=0.12, scale=22))
    plinth(M, U, V, S, S, 2, 1.2)
    windows(M, "left", U, V, S, S, 2, WING_H, 18, 1, M["trim"], fill=0.5, margin=0.04)
    windows(M, "right", U, V, S, S, 2, WING_H, 18, 1, M["trim"], fill=0.5, margin=0.04)
    cornice(M, U, V, S, S, 2 + WING_H - 0.7, 0.6, M["trim"], 0.02)
    deck(M, rng, 0.08, 0.08, 3.84, 3.84, 2 + WING_H, avoid=[(0.38, 0.38, 3.24, 2.64)])
    parapet(U, V, S, S, 2 + WING_H, 1.5, M["trim"], M["light2"], 0.05)
    entrance(M, "left", U, V, S, S, 2, 0.46, 0.54, 4.5, M["trim"])

    # Main block.
    z0 = 8
    box(0.4, 0.4, 3.2, 2.6, z0 - 6, 18, M["stone"])
    plinth(M, 0.4, 0.4, 3.2, 2.6, z0 - 6, 2.4)
    windows(M, "left", 0.4, 0.4, 3.2, 2.6, z0 - 6, 18, 14, 3, M["light"])
    windows(M, "right", 0.4, 0.4, 3.2, 2.6, z0 - 6, 18, 11, 3, M["light"])
    box(0.395, 0.395, 3.21, 2.61, z0 + 10.6, 0.8, M["team"])  # team band under the cornice
    cornice(M, 0.4, 0.4, 3.2, 2.6, z0 + 11.6, 1.5, M["light"])
    deck(M, rng, 0.45, 0.45, 3.1, 2.5, z0 + 13.5, avoid=[(1.08, 0.98, 1.84, 1.64)], mast=True)
    parapet(0.4, 0.4, 3.2, 2.6, z0 + 13.5, 2, M["light"], M["light2"])
    entrance(M, "left", 0.4, 0.4, 3.2, 2.6, z0 - 6, 0.44, 0.56, 9, M["light"])
    for k in range(3):  # steps down to the wing roof
        box(1.75, 3.0 + k * 0.05, 0.5, 0.05, z0, 1.2 - k * 0.4, M["light"])

    # Stepped tower.
    box(1.1, 1.0, 1.8, 1.6, 20, 30, M["light"])
    windows(M, "left", 1.1, 1.0, 1.8, 1.6, 20, 30, 7, 6, M["light2"])
    windows(M, "right", 1.1, 1.0, 1.8, 1.6, 20, 30, 6, 6, M["light2"])
    for zz in (30, 40):
        box(1.08, 0.98, 1.84, 1.64, zz, 0.6, M["stone"])
    box(1.096, 0.996, 1.808, 1.608, 48.4, 0.8, M["team"])  # team band under the tower cornice
    cornice(M, 1.1, 1.0, 1.8, 1.6, 49.6, 1.4, M["stone"])
    deck(M, rng, 1.12, 1.02, 1.76, 1.56, 51, avoid=[(1.38, 1.28, 1.24, 1.04)])
    parapet(1.1, 1.0, 1.8, 1.6, 51, 1.2, M["stone"], M["light2"], 0.04)
    box(1.4, 1.3, 1.2, 1.0, 51, 13, M["stone"])
    windows(M, "left", 1.4, 1.3, 1.2, 1.0, 51, 11, 4, 2, M["light"], lesenes=False)
    windows(M, "right", 1.4, 1.3, 1.2, 1.0, 51, 11, 3, 2, M["light"], lesenes=False)
    box(1.38, 1.28, 1.24, 1.04, 62, 2, M["team"])
    box(1.37, 1.27, 1.26, 1.06, 63.6, 0.5, M["light2"])
    seamed_pyramid(M, 1.45, 1.35, 1.1, 0.9, 64, 18)
    cylinder(2.0, 1.8, 0.05, 81.6, 1.0, M["gold"], 16)  # finial ring
    rod((2.0, 1.8, zp(82)), (2.0, 1.8, zp(100)), 0.02, M["gold"])
    for zz in (88, 94):
        cylinder(2.0, 1.8, 0.03, zz, 0.6, M["gold"], 12)
    if damage < 3:  # stage 3: spire and star are down in the rubble
        star(M, 2.0, 1.8, 104, 0.12, 0.02)
    if damage == 3:
        _drop_high(78)
    ruin_and_render("allied-russia", HEIGHT + 8, damage, 35)



def _drop_high(zmin_px):
    """Stage 3: remove loose pieces (spire tips, finials) that would float above the rubble field."""
    import bpy
    for ob in list(bpy.data.objects):
        if ob.type == "MESH" and ob.data.vertices and min((ob.matrix_world @ v.co).z for v in ob.data.vertices) > zp(zmin_px):
            bpy.data.objects.remove(ob, do_unlink=True)

MODELS = {"allied-russia": allied_russia, **{f"allied-russia-d{d}": (lambda d=d: allied_russia(d)) for d in (1, 2, 3)}}
