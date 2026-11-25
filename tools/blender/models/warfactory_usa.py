"""Paxamerica War Factory (5 x 4): the design kept as it was (steel-clad hall with steel pilasters, a team band, three
hazard-striped roller-door bays, sawtooth north-light roof, gantry cranes at both ends, two stacks and a tower crane),
with the ART_GUIDE detail pass:
- cladding: profiled-sheet ribs on both visible faces, a dark plinth with a drip flashing, pilaster caps;
- side windows set back behind a full frame with a mullion cross, sill and lintel;
- roof: membrane with joint lines on the flat deck, a coping round the parapet; sawtooth sheets with standing seams,
  ridge caps and gutters; HVAC units with fan grilles and louvres, mushroom vents, a roof hatch;
- doors: roller boxes, guide rails, lamps, bollards; a personnel door with a canopy;
- stacks with steel hoops and caps.
Team colour (TEAM["usa"]): the wall band, the gantry beams, the stack bands, and now the roller-box fascias and the
personnel-door canopy.

Plot: u 0..5, v 0..4 (front at +v). Heights in art px. Own geometry only (kit primitives and materials).
"""
import bmesh

from kit import _obj, box, cylinder, lathe, mat, render, rod, zp, TEAM

TEAMC = TEAM["usa"]


def K():
    return dict(
        wall=mat("#a3abb3", 0.55, metal=0.4, grain=0.12, scale=45),
        rib=mat("#949ca4", 0.5, metal=0.45, grain=0.05),
        dark=mat("#6f7880", 0.8),
        pil=mat("#80888f", 0.5, metal=0.5),
        steel=mat("#7c8288", 0.45, metal=0.7, grain=0.05),
        steel_d=mat("#4a5056", 0.45, metal=0.7, grain=0.05),
        steel_l=mat("#9aa0a6", 0.45, metal=0.7, grain=0.05),
        glass=mat("#2e4256", 0.1, grain=0, glass=True),
        frame=mat("#cfcac0", 0.7, grain=0.05),
        stone=mat("#c4c2bc", 0.85, grain=0.08),
        deck=mat("#55595c", 0.9, grain=0.12, scale=6),
        joint=mat("#6a6e72", 0.9, grain=0),
        sheet=mat("#7d858c", 0.55, metal=0.5, grain=0.05),
        seam=mat("#8f979e", 0.45, metal=0.55, grain=0),
        door=mat("#2a2e33", 0.6, metal=0.4, grain=0.04),
        slat=mat("#454a50", 0.5, metal=0.5, grain=0),
        lamp=mat("#e8d690", 0.4, grain=0, emit="#ffd890"),
        ac=mat("#b8bcbe", 0.6, metal=0.3),
        grille=mat("#3a3c3e", 0.6, grain=0),
        black=mat("#2a2a2a", 0.8, grain=0),
        hazard_y=mat("#e0b020", 0.6, grain=0),
        hazard_k=mat("#222222", 0.6, grain=0),
        crane=mat("#e0b23a", 0.55, metal=0.3, grain=0.05),
        plinth=mat("#6f7880", 0.95, grain=0.15, scale=8),
        team=mat(TEAMC, 0.45, metal=0.3, grain=0.03),
    )


# ---------------------------------------------------------------- parts


def plate(face, u, v, w, d, s0, s1, z, h, m, t):
    if face == "left":
        box(u + s0, v + d, s1 - s0, t, z, h, m)
    else:
        box(u + w, v + d - s1, t, s1 - s0, z, h, m)


