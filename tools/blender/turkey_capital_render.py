"""
Turkey's contested capital, "Ankara Külliye": the main building of the Presidential Complex (Cumhurbaşkanlığı
Külliyesi, Beştepe, Ankara, 2014).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/turkey_capital_render.py

Writes ui/public/sprites/building-nation-turkey.png (then run tools/to_webp.py).

Real building: a long, symmetrical neo-Seljuk / neo-Ottoman block faced in white-cream limestone, set on a stepped
stone podium: an arcaded ground floor of pointed arches, two upper storeys of tall pointed-arch windows in framed
bays between flat pilasters, a heavy cornice and a parapet over flat roofs; slightly projecting end pavilions; in the
middle a raised entrance block with a tall pointed-arch portal (Seljuk taçkapı) set in a rectangular frame carved with
eight-pointed Seljuk stars.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 60 art px (NationCapital.ts HEIGHTS).
The two flag poles at (0.15, 2.25) and (3.85, 2.25), 37 art px tall, carry the game's animated flags.
Identity line: a saturated red band (TEAM_LINE) under the cornice and on the portal frame, recoloured with the holder.
No trees or decoration (ART_GUIDE "Nothing extra").
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
import capital_damage  # noqa: E402
from kit import _obj, box, cylinder, mat, render, rod, zp  # noqa: E402  (infrastructure only)

D = 2.4
HEIGHT = 60

STONE = "#e6ddc8"      # white-cream limestone
STONE_L = "#f1ebdd"
STONE_D = "#c9bfa8"
PODIUM = "#b9b09c"
GLASS = "#2b343c"
TEAM_LINE = "#c8102e"  # Turkish red, recoloured to the holder in game


def face_poly(face, plane, pts, m, t=0.012):
    """Flat plate on a visible face: "left" = +v face at v = plane (s along u), "right" = +u face at u = plane (s along
    v); pts = [(s, z art px)]."""
    bm = bmesh.new()

    def P(s, z, k):
        return (s, plane + k, zp(z)) if face == "left" else (plane + k, s, zp(z))

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


def pointed(s0, s1, z, h, rise=0.32, n=6):
    """Pointed (two-centred) arch outline: jambs, then two curves meeting at the apex."""
    spring = z + h * (1 - rise)
    mid = (s0 + s1) / 2
    pts = [(s0, z), (s1, z), (s1, spring)]
    for i in range(1, n):
        t = i / n
        pts.append((s1 - (s1 - mid) * (1 - math.cos(t * math.pi / 2)), spring + h * rise * math.sin(t * math.pi / 2)))
    pts.append((mid, z + h))
    for i in range(n - 1, 0, -1):
        t = i / n
        pts.append((s0 + (mid - s0) * (1 - math.cos(t * math.pi / 2)), spring + h * rise * math.sin(t * math.pi / 2)))
    pts.append((s0, spring))
    return pts


def star8(cs, cz, r_s, r_z):
    """Eight-pointed Seljuk star (two overlapping squares) as an outline; r_s tiles across, r_z px tall."""
    pts = []
    for k in range(16):
        a = math.pi / 2 + k * math.pi / 8
        f = 1.0 if k % 2 == 0 else 0.62
        pts.append((cs + math.cos(a) * r_s * f, cz + math.sin(a) * r_z * f))
    return pts


def window(face, plane, a0, a1, z, h, glass, frame, sill):
    """Tall pointed-arch window: frame plate, glass proud of it but behind the jambs (reads set back), mullion, sill."""
    face_poly(face, plane, pointed(a0 - 0.014, a1 + 0.014, z - 0.6, h + 1.4), frame, 0.008)
    face_poly(face, plane + 0.008, pointed(a0, a1, z, h), glass, 0.004)
    for s in (a0 - 0.014, a1):
        face_poly(face, plane, [(s, z - 0.6), (s + 0.014, z - 0.6), (s + 0.014, z + h * 0.68), (s, z + h * 0.68)], frame, 0.018)
    m = (a0 + a1) / 2
    face_poly(face, plane + 0.008, [(m - 0.004, z), (m + 0.004, z), (m + 0.004, z + h * 0.7), (m - 0.004, z + h * 0.7)], frame, 0.008)
    face_poly(face, plane, [(a0 - 0.024, z - 1.4), (a1 + 0.024, z - 1.4), (a1 + 0.024, z - 0.6), (a0 - 0.024, z - 0.6)], sill, 0.026)


def facade(face, lo, hi, plane, z0, n, glass, frame, sill, pil, arcade_m):
    """Arcaded ground floor of pointed arches, two upper storeys of tall pointed windows between pilasters."""
    step = (hi - lo) / n
    for i in range(n + 1):  # pilasters
        c = min(max(lo + i * step, lo + 0.02), hi - 0.02)
        face_poly(face, plane, [(c - 0.02, z0 + 9), (c + 0.02, z0 + 9), (c + 0.02, z0 + 26.5), (c - 0.02, z0 + 26.5)], pil, 0.016)
    for i in range(n):
        c = lo + (i + 0.5) * step
        # Arcade: a dark pointed recess with a stone archivolt round it.
        face_poly(face, plane, pointed(c - step * 0.42, c + step * 0.42, z0, 8.4), frame, 0.01)
        face_poly(face, plane + 0.01, pointed(c - step * 0.34, c + step * 0.34, z0, 7.4), arcade_m, 0.004)
        w = step * 0.36
        window(face, plane, c - w / 2, c + w / 2, z0 + 10.6, 6.0, glass, frame, sill)
        window(face, plane, c - w / 2, c + w / 2, z0 + 19.0, 6.0, glass, frame, sill)
    # String course over the arcade and between the storeys.
    face_poly(face, plane, [(lo - 0.01, z0 + 8.6), (hi + 0.01, z0 + 8.6), (hi + 0.01, z0 + 9.4), (lo - 0.01, z0 + 9.4)], pil, 0.022)
    face_poly(face, plane, [(lo, z0 + 17.6), (hi, z0 + 17.6), (hi, z0 + 18.0), (lo, z0 + 18.0)], pil, 0.012)


def coursing(face, lo, hi, plane, z0, z1, step, m):
    z = z0 + step
    while z < z1 - 0.2:
        face_poly(face, plane, [(lo, z), (hi, z), (hi, z + 0.18), (lo, z + 0.18)], m, 0.003)
        z += step


def crown(u0, u1, v0, v1, z, team, team_faces=("left", "right")):
    """Team band, dentilled cornice, parapet with coping, roof membrane with joints."""
    cm = mat(STONE_L, 0.75, grain=0.05)
    for f in team_faces:  # team line under the cornice
        if f == "left":
            box(u0 - 0.004, v1, u1 - u0 + 0.008, 0.014, z - 2.8, 1.0, team)
        else:
            box(u1, v0 - 0.004, 0.014, v1 - v0 + 0.008, z - 2.8, 1.0, team)
    n = int((u1 - u0) / 0.05)
    for i in range(n):  # dentils
        box(u0 + 0.01 + i * 0.05, v1 + 0.016, 0.022, 0.014, z - 1.6, 0.6, cm)
    for i in range(int((v1 - v0) / 0.05)):
        box(u1 + 0.016, v0 + 0.01 + i * 0.05, 0.014, 0.022, z - 1.6, 0.6, cm)
    box(u0 - 0.05, v0 - 0.05, u1 - u0 + 0.1, v1 - v0 + 0.1, z - 1.0, 1.0, cm)  # cornice
    pm = mat(STONE, 0.8, grain=0.08, scale=24)
    cap = mat(STONE_D, 0.8, grain=0.05)
    for bx in ((u0 - 0.04, v0 - 0.04, u1 - u0 + 0.08, 0.04), (u0 - 0.04, v1, u1 - u0 + 0.08, 0.04),
               (u0 - 0.04, v0, 0.04, v1 - v0), (u1, v0, 0.04, v1 - v0)):
        box(*bx, z, 2.0, pm)
        box(bx[0] - 0.006, bx[1] - 0.006, bx[2] + 0.012, bx[3] + 0.012, z + 2.0, 0.4, cap)
    box(u0, v0, u1 - u0, v1 - v0, z, 0.2, mat("#8f8c85", 0.85, grain=0.12, scale=20))
    jm = mat("#77746d", 0.9, grain=0)
    nu = max(2, int((u1 - u0) / 0.22))
    nv = max(2, int((v1 - v0) / 0.22))
    for i in range(1, nu):
        box(u0 + i * (u1 - u0) / nu - 0.004, v0, 0.008, v1 - v0, z + 0.2, 0.08, jm)
    for i in range(1, nv):
        box(u0, v0 + i * (v1 - v0) / nv - 0.004, u1 - u0, 0.008, z + 0.2, 0.08, jm)


def plant(u, v, z):
    pm = mat("#9a9b98", 0.6, metal=0.4, grain=0.03)
    box(u - 0.09, v - 0.06, 0.18, 0.12, z, 1.8, pm)
    box(u - 0.1, v - 0.07, 0.2, 0.14, z + 1.8, 0.3, mat("#6f706e", 0.6, metal=0.3, grain=0))
    for k in range(4):
        box(u - 0.07 + k * 0.04, v + 0.06, 0.02, 0.004, z + 0.3, 1.2, mat("#45474a", 0.5, metal=0.5, grain=0))


def plaza():
    box(0, 0, 4, D, 0, 3, mat("#b3ad9f", 0.95, grain=0.14, scale=10))
    j = mat("#9c978c", 0.95, grain=0.05)
    for i in range(1, 16):
        box(i * 0.25, 0, 0.008, D, 3, 0.05, j)
    for i in range(1, 10):
        box(0, i * 0.24, 4, 0.008, 3, 0.05, j)


def poles():
    p = mat("#d8d8d8", 0.3, metal=0.9, grain=0)
    for u, v in ((0.15, 2.25), (3.85, 2.25)):
        rod((u, v, zp(3)), (u, v, zp(37)), 0.012, p, 8)
        cylinder(u, v, 0.04, 3, 0.8, mat("#55595e", 0.5, metal=0.6, grain=0), 12)
        cylinder(u, v, 0.02, 37, 0.8, mat("#d4b24a", 0.3, metal=0.9, grain=0), 12)


def build():
    glass = mat(GLASS, 0.08, metal=0.15, grain=0, glass=True)
    frame = mat(STONE_L, 0.65, grain=0.03)
    sill = mat(STONE_D, 0.8, grain=0.06)
    pil = mat(STONE_L, 0.75, grain=0.05, scale=24)
    wall = mat(STONE, 0.8, grain=0.09, scale=24)
    arcade = mat("#4a4840", 0.85, grain=0.05)
    joint = mat(STONE_D, 0.9, grain=0.02)
    team = mat(TEAM_LINE, 0.5, grain=0.03)

    plaza()
    # Stepped stone podium.
    U0, U1, V0, V1 = 0.22, 3.78, 0.3, 1.66
    pod = mat(PODIUM, 0.9, grain=0.14, scale=18)
    box(U0 - 0.12, V0 - 0.1, U1 - U0 + 0.24, V1 - V0 + 0.22, 3, 2.2, pod)
    box(U0 - 0.06, V0 - 0.05, U1 - U0 + 0.12, V1 - V0 + 0.12, 5.2, 0.8, mat(STONE_D, 0.85, grain=0.08))
    for k in range(1, 3):
        box(U0 - 0.124, V1 + 0.12, U1 - U0 + 0.248, 0.004, 3 + k * 0.72, 0.2, mat("#8f8878", 0.9, grain=0))
    Z0 = 6.0
    BODY = 28.0

    # Main block between the end pavilions.
    box(U0, V0, U1 - U0, V1 - V0, Z0, BODY, wall)
    coursing("left", U0, U1, V1, Z0, Z0 + 8.4, 1.4, joint)
    coursing("right", V0, V1, U1, Z0, Z0 + 8.4, 1.4, joint)
    facade("left", 0.78, 1.48, V1, Z0, 3, glass, frame, sill, pil, arcade)
    facade("left", 2.52, 3.22, V1, Z0, 3, glass, frame, sill, pil, arcade)
    crown(U0, U1, V0, V1, Z0 + BODY, team, team_faces=("left",))

    # End pavilions, proud of the front and a little taller, with quoins.
    PW = 0.56
    for pu in (U0 - 0.02, U1 - PW + 0.02):
        pv0, pv1 = V0 - 0.02, V1 + 0.08
        box(pu, pv0, PW, pv1 - pv0, Z0, BODY + 2.5, wall)
        coursing("left", pu, pu + PW, pv1, Z0, Z0 + 8.4, 1.4, joint)
        facade("left", pu, pu + PW, pv1, Z0, 2, glass, frame, sill, pil, arcade)
        if pu > 2:
            coursing("right", pv0, pv1, pu + PW, Z0, Z0 + 8.4, 1.4, joint)
            facade("right", pv0, pv1, pu + PW, Z0, 5, glass, frame, sill, pil, arcade)
        for k in range(int((BODY - 9) / 1.6)):  # quoins
            ext = 0.05 if k % 2 == 0 else 0.032
            for s in (pu, pu + PW - ext):
                box(s, pv1, ext, 0.014, Z0 + 9 + k * 1.6, 1.3, pil)
        crown(pu, pu + PW, pv0, pv1, Z0 + BODY + 2.5, team)
        plant(pu + PW / 2, (pv0 + pv1) / 2, Z0 + BODY + 2.7)

    # Central entrance block with the Seljuk portal.
    C0, C1, CV1 = 1.48, 2.52, V1 + 0.22
    CH = BODY + 8.0
    box(C0, V0 + 0.15, C1 - C0, CV1 - V0 - 0.15, Z0, CH, wall)
    coursing("right", V0 + 0.15, CV1, C1, Z0, Z0 + CH, 1.6, joint)
    for row in (Z0 + 10.6, Z0 + 19.0, Z0 + 27.4):
        for c in (CV1 - 0.12, CV1 - 0.36):
            window("right", C1, c - 0.04, c + 0.04, row, 6.0, glass, frame, sill)
    mid = (C0 + C1) / 2
    # Rectangular portal frame (pishtaq) proud of the block, the team band on its border.
    fz0, fz1 = Z0, Z0 + CH - 2.0
    face_poly("left", CV1, [(mid - 0.36, fz0), (mid + 0.36, fz0), (mid + 0.36, fz1), (mid - 0.36, fz1)], frame, 0.02)
    for s0, s1 in ((mid - 0.36, mid - 0.33), (mid + 0.33, mid + 0.36)):
        face_poly("left", CV1 + 0.02, [(s0, fz0), (s1, fz0), (s1, fz1), (s0, fz1)], team, 0.006)
    face_poly("left", CV1 + 0.02, [(mid - 0.36, fz1 - 1.0), (mid + 0.36, fz1 - 1.0), (mid + 0.36, fz1), (mid - 0.36, fz1)], team, 0.006)
    # The tall pointed arch: carved archivolt, deep dark recess, glazed doors at its foot, a muqarnas hood.
    face_poly("left", CV1 + 0.02, pointed(mid - 0.26, mid + 0.26, fz0 + 0.4, 25.0), mat(STONE_D, 0.8, grain=0.06), 0.008)
    face_poly("left", CV1 + 0.028, pointed(mid - 0.21, mid + 0.21, fz0 + 0.4, 23.0), arcade, 0.004)
    for k in range(5):  # muqarnas tiers in the arch head
        zz = fz0 + 0.4 + 23.0 * 0.66 + k * 1.3
        hw = 0.19 * (1 - k * 0.17)
        face_poly("left", CV1 + 0.032, [(mid - hw, zz), (mid + hw, zz), (mid + hw, zz + 0.5), (mid - hw, zz + 0.5)], frame, 0.006)
    for k in range(3):  # bronze-framed glazed doors
        dc = mid - 0.12 + k * 0.12
        face_poly("left", CV1 + 0.032, [(dc - 0.045, fz0 + 0.4), (dc + 0.045, fz0 + 0.4), (dc + 0.045, fz0 + 8.0), (dc - 0.045, fz0 + 8.0)], mat("#6b5534", 0.45, metal=0.6, grain=0), 0.004)
        face_poly("left", CV1 + 0.036, [(dc - 0.035, fz0 + 0.8), (dc + 0.035, fz0 + 0.8), (dc + 0.035, fz0 + 7.4), (dc - 0.035, fz0 + 7.4)], glass, 0.003)
    # Eight-pointed Seljuk stars carved into the frame either side of the arch and over it.
    for s, z in ((mid - 0.31, fz0 + 14.0), (mid + 0.31, fz0 + 14.0), (mid - 0.31, fz0 + 22.0), (mid + 0.31, fz0 + 22.0), (mid, fz1 - 3.6)):
        face_poly("left", CV1 + 0.02, star8(s, z, 0.04 if s != mid else 0.06, 1.6 if s != mid else 2.2), mat(STONE_D, 0.8, grain=0.04), 0.006)
    # Inscription frieze over the portal: lettering too small to read, drawn as dark blocks.
    for k in range(9):
        face_poly("left", CV1 + 0.026, [(mid - 0.22 + k * 0.05, fz1 - 6.4), (mid - 0.19 + k * 0.05, fz1 - 6.4), (mid - 0.19 + k * 0.05, fz1 - 5.6), (mid - 0.22 + k * 0.05, fz1 - 5.6)], mat("#6d6656", 0.85, grain=0), 0.004)
    crown(C0, C1, V0 + 0.15, CV1, Z0 + CH, team, team_faces=("right",))
    plant(mid - 0.25, V0 + 0.45, Z0 + CH + 0.2)
    plant(mid + 0.25, V0 + 0.45, Z0 + CH + 0.2)
    # Low glazed lantern dome on the entrance block roof, ribbed.
    cylinder(mid, (V0 + CV1) / 2 + 0.05, 0.2, Z0 + CH + 0.2, 2.4, wall, 32)
    kit.dome(mid, (V0 + CV1) / 2 + 0.05, 0.19, Z0 + CH + 2.6, 5.0, mat("#7f99a8", 0.1, metal=0.35, grain=0, glass=True), 32, 10)
    rib = mat("#c9c3b4", 0.5, metal=0.4, grain=0)
    cu, cv = mid, (V0 + CV1) / 2 + 0.05
    for i in range(12):
        a = i / 12 * 2 * math.pi
        prev = None
        for k in range(7):
            t = k / 6 * (math.pi / 2) * 0.9
            p = (cu + math.cos(a) * 0.192 * math.cos(t), cv + math.sin(a) * 0.192 * math.cos(t), zp(Z0 + CH + 2.6 + 5.0 * math.sin(t)))
            if prev:
                rod(prev, p, 0.005, rib, 6)
            prev = p
    rod((cu, cv, zp(Z0 + CH + 7.4)), (cu, cv, zp(Z0 + CH + 10.0)), 0.008, mat("#d4b24a", 0.3, metal=0.9, grain=0), 6)

    # Broad flight of steps up the podium to the portal, bronze lamps either side.
    for k in range(4):
        box(mid - 0.42, CV1 + 0.02 + k * 0.05, 0.84, 0.05, 3, 3.0 - k * 0.7, pod)
    lamp = mat("#3d3a33", 0.4, metal=0.7, grain=0)
    for u in (mid - 0.46, mid + 0.46):
        cylinder(u, CV1 + 0.12, 0.018, 3, 5.0, lamp, 10)
        cylinder(u, CV1 + 0.12, 0.032, 8.0, 1.4, mat("#f2e6b0", 0.3, emit="#f2e6b0"), 12)
        cylinder(u, CV1 + 0.12, 0.036, 9.4, 0.4, lamp, 12)

    poles()
    return locals()


def smooth_round_parts():
    """Hard where hard, round where round (ART_GUIDE 1): box corners stay sharp, the dome and lamps smooth."""
    import bpy

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))


def damage_cfg(L):
    """Damage stages (capital_damage.py): the east half goes at stage 2, rubble field at stage 3."""
    return dict(
        rects=[(0.2, 0.28, 3.8, 1.74, 6.0, 36.5), (1.48, 0.45, 2.52, 1.88, 6.0, 42.0)],
        base=6.0, walls=[L["wall"], L["pil"], L["frame"], L["sill"]], roof=L["wall"], team=L["team"],
        glass=L["glass"], split=2.0, floors=[14.4, 22.8, 31.0], team_z=12, seed=95,
    )


for _d in capital_damage.stages():
    kit.reset()
    capital_damage.apply(_d, damage_cfg(build()))
    smooth_round_parts()
    render("nation-turkey" + (f"-d{_d}" if _d else ""), (4, D), HEIGHT)

