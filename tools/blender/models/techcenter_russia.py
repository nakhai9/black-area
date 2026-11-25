"""Nordursia High-Tech Center (4 x 4): the Stalinist high-rise kept as it was — a glazed podium with the entrance
canopy, four corner stone towers with gilded pyramid roofs, the central stepped tower with gilded corner pinnacles,
a gilded spire and the red star — with the ART_GUIDE detail pass:
- windows set back in frames (jambs, lintel, sill) on the visible faces, lesenes every two bays, floor bands,
  red cornices with dentils, stone coursing on the podium and its pilasters;
- every flat roof: bitumen membrane with joint lines inside a red parapet coping; plant boxes with louvres, vents,
  brick chimneys and a radio mast on the podium deck;
- pyramid roofs: standing seams on all four faces and raised hip ribs, a finial;
- spire: eight ribs and gilded rings;
- podium entrance: framed glass doors, canopy fascia, steps.
Team colour (TEAM["russia"]): the podium band and entrance canopy, the band high on the central tower (as before),
plus bands under the cornices of the four corner towers and the central lower block.

Plot: u 0..4, v 0..4 (front at +v). Heights in art px. Own geometry only (kit primitives and materials).
"""
import math
import random

import bmesh

from models._damage import ruined_render
from kit import _obj, cylinder, lathe, mat, render, rod, roof, zp, TEAM


class Batch:
    """Many boxes per material joined into one mesh each."""

    def __init__(self):
        self.parts = {}

    def box(self, u, v, w, d, z, h, m):
        self.parts.setdefault(id(m), (m, []))[1].append((u, v, w, d, z, h))

    def flush(self):
        for m, items in self.parts.values():
            bm = bmesh.new()
            for u, v, w, d, z, h in items:
                pts = [(u, v), (u + w, v), (u + w, v + d), (u, v + d)]
                lo = [bm.verts.new((a, b, zp(z))) for a, b in pts]
                hi = [bm.verts.new((a, b, zp(z + h))) for a, b in pts]
                for i in range(4):
                    j = (i + 1) % 4
                    bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
                bm.faces.new(list(reversed(lo)))
                bm.faces.new(hi)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            _obj("batch", bm, m)
        self.parts = {}


def mats():
    team = TEAM["russia"]
    return dict(
        base=mat("#7a7c7e", 0.9, grain=0.15, scale=8),
        pod=mat("#d2c4a0", 0.85, grain=0.12, scale=14),
        pod_d=mat("#b8aa86", 0.85, grain=0.1, scale=14),
        st=mat("#d2c4a0", 0.85, grain=0.12, scale=14),
        st2=mat("#ddd0ae", 0.85, grain=0.12, scale=14),
        les=mat("#e6dbbd", 0.8, grain=0.08, scale=14),
        band=mat("#bfb18e", 0.85, grain=0.08),
        red=mat("#a8322a", 0.7, grain=0.08),
        red_d=mat("#862620", 0.75, grain=0.06),
        gold=mat("#c8a850", 0.3, metal=0.9, grain=0.03),
        gold_d=mat("#a8883a", 0.35, metal=0.9, grain=0),
        glass=mat("#3a4048", 0.08, metal=0.3, grain=0.04, scale=4, glass=True),
        frame=mat("#7a6a50", 0.7, grain=0),
        trim=mat("#ece4cc", 0.7, grain=0.04),
        steel=mat("#5a5a58", 0.5, metal=0.6, grain=0),
        dark=mat("#4a4c4e", 0.9, grain=0.05),
        tar=mat("#56595c", 0.95, grain=0.1, scale=30),
        tar_d=mat("#45474a", 0.95, grain=0.1, scale=30),
        joint=mat("#6a6c6e", 0.9, grain=0),
        plant=mat("#9a948a", 0.85, grain=0.12),
        louvre=mat("#3a3c3e", 0.5, metal=0.5, grain=0),
        brick=mat("#8b3b2c", 0.9, grain=0.25, scale=50),
        door=mat("#9fc3d8", 0.05, metal=0.2, grain=0, glass=True),
        paving=mat("#b8b6b0", 0.9),
        team=mat(team, 0.5, grain=0.03),
        team_lit=mat(team, 0.4, emit=team),
        star=mat("#e0201a", 0.3, grain=0, emit="#c01010"),
    )


# ---------------------------------------------------------------- walls