def framed_windows(M, face, u, v, w, d, z, h, cols, rows, fill=0.5):
    L = d if face == "right" else w
    fw = 0.025
    for c in range(cols):
        for r in range(rows):
            s0 = (c + 0.5 - fill / 2) / cols * L
            s1 = (c + 0.5 + fill / 2) / cols * L
            cellh = h / rows
            z0 = z + r * cellh + cellh * 0.22
            zh = cellh * 0.6
            plate(face, u, v, w, d, s0, s1, z0, zh, M["glass"], 0.008)
            plate(face, u, v, w, d, s0 - fw, s0, z0, zh, M["frame"], 0.024)
            plate(face, u, v, w, d, s1, s1 + fw, z0, zh, M["frame"], 0.024)
            plate(face, u, v, w, d, s0 - fw, s1 + fw, z0 + zh, 0.6, M["frame"], 0.024)
            plate(face, u, v, w, d, (s0 + s1) / 2 - 0.008, (s0 + s1) / 2 + 0.008, z0, zh, M["frame"], 0.018)
            plate(face, u, v, w, d, s0, s1, z0 + zh * 0.55, 0.35, M["frame"], 0.018)
            plate(face, u, v, w, d, s0 - fw * 1.6, s1 + fw * 1.6, z0 - 0.8, 0.8, M["stone"], 0.034)
            plate(face, u, v, w, d, s0 - fw * 1.6, s1 + fw * 1.6, z0 + zh + 0.6, 0.6, M["steel_d"], 0.03)


def cornice(u, v, w, d, z, m, steps):
    zz = z
    for grow, hh in steps:
        box(u - grow, v - grow, w + 2 * grow, d + 2 * grow, zz, hh, m)
        zz += hh
    return zz


