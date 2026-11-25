"""Nordursia Ministry of Defence (5 x 3): the Stalinist design kept as it was (two stepped towers with spires at the
back, two teal domes, long low wings with hip roofs and arched gateways, the central block with giant pilasters,
balustrade, crest and crowning pavilion), with the ART_GUIDE detail pass:
- windows set back in white frames with sills and lintels, rustication joints on the granite base, string courses;
- wing hip roofs: standing seams on every face, raised ridge and hips, gutter board and dormers on all four slopes;
- tower roofs: seamed pyramids with hip ribs; every tier with a cornice, dentils and corner pinnacles;
- domes: ribbed, on drums with arched windows and a cornice; gilded finials;
- the central block's flat roof: membrane with joint lines, parapet, plant room with louvres;
- arched gateways with a stone surround and keystone, steps in front of the main entrance.
Team colour (TEAM["russia"]): the band under the central block's attic (as before), bands under the wings' cornices,
round each tower's first tier and round both dome drums.

Plot: u 0..5 (along the front), v 0..3 (front at +v). Heights in art px. Own geometry only (kit primitives and
materials).
"""
import math

import bmesh

from kit import _obj, cylinder, dome, lathe, mat, render, rod, roof, zp, TEAM
from models._damage import ruined_render

W, D, MU = 5, 3, 2.5


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
    return dict(
        stone=mat("#dcd2bb", 0.85, grain=0.1, scale=25),
        stone_d=mat("#c2b79e", 0.85, grain=0.08, scale=25),
        base=mat("#a59a80", 0.9, grain=0.12, scale=20),
        base_d=mat("#857b64", 0.9, grain=0.1, scale=20),
        trim=mat("#ece5d2", 0.7, grain=0.05),
        roof=mat("#7e786c", 0.8, grain=0.15, scale=14),
        roof_d=mat("#5f5a51", 0.8, grain=0.1, scale=14),
        seam=mat("#948d80", 0.6, metal=0.2, grain=0),
        glass=mat("#2a2f33", 0.1, grain=0, glass=True),
        frame=mat("#efe9d8", 0.6, grain=0),
        dome=mat("#5d8a94", 0.35, metal=0.6, grain=0.05),
        dome_d=mat("#466c75", 0.35, metal=0.6, grain=0),
        gold=mat("#d9b23e", 0.3, metal=0.9, grain=0),
        dark=mat("#26282a", 0.7, grain=0),
        red=mat("#b8231c", 0.5, grain=0),
        membrane=mat("#3c3a36", 0.8, grain=0.1),
        joint=mat("#55524c", 0.9, grain=0),
        louvre=mat("#4a4c4f", 0.5, metal=0.5, grain=0),
        pave=mat("#8f846c", 0.95, grain=0.15, scale=10),
        team=mat(TEAM["russia"], 0.45, metal=0.3, grain=0),
    )


# ---------------------------------------------------------------- walls and windows


def side_plate(B, side, u, v, w, d, s0, s1, z, h, m, t, off=0.0):
    """Plate on a box wall: l = +v, r = +u, f = -v, b = -u; s along the wall from its low corner."""
    if side == "l":
        B.box(u + s0, v + d + off, s1 - s0, t, z, h, m)
    elif side == "f":
        B.box(u + s0, v - off - t, s1 - s0, t, z, h, m)
    elif side == "r":
        B.box(u + w + off, v + s0, t, s1 - s0, z, h, m)
    else:
        B.box(u - off - t, v + s0, t, s1 - s0, z, h, m)