def plate(B, side, u, v, w, d, s0, s1, z, h, m, t, off=0.0):
    """Plate on a box wall: "+v" / "+u" visible faces, "-v" / "-u" the back ones; s along the wall."""
    if side == "+v":
        B.box(u + s0, v + d + off, s1 - s0, t, z, h, m)
    elif side == "-v":
        B.box(u + s0, v - off - t, s1 - s0, t, z, h, m)
    elif side == "+u":
        B.box(u + w + off, v + s0, t, s1 - s0, z, h, m)
    else:
        B.box(u - off - t, v + s0, t, s1 - s0, z, h, m)


def windows(B, M, u, v, w, d, z, h, cols_per_tile, rows, fill=0.45, vfill=0.62, lesenes=True):
    """Windows on all four faces; on the visible ones set back in a frame with a lintel and sill, lesenes between."""
    for side in ("+v", "-v", "+u", "-u"):
        L = w if side in ("+v", "-v") else d
        cols = max(1, round(L * cols_per_tile))
        vis = side in ("+v", "+u")
        for c in range(cols):
            s0 = (c + (1 - fill) / 2) / cols * L
            s1 = s0 + fill / cols * L
            for r in range(rows):
                t0 = z + h * (r + (1 - vfill) / 2) / rows
                th = h * vfill / rows
                plate(B, side, u, v, w, d, s0, s1, t0, th, M["glass"], 0.006)
                if vis:
                    fw = min(0.012, (s1 - s0) * 0.16)
                    plate(B, side, u, v, w, d, s0 - fw, s0, t0, th, M["frame"], 0.016)
                    plate(B, side, u, v, w, d, s1, s1 + fw, t0, th, M["frame"], 0.016)
                    plate(B, side, u, v, w, d, s0 - fw, s1 + fw, t0 + th, 0.5, M["trim"], 0.018)  # lintel
                    plate(B, side, u, v, w, d, s0 - fw * 1.6, s1 + fw * 1.6, t0 - 0.5, 0.45, M["trim"], 0.022)  # sill
                    plate(B, side, u, v, w, d, (s0 + s1) / 2 - 0.004, (s0 + s1) / 2 + 0.004, t0, th, M["frame"], 0.012)
        if vis:
            for r in range(1, rows):  # floor bands
                plate(B, side, u, v, w, d, 0, L, z + h * r / rows - 0.15, 0.3, M["band"], 0.004)
            if lesenes:
                for c in range(0, cols + 1, 2):
                    s = min(max(c / cols * L, 0.016), L - 0.016)
                    plate(B, side, u, v, w, d, s - 0.016, s + 0.016, z, h, M["les"], 0.01)


def flat_top(B, M, u, v, w, d, z, coping=None):
    """Membrane with joint lines inside a parapet coping (the old red cap stays as the coping)."""
    cop = coping or M["red"]
    t = 0.06
    for bx in ((u, v, w, t), (u, v + d - t, w, t), (u, v + t, t, d - 2 * t), (u + w - t, v + t, t, d - 2 * t)):
        B.box(*bx, z, 1.0, cop)
    B.box(u + t, v + t, w - 2 * t, d - 2 * t, z, 0.25, M["tar"])
    n = max(1, int((w - 2 * t) / 0.18))
    for k in range(1, n):
        B.box(u + t + k * (w - 2 * t) / n - 0.004, v + t, 0.008, d - 2 * t, z + 0.25, 0.06, M["joint"])
    m = max(1, int((d - 2 * t) / 0.18))
    for k in range(1, m):
        B.box(u + t, v + t + k * (d - 2 * t) / m - 0.004, w - 2 * t, 0.008, z + 0.25, 0.06, M["joint"])


def stone_block(B, M, u, v, w, d, z, h, stone, floors, cols=5, team=False, top=True):
    """Stone block with framed windows, a red cornice with dentils, an optional team band under it and a flat top."""
    B.box(u, v, w, d, z, h, stone)
    windows(B, M, u, v, w, d, z, h - 1.6, cols, floors)
    if team:
        B.box(u - 0.012, v - 0.012, w + 0.024, d + 0.024, z + h - 2.8, 0.9, M["team"])
    B.box(u - 0.025, v - 0.025, w + 0.05, d + 0.05, z + h - 1.9, 0.7, M["red_d"])
    B.box(u - 0.04, v - 0.04, w + 0.08, d + 0.08, z + h - 1.2, 1.4, M["red"])
    for k in range(int(w / 0.05)):  # dentils, front and side
        B.box(u + 0.012 + k * 0.05, v + d + 0.025, 0.022, 0.012, z + h - 2.6, 0.7, M["trim"])
    for k in range(int(d / 0.05)):
        B.box(u + w + 0.025, v + 0.012 + k * 0.05, 0.012, 0.022, z + h - 2.6, 0.7, M["trim"])
    if top:
        flat_top(B, M, u - 0.04, v - 0.04, w + 0.08, d + 0.08, z + h + 0.2)


