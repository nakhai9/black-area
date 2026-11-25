"""Military Garage (6 x 4: 6 tiles along the front u, 4 deep along v) of every nation: a vehicle / aircraft shed with
its long side on the front, doors on the +v front (the plot's "left" face in the game) opening onto a concrete apron.

One design code per nation (the shapes differ), each with its damage states (ART_GUIDE "Damage states": d1 <= 80 %
light, d2 <= 50 % half destroyed, d3 <= 20 % collapsed) rendered from this script with the same camera and origin:
- russia: a single corrugated-steel barrel vault (arch hut), one wide sectional door in a steel end wall.
- china: two corrugated-steel barrel vaults side by side with a valley gutter, one door each.
- usa: a rectangular steel box shed clad in standing-seam panels, low-pitch seamed roof, one wide door.
- islamic: three gable-roofed bays side by side in sand stucco with seamed metal roofs, three doors.
- europe: a hardened reinforced-concrete arch shelter with formwork joints, a vertical headwall and a two-leaf
  sliding blast door on rails.
Team colour (TEAM[nation]): a band across the front above the door(s), a band along the visible (+u) side plinth and
the personnel-door canopy.

Plot: u 0..6 (along the front), v 0..4 (front at +v). Heights in art px. Own geometry only (kit primitives and
materials; the damage stages use the shared infrastructure in models/_damage.py).
"""
import math

import bmesh

import kit
from kit import _obj, box, cylinder, lathe, mat, rod, roof, zp, TEAM
from models._damage import ruined_render

W, D = 6, 4
G = 1.0  # apron top
V0, V1 = 0.3, 2.95  # shed runs from the back (v0) to the front wall (v1)
HEIGHT = {"russia": 36, "china": 30, "usa": 32, "islamic": 30, "europe": 34}


def mats(f):
    base = dict(
        door=mat("#3c4146", 0.5, metal=0.6, grain=0.05),
        door_l=mat("#565c62", 0.45, metal=0.6, grain=0),
        frame=mat("#2a2d30", 0.4, metal=0.7, grain=0),
        yellow=mat("#d6a51c", 0.55, grain=0),
        black=mat("#1c1c1c", 0.6, grain=0),
        lamp=mat("#f0e2a8", 0.3, grain=0, emit="#ffe8a8"),
        glass=mat("#2c3a46", 0.08, grain=0, glass=True),
        apron=mat("#97938a", 0.92, grain=0.2, scale=12),
        joint=mat("#6c6964", 0.95, grain=0),
        paint=mat("#d8c25a", 0.6, grain=0.1),
        plinth=mat("#86827a", 0.9, grain=0.18, scale=20),
        steel=mat("#8d9296", 0.4, metal=0.7, grain=0.03),
        team=mat(TEAM[f], 0.45, metal=0.3, grain=0),
    )
    skin = {
        "russia": ("#6e7564", 0.5, 0.45),
        "china": ("#848b87", 0.45, 0.5),
        "usa": ("#9d978a", 0.55, 0.35),
        "islamic": ("#857a66", 0.5, 0.45),
        "europe": ("#8e8a81", 0.92, 0.0),
    }[f]
    base["skin"] = mat(skin[0], skin[1], metal=skin[2], grain=0.08 if f != "europe" else 0.3, scale=30)
    base["skin_d"] = mat("#4a4f47" if f != "europe" else "#6d6a63", 0.6, metal=skin[2] * 0.6, grain=0.05)
    base["stucco"] = mat("#c9b48c", 0.9, grain=0.12, scale=25)
    base["stucco_d"] = mat("#a8936c", 0.9, grain=0.1, scale=25)
    return base


# ---------------------------------------------------------------- shared parts


def apron(M):
    box(0, 0, W, D, 0, G, M["apron"])  # plot paving (sunk flush by kit.render)
    for k in range(1, 5):
        box(0.02, k * 0.8, W - 0.04, 0.008, G, 0.06, M["joint"])
    for k in range(1, 8):
        box(k * 0.75, 0.02, 0.008, D - 0.04, G, 0.06, M["joint"])


def lead_in(M, cu):
    """Painted yellow guide line from the door out across the apron, with a stop bar."""
    box(cu - 0.02, V1 + 0.05, 0.04, D - V1 - 0.2, G + 0.06, 0.06, M["paint"])
    box(cu - 0.25, D - 0.45, 0.5, 0.05, G + 0.06, 0.06, M["paint"])