def windows(B, M, u, v, w, d, z, h, cu, cv, rows, sides="lrfb", fill=0.55, wfill=0.45, margin=0.05):
    """Window grids: glass set back behind a white frame (jambs, lintel), a sill below."""
    for side in sides:
        L = w if side in "lf" else d
        cols = cu if side in "lf" else cv
        span = L * (1 - 2 * margin)
        for c in range(cols):
            s0 = L * margin + span * (c + (1 - wfill) / 2) / cols
            s1 = s0 + span * wfill / cols
            fw = min(0.012, (s1 - s0) * 0.18)
            for r in range(rows):
                z0 = z + h * (r + (1 - fill) / 2) / rows
                zh = h * fill / rows
                side_plate(B, side, u, v, w, d, s0, s1, z0, zh, M["glass"], 0.004)
                side_plate(B, side, u, v, w, d, s0 - fw, s0, z0, zh, M["frame"], 0.012)
                side_plate(B, side, u, v, w, d, s1, s1 + fw, z0, zh, M["frame"], 0.012)
                side_plate(B, side, u, v, w, d, s0 - fw, s1 + fw, z0 + zh, 0.5, M["frame"], 0.014)
                side_plate(B, side, u, v, w, d, s0 - fw * 1.6, s1 + fw * 1.6, z0 - 0.5, 0.45, M["trim"], 0.02)


def rustic_base(B, M, u, v, w, d, z, h):
    B.box(u, v, w, d, z, h, M["base"])
    for k in range(1, 3):
        zz = z + h * k / 3 - 0.12
        B.box(u - 0.004, v - 0.004, w + 0.008, d + 0.008, zz, 0.24, M["base_d"])
    B.box(u - 0.012, v - 0.012, w + 0.024, d + 0.024, z + h - 0.4, 0.5, M["trim"])


def cornice(B, M, u, v, w, d, z, h, dentils=True):
    B.box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, z, h * 0.45, M["stone_d"])
    B.box(u - 0.035, v - 0.035, w + 0.07, d + 0.07, z + h * 0.45, h * 0.55, M["trim"])
    if dentils:
        for k in range(int(w / 0.05)):
            B.box(u + 0.012 + k * 0.05, v + d + 0.02, 0.022, 0.01, z - 0.6, 0.6, M["trim"])
        for k in range(int(d / 0.05)):
            B.box(u + w + 0.02, v + 0.012 + k * 0.05, 0.01, 0.022, z - 0.6, 0.6, M["trim"])