def seamed_pyramid(B, M, u, v, w, d, z, h, m, seam):
    """Pyramid roof with standing seams on every face and raised hip ribs."""
    roof(u, v, w, d, z, h, m, kind="pyramid", overhang=0)
    cu, cv = u + w / 2, v + d / 2
    hw, hd = w / 2, d / 2

    def hz(pu, pv):
        return z + h * min((pu - u) / hw, (u + w - pu) / hw, (pv - v) / hd, (v + d - pv) / hd, 1.0)

    n = max(4, round(w / 0.045))
    for k in range(1, n):
        pu = u + k * w / n
        r = min(pu - u, u + w - pu) / hw * hd - 0.004
        if r < 0.01:
            continue
        for e, sg in ((v, 1), (v + d, -1)):
            p, q = (pu, e + sg * 0.002), (pu, e + sg * r)
            rod((p[0], p[1], zp(hz(*p) + 0.2)), (q[0], q[1], zp(hz(*q) + 0.2)), 0.0045, seam, 4)
    n = max(4, round(d / 0.045))
    for k in range(1, n):
        pv = v + k * d / n
        r = min(pv - v, v + d - pv) / hd * hw - 0.004
        if r < 0.01:
            continue
        for e, sg in ((u, 1), (u + w, -1)):
            p, q = (e + sg * 0.002, pv), (e + sg * r, pv)
            rod((p[0], p[1], zp(hz(*p) + 0.2)), (q[0], q[1], zp(hz(*q) + 0.2)), 0.0045, seam, 4)
    for pu, pv in ((u, v), (u + w, v), (u, v + d), (u + w, v + d)):
        rod((pu, pv, zp(z + 0.3)), (cu, cv, zp(z + h + 0.3)), 0.01, seam, 6)
    lathe(cu, cv, z + h - 0.3, [(0.025, 0), (0.032, 0.8), (0.004, 3.5)], M["gold"], 10, cap_bottom=True)


# ---------------------------------------------------------------- podium


def podium(B, M, h=14):
    B.box(0, 0, 4, 4, 0, 2, M["base"])
    B.box(0.05, 0.05, 3.9, 3.9, 2, h, M["pod"])
    B.box(0.04, 0.04, 3.92, 3.92, 2, 1.4, M["pod_d"])  # plinth
    for k in range(1, 4):  # stone coursing
        B.box(0.048, 0.048, 3.904, 3.904, 2 + 1.4 + k * (h * 0.8) / 4, 0.18, M["pod_d"])
    windows(B, M, 0.05, 0.05, 3.9, 3.9, 2, h, 5, 3, fill=0.62, vfill=0.6, lesenes=False)
    for k in range(21):  # pilasters on the two visible faces
        s = 0.06 + k * 3.78 / 20
        B.box(0.05 + s, 3.95, 0.03, 0.018, 2, h * 0.86, M["les"])
        B.box(3.95, 0.05 + s, 0.018, 0.03, 2, h * 0.86, M["les"])
    B.box(0.04, 0.04, 3.92, 3.92, 2 + h * 0.86, h * 0.08, M["team"])
    B.box(0.0, 0.0, 4.0, 4.0, 2 + h, 1.2, M["pod"])
    for k in range(int(4 / 0.05)):  # dentils under the podium cornice
        B.box(0.01 + k * 0.05, 3.98, 0.022, 0.012, 2 + h - 0.5, 0.5, M["trim"])
        B.box(3.98, 0.01 + k * 0.05, 0.012, 0.022, 2 + h - 0.5, 0.5, M["trim"])
    # Entrance on the +v face: framed glass doors, canopy with a team fascia on posts, steps.
    B.box(1.4, 3.92, 1.2, 0.05, 2, h * 0.5, M["door"])
    for k in range(5):
        B.box(1.4 + k * 0.29, 3.93, 0.02, 0.06, 2, h * 0.5, M["steel"])
    B.box(1.38, 3.93, 1.24, 0.06, 2 + h * 0.5, 0.5, M["steel"])
    B.box(1.35, 3.75, 1.3, 0.38, 2 + h * 0.55, 1.5, M["team"])
    B.box(1.34, 4.12, 1.32, 0.012, 2 + h * 0.55 - 0.2, 1.9, M["red_d"])  # fascia lip
    for k in range(6):  # canopy soffit lights
        B.box(1.45 + k * 0.22, 4.0, 0.06, 0.04, 2 + h * 0.55 - 0.1, 0.1, M["trim"])
    for pu in (1.4, 2.6):
        rod((pu, 4.1, zp(2)), (pu, 4.1, zp(2 + h * 0.55)), 0.012, M["steel"])
    B.box(1.3, 3.95, 1.4, 0.12, 0, 1.2, M["paving"])
    B.box(1.3, 4.0, 1.4, 0.05, 0, 0.6, M["dark"])


