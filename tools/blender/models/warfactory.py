"""War Factory (5 x 4) of every nation, after the vector designs in WarFactory.ts / WarFactoryNations.ts."""
import math

from kit import box, cylinder, dome, lathe, mat, prism, render, rod, roof, windows, zp, TEAM

GLASS = "#2e4256"
DOOR = "#2a2e33"


def m_glass():
    return mat(GLASS, 0.1, grain=0, glass=True)


def m_lit():
    return mat("#c9b98a", 0.3, grain=0, emit="#e8c880")


def m_steel(c="#7c8288"):
    return mat(c, 0.45, metal=0.7, grain=0.05)


def roller_doors(u, v, w, z, h, count, frame, hazard=False, width=0.6):
    """Roller doors on the +v face at v (face plane), door height h."""
    for i in range(count):
        cu = u + (i + 0.5) * w / count
        hw = width * w / count / 2
        box(cu - hw - 0.06, v, hw * 2 + 0.12, 0.03, z, h + 1.5, frame)
        box(cu - hw, v + 0.02, hw * 2, 0.02, z, h, mat(DOOR, 0.6, metal=0.4, grain=0.04))
        for k in range(1, 8):
            box(cu - hw, v + 0.035, hw * 2, 0.008, z + h * k / 8, 0.35, mat("#454a50", 0.5, metal=0.5, grain=0))
        if hazard:
            for k in range(0, int(h), 2):
                c = "#e0b020" if (k // 2) % 2 == 0 else "#222222"
                for x in (cu - hw - 0.06, cu + hw):
                    box(x, v + 0.03, 0.06, 0.01, z + k, 2, mat(c, 0.6, grain=0))
        # Lamp over the bay.
        box(cu - 0.06, v + 0.03, 0.12, 0.05, z + h + 2, 0.8, mat("#e8d690", 0.4, grain=0, emit="#ffd890"))


def framed_windows(face, u, v, w, d, z, h, cols, rows, glass=None, frame="#e2ddd2", fill=0.5, sill=True):
    """Window grid with a full surround, a sill and a mullion cross on a box face ("left" = +v, "right" = +u)."""
    glass = glass or m_glass()
    fm = mat(frame, 0.7, grain=0.05)
    L = d if face == "right" else w
    for c in range(cols):
        for r in range(rows):
            s0 = (c + 0.5 - fill / 2) / cols
            s1 = (c + 0.5 + fill / 2) / cols
            cellh = h / rows
            z0 = z + r * cellh + cellh * 0.22
            zh = cellh * 0.6
            t = 0.012
            def piece(a0, a1, zz, hh, m, depth):
                if face == "left":
                    box(u + a0 * L, v + d, (a1 - a0) * L, depth, zz, hh, m)
                else:
                    box(u + w, v + d - a1 * L, depth, (a1 - a0) * L, zz, hh, m)
            fw = 0.025 / L
            piece(s0, s1, z0, zh, glass, t)
            piece(s0 - fw, s0, z0, zh, fm, t * 2)
            piece(s1, s1 + fw, z0, zh, fm, t * 2)
            piece(s0 - fw, s1 + fw, z0 + zh, 0.6, fm, t * 2)
            piece((s0 + s1) / 2 - fw / 3, (s0 + s1) / 2 + fw / 3, z0, zh, fm, t * 1.6)
            piece(s0, s1, z0 + zh * 0.55, 0.35, fm, t * 1.6)
            if sill:
                piece(s0 - fw * 1.6, s1 + fw * 1.6, z0 - 0.8, 0.8, fm, t * 3)


def side_windows_right(u, v, w, d, z, h, cols, rows, fill=0.5, frame="#cfcac0"):
    framed_windows("right", u, v, w, d, z, h, cols, rows, fill=fill, frame=frame)


def side_windows_left(u, v, w, d, z, h, cols, rows, fill=0.5, frame="#cfcac0"):
    framed_windows("left", u, v, w, d, z, h, cols, rows, fill=fill, frame=frame)


def cornice(u, v, w, d, z, material, steps=((0.02, 0.8), (0.045, 0.7), (0.07, 0.9))):
    """Stepped cornice: boxes growing outward from z up."""
    zz = z
    for grow, hh in steps:
        box(u - grow, v - grow, w + 2 * grow, d + 2 * grow, zz, hh, material)
        zz += hh
    return zz


def mansard(u, v, w, d, z, h1, inset1, h2, material, cap=None):
    """Two-pitch mansard: steep lower slope (h1, inset1) then a shallow hip top (h2)."""
    import bmesh
    import kit

    bm = bmesh.new()
    def ring(i, zz):
        return [bm.verts.new(p) for p in ((u + i, v + i, zp(zz)), (u + w - i, v + i, zp(zz)), (u + w - i, v + d - i, zp(zz)), (u + i, v + d - i, zp(zz)))]
    r0 = ring(0, z)
    r1 = ring(inset1, z + h1)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(list(reversed(r0)))
    bm.faces.new(r1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    kit._obj("mansard", bm, material)
    roof(u + inset1, v + inset1, w - 2 * inset1, d - 2 * inset1, z + h1, h2, cap or material, kind="hip", ridge="u", overhang=0.0)
    # Lead roll at the break of slope.
    box(u + inset1 - 0.015, v + inset1 - 0.015, w - 2 * inset1 + 0.03, d - 2 * inset1 + 0.03, z + h1 - 0.4, 0.5, mat("#6a737e", 0.5, metal=0.5, grain=0))


def chimney_stack(u, v, z, h, material, cap):
    box(u, v, 0.14, 0.1, z, h, material)
    box(u - 0.015, v - 0.015, 0.17, 0.13, z + h, 0.8, cap)
    for k in range(2):
        cylinder(u + 0.04 + k * 0.06, v + 0.05, 0.018, z + h + 0.8, 1.5, mat("#9a5a40", 0.8, grain=0.1), 8)


def downpipe(u, v, z0, z1):
    m = mat("#5a5f64", 0.5, metal=0.6, grain=0)
    rod((u, v, zp(z0)), (u, v, zp(z1)), 0.012, m, 8)


def roof_vent(u, v, z):
    cylinder(u, v, 0.06, z, 3, m_steel("#9aa0a6"), 12)
    lathe(u, v, z + 3, [(0.09, 0), (0.0, 1.5)], m_steel("#80868c"), segs=12, cap_bottom=True)


def tower_crane(u, v, z, h, reach, direction, color="#e0b23a"):
    """Lattice tower crane: mast h art px, jib reaching `reach` tiles along u (direction +-1)."""
    c = mat(color, 0.55, metal=0.3, grain=0.05)
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
    box(u - 0.04 + direction * 0.12, v + 0.3, 0.2, 0.01, top - 2.5, 3, m_glass())
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
    rod((u, v, zp(jz + 10)), (tip, v, zp(jz + 3.5)), 0.005, m_steel("#555555"), 4)
    rod((u, v, zp(jz + 10)), (back, v, zp(jz)), 0.005, m_steel("#555555"), 4)
    box(back - (0 if direction > 0 else 0.3), v - 0.12, 0.3, 0.24, jz - 3, 4, mat("#9a9890", 0.9))
    tu = u + direction * reach * 0.62
    box(tu - 0.07, v - 0.07, 0.14, 0.14, jz - 1.5, 1.4, mat("#3a3a3a", 0.6))
    hz = max(z + 6, jz - 18)
    rod((tu, v, zp(jz - 1.5)), (tu, v, zp(hz + 2)), 0.004, mat("#222222", 0.5, grain=0), 4)
    box(tu - 0.06, v - 0.06, 0.12, 0.12, hz, 2.2, mat("#d84a2a", 0.6, grain=0))


def plinth(color, h=2):
    box(0, 0, 5, 4, 0, h, mat(color, 0.95, grain=0.15, scale=8))


def ac_unit(u, v, z):
    box(u, v, 0.28, 0.22, z, 3, mat("#b8bcbe", 0.6, metal=0.3))
    cylinder(u + 0.14, v + 0.11, 0.07, z + 3, 0.3, mat("#3a3c3e", 0.6, grain=0))


# ---------------------------------------------------------------- USA


def usa():
    team = TEAM["usa"]
    wall = mat("#a3abb3", 0.55, metal=0.4, grain=0.12, scale=45)
    dark = mat("#6f7880", 0.8)
    U, V, W, D = 0.05, 0.05, 4.9, 3.9
    plinth("#6f7880")
    box(U, V, W, D, 2, 20, wall)
    box(U - 0.01, V - 0.01, W + 0.02, D + 0.02, 2, 2.4, dark)
    # Steel pilasters on both visible faces.
    for i in range(9):
        box(U + i * W / 8 - 0.03, V + D, 0.06, 0.03, 2, 20, mat("#80888f", 0.5, metal=0.5))
        box(U + W, V + i * D / 8 - 0.03, 0.03, 0.06, 2, 20, mat("#80888f", 0.5, metal=0.5))
    side_windows_right(U, V, W, D, 4, 14, 8, 1)
    box(U - 0.01, V - 0.01, W + 0.02, D + 0.02, 18, 2, mat(team, 0.45, metal=0.3, grain=0.03))
    roller_doors(U, V + D, W, 2, 13, 3, m_steel("#5a6066"), hazard=True)
    # Roof: parapet, sawtooth north-lights, star disc.
    cornice(U, V, W, D, 20, mat("#8b939a", 0.6, metal=0.3, grain=0.06), ((0.0, 1.0), (0.025, 0.8), (0.04, 0.7)))
    box(U + 0.08, V + 0.08, W - 0.16, D - 0.16, 21, 1.6, mat("#55595c", 0.9, grain=0.12, scale=6))
    for k in range(3):
        v0 = 0.45 + k * 1.05
        box(0.6, v0 + 0.68, 3.8, 0.02, 22.5, 7, m_glass())
        for j in range(9):
            box(0.6 + j * 3.8 / 8 - 0.015, v0 + 0.7, 0.03, 0.015, 22.5, 7, m_steel("#4a5056"))
    # Proper sloped roof sheets.
    for k in range(3):
        v0 = 0.45 + k * 1.05
        _slope(0.6, 4.4, v0, v0 + 0.7, 22.5, 22.5 + 7, mat("#7d858c", 0.55, metal=0.5, grain=0.05))
    ac_unit(0.3, 0.2, 22.5)
    for u, v in ((0.35, 1.5), (0.35, 2.6), (4.55, 1.5), (4.55, 2.6), (1.5, 0.2), (3.6, 0.2)):
        roof_vent(u, v, 22.5)
    for u in (0.55, 4.45):
        downpipe(u, V + D + 0.03, 2, 22)
    for v in (0.6, 3.5):
        downpipe(U + W + 0.03, v, 2, 22)
    for k in range(3):
        box(U + W + 0.02, 1.05 + k * 0.9, 0.04, 0.5, 15.5, 1.6, mat("#e2e4e6", 0.5, grain=0))
    ac_unit(1.9, 3.5, 22.5)
    ac_unit(3.2, 3.5, 22.5)
    # Gantry cranes at both ends.
    for u in (0.25, 4.6):
        box(u, 0.3, 0.15, 0.15, 22, 12, m_steel())
        box(u, 3.4, 0.15, 0.15, 22, 12, m_steel())
        box(u, 0.3, 0.15, 3.25, 34, 1.5, mat(team, 0.5, grain=0.03))
    for cu, cv in ((0.95, 0.25), (4.05, 0.25)):
        cylinder(cu, cv, 0.11, 22, 18, m_steel("#9aa0a6"))
        cylinder(cu, cv, 0.12, 30, 1.6, mat(team, 0.5, grain=0))
        cylinder(cu, cv, 0.12, 40, 1.5, mat("#3a3a3a", 0.8, grain=0))
    tower_crane(2.6, 0.25, 22, 34, 1.8, -1)
    render("warfactory-usa", (5, 4), 90)


def _slope(u0, u1, v0, v1, z0, z1, material):
    """Sheet rising from (v0, z0) to (v1, z1), spanning u0..u1, closed below."""
    import bmesh
    import kit

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
    return kit._obj("slope", bm, material)


# ---------------------------------------------------------------- Russia


def russia():
    team = TEAM["russia"]
    brick = mat("#8a4a36", 0.9, grain=0.2, scale=60)
    pier = mat("#6e3a2a", 0.9, grain=0.15, scale=60)
    conc = mat("#9a9a8a", 0.9, grain=0.15, scale=20)
    tar = mat("#4e4640", 0.95, grain=0.1, scale=8)
    plinth("#6a645a")
    # Chimney (back corner) with team bands.
    lathe(4.4, 0.6, 2, [(0.27, 0), (0.22, 68)], mat("#e4e0d8", 0.8), cap_top=True)
    for i in range(5):
        lathe(4.4, 0.6, 6 + i * 14, [(0.272 - i * 0.01, 0), (0.262 - i * 0.01, 6)], mat(team, 0.6, grain=0.05))
    cylinder(4.4, 0.6, 0.24, 70, 1.5, mat("#2a2a2a", 0.9, grain=0))
    # Brick hall.
    box(0.1, 0.1, 4.8, 3.3, 2, 22, brick)
    for i in range(11):
        box(0.1 + i * 4.8 / 10 - 0.04, 3.4, 0.08, 0.03, 2, 22, pier)
    for i in range(8):
        box(4.9, 0.1 + i * 3.3 / 7 - 0.04, 0.03, 0.08, 2, 22, pier)
    side_windows_right(0.1, 0.1, 4.8, 3.3, 6, 16, 7, 1)
    cornice(0.1, 0.1, 4.8, 3.3, 22, mat("#7a3e2c", 0.9, grain=0.2, scale=60), ((0.015, 0.7), (0.035, 0.7), (0.05, 0.9)))
    box(0.2, 0.2, 4.6, 3.1, 24.2, 0.5, tar)
    # Clerestory.
    box(0.5, 1.3, 4.0, 0.9, 24, 8, brick)
    framed_windows("left", 0.5, 1.3, 4.0, 0.9, 22, 12, 12, 1, glass=m_lit(), frame="#5a5a52", fill=0.6, sill=False)
    framed_windows("right", 0.5, 1.3, 4.0, 0.9, 22, 12, 3, 1, glass=m_lit(), frame="#5a5a52", fill=0.6, sill=False)
    cornice(0.5, 1.3, 4.0, 0.9, 31.4, mat("#7a3e2c", 0.9, grain=0.2, scale=60), ((0.02, 0.6),))
    roof(0.5, 1.3, 4.0, 0.9, 32, 3, mat("#5a524a", 0.7, metal=0.3), kind="gable", ridge="u", overhang=0.06)
    ac_unit(0.5, 0.4, 24)
    ac_unit(3.6, 2.6, 24)
    for u, v in ((0.4, 2.8), (1.2, 0.5), (2.6, 0.5), (3.6, 0.5), (4.6, 2.0)):
        roof_vent(u, v, 24)
    for u in (0.12, 4.88):
        downpipe(u, 3.43, 2, 22)
    for v in (1.2, 2.6):
        downpipe(4.93, v, 2, 22)
    # Steam pipe along the side wall to the chimney.
    rod((4.97, 3.2, zp(10)), (4.97, 0.9, zp(10)), 0.03, m_steel("#8a8d90"), 10)
    # Concrete front block with the bay doors.
    box(0.1, 3.4, 4.8, 0.55, 2, 18, conc)
    cornice(0.1, 3.4, 4.8, 0.55, 20, mat("#7a7a6c", 0.9, grain=0.12), ((0.015, 0.6), (0.035, 0.8)))
    box(0.1, 3.4, 4.8, 0.56, 16, 2.6, mat(team, 0.6, grain=0.05))
    roller_doors(0.1, 3.95, 4.8, 2, 12.5, 3, mat("#6c6c60", 0.9), width=0.55)
    # Administration tower with star.
    box(1.9, 2.9, 1.2, 1.05, 2, 40, conc)
    side_windows_left(1.9, 2.9, 1.2, 1.05, 14, 22, 3, 3)
    side_windows_right(1.9, 2.9, 1.2, 1.05, 4, 32, 3, 4)
    cornice(1.9, 2.9, 1.2, 1.05, 42, mat("#82827a", 0.9, grain=0.12), ((0.02, 0.8), (0.045, 1.2)))
    box(2.0, 3.0, 0.3, 0.25, 44, 3, mat("#8a8a7e", 0.9))
    roof_vent(2.8, 3.1, 44)
    box(2.3, 3.95, 0.4, 0.06, 11, 0.8, mat("#82827a", 0.9))
    for k in range(4):
        box(2.2 + k * 0.01, 3.95 + k * 0.05, 0.6, 0.05, 2 - k * 0.5, 0.5, conc)
    box(2.3, 3.95, 0.4, 0.04, 2, 9, mat(DOOR, 0.6))
    star(2.5, 3.98, 33, 6.4, team)
    tower_crane(0.45, 0.45, 2, 56, 1.9, 1)
    render("warfactory-russia", (5, 4), 92)


def star(cu, v, cz, r, color):
    """Five-point star on the +v face, centred at (cu, cz), radius r art px (vertical)."""
    import bmesh
    import kit

    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.4
        pts.append((cu + math.cos(a) * rr / 32 * 1.0, cz + math.sin(a) * rr))
    bm = bmesh.new()
    front = [bm.verts.new((x, v + 0.02, zp(z))) for x, z in pts]
    back = [bm.verts.new((x, v, zp(z))) for x, z in pts]
    centre_f = bm.verts.new((cu, v + 0.02, zp(cz)))
    centre_b = bm.verts.new((cu, v, zp(cz)))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((centre_f, front[i], front[j]))
        bm.faces.new((centre_b, back[j], back[i]))
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    kit._obj("star", bm, mat(color, 0.5, grain=0, emit=None))


# ---------------------------------------------------------------- China


def curled_roof(u, v, w, d, z, h, tile, ridge_col="#c89a30", over=0.2):
    roof(u, v, w, d, z, h, tile, kind="hip", ridge="u", overhang=over)
    # Eave fascia and golden ridge.
    box(u - over, v - over, w + 2 * over, d + 2 * over, z - 1, 1, mat("#5a2a1c", 0.7))
    rod((u + min(w, d) / 2, v + d / 2, zp(z + h)), (u + w - min(w, d) / 2, v + d / 2, zp(z + h)), 0.03, mat(ridge_col, 0.35, metal=0.7, grain=0), 8)
    for cu, cv in ((u - over, v - over), (u + w + over, v - over), (u - over, v + d + over), (u + w + over, v + d + over)):
        rod((cu, cv, zp(z)), (cu + (0.08 if cu > u else -0.08), cv + (0.08 if cv > v else -0.08), zp(z + 3)), 0.025, tile, 6)


def china():
    team = TEAM["china"]
    brick = mat("#8a8478", 0.9, grain=0.18, scale=50)
    red = mat("#a8281c", 0.55, grain=0.06)
    tile = mat("#3e3a36", 0.6, grain=0.25, scale=90)
    plinth("#c8c0ac", 3)
    box(0.55, 0.25, 3.9, 3.7, 3, 1.5, mat("#b0a894", 0.9))
    box(0.6, 0.3, 3.8, 3.0, 3, 20, brick)
    for i in range(6):
        box(4.4, 0.3 + (i + 0.5) * 3.0 / 6 - 0.15, 0.02, 0.3, 8, 10, mat("#3a2a22", 0.6, grain=0))
        box(4.41, 0.3 + (i + 0.5) * 3.0 / 6 - 0.17, 0.02, 0.34, 7.4, 0.6, red)
    cornice(0.6, 0.3, 3.8, 3.0, 21, mat("#5a2a1c", 0.7), ((0.03, 1.0), (0.07, 1.0)))
    curled_roof(0.6, 0.3, 3.8, 3.0, 23, 7, tile, over=0.25)
    box(1.3, 1.0, 2.4, 1.6, 27, 10, red)
    box(1.28, 0.98, 2.44, 1.64, 34, 2, mat(team, 0.4, metal=0.3, grain=0.03))
    framed_windows("left", 1.3, 1.0, 2.4, 1.6, 27, 7, 8, 1, glass=mat("#3a2a22", 0.6, grain=0), frame="#d0a040", fill=0.55, sill=False)
    framed_windows("right", 1.3, 1.0, 2.4, 1.6, 27, 7, 5, 1, glass=mat("#3a2a22", 0.6, grain=0), frame="#d0a040", fill=0.55, sill=False)
    curled_roof(1.3, 1.0, 2.4, 1.6, 36.5, 8, tile, ridge_col=team, over=0.14)
    # Front gallery.
    box(0.6, 3.3, 3.8, 0.3, 3, 16, mat("#2a2622", 0.8))
    for i in range(7):
        cylinder(0.65 + i * 3.7 / 6, 3.82, 0.05, 4.5, 14.5, red, 12)
    box(0.6, 3.3, 3.8, 0.62, 16.5, 2.5, mat(team, 0.5, grain=0.04))
    roller_doors(0.6, 3.6, 3.8, 3, 12, 3, red, width=0.55)
    curled_roof(0.6, 3.3, 3.8, 0.6, 19, 4, mat("#4a4540", 0.7, grain=0.12, scale=40), over=0.15)
    for u in (0.05, 4.05):
        box(u, 2.6, 0.8, 1.3, 3, 26, red)
        box(u - 0.02, 2.58, 0.84, 1.34, 3, 4, mat("#b0a894", 0.9))
        framed_windows("left", u, 2.6, 0.8, 1.3, 7, 22, 2, 2, glass=mat("#3a2a22", 0.6, grain=0), frame="#d0a040", fill=0.5)
        framed_windows("right", u, 2.6, 0.8, 1.3, 7, 22, 3, 2, glass=mat("#3a2a22", 0.6, grain=0), frame="#d0a040", fill=0.5)
        cornice(u, 2.6, 0.8, 1.3, 27, mat("#5a2a1c", 0.7), ((0.03, 1.0), (0.06, 1.0)))
        curled_roof(u, 2.6, 0.8, 1.3, 29, 9, tile, over=0.18)
        box(u + 0.3, 3.15, 0.2, 0.2, 38, 4, mat(team, 0.4, metal=0.4, grain=0))
    tower_crane(4.6, 0.35, 3, 52, 1.8, -1, "#d8a62a")
    render("warfactory-china", (5, 4), 90)


# ---------------------------------------------------------------- Europe


def arch_doors(u, v, w, z, count, h, frame, door=DOOR):
    for i in range(count):
        cu = u + (i + 0.5) * w / count
        hw = w * 0.3 / count
        for grow, mm, dv in ((0.04, frame, 0.0), (0.0, mat(door, 0.6, grain=0.05), 0.012)):
            pts = []
            r = hw + grow
            spring = z + h * 0.62
            for k in range(13):
                a = math.pi * k / 12
                pts.append((cu - r * math.cos(a), spring + (h + grow * 30 - h * 0.62) * math.sin(a)))
            outline = [(cu - r, z)] + pts + [(cu + r, z)]
            _face_poly(outline, v + dv, 0.02, mm)


def _face_poly(outline, v, t, material):
    """Flat polygon [(u, z)] on the +v face plane at v, t tiles thick."""
    import bmesh
    import kit

    bm = bmesh.new()
    f = [bm.verts.new((x, v + t, zp(zz))) for x, zz in outline]
    b = [bm.verts.new((x, v, zp(zz))) for x, zz in outline]
    bm.faces.new(f)
    bm.faces.new(list(reversed(b)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((f[i], b[i], b[j], f[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    kit._obj("facepoly", bm, material)


def europe():
    team = TEAM["europe"]
    stone = mat("#ddd6c6", 0.85, grain=0.16, scale=40)
    trim = mat("#b8ae98", 0.85, grain=0.1, scale=30)
    slate = mat("#4e5866", 0.6, grain=0.22, scale=25)
    plinth("#9c968a")
    box(0.2, 0.2, 4.6, 3.4, 2, 20, stone)
    box(0.18, 0.18, 4.64, 3.44, 2, 3, trim)
    for i in range(8):
        vv = 0.2 + (i + 0.5) * 3.4 / 8
        _arch_window_right(4.8, vv, 6, 11, 0.13)
    cornice(0.2, 0.2, 4.6, 3.4, 19.5, trim, ((0.015, 0.8), (0.035, 0.8), (0.06, 0.9)))
    box(0.18, 0.18, 4.64, 3.44, 9.5, 0.7, trim)
    # Mansard roof, dormers, lantern.
    mansard(0.2, 0.2, 4.6, 3.4, 22, 15, 0.3, 7, slate, cap=mat("#5e6a78", 0.5, metal=0.3, grain=0.15, scale=25))
    for u, v in ((0.6, 0.55), (4.3, 0.55), (0.6, 3.0), (4.3, 3.0), (2.0, 0.55), (3.0, 0.55)):
        chimney_stack(u, v, 32, 9, stone, trim)
    for u in (0.7, 1.5, 3.5, 4.3):
        box(u - 0.15, 3.2, 0.3, 0.36, 23, 7, stone)
        box(u - 0.08, 3.56, 0.16, 0.01, 24, 5, m_glass())
        roof(u - 0.15, 3.2, 0.3, 0.36, 30, 3.5, slate, kind="gable", ridge="v", overhang=0.03)
        box(u - 0.17, 3.54, 0.34, 0.03, 29.5, 0.7, trim)
    for vv in (0.8, 1.8, 2.6):
        box(4.4, vv - 0.12, 0.36, 0.24, 23, 7, stone)
        box(4.76, vv - 0.07, 0.01, 0.14, 24, 5, m_glass())
        roof(4.4, vv - 0.12, 0.36, 0.24, 30, 3.5, slate, kind="gable", ridge="u", overhang=0.03)
    box(1.4, 1.6, 2.2, 0.6, 37, 6, mat("#8aa6bc", 0.15, metal=0.2, grain=0, glass=True))
    for k in range(9):
        box(1.4 + k * 2.2 / 8 - 0.015, 2.2, 0.03, 0.01, 37, 6, m_steel("#3a3f44"))
    roof(1.4, 1.6, 2.2, 0.6, 43, 3, mat("#5c6878", 0.6), kind="hip", ridge="u", overhang=0.04)
    # Front block with arched doors.
    box(0.2, 3.6, 4.6, 0.35, 2, 16, stone)
    box(0.18, 3.58, 4.64, 0.39, 15, 2, mat(team, 0.55, grain=0.04))
    box(0.18, 3.58, 4.64, 0.39, 17, 1, trim)
    arch_doors(0.2, 3.95, 4.6, 2, 4, 11, trim)
    for u in (0.05, 4.25):
        box(u, 3.25, 0.7, 0.7, 2, 26, stone)
        box(u - 0.02, 3.23, 0.74, 0.74, 2, 3, trim)
        _arch_window_left(u + 0.35, 3.95, 7, 6, 0.13)
        _arch_window_left(u + 0.35, 3.95, 17, 6, 0.13)
        _arch_window_right(u + 0.7, 3.6, 12, 7, 0.13)
        cornice(u, 3.25, 0.7, 0.7, 27.5, trim, ((0.02, 0.8), (0.045, 1.2)))
        dome(u + 0.35, 3.6, 0.36, 29.5, 10, slate)
        rod((u + 0.35, 3.6, zp(39)), (u + 0.35, 3.6, zp(43)), 0.012, mat("#c8a850", 0.3, metal=0.9, grain=0))
    # Central pavilion.
    box(1.8, 3.2, 1.4, 0.75, 2, 32, stone)
    for cu in (1.9, 3.1):
        box(cu - 0.05, 3.95, 0.1, 0.04, 2, 29, trim)
    _face_poly([(1.78, 34), (2.5, 42), (3.22, 34)], 3.95, 0.04, trim)
    _face_poly([(1.82, 34), (3.18, 34), (3.18, 35.5), (1.82, 35.5)], 3.95, 0.05, trim)
    cyl_disc(2.5, 3.97, 21, 6.2, mat(team, 0.5, grain=0.03))
    for k in range(12):
        a = k / 12 * 2 * math.pi
        cyl_disc(2.5 + math.cos(a) * 4.4 / 32, 3.99, 21 + math.sin(a) * 4.4, 0.8, mat("#f2c94c", 0.3, metal=0.6, grain=0))
    cyl_disc(2.5, 3.97, 30, 1.9, mat("#f4f0e4", 0.5, grain=0))
    box(2.2, 3.96, 0.6, 0.02, 2, 11, mat(DOOR, 0.6))
    cornice(1.8, 3.2, 1.4, 0.75, 33.5, trim, ((0.02, 0.8), (0.05, 1.2)))
    roof(1.8, 3.2, 1.4, 0.75, 35.5, 8, slate, kind="hip", ridge="u", overhang=0.05)
    tower_crane(4.65, 0.35, 2, 54, 1.9, -1, "#e8c23a")
    render("warfactory-europe", (5, 4), 90)


def cyl_disc(cu, v, cz, r, material):
    """Round plaque on the +v face, radius r art px (vertical) at height cz."""
    pts = [(cu + math.cos(2 * math.pi * k / 24) * r / 32, cz + math.sin(2 * math.pi * k / 24) * r) for k in range(24)]
    _face_poly(pts, v, 0.015, material)


def _arch_window_left(cu, v, z, h, hw):
    _arch_shape(cu, v, z, h, hw, "left")


def _arch_window_right(u, cv, z, h, hw):
    _arch_shape(cv, u, z, h, hw, "right")


def _arch_shape(c, plane, z, h, hw, face):
    import bmesh
    import kit

    pts = [(c - hw, z)]
    for k in range(9):
        a = math.pi * k / 8
        pts.append((c - hw * math.cos(a), z + h * 0.7 + h * 0.3 * math.sin(a)))
    pts.append((c + hw, z))
    for grow, m, t in ((0.025, mat("#b8ae98", 0.85), 0.012), (0.0, m_glass(), 0.02)):
        outl = [(x if x == c else c + (x - c) * (1 + grow / hw), zz - (1.2 if zz == z and grow else 0)) for x, zz in pts]
        bm = bmesh.new()
        if face == "left":
            f = [bm.verts.new((x, plane + t, zp(zz))) for x, zz in outl]
            b = [bm.verts.new((x, plane, zp(zz))) for x, zz in outl]
        else:
            f = [bm.verts.new((plane + t, x, zp(zz))) for x, zz in outl]
            b = [bm.verts.new((plane, x, zp(zz))) for x, zz in outl]
        bm.faces.new(f)
        bm.faces.new(list(reversed(b)))
        n = len(outl)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((f[i], b[i], b[j], f[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        kit._obj("arch", bm, m)


# ---------------------------------------------------------------- Islamic


GREEN = "#1f8a5a"


def islamic():
    team = TEAM["islamic"]
    sand = mat("#d0b88c", 0.9, grain=0.2, scale=40)
    sand_d = mat("#c0a87c", 0.9, grain=0.15, scale=30)
    green = mat(GREEN, 0.35, metal=0.3, grain=0.05)
    gold = mat("#e8c860", 0.3, metal=0.9, grain=0)
    plinth("#a8946c")

    def tower(u, v):
        box(u, v, 0.7, 0.7, 2, 30, sand_d)
        for k in range(3):
            _arch_window_left(u + 0.35, v + 0.7, 6 + k * 8, 5, 0.09)
            _arch_window_right(u + 0.7, v + 0.35, 6 + k * 8, 5, 0.09)
        box(u - 0.05, v - 0.05, 0.8, 0.8, 32, 2, sand)
        for i in range(4):
            box(u - 0.05 + i * 0.22, v + 0.65, 0.12, 0.1, 34, 2, sand)
            box(u + 0.65, v - 0.05 + i * 0.22, 0.1, 0.12, 34, 2, sand)
        cylinder(u + 0.35, v + 0.35, 0.3, 34, 2, sand)
        dome(u + 0.35, v + 0.35, 0.31, 36, 10, green, onion=True)
        rod((u + 0.35, v + 0.35, zp(45)), (u + 0.35, v + 0.35, zp(49)), 0.012, gold)

    tower(0, 0)
    tower(4.3, 0)
    box(0.3, 0.3, 4.4, 3.4, 2, 20, sand)
    box(0.28, 0.28, 4.44, 3.44, 2, 2.5, sand_d)
    box(0.29, 0.29, 4.42, 3.42, 17, 2, mat(team, 0.4, grain=0.05))
    for i in range(16):
        box(0.3 + i * 4.4 / 16, 3.6, 0.14, 0.1, 22, 2.5, sand_d)
    for i in range(12):
        box(4.6, 0.3 + i * 3.4 / 12, 0.1, 0.14, 22, 2.5, sand_d)
    for i in range(6):
        _arch_window_right(4.7, 0.6 + i * 0.55, 6, 8, 0.1)
    cornice(0.3, 0.3, 4.4, 3.4, 19.5, sand_d, ((0.015, 0.8), (0.035, 1.7)))
    box(0.35, 0.35, 4.3, 3.3, 21, 1.2, mat("#a8946c", 0.95, grain=0.1, scale=8))
    arch_doors(0.3, 3.7, 4.4, 2, 3, 12, mat("#8a6a44", 0.7))
    # Great dome on a drum.
    cylinder(2.5, 2.0, 1.0, 22, 6, sand, 48)
    for k in range(12):
        a = 2 * math.pi * k / 12
        cyl = (2.5 + math.cos(a) * 1.0, 2.0 + math.sin(a) * 1.0)
        box(cyl[0] - 0.04, cyl[1] - 0.04, 0.08, 0.08, 23.5, 3, mat("#3a3024", 0.5, grain=0))
    cylinder(2.5, 2.0, 1.03, 27.5, 1, sand_d, 48)
    dome(2.5, 2.0, 1.0, 28.5, 26, green, segs=48, rings=14)
    rod((2.5, 2.0, zp(54)), (2.5, 2.0, zp(60)), 0.018, gold)
    rib = mat("#16704a", 0.4, metal=0.3, grain=0)
    for k in range(16):
        a = 2 * math.pi * k / 16
        prev = None
        for i in range(9):
            t = i / 8 * math.pi / 2
            p = (2.5 + 1.005 * math.cos(t) * math.cos(a), 2.0 + 1.005 * math.cos(t) * math.sin(a), zp(28.5 + 26 * math.sin(t)))
            if prev:
                rod(prev, p, 0.008, rib, 4)
            prev = p
    lathe(2.5, 2.0, 54, [(0.12, 0), (0.05, 1.5)], gold, cap_top=True)
    for u, v in ((0.9, 0.9), (4.1, 3.0), (0.9, 3.0), (4.1, 1.0)):
        box(u - 0.12, v - 0.12, 0.24, 0.24, 22, 2.5, sand_d)
        dome(u, v, 0.1, 24.5, 2.5, sand)
    tower(0, 3.3)
    tower(4.3, 3.3)
    tower_crane(3.6, 0.6, 22, 34, 1.6, -1, "#d4a83a")
    render("warfactory-islamic", (5, 4), 90)


MODELS = {
    "warfactory-usa": usa,
    "warfactory-russia": russia,
    "warfactory-china": china,
    "warfactory-europe": europe,
    "warfactory-islamic": islamic,
}