def seamed_roof(B, M, u, v, w, d, z, h, kind="hip", over=0.02, dormers=(0, 0), step=0.045):
    """Hip / pyramid roof with standing seams on every slope, raised ridge and hips, gutter board, dormers."""
    a0, a1, b0, b1 = u - over, u + w + over, v - over, v + d + over
    ridge = "u" if (a1 - a0) >= (b1 - b0) else "v"
    roof(u, v, w, d, z, h, M["roof"], kind=kind, ridge=ridge, overhang=over)
    half = min(a1 - a0, b1 - b0) / 2
    hu = half if kind != "pyramid" else (a1 - a0) / 2
    hv = half if kind != "pyramid" else (b1 - b0) / 2

    def hz(pu, pv):
        return z + h * min((pu - a0) / hu, (a1 - pu) / hu, (pv - b0) / hv, (b1 - pv) / hv, 1.0)

    n = max(2, round((a1 - a0) / step))
    for k in range(1, n):
        pu = a0 + k * (a1 - a0) / n
        r = min(pu - a0, a1 - pu) / hu * hv
        r = min(r, hv) - 0.004
        if r < 0.015:
            continue
        for e, sg in ((b0, 1), (b1, -1)):
            p, q = (pu, e + sg * 0.003), (pu, e + sg * r)
            rod((p[0], p[1], zp(hz(*p) + 0.25)), (q[0], q[1], zp(hz(*q) + 0.25)), 0.0045, M["seam"], 4)
    m = max(2, round((b1 - b0) / step))
    for k in range(1, m):
        pv = b0 + k * (b1 - b0) / m
        r = min(pv - b0, b1 - pv) / hv * hu
        r = min(r, hu) - 0.004
        if r < 0.015:
            continue
        for e, sg in ((a0, 1), (a1, -1)):
            p, q = (e + sg * 0.003, pv), (e + sg * r, pv)
            rod((p[0], p[1], zp(hz(*p) + 0.25)), (q[0], q[1], zp(hz(*q) + 0.25)), 0.0045, M["seam"], 4)
    cu, cv = (a0 + a1) / 2, (b0 + b1) / 2
    if kind == "pyramid":
        r0 = r1 = (cu, cv)
    elif ridge == "u":
        r0, r1 = (a0 + half, cv), (a1 - half, cv)
    else:
        r0, r1 = (cu, b0 + half), (cu, b1 - half)
    if math.dist(r0, r1) > 0.01:
        rod((r0[0], r0[1], zp(z + h + 0.3)), (r1[0], r1[1], zp(z + h + 0.3)), 0.012, M["roof_d"], 6)
    for (pu, pv) in ((a0, b0), (a1, b0), (a0, b1), (a1, b1)):
        top = min((r0, r1), key=lambda r: math.dist(r, (pu, pv)))
        rod((pu, pv, zp(z + 0.3)), (top[0], top[1], zp(z + h + 0.3)), 0.009, M["roof_d"], 6)
    for bx in ((a0, b0, a1 - a0, 0.018), (a0, b1 - 0.018, a1 - a0, 0.018), (a0, b0, 0.018, b1 - b0), (a1 - 0.018, b0, 0.018, b1 - b0)):
        B.box(*bx, z - 0.5, 0.7, M["roof_d"])
    long_n, short_n = dormers
    inset = min(0.16, half * 0.45)
    for side in ("-v", "+v", "-u", "+u"):
        along_u = side in ("-v", "+v")
        cnt = long_n if along_u == (ridge == "u") else short_n
        lo, hi = (a0, a1) if along_u else (b0, b1)
        for k in range(cnt):
            s = lo + inset + 0.1 + (hi - lo - 2 * inset - 0.2) * (k + 0.5) / cnt
            pu, pv = {"-v": (s, b0 + inset), "+v": (s, b1 - inset), "-u": (a0 + inset, s), "+u": (a1 - inset, s)}[side]
            dormer(B, M, pu, pv, side, hz(pu, pv) - 1.0)


def dormer(B, M, cu, cv, side, z):
    s = 0.03
    B.box(cu - s, cv - s, 2 * s, 2 * s, z, 3.6, M["stone"])
    roof(cu - s, cv - s, 2 * s, 2 * s, z + 3.6, 1.8, M["roof_d"], kind="gable", ridge="v" if side in ("-v", "+v") else "u", overhang=0.006)
    g = 0.018
    if side == "+v":
        B.box(cu - g, cv + s, 2 * g, 0.005, z + 0.7, 2.3, M["glass"])
    elif side == "-v":
        B.box(cu - g, cv - s - 0.005, 2 * g, 0.005, z + 0.7, 2.3, M["glass"])
    elif side == "+u":
        B.box(cu + s, cv - g, 0.005, 2 * g, z + 0.7, 2.3, M["glass"])
    else:
        B.box(cu - s - 0.005, cv - g, 0.005, 2 * g, z + 0.7, 2.3, M["glass"])


def arch_gate(B, M, gate_u, v_face, z):
    """Arched gateway on a +v wall: stone surround, dark opening with a round head, keystone."""
    B.box(gate_u - 0.12, v_face - 0.01, 0.24, 0.03, z, 10.6, M["trim"])
    B.box(gate_u - 0.08, v_face + 0.0, 0.16, 0.032, z, 7.6, M["dark"])
    for k in range(7):  # round head of the opening as stepped blocks
        a = math.pi * (k + 0.5) / 7
        B.box(gate_u + 0.08 * math.cos(a) - 0.012, v_face + 0.0, 0.024, 0.032, z + 7.6, 2.2 * math.sin(a), M["dark"])
    B.box(gate_u - 0.015, v_face + 0.02, 0.03, 0.02, z + 9.6, 1.4, M["trim"])  # keystone
    for k in range(4):  # rusticated jambs
        B.box(gate_u - 0.13, v_face + 0.02, 0.04, 0.012, z + 0.4 + k * 1.9, 1.5, M["stone_d"])
        B.box(gate_u + 0.09, v_face + 0.02, 0.04, 0.012, z + 0.4 + k * 1.9, 1.5, M["stone_d"])