def podium_deck(B, M, z, rng, avoid):
    """The podium roof: membrane with joints inside a coping, plant boxes, vents, brick chimneys, a radio mast."""
    u, v, w, d = 0.15, 0.15, 3.7, 3.7
    B.box(0.1, 0.1, 3.8, 3.8, z - 1.2, 1.2, M["tar_d"])
    B.box(u, v, w, d, z, 0.3, M["tar"])
    for k in range(1, 18):
        B.box(u + k * w / 18 - 0.004, v, 0.008, d, z + 0.3, 0.06, M["joint"])
        B.box(u, v + k * d / 18 - 0.004, w, 0.008, z + 0.3, 0.06, M["joint"])
    for bx in ((0.0, 0.0, 4.0, 0.06), (0.0, 3.94, 4.0, 0.06), (0.0, 0.06, 0.06, 3.88), (3.94, 0.06, 0.06, 3.88)):
        B.box(*bx, z - 0.6, 1.6, M["pod"])  # parapet
    for bx in ((-0.008, -0.008, 4.016, 0.076), (-0.008, 3.932, 4.016, 0.076), (-0.008, 0.068, 0.076, 3.864), (3.932, 0.068, 0.076, 3.864)):
        B.box(*bx, z + 1.0, 0.4, M["trim"])
    rects = list(avoid)
    zt = z + 0.3

    def spot(sw, sd):
        for _ in range(60):
            pu = u + 0.08 + rng.random() * (w - 0.16 - sw)
            pv = v + 0.08 + rng.random() * (d - 0.16 - sd)
            if all(pu + sw < a or pu > a + c or pv + sd < b or pv > b + e for a, b, c, e in rects):
                rects.append((pu - 0.04, pv - 0.04, sw + 0.08, sd + 0.08))
                return pu, pv
        return None

    for _ in range(5):
        p = spot(0.26, 0.18)
        if p:
            B.box(p[0], p[1], 0.26, 0.18, zt, 2.6, M["plant"])
            B.box(p[0] - 0.02, p[1] - 0.02, 0.3, 0.22, zt + 2.6, 0.5, mat("#5f6a5c", 0.6, metal=0.3, grain=0.05))
            for k in range(5):
                B.box(p[0] + 0.03 + k * 0.045, p[1] + 0.18, 0.025, 0.004, zt + 0.5, 1.6, M["louvre"])
    for _ in range(6):
        s = 0.1 + rng.random() * 0.05
        p = spot(s, s)
        if p:
            hh = 4 + rng.random() * 3
            B.box(p[0], p[1], s, s, zt, hh, M["brick"])
            B.box(p[0] - 0.01, p[1] - 0.01, s + 0.02, s + 0.02, zt + hh, 0.8, M["dark"])
    for _ in range(6):
        p = spot(0.08, 0.08)
        if p:
            cylinder(p[0] + 0.04, p[1] + 0.04, 0.025, zt, 1.8, M["steel"], 10)
            lathe(p[0] + 0.04, p[1] + 0.04, zt + 1.8, [(0.05, 0), (0.0, 0.9)], M["steel"], 10, cap_bottom=True)
    p = spot(0.1, 0.1)
    if p:  # radio mast with the team light
        cu, cv = p[0] + 0.03, p[1] + 0.017
        for du, dv in ((0, 0), (0.06, 0), (0.03, 0.05)):
            rod((p[0] + du, p[1] + dv, zp(zt)), (cu, cv, zp(zt + 18)), 0.006, M["steel"])
        for k in range(1, 5):
            f = 1 - k / 5
            rod((cu - 0.03 * f, cv - 0.017 * f, zp(zt + 18 * k / 5)), (cu + 0.03 * f, cv - 0.017 * f, zp(zt + 18 * k / 5)), 0.004, M["steel"])
        cylinder(cu, cv, 0.018, zt + 18, 1.2, M["team_lit"], 8)


# ---------------------------------------------------------------- the model