def arc(cu, hw, zb, rise, n=24, power=1.0):
    """Points (u, z) of a vault profile over the span cu +- hw, from the left foot to the right foot."""
    return [(cu - hw * math.cos(math.pi * i / n), zb + rise * math.sin(math.pi * i / n) ** power) for i in range(n + 1)]


def vault(M, cu, hw, zb, rise, v0, v1, corrugated=True, power=1.0, thick=0.03, m=None):
    """Barrel-vault shell along v; corrugated steel = radial ripples every 0.02 tile along v (the ribs follow the arch)."""
    prof = arc(cu, hw, zb, rise, 28, power)
    step = 0.02 if corrugated else 0.25
    nv = max(2, round((v1 - v0) / step))
    bm = bmesh.new()
    rows = []
    for j in range(nv + 1):
        v = v0 + (v1 - v0) * j / nv
        amp = (0.006 if j % 2 else -0.006) if corrugated else 0.0
        row = []
        for u, z in prof:
            du, dz = (u - cu) / hw, (z - zb) / max(rise, 1e-6)
            r = math.hypot(du, dz) or 1.0
            row.append(bm.verts.new((u + amp * du / r, v, zp(z + amp * 40 * dz / r))))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for i in range(len(prof) - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("vault", bm, m or M["skin"])
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.modifiers.new("solid", "SOLIDIFY").thickness = thick
    return prof


def end_wall(M, prof, v, t, m):
    """Wall closing a vault end: the arch profile as a polygon in the u-z plane, t tiles thick (from v back)."""
    bm = bmesh.new()
    a = [bm.verts.new((u, v, zp(z))) for u, z in prof]
    b = [bm.verts.new((u, v - t, zp(z))) for u, z in prof]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("endwall", bm, m)


def front_plate(u0, u1, v, z, h, m, t=0.012):
    box(u0, v, u1 - u0, t, z, h, m)


def sectional_door(M, cu, dw, v, zb, dh):
    """Wide sectional door on a front wall at v: steel frame, panels with grooves and windows, hazard-striped jambs,
    a bump rail at the foot, lamps above."""
    u0, u1 = cu - dw / 2, cu + dw / 2
    front_plate(u0 - 0.06, u1 + 0.06, v, zb, dh + 1.6, M["frame"], 0.016)
    front_plate(u0, u1, v + 0.016, zb, dh, M["door"], 0.01)
    n = 7
    for k in range(1, n):
        front_plate(u0, u1, v + 0.026, zb + dh * k / n - 0.12, 0.24, M["door_l"], 0.006)
    nw = max(3, int(dw / 0.3))
    for k in range(nw):  # a row of small windows in the fifth panel
        s = u0 + (k + 0.5) * dw / nw
        front_plate(s - 0.06, s + 0.06, v + 0.026, zb + dh * 4.25 / n, dh * 0.5 / n, M["glass"], 0.006)
    for j in range(int(dh / 1.6)):  # hazard stripes on both jambs
        c = M["yellow"] if j % 2 == 0 else M["black"]
        for s in (u0 - 0.06, u1):
            front_plate(s, s + 0.06, v + 0.018, zb + j * 1.6, 1.6, c, 0.008)
    front_plate(u0 - 0.06, u1 + 0.06, v + 0.016, zb + dh, 1.2, M["frame"], 0.04)  # roller / track header
    for s in (u0 + 0.15, u1 - 0.15):
        box(s - 0.05, v + 0.02, 0.1, 0.05, zb + dh + 2.2, 0.8, M["lamp"])
        box(s - 0.06, v + 0.02, 0.12, 0.06, zb + dh + 3.0, 0.3, M["frame"])
    for s in (u0 - 0.12, u1 + 0.06):  # bollards
        cylinder(s + 0.03, v + 0.12, 0.025, zb, 3.2, M["yellow"], 10)
        cylinder(s + 0.03, v + 0.12, 0.026, zb + 1.4, 0.6, M["black"], 10)


def side_door(M, u, v, zb):
    """Personnel door on the +u side wall at u (face plane), with a team-colour canopy and lamp."""
    box(u, v - 0.1, 0.012, 0.2, zb, 7, M["frame"])
    box(u + 0.012, v - 0.08, 0.006, 0.16, zb, 6.4, M["door"])
    box(u, v - 0.14, 0.12, 0.28, zb + 7.6, 0.5, M["team"])
    box(u + 0.012, v - 0.03, 0.03, 0.06, zb + 8.4, 0.7, M["lamp"])
    for k in range(2):
        box(u + 0.012 + k * 0.05, v - 0.12, 0.05, 0.24, G, 0.5 - k * 0.2, M["plinth"])


def vent(M, cu, cv, z):
    cylinder(cu, cv, 0.05, z, 2.4, M["steel"], 14)
    lathe(cu, cv, z + 2.4, [(0.08, 0), (0.09, 0.8), (0.06, 1.8), (0.0, 2.4)], M["steel"], 14, cap_bottom=True)
    for k in range(10):  # turbine vanes
        a = 2 * math.pi * k / 10
        rod((cu + 0.085 * math.cos(a), cv + 0.085 * math.sin(a), zp(z + 2.5)), (cu + 0.07 * math.cos(a + 0.6), cv + 0.07 * math.sin(a + 0.6), zp(z + 4.0)), 0.004, M["frame"], 4)


def arch_vents(M, cu, hw, zb, rise, us, vs, power=1.0):
    for u in us:
        t = math.acos(max(-1, min(1, (cu - u) / hw)))
        z = zb + rise * math.sin(t) ** power
        for v in vs:
            vent(M, u, v, z - 0.6)


# ---------------------------------------------------------------- designs


def russia(M):
    cu, hw, zb, rise = 3.0, 2.75, G + 2.4, 30.0
    box(cu - hw - 0.05, V0 - 0.05, 2 * hw + 0.1, V1 - V0 + 0.1, G, 2.4, M["plinth"])
    box(cu + hw + 0.05, V0 - 0.05, 0.012, V1 - V0 + 0.1, G + 1.0, 0.8, M["team"])  # team line along the visible side
    prof = vault(M, cu, hw, zb, rise, V0, V1)
    for v in (V0 + 0.02, V1):  # stiffener arches at both ends, rivet seams every bay
        pts = arc(cu, hw + 0.012, zb, rise + 0.3, 24)
        for a, b in zip(pts, pts[1:]):
            rod((a[0], v, zp(a[1])), (b[0], v, zp(b[1])), 0.012, M["skin_d"], 6)
    for k in range(1, 5):
        v = V0 + (V1 - V0) * k / 5
        pts = arc(cu, hw + 0.01, zb, rise + 0.25, 24)
        for a, b in zip(pts, pts[1:]):
            rod((a[0], v, zp(a[1])), (b[0], v, zp(b[1])), 0.005, M["skin_d"], 4)
    end_wall(M, prof, V1, 0.04, M["skin_d"])
    end_wall(M, prof, V0 + 0.04, 0.04, M["skin_d"])
    for k in range(1, 18):  # vertical cladding ribs on the front end wall
        u = cu - hw + 2 * hw * k / 18
        t = math.acos((cu - u) / hw)
        rod((u, V1 + 0.006, zp(zb)), (u, V1 + 0.006, zp(zb + rise * math.sin(t) - 0.5)), 0.006, M["skin"], 4)
    sectional_door(M, cu, 3.4, V1, G, 20)
    front_plate(cu - 1.8, cu + 1.8, V1 + 0.02, G + 23.0, 1.4, M["team"], 0.014)  # team band above the door
    side_door(M, cu + hw + 0.04, 1.6, G)
    arch_vents(M, cu, hw, zb, rise, [cu - 1.2, cu + 1.2], [1.6])
    lead_in(M, cu)


def china(M):
    zb, rise, hw = G + 2.2, 24.0, 1.36
    box(0.2, V0 - 0.05, 5.6, V1 - V0 + 0.1, G, 2.2, M["plinth"])
    box(5.8, V0 - 0.05, 0.012, V1 - V0 + 0.1, G + 0.9, 0.8, M["team"])
    for cu in (1.58, 4.42):
        prof = vault(M, cu, hw, zb, rise, V0, V1)
        end_wall(M, prof, V1, 0.04, M["skin_d"])
        end_wall(M, prof, V0 + 0.04, 0.04, M["skin_d"])
        for v in (V0 + 0.02, V1):
            pts = arc(cu, hw + 0.012, zb, rise + 0.3, 20)
            for a, b in zip(pts, pts[1:]):
                rod((a[0], v, zp(a[1])), (b[0], v, zp(b[1])), 0.011, M["skin_d"], 6)
        for k in range(1, 5):
            v = V0 + (V1 - V0) * k / 5
            pts = arc(cu, hw + 0.01, zb, rise + 0.25, 20)
            for a, b in zip(pts, pts[1:]):
                rod((a[0], v, zp(a[1])), (b[0], v, zp(b[1])), 0.005, M["skin_d"], 4)
        sectional_door(M, cu, 2.0, V1, G, 16)
        front_plate(cu - 1.08, cu + 1.08, V1 + 0.02, G + 18.6, 1.2, M["team"], 0.014)
        arch_vents(M, cu, hw, zb, rise, [cu], [1.6])
        lead_in(M, cu)
    box(2.92, V0, 0.16, V1 - V0, zb - 0.5, 1.2, M["frame"])  # valley gutter between the vaults
    for v in (V0 + 0.2, V1 - 0.2):
        rod((3.0, v, zp(zb)), (3.0, v, zp(G)), 0.012, M["frame"], 6)  # downpipes
    side_door(M, 5.8, 1.6, G)


def usa(M):
    u0, u1, wh = 0.3, 5.7, 22.0
    box(u0 - 0.03, V0 - 0.03, u1 - u0 + 0.06, V1 - V0 + 0.06, G, 2.0, M["plinth"])
    box(u0, V0, u1 - u0, V1 - V0, G + 2.0, wh, M["skin"])
    for k in range(int((u1 - u0) / 0.06)):  # standing-seam cladding, front
        box(u0 + 0.03 + k * 0.06, V1, 0.012, 0.01, G + 2.0, wh, M["skin_d"])
    for k in range(int((V1 - V0) / 0.06)):  # and the visible side
        box(u1, V0 + 0.03 + k * 0.06, 0.01, 0.012, G + 2.0, wh, M["skin_d"])
    for k in range(1, 5):  # clerestory strip windows on the side
        v = V0 + (V1 - V0) * k / 5
        box(u1 + 0.012, v - 0.14, 0.006, 0.28, G + wh - 3.4, 2.2, M["glass"])
        box(u1 + 0.01, v - 0.16, 0.01, 0.32, G + wh - 3.8, 0.4, M["frame"])
    zt = G + 2.0 + wh
    box(u0 - 0.03, V1 + 0.01, u1 - u0 + 0.06, 0.014, zt - 2.2, 1.4, M["team"])  # team band under the eave, front
    box(u1 + 0.01, V0 - 0.03, 0.014, V1 - V0 + 0.06, zt - 2.2, 1.4, M["team"])  # and side
    roof(u0, V0, u1 - u0, V1 - V0, zt, 4.5, M["skin"], kind="gable", ridge="v", overhang=0.06)
    cu = (u0 + u1) / 2
    for k in range(int((V1 - V0 + 0.12) / 0.05)):  # roof seams down both slopes
        v = V0 - 0.06 + k * 0.05
        for e in (u0 - 0.06, u1 + 0.06):
            rod((e, v, zp(zt + 0.2)), (cu, v, zp(zt + 4.7)), 0.0045, M["skin_d"], 4)
    box(cu - 0.02, V0 - 0.06, 0.04, V1 - V0 + 0.12, zt + 4.3, 0.6, M["skin_d"])  # ridge cap
    for e in (u0 - 0.08, u1 + 0.04):
        box(e, V0 - 0.06, 0.04, V1 - V0 + 0.12, zt - 0.6, 0.7, M["frame"])  # gutters
    for v in (V0 + 0.1, V1 - 0.1):
        rod((u1 + 0.05, v, zp(zt)), (u1 + 0.05, v, zp(G)), 0.012, M["frame"], 6)
    for u in (1.3, 3.0, 4.7):
        vent(M, u, 1.62, zt + 3.9)
    sectional_door(M, cu, 3.8, V1, G, 18)
    side_door(M, u1 + 0.01, 1.6, G)
    lead_in(M, cu)


def islamic(M):
    bw, zb, wh, rise = 1.8, G, 15.0, 11.0
    for i in range(3):
        u0 = 0.3 + i * bw
        cu = u0 + bw / 2
        box(u0, V0, bw, V1 - V0, zb, wh, M["stucco"])
        box(u0 - 0.01, V0 - 0.01, bw + 0.02, V1 - V0 + 0.02, zb, 1.6, M["stucco_d"])  # plinth
        roof(u0, V0, bw, V1 - V0, zb + wh, rise, M["skin"], kind="gable", ridge="v", overhang=0.05)
        for k in range(int((V1 - V0 + 0.1) / 0.05)):
            v = V0 - 0.05 + k * 0.05
            for e in (u0 - 0.05, u0 + bw + 0.05):
                rod((e, v, zp(zb + wh + 0.2)), (cu, v, zp(zb + wh + rise + 0.2)), 0.0045, M["skin_d"], 4)
        box(cu - 0.02, V0 - 0.05, 0.04, V1 - V0 + 0.1, zb + wh + rise - 0.3, 0.6, M["skin_d"])
        # Front gable: stucco triangle with a round vent, a moulded rim.
        bm = bmesh.new()
        tri = [(u0, zb + wh), (u0 + bw, zb + wh), (cu, zb + wh + rise)]
        a = [bm.verts.new((u, V1, zp(z))) for u, z in tri]
        b = [bm.verts.new((u, V1 - 0.04, zp(z))) for u, z in tri]
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        for j in range(3):
            k = (j + 1) % 3
            bm.faces.new((a[j], a[k], b[k], b[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _obj("gable", bm, M["stucco"])
        rod((cu, V1, zp(zb + wh + rise * 0.42)), (cu, V1 + 0.012, zp(zb + wh + rise * 0.42)), 0.09, M["frame"], 16)
        for k in range(6):
            a_ = 2 * math.pi * k / 6
            rod((cu + 0.07 * math.cos(a_), V1 + 0.014, zp(zb + wh + rise * 0.42 + 2.2 * math.sin(a_))), (cu, V1 + 0.014, zp(zb + wh + rise * 0.42)), 0.004, M["steel"], 4)
        front_plate(u0 + 0.04, u0 + bw - 0.04, V1 + 0.01, zb + wh - 1.8, 1.2, M["team"], 0.014)  # team band, each bay
        # Door with a pointed-arch stucco surround.
        dw, dh = 1.25, 11.5
        front_plate(cu - dw / 2 - 0.07, cu + dw / 2 + 0.07, V1, zb, dh + 1.6, M["stucco_d"], 0.012)
        sectional_door(M, cu, dw, V1, zb, dh)
        lead_in(M, cu)
    for i in range(1, 3):  # valley gutters between the bays
        u = 0.3 + i * bw
        box(u - 0.06, V0, 0.12, V1 - V0, zb + wh - 0.4, 0.9, M["frame"])
        rod((u, V1 + 0.03, zp(zb + wh)), (u, V1 + 0.03, zp(G)), 0.012, M["frame"], 6)
    u1 = 0.3 + 3 * bw
    for k in range(1, 4):  # small barred windows on the visible side wall
        v = V0 + (V1 - V0) * k / 4
        box(u1, v - 0.1, 0.008, 0.2, zb + 8, 3, M["glass"])
        box(u1, v - 0.12, 0.016, 0.24, zb + 7.6, 0.4, M["stucco_d"])
        for j in range(3):
            box(u1 + 0.01, v - 0.06 + j * 0.06, 0.006, 0.008, zb + 8, 3, M["frame"])
    box(u1 + 0.005, V0, 0.012, V1 - V0, zb + wh - 1.8, 1.2, M["team"])  # team band, side
    side_door(M, u1, 1.0, G)


def europe(M):
    cu, hw, zb, rise = 3.0, 2.75, G, 26.0
    box(cu - hw - 0.12, V0 - 0.05, 2 * hw + 0.24, V1 - V0 - 0.15, G, 3.0, M["plinth"])
    vault(M, cu, hw, zb, rise, V0, V1 - 0.18, corrugated=False, power=0.75, thick=0.12)
    # Formwork joints: rings across the vault and lines along it.
    for k in range(1, 5):
        v = V0 + (V1 - 0.18 - V0) * k / 5
        pts = arc(cu, hw + 0.006, zb, rise + 0.2, 24, 0.75)
        for a, b in zip(pts, pts[1:]):
            rod((a[0], v, zp(a[1])), (b[0], v, zp(b[1])), 0.004, M["skin_d"], 4)
    for t in (0.18, 0.34, 0.5, 0.66, 0.82):
        a_ = math.pi * t
        u = cu - (hw + 0.006) * math.cos(a_)
        z = zb + (rise + 0.2) * math.sin(a_) ** 0.75
        rod((u, V0, zp(z)), (u, V1 - 0.18, zp(z)), 0.004, M["skin_d"], 4)
    # Vertical reinforced-concrete headwall with a parapet, the sliding blast door on rails.
    hw_top = rise + 4.0
    box(0.15, V1 - 0.2, 5.7, 0.22, G, hw_top, M["skin"])
    for k in range(1, int(hw_top / 3.2)):
        box(0.15, V1 + 0.02, 5.7, 0.004, G + k * 3.2, 0.2, M["skin_d"])  # lift joints
    for k in range(1, 9):
        box(0.15 + k * 5.7 / 9, V1 + 0.02, 0.006, 0.004, G, hw_top, M["skin_d"])
    box(0.12, V1 - 0.23, 5.76, 0.28, G + hw_top, 1.2, M["skin_d"])  # coping
    box(5.85, V1 - 0.2, 0.004, 0.22, G + hw_top - 3.2, 1.4, M["team"])
    front_plate(0.15, 5.85, V1 + 0.02, G + hw_top - 3.2, 1.4, M["team"], 0.014)  # team band on the headwall
    dw, dh = 4.0, 20.0
    box(cu - dw / 2 - 0.25, V1 + 0.02, dw + 0.5, 0.05, G + dh, 1.0, M["frame"])  # top rail
    box(cu - dw / 2 - 0.25, V1 + 0.02, dw + 0.5, 0.05, G, 0.5, M["frame"])  # bottom rail
    for s in (-1, 1):  # two door leaves, ribbed
        a0 = cu if s > 0 else cu - dw / 2
        front_plate(a0, a0 + dw / 2, V1 + 0.03, G + 0.5, dh - 0.5, M["door"], 0.03)
        for k in range(1, 6):
            front_plate(a0 + 0.04, a0 + dw / 2 - 0.04, V1 + 0.06, G + 0.5 + k * (dh - 0.5) / 6 - 0.2, 0.4, M["door_l"], 0.008)
        for k in range(3):
            front_plate(a0 + 0.1 + k * (dw / 2 - 0.2) / 2 - 0.015, a0 + 0.1 + k * (dw / 2 - 0.2) / 2 + 0.015, V1 + 0.06, G + 0.5, dh - 0.5, M["door_l"], 0.01)
    for j in range(int(dh / 1.6)):
        c = M["yellow"] if j % 2 == 0 else M["black"]
        for s in (cu - dw / 2 - 0.08, cu + dw / 2 + 0.02):
            front_plate(s, s + 0.06, V1 + 0.02, G + j * 1.6, 1.6, c, 0.01)
    for s in (cu - 1.7, cu + 1.7):
        box(s - 0.05, V1 + 0.03, 0.1, 0.05, G + dh + 2.0, 0.8, M["lamp"])
    for v in (1.0, 2.0):  # exhaust stacks on the crown
        cylinder(cu, v, 0.07, G + rise - 0.5, 4.0, M["skin_d"], 14)
        cylinder(cu, v, 0.085, G + rise + 3.5, 0.6, M["frame"], 14)
    side_door(M, cu + hw + 0.12, 1.4, G)
    box(cu + hw + 0.12, V0 - 0.05, 0.012, V1 - V0 - 0.15, G + 1.6, 0.8, M["team"])
    lead_in(M, cu)


DESIGNS = {"russia": russia, "china": china, "usa": usa, "islamic": islamic, "europe": europe}


def garage(f, damage=0):
    M = mats(f)
    apron(M)
    DESIGNS[f](M)
    ruined_render(f"garage-{f}", (W, D), HEIGHT[f] + 6, damage, seed=53, cut_u=3.0)


MODELS = {f"garage-{f}" + (f"-d{d}" if d else ""): (lambda f=f, d=d: garage(f, d)) for f in DESIGNS for d in (0, 1, 2, 3)}