# ---------------------------------------------------------------- the model


def barracks_russia(damage=0):
    M = mats()
    B = Batch()
    B.box(0, 0, W, D, 0, 2, M["pave"])
    for k in range(1, 12):  # paving joints
        B.box(k * 0.42, 0.02, 0.006, 2.96, 2, 0.08, M["joint"])
    for k in range(1, 7):
        B.box(0.02, k * 0.42, 4.96, 0.006, 2, 0.08, M["joint"])

    def tiered(u, v, w, d, z, h, cols_u, cols_v, rows, pinnacles=False):
        B.box(u, v, w, d, z, h, M["stone"])
        windows(B, M, u, v, w, d, z + 1, h - 2, cols_u, cols_v, rows, fill=0.55, wfill=0.45)
        cornice(B, M, u, v, w, d, z + h, 1.2)
        if pinnacles:
            for pu in (u - 0.01, u + w - 0.04):
                for pv in (v - 0.01, v + d - 0.04):
                    B.box(pu, pv, 0.05, 0.05, z + h + 1.2, 2.6, M["trim"])
                    lathe(pu + 0.025, pv + 0.025, z + h + 3.8, [(0.022, 0), (0.0005, 2.4)], M["trim"], 8, cap_bottom=True)

    # Two tall stepped towers at the back, each crowned with a spire.
    for u in (0.7, W - 0.7 - 0.75):
        rustic_base(B, M, u, 0.1, 0.75, 0.75, 2, 2.5)
        tiered(u, 0.1, 0.75, 0.75, 4.5, 31.5, 5, 5, 9)
        B.box(u - 0.022, 0.078, 0.794, 0.794, 33.2, 0.8, M["team"])  # team band under the first cornice
        tiered(u + 0.1, 0.2, 0.55, 0.55, 37.2, 7, 4, 4, 2, pinnacles=True)
        tiered(u + 0.2, 0.3, 0.35, 0.35, 45.4, 4, 2, 2, 1, pinnacles=True)
        seamed_roof(B, M, u + 0.2, 0.3, 0.35, 0.35, 50.6, 6, kind="pyramid", over=0.03, step=0.04)
        lathe(u + 0.375, 0.475, 56, [(0.03, 0), (0.04, 0.8), (0.022, 1.8), (0.005, 9)], M["gold"], segs=12, cap_bottom=True)
        for k in range(4):  # corner pinnacles on the first tier
            pu = u + (0.04 if k % 2 == 0 else 0.67)
            pv = 0.14 + (0 if k < 2 else 0.63)
            B.box(pu, pv, 0.04, 0.04, 37.2, 3, M["trim"])
            lathe(pu + 0.02, pv + 0.02, 40.2, [(0.02, 0), (0.0005, 2.2)], M["trim"], 8, cap_bottom=True)
    # Teal domes on drums between the towers and the centre.
    for u in (1.85, W - 1.85):
        cylinder(u, 0.95, 0.3, 20, 4, M["stone"], 32)
        for k in range(12):  # arched drum windows
            a = 2 * math.pi * (k + 0.5) / 12
            B.box(u + 0.3 * math.cos(a) - 0.018, 0.95 + 0.3 * math.sin(a) - 0.018, 0.036, 0.036, 20.8, 2.4, M["glass"])
        cylinder(u, 0.95, 0.304, 22.9, 0.5, M["team"], 32)
        cylinder(u, 0.95, 0.33, 24, 0.8, M["trim"], 32)
        cylinder(u, 0.95, 0.315, 23.4, 0.6, M["stone_d"], 32)
        dome(u, 0.95, 0.31, 24.8, 9, M["dome"])
        for k in range(16):  # dome ribs
            a = 2 * math.pi * k / 16
            prev = None
            for i in range(9):
                t = i / 8 * 0.93
                rr = 0.31 * math.cos(t * math.pi / 2) + 0.004
                p = (u + rr * math.cos(a), 0.95 + rr * math.sin(a), zp(24.8 + 9 * math.sin(t * math.pi / 2) + 0.15))
                if prev:
                    rod(prev, p, 0.006, M["dome_d"], 4)
                prev = p
        lathe(u, 0.95, 33.5, [(0.03, 0), (0.035, 0.7), (0.02, 1.5), (0.004, 4)], M["gold"], segs=10, cap_bottom=True)

    C0, CW = 1.75, W - 3.5
    # Long low wings either side, an arched gateway beside the centre.
    for u, w, gate_u in ((0.08, C0 - 0.08, C0 - 0.4), (W - C0, C0 - 0.08, W - C0 + 0.4)):
        rustic_base(B, M, u, 1.0, w, 1.95, 2, 2.4)
        B.box(u, 1.0, w, 1.95, 4.4, 15.6, M["stone"])
        windows(B, M, u, 1.0, w, 1.95, 5, 14.5, 9, 10, 4, fill=0.55, wfill=0.42)
        for k in range(1, 4):  # string courses between floors
            B.box(u - 0.004, 0.996, w + 0.008, 1.958, 5 + k * 14.5 / 4 - 0.1, 0.2, M["stone_d"])
        B.box(u - 0.014, 0.986, w + 0.028, 1.978, 18.6, 0.8, M["team"])  # team band under the cornice
        cornice(B, M, u, 1.0, w, 1.95, 19.4, 1.6)
        seamed_roof(B, M, u, 1.0, w, 1.95, 21.0, 3.4, kind="hip", over=0.02, dormers=(3, 3))
        arch_gate(B, M, gate_u, 2.95, 2)
    # Central block: rusticated base, giant pilasters, team band, attic with the crest, crowning pavilion.
    rustic_base(B, M, C0, 0.6, CW, 2.35, 2, 3)
    B.box(C0, 0.6, CW, 2.35, 5, 25, M["stone"])
    windows(B, M, C0, 0.6, CW, 2.35, 6, 22, 7, 11, 6, fill=0.6, wfill=0.4)
    for k in range(8):  # giant pilasters with bases and capitals
        u = C0 + 0.02 + k * (CW - 0.06) / 7
        B.box(u, 2.95, 0.04, 0.035, 5, 25, M["trim"])
        B.box(u - 0.008, 2.95, 0.056, 0.045, 5, 1.0, M["stone_d"])
        B.box(u - 0.008, 2.95, 0.056, 0.045, 28.8, 1.0, M["trim"])
    for k in range(12):  # pilasters on the side face
        v = 0.62 + k * (2.35 - 0.06) / 11
        B.box(C0 + CW, v, 0.035, 0.04, 5, 25, M["trim"])
    B.box(C0 - 0.01, 2.95, CW + 0.02, 0.03, 27, 1.2, M["team"])
    B.box(C0 + CW, 0.59, 0.03, 2.37, 27, 1.2, M["team"])  # team band continues on the side
    # Main entrance: dark recessed portal, framed, with steps.
    B.box(C0 + 0.6, 2.95, CW - 1.2, 0.04, 2, 7, M["dark"])
    B.box(C0 + 0.56, 2.95, 0.04, 0.05, 2, 7.6, M["trim"])
    B.box(C0 + CW - 0.6, 2.95, 0.04, 0.05, 2, 7.6, M["trim"])
    B.box(C0 + 0.56, 2.95, CW - 1.12, 0.05, 9, 0.8, M["trim"])
    for k in range(1, 6):  # door leaves
        B.box(C0 + 0.6 + k * (CW - 1.2) / 6 - 0.004, 2.99, 0.008, 0.004, 2, 6.4, M["frame"])
    for k in range(3):
        B.box(C0 + 0.5 + k * 0.03, 2.95 + k * 0.08 + 0.04, CW - 1.0 - k * 0.06, 0.08, 2 - k * 0.6, 0.6, M["trim"])
    cornice(B, M, C0, 0.6, CW, 2.35, 29.4, 1.8)
    for k in range(12):  # balustrade posts (front) with a rail
        B.box(C0 + 0.02 + k * (CW - 0.06) / 11, 2.93, 0.03, 0.03, 31.6, 1.8, M["trim"])
        for j in range(3):
            B.box(C0 + 0.02 + k * (CW - 0.06) / 11 + 0.04 + j * 0.03, 2.935, 0.012, 0.02, 31.6, 1.6, M["trim"])
    for k in range(20):  # balustrade along the side
        B.box(C0 + CW + 0.01, 0.6 + k * 2.3 / 19, 0.02, 0.02, 31.6, 1.6, M["trim"])
    B.box(C0 - 0.03, 2.93, CW + 0.06, 0.05, 33.2, 0.5, M["trim"])
    B.box(C0 + CW + 0.0, 0.58, 0.04, 2.4, 33.2, 0.5, M["trim"])
    # Attic storey with the crest.
    B.box(C0 + 0.2, 0.8, CW - 0.4, 1.95, 31.6, 6, M["stone"])
    windows(B, M, C0 + 0.2, 0.8, CW - 0.4, 1.95, 32.5, 4.5, 6, 8, 1, sides="frb", fill=0.6, wfill=0.4)
    rod((MU, 2.75, zp(34.6)), (MU, 2.77, zp(34.6)), 0.135, M["gold"], 24)
    rod((MU, 2.77, zp(34.6)), (MU, 2.78, zp(34.6)), 0.1, M["red"], 24)
    rod((MU, 2.78, zp(34.6)), (MU, 2.79, zp(34.6)), 0.04, M["gold"], 16)
    for k in range(8):  # gilded rays round the crest
        a = 2 * math.pi * k / 8
        B.box(MU + 0.15 * math.cos(a) - 0.01, 2.75, 0.02, 0.012, 34.6 + 3.2 * math.sin(a) - 0.4, 0.8, M["gold"])
    cornice(B, M, C0 + 0.18, 0.78, CW - 0.36, 1.99, 37.6, 0.8, dentils=False)
    # Crowning pavilion: flat roof with membrane, joints, a parapet and a plant room.
    P0, PV, PW, PD = C0 + 0.4, 1.1, CW - 0.8, 1.3
    B.box(P0, PV, PW, PD, 38.4, 2.2, M["membrane"])
    for k in range(1, 8):
        B.box(P0 + k * PW / 8 - 0.003, PV, 0.006, PD, 40.6, 0.06, M["joint"])
    for k in range(1, 8):
        B.box(P0, PV + k * PD / 8 - 0.003, PW, 0.006, 40.6, 0.06, M["joint"])
    for bx in ((P0 - 0.03, PV - 0.03, PW + 0.06, 0.03), (P0 - 0.03, PV + PD, PW + 0.06, 0.03), (P0 - 0.03, PV, 0.03, PD), (P0 + PW, PV, 0.03, PD)):
        B.box(*bx, 38.4, 3.4, M["stone"])
        B.box(bx[0] - 0.005, bx[1] - 0.005, bx[2] + 0.01, bx[3] + 0.01, 41.8, 0.4, M["trim"])
    B.box(P0 + 0.12, PV + 0.15, 0.3, 0.22, 40.6, 2.6, M["stone_d"])
    for k in range(6):
        B.box(P0 + 0.14 + k * 0.045, PV + 0.37, 0.025, 0.004, 41.0, 1.8, M["louvre"])
    B.flush()
    ruined_render("barracks-russia", (W, D), 66, damage, flag=(2.5, 1.75, 40.6), seed=2)


MODELS = {"barracks-russia": barracks_russia, **{f"barracks-russia-d{d}": (lambda d=d: barracks_russia(d)) for d in (1, 2, 3)}}