def techcenter_russia(damage=0):
    M = mats()
    B = Batch()
    rng = random.Random("techcenter-russia")
    podium(B, M, 14)
    podium_deck(B, M, 17.4, rng, [(0.26, 0.26, 1.08, 1.08), (2.66, 0.26, 1.08, 1.08), (0.26, 2.66, 1.08, 1.08), (2.66, 2.66, 1.08, 1.08), (1.0, 0.9, 2.0, 1.9)])
    # Four corner towers with gilded pyramid roofs.
    for u, v in [(0.3, 0.3), (2.7, 0.3), (0.3, 2.7), (2.7, 2.7)]:
        stone_block(B, M, u, v, 1.0, 1.0, 16, 30, M["st"], 5, cols=5, team=True)
        seamed_pyramid(B, M, u + 0.15, v + 0.15, 0.7, 0.7, 46, 12, M["gold"], M["gold_d"])
    # Central stepped tower.
    stone_block(B, M, 1.05, 0.95, 1.9, 1.8, 16, 18, M["st"], 3, team=True)
    stone_block(B, M, 1.3, 1.2, 1.4, 1.3, 34, 56, M["st2"], 9)
    B.box(1.3, 2.5, 1.4, 0.03, 86, 2.5, M["team"])
    B.box(2.7, 1.2, 0.03, 1.3, 86, 2.5, M["team"])
    for u, v in [(1.3, 1.2), (2.7, 1.2), (1.3, 2.5), (2.7, 2.5)]:  # gilded corner pinnacles on pedestals
        B.box(u - 0.05, v - 0.05, 0.1, 0.1, 90.2, 1.2, M["trim"])
        lathe(u, v, 91.4, [(0.06, 0), (0.07, 0.8), (0.04, 2.5), (0.0, 8)], M["gold"], 8, cap_bottom=True)
    stone_block(B, M, 1.5, 1.4, 1.0, 0.9, 90, 26, M["st2"], 4)
    stone_block(B, M, 1.7, 1.6, 0.6, 0.5, 116, 14, M["st2"], 2, top=False)
    # Spire: octagonal gilded cone with ribs and rings.
    prof = [(0.3, 0), (0.22, 12), (0.12, 30), (0.04, 46), (0.015, 52)]
    lathe(2.0, 1.85, 130, prof, M["gold"], 8)
    for k in range(8):
        a = 2 * math.pi * k / 8
        pts = [(2.0 + (r + 0.004) * math.cos(a), 1.85 + (r + 0.004) * math.sin(a), zp(130 + z)) for r, z in prof]
        for p, q in zip(pts, pts[1:]):
            rod(p, q, 0.008, M["gold_d"], 4)
    for r, z in ((0.3, 0.2), (0.245, 8.5), (0.19, 18), (0.12, 30)):
        cylinder(2.0, 1.85, r + 0.012, 130 + z, 0.8, M["gold_d"], 16)
    lathe(2.0, 1.85, 182, [(0.02, 0), (0.02, 8)], M["gold"], 8)
    B.flush()
    # Red star standing in the u-z plane (faces the +v side), centred at z = 196.
    cz = zp(196)
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        r = 0.2 if k % 2 == 0 else 0.08
        pts.append((r * math.cos(a), r * math.sin(a)))
    bm = bmesh.new()
    front = [bm.verts.new((2.0 + x, 1.87, cz + y)) for x, y in pts]
    back = [bm.verts.new((2.0 + x, 1.83, cz + y)) for x, y in pts]
    cf, cb = bm.verts.new((2.0, 1.87, cz)), bm.verts.new((2.0, 1.83, cz))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((cf, front[i], front[j]))
        bm.faces.new((cb, back[j], back[i]))
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if damage < 3:  # stage 3: spire and star are down in the rubble
        _obj("star", bm, M["star"])
    else:
        bm.free()
    if damage == 3:
        _drop_high(120)
    ruined_render("techcenter-russia", (4, 4), 210, damage, seed=25, cut_u=2.0)



def _drop_high(zmin_px):
    """Stage 3: remove loose pieces (spire tips, finials) that would float above the rubble field."""
    import bpy
    for ob in list(bpy.data.objects):
        if ob.type == "MESH" and ob.data.vertices and min((ob.matrix_world @ v.co).z for v in ob.data.vertices) > zp(zmin_px):
            bpy.data.objects.remove(ob, do_unlink=True)

MODELS = {"techcenter-russia": techcenter_russia, **{f"techcenter-russia-d{d}": (lambda d=d: techcenter_russia(d)) for d in (1, 2, 3)}}