def roller_doors(M, u, v, w, z, h, count, frame, width=0.6):
    for i in range(count):
        cu = u + (i + 0.5) * w / count
        hw = width * w / count / 2
        box(cu - hw - 0.06, v, hw * 2 + 0.12, 0.03, z, h + 1.5, frame)
        box(cu - hw, v + 0.02, hw * 2, 0.02, z, h, M["door"])
        for k in range(1, 14):
            box(cu - hw, v + 0.035, hw * 2, 0.008, z + h * k / 14, 0.3, M["slat"])
        for k in range(0, int(h), 2):  # hazard stripes on the jambs
            c = M["hazard_y"] if (k // 2) % 2 == 0 else M["hazard_k"]
            for x in (cu - hw - 0.06, cu + hw):
                box(x, v + 0.03, 0.06, 0.01, z + k, 2, c)
        box(cu - hw - 0.02, v + 0.03, hw * 2 + 0.04, 0.05, z + h, 1.3, M["steel_d"])  # roller box
        box(cu - hw - 0.02, v + 0.08, hw * 2 + 0.04, 0.006, z + h + 0.3, 0.7, M["team"])  # team fascia
        box(cu - 0.06, v + 0.03, 0.12, 0.05, z + h + 2, 0.8, M["lamp"])
        for x in (cu - hw - 0.12, cu + hw + 0.09):  # bollards
            cylinder(x + 0.015, v + 0.12, 0.018, z, 3, M["hazard_y"], 10)
            cylinder(x + 0.015, v + 0.12, 0.019, z + 1.2, 0.6, M["black"], 10)


def roof_vent(M, u, v, z):
    cylinder(u, v, 0.06, z, 3, M["steel_l"], 12)
    lathe(u, v, z + 3, [(0.09, 0), (0.0, 1.5)], M["steel"], segs=12, cap_bottom=True)


def ac_unit(M, u, v, z):
    box(u, v, 0.28, 0.22, z, 3, M["ac"])
    cylinder(u + 0.14, v + 0.11, 0.07, z + 3, 0.3, M["grille"], 16)
    cylinder(u + 0.14, v + 0.11, 0.02, z + 3.3, 0.2, M["ac"], 8)
    for k in range(5):  # louvres on the visible sides
        box(u + 0.03 + k * 0.05, v + 0.22, 0.03, 0.004, z + 0.5, 2.0, M["grille"])
        box(u + 0.28, v + 0.02 + k * 0.04, 0.004, 0.025, z + 0.5, 2.0, M["grille"])


def downpipe(M, u, v, z0, z1):
    rod((u, v, zp(z0)), (u, v, zp(z1)), 0.012, M["steel_d"], 8)
    for zz in range(int(z0) + 3, int(z1), 5):
        box(u - 0.02, v - 0.02, 0.04, 0.04, zz, 0.4, M["steel_d"])


def slope(u0, u1, v0, v1, z0, z1, m):
    bm = bmesh.new()
    a = bm.verts.new((u0, v0, zp(z0)))
    b = bm.verts.new((u1, v0, zp(z0)))
    c = bm.verts.new((u1, v1, zp(z1)))
    d = bm.verts.new((u0, v1, zp(z1)))
    e = bm.verts.new((u0, v1, zp(z0)))
    f = bm.verts.new((u1, v1, zp(z0)))
    bm.faces.new((a, b, c, d))
    bm.faces.new((a, d, e))
    bm.faces.new((b, f, c))
    bm.faces.new((e, d, c, f))
    bm.faces.new((a, e, f, b))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("slope", bm, m)


def tower_crane(M, u, v, z, h, reach, direction):
    c = M["crane"]
    box(u - 0.2, v - 0.2, 0.4, 0.4, z, 2, mat("#8a8a84", 0.9))
    m = 0.1
    top = z + h
    corners = [(u - m, v - m), (u + m, v - m), (u + m, v + m), (u - m, v + m)]
    for cu, cv in corners:
        rod((cu, cv, zp(z + 2)), (cu, cv, zp(top)), 0.012, c, 4)
    bays = max(4, round(h / 5))
    for k in range(bays):
        z0 = z + 2 + (top - z - 2) * k / bays
        z1 = z + 2 + (top - z - 2) * (k + 1) / bays
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            rod((a[0], a[1], zp(z0)), (b[0], b[1], zp(z1)), 0.006, c, 4)
            rod((a[0], a[1], zp(z1)), (b[0], b[1], zp(z1)), 0.006, c, 4)
    box(u - 0.15, v - 0.15, 0.3, 0.3, top, 3, c)
    box(u - 0.05 + direction * 0.12, v + 0.1, 0.22, 0.2, top - 4, 5, mat("#d8dce0", 0.5))
    box(u - 0.04 + direction * 0.12, v + 0.3, 0.2, 0.01, top - 2.5, 3, M["glass"])
    jz = top + 3
    tip = u + direction * reach
    back = u - direction * reach * 0.35
    for vv in (v - 0.05, v + 0.05):
        rod((u, vv, zp(jz)), (tip, vv, zp(jz)), 0.01, c, 4)
        rod((u, vv, zp(jz)), (back, vv, zp(jz)), 0.01, c, 4)
    rod((u, v, zp(jz + 3.5)), (tip, v, zp(jz + 3.5)), 0.01, c, 4)
    n = max(3, round(reach * 5))
    for k in range(n):
        a = u + direction * reach * k / n
        b = u + direction * reach * (k + 1) / n
        for vv in (v - 0.05, v + 0.05):
            rod((a, vv, zp(jz)), (b, v, zp(jz + 3.5)), 0.005, c, 4)
    rod((u, v, zp(jz)), (u, v, zp(jz + 10)), 0.015, c, 4)
    rod((u, v, zp(jz + 10)), (tip, v, zp(jz + 3.5)), 0.005, M["black"], 4)
    rod((u, v, zp(jz + 10)), (back, v, zp(jz)), 0.005, M["black"], 4)
    box(back - (0 if direction > 0 else 0.3), v - 0.12, 0.3, 0.24, jz - 3, 4, mat("#9a9890", 0.9))
    tu = u + direction * reach * 0.62
    box(tu - 0.07, v - 0.07, 0.14, 0.14, jz - 1.5, 1.4, mat("#3a3a3a", 0.6))
    hz = max(z + 6, jz - 18)
    rod((tu, v, zp(jz - 1.5)), (tu, v, zp(hz + 2)), 0.004, M["black"], 4)
    box(tu - 0.06, v - 0.06, 0.12, 0.12, hz, 2.2, mat("#d84a2a", 0.6, grain=0))


# ---------------------------------------------------------------- the model


def warfactory_usa():
    M = K()
    U, V, W, D = 0.05, 0.05, 4.9, 3.9
    box(0, 0, 5, 4, 0, 2, M["plinth"])
    for k in range(1, 10):  # apron joints in front
        box(k * 0.5, 3.96, 0.006, 0.04, 2, 0.06, M["joint"])
    box(U, V, W, D, 2, 20, M["wall"])
    box(U - 0.01, V - 0.01, W + 0.02, D + 0.02, 2, 2.4, M["dark"])
    box(U - 0.016, V - 0.016, W + 0.032, D + 0.032, 4.2, 0.3, M["steel_d"])  # drip flashing
    # Profiled cladding ribs on both visible faces.
    for k in range(int(W / 0.06)):
        box(U + 0.03 + k * 0.06, V + D, 0.012, 0.006, 4.5, 13.4, M["rib"])
    for k in range(int(D / 0.06)):
        box(U + W, V + 0.03 + k * 0.06, 0.006, 0.012, 4.5, 13.4, M["rib"])
    # Steel pilasters with caps.
    for i in range(9):
        box(U + i * W / 8 - 0.03, V + D, 0.06, 0.03, 2, 20, M["pil"])
        box(U + i * W / 8 - 0.04, V + D, 0.08, 0.04, 17.2, 0.8, M["steel_d"])
        box(U + W, V + i * D / 8 - 0.03, 0.03, 0.06, 2, 20, M["pil"])
        box(U + W, V + i * D / 8 - 0.04, 0.04, 0.08, 17.2, 0.8, M["steel_d"])
    framed_windows(M, "right", U, V, W, D, 4, 14, 8, 1)
    box(U - 0.01, V - 0.01, W + 0.02, D + 0.02, 18, 2, M["team"])
    roller_doors(M, U, V + D, W, 2, 13, 3, M["steel_d"])
    # Personnel door on the side with a team canopy.
    box(U + W, 3.55, 0.02, 0.16, 2, 6.5, M["door"])
    box(U + W, 3.53, 0.03, 0.2, 8.5, 0.5, M["frame"])
    box(U + W, 3.5, 0.12, 0.26, 9.2, 0.6, M["team"])
    box(U + W + 0.03, 3.58, 0.03, 0.1, 10.2, 0.6, M["lamp"])
    # Roof: parapet with coping, membrane with joints.
    cornice(U, V, W, D, 20, mat("#8b939a", 0.6, metal=0.3, grain=0.06), ((0.0, 1.0), (0.025, 0.8), (0.04, 0.7)))
    for bx in ((U - 0.045, V - 0.045, W + 0.09, 0.03), (U - 0.045, V + D + 0.015, W + 0.09, 0.03), (U - 0.045, V - 0.015, 0.03, D + 0.03), (U + W + 0.015, V - 0.015, 0.03, D + 0.03)):
        box(*bx, 22.5, 0.5, M["steel_l"])  # coping
    box(U + 0.08, V + 0.08, W - 0.16, D - 0.16, 21, 1.6, M["deck"])
    for k in range(1, 12):
        box(U + 0.08 + k * (W - 0.16) / 12 - 0.004, V + 0.08, 0.008, D - 0.16, 22.6, 0.06, M["joint"])
    for k in range(1, 9):
        box(U + 0.08, V + 0.08 + k * (D - 0.16) / 9 - 0.004, W - 0.16, 0.008, 22.6, 0.06, M["joint"])
    # Sawtooth north-lights: glazing with mullions, seamed sheets, ridge caps, gutters.
    for k in range(3):
        v0 = 0.45 + k * 1.05
        box(0.6, v0 + 0.68, 3.8, 0.02, 22.5, 7, M["glass"])
        for j in range(9):
            box(0.6 + j * 3.8 / 8 - 0.015, v0 + 0.7, 0.03, 0.015, 22.5, 7, M["steel_d"])
        box(0.6, v0 + 0.7, 3.8, 0.015, 26.0, 0.4, M["steel_d"])  # transom
        slope(0.6, 4.4, v0, v0 + 0.7, 22.5, 22.5 + 7, M["sheet"])
        for j in range(1, 48):  # standing seams
            u = 0.6 + j * 3.8 / 48
            rod((u, v0 + 0.01, zp(22.8)), (u, v0 + 0.69, zp(29.4)), 0.004, M["seam"], 4)
        box(0.58, v0 + 0.66, 3.84, 0.05, 29.4, 0.6, M["steel_d"])  # ridge cap
        box(0.58, v0 - 0.03, 3.84, 0.04, 22.6, 0.6, M["steel_d"])  # gutter
        for u in (0.58, 4.4):  # gable end flashing
            rod((u + 0.01, v0, zp(22.6)), (u + 0.01, v0 + 0.7, zp(29.6)), 0.008, M["steel_d"], 4)
    ac_unit(M, 0.3, 0.2, 22.6)
    for u, v in ((0.35, 1.5), (0.35, 2.6), (4.55, 1.5), (4.55, 2.6), (1.5, 0.2), (3.6, 0.2)):
        roof_vent(M, u, v, 22.6)
    box(4.5, 3.45, 0.16, 0.16, 22.6, 0.9, M["dark"])  # roof hatch
    box(4.515, 3.465, 0.13, 0.13, 23.5, 0.2, M["steel_d"])
    for u in (0.55, 4.45):
        downpipe(M, u, V + D + 0.03, 2, 22)
    for v in (0.6, 3.5):
        downpipe(M, U + W + 0.03, v, 2, 22)
    for k in range(3):
        box(U + W + 0.02, 1.05 + k * 0.9, 0.04, 0.5, 15.5, 1.6, mat("#e2e4e6", 0.5, grain=0))
    ac_unit(M, 1.9, 3.5, 22.6)
    ac_unit(M, 3.2, 3.5, 22.6)
    # Gantry cranes at both ends.
    for u in (0.25, 4.6):
        box(u, 0.3, 0.15, 0.15, 22, 12, M["steel"])
        box(u, 3.4, 0.15, 0.15, 22, 12, M["steel"])
        for vv in (0.3, 3.4):
            for zz in (26, 30):  # bracing
                box(u + 0.02, vv - 0.01, 0.11, 0.17, zz, 0.4, M["steel_d"])
        box(u, 0.3, 0.15, 3.25, 34, 1.5, M["team"])
        box(u + 0.03, 1.6, 0.09, 0.2, 31.5, 2.5, M["steel_d"])  # hoist trolley
        rod((u + 0.075, 1.7, zp(31.5)), (u + 0.075, 1.7, zp(26)), 0.004, M["black"], 4)
    for cu, cv in ((0.95, 0.25), (4.05, 0.25)):
        cylinder(cu, cv, 0.11, 22, 18, M["steel_l"], 24)
        for zz in (25, 35):
            cylinder(cu, cv, 0.116, zz, 0.5, M["steel_d"], 24)
        cylinder(cu, cv, 0.12, 30, 1.6, M["team"], 24)
        cylinder(cu, cv, 0.12, 40, 1.5, M["black"], 24)
        for k in range(8):  # ladder rungs
            rod((cu - 0.03, cv + 0.12, zp(23 + k * 2)), (cu + 0.03, cv + 0.12, zp(23 + k * 2)), 0.003, M["steel_d"], 4)
    tower_crane(M, 2.6, 0.25, 22, 34, 1.8, -1)
    render("warfactory-usa", (5, 4), 90)


MODELS = {"warfactory-usa": warfactory_usa}

from models._wreck import with_damage  # noqa: E402

with_damage(MODELS, __name__, flags={"warfactory-usa": [(0.3, 3.7), (4.7, 3.7)]})
