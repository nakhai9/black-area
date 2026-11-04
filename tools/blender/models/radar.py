"""Radar Tower (2 x 2): each nation's pedestal (radar-<nation>) plus its antenna rendered at N_FRAMES headings
(radar-<nation>-ant<kk>, heading k * 360 / N_FRAMES from +u towards +v), all in the same frame so they stack."""
import math
import os

import bmesh
import bpy

from kit import OUT, _obj, box, cylinder, lathe, mat, render, rod, zp, TEAM

N_FRAMES = int(os.environ.get("RADAR_FRAMES", 32))
TOP = 62  # art px the render reaches above the pivot


# ---------------------------------------------------------------- helpers


def frustum(cu, cv, r0, r1, z, h, material, sides, turn=0.0, flat=True, cap=True):
    """Tapered prism/cone round (cu, cv) from z up h art px; flat facets unless flat=False."""
    bm = bmesh.new()
    lo, hi = [], []
    for i in range(sides):
        a = turn + 2 * math.pi * i / sides
        lo.append(bm.verts.new((cu + r0 * math.cos(a), cv + r0 * math.sin(a), zp(z))))
        hi.append(bm.verts.new((cu + r1 * math.cos(a), cv + r1 * math.sin(a), zp(z + h))))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    if cap:
        bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("frustum", bm, material)
    for f in ob.data.polygons:
        f.use_smooth = not flat
    return ob


def plate(cu, cv, r, a, z0, z1, width, material, depth=0.03):
    """Thin plate standing on a tower face at bearing a (0 = +u, pi/2 = +v), distance r from the axis."""
    nu, nv = math.cos(a), math.sin(a)
    tu, tv = -nv, nu
    bm = bmesh.new()
    vs = []
    for dd in (0, depth):
        for s in (-width / 2, width / 2):
            for zz in (z0, z1):
                vs.append(bm.verts.new((cu + nu * (r + dd) + tu * s, cv + nv * (r + dd) + tv * s, zp(zz))))
    bmesh.ops.convex_hull(bm, input=vs)
    return _obj("plate", bm, material)


def ring_rail(cu, cv, r, z, h, material, n=24):
    for i in range(n):
        a, b = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        p = (cu + r * math.cos(a), cv + r * math.sin(a))
        q = (cu + r * math.cos(b), cv + r * math.sin(b))
        rod((p[0], p[1], zp(z)), (p[0], p[1], zp(z + h)), 0.008, material, 4)
        rod((p[0], p[1], zp(z + h)), (q[0], q[1], zp(z + h)), 0.007, material, 4)


def pad(ground):
    box(0, 0, 2, 2, 0, 2, mat("#8e8c86", 0.95, grain=0.15, scale=8), bevel=0.01)
    box(0.08, 0.08, 1.84, 1.84, 2, 0.15, mat(ground, 0.95, grain=0.2, scale=10))
    stripe = mat("#e0b020", 0.7, grain=0.05)
    for k in range(6):
        box(0.1 + k * 0.3, 1.86, 0.15, 0.06, 2, 0.3, stripe)


FRONT = math.pi / 4


def porch(t, door, wall):
    cu, cv, r0 = t
    a = FRONT
    plate(cu, cv, r0 - 0.08, a, 2, 18, 0.36, mat(wall, 0.85), depth=0.2)
    plate(cu, cv, r0 + 0.12, a, 2.5, 15, 0.22, mat(door, 0.5, grain=0.05), depth=0.01)
    plate(cu, cv, r0 - 0.1, a, 18, 20, 0.46, mat("#6e706c", 0.7), depth=0.3)


# ---------------------------------------------------------------- pedestals


def ped_usa(team):
    pad("#6f8a45")
    white = mat("#e2e5e8", 0.55, grain=0.05, scale=30)
    lathe(1, 1, 2, [(0.9, 0), (0.36, 66)], white, segs=48, cap_top=True)
    seam = mat("#aab0b6", 0.6, grain=0)
    for z in (20, 38, 54):
        r = 0.9 - (0.9 - 0.36) * (z - 2) / 66 + 0.006
        lathe(1, 1, z, [(r, 0), (r - 0.004, 0.8)], seam, segs=48)
    grille = mat("#5b6066", 0.6, metal=0.4, grain=0)
    for a in (FRONT - 0.55, FRONT + 0.75):
        plate(1, 1, 0.84, a, 6, 20, 0.22, grille, depth=0.04)
    plate(1, 1, 0.62, FRONT + 1.3, 24, 28, 0.12, mat(team, 0.5, grain=0), depth=0.03)
    porch((1, 1, 0.9), "#26407a", "#d9dcdf")
    lathe(1, 1, 68, [(0.4, 0), (0.38, 10)], mat("#d6d9dc", 0.6, grain=0.04), cap_top=True)
    cylinder(1, 1, 0.56, 67.5, 1, mat("#8d9298", 0.5, metal=0.6, grain=0))
    ring_rail(1, 1, 0.55, 68.5, 6, mat("#e6e8ea", 0.5, metal=0.3, grain=0))
    cylinder(1, 1, 0.3, 78, 6, mat("#cfd3d7", 0.5, grain=0.03))


def ped_russia(team):
    pad("#8a8577")
    steel = mat("#5c6644", 0.7, metal=0.3, grain=0.06)
    brace = mat("#6b7650", 0.7, metal=0.3, grain=0.06)
    H = 62
    legs = [(0.25, 0.25), (1.75, 0.25), (1.75, 1.75), (0.25, 1.75)]
    top = lambda u, v: (1 + (u - 1) * 0.42, 1 + (v - 1) * 0.42)
    at = lambda u, v, tu, tv, f: (u + (tu - u) * f, v + (tv - v) * f, zp(2 + (H - 2) * f))
    for i in range(4):
        u0, v0 = legs[i]
        u1, v1 = legs[(i + 1) % 4]
        tu0, tv0 = top(u0, v0)
        tu1, tv1 = top(u1, v1)
        box(u0 - 0.11, v0 - 0.11, 0.22, 0.22, 2, 4, mat("#a8a598", 0.95, grain=0.15))
        rod(at(u0, v0, tu0, tv0, 0), at(u0, v0, tu0, tv0, 1), 0.035, steel, 8)
        for k in range(5):
            f0, f1 = k / 5, (k + 1) / 5
            rod(at(u0, v0, tu0, tv0, f0), at(u1, v1, tu1, tv1, f1), 0.012, brace, 4)
            rod(at(u1, v1, tu1, tv1, f0), at(u0, v0, tu0, tv0, f1), 0.012, brace, 4)
            rod(at(u0, v0, tu0, tv0, f1), at(u1, v1, tu1, tv1, f1), 0.016, steel, 4)
    cab = mat("#6e7a4e", 0.75, grain=0.08)
    box(0.56, 0.56, 0.88, 0.88, H, 15, cab, bevel=0.015)
    glass = mat("#2c3a4e", 0.1, grain=0, glass=True)
    box(0.64, 1.44, 0.72, 0.02, H + 7, 4, glass)
    box(1.44, 0.64, 0.02, 0.72, H + 7, 4, glass)
    box(1.44, 0.9, 0.02, 0.2, H + 1.5, 4.5, mat(team, 0.5, grain=0))
    box(0.52, 0.52, 0.96, 0.96, H + 15, 1.5, steel)
    cylinder(1, 1, 0.22, H + 16.5, 9.5, steel)


def ped_china(team):
    pad("#8d8a80")
    wall = mat("#d3d6d9", 0.7, grain=0.06, scale=24)
    frustum(1, 1, 0.82, 0.5, 2, 58, wall, 8, math.pi / 8)
    frustum(1, 1, 0.82 - 0.044 + 0.014, 0.82 - 0.072 + 0.014, 10, 5, mat(team, 0.5, grain=0), 8, math.pi / 8, cap=False)
    porch((1, 1, 0.8), "#7a1e1e", "#cfd2d5")
    glass = mat("#2c3a4e", 0.1, grain=0, glass=True)
    for a in (FRONT - 0.785, FRONT + 0.785):
        for z in range(22, 52, 10):
            r = 0.82 - 0.32 * (z + 2 - 2) / 58
            plate(1, 1, r * math.cos(math.pi / 8) - 0.005, a, z, z + 5, 0.14, glass, 0.02)
    frustum(1, 1, 0.56, 0.56, 60, 10, mat("#3c5068", 0.1, grain=0, glass=True), 16)
    for i in range(16):
        a = 2 * math.pi * i / 16
        rod((1 + 0.565 * math.cos(a), 1 + 0.565 * math.sin(a), zp(60)), (1 + 0.565 * math.cos(a), 1 + 0.565 * math.sin(a), zp(70)), 0.01, mat("#c8ccd0", 0.5, metal=0.5, grain=0), 4)
    frustum(1, 1, 0.66, 0.6, 70, 3, mat("#c9cdd1", 0.7, grain=0.04), 16)
    frustum(1, 1, 0.34, 0.32, 73, 12, mat("#c2c6cb", 0.7, grain=0.04), 24, flat=False)


def ped_europe(team):
    pad("#7e8a6a")
    conc = mat("#bdb9ae", 0.92, grain=0.14, scale=20)
    lathe(1, 1, 2, [(0.6, 0), (0.52, 64)], conc, segs=48, cap_top=True)
    joint = mat("#a09c91", 0.9, grain=0.05)
    for z in range(8, 64, 9):
        r = 0.6 - 0.08 * (z - 2) / 64 + 0.003
        lathe(1, 1, z, [(r, 0), (r, 0.5)], joint, segs=48)
    lathe(1, 1, 50, [(0.522 + 0.004, 0), (0.522 + 0.004, 5)], mat(team, 0.5, grain=0), segs=48)
    glass = mat("#2c3a4e", 0.1, grain=0, glass=True)
    for z in range(14, 46, 9):
        plate(1, 1, 0.585 - 0.08 * z / 64, FRONT, z, z + 5, 0.1, glass, 0.02)
    porch((1, 1, 0.6), "#2f3d52", "#c9c5ba")
    cylinder(1, 1, 0.76, 66, 2, mat("#9ea3a8", 0.5, metal=0.5, grain=0), segs=48)
    ring_rail(1, 1, 0.74, 68, 6, mat("#d8dbde", 0.5, metal=0.3, grain=0))
    lathe(1, 1, 68, [(0.46, 0), (0.4, 12)], mat("#c7c3b8", 0.85, grain=0.1), cap_top=True)


def ped_islamic(team):
    pad("#b9a57e")
    stone = mat("#cdb184", 0.92, grain=0.18, scale=16)
    frustum(1, 1, 0.84, 0.6, 2, 60, stone, 8, math.pi / 8)
    niche = mat("#6f5532", 0.95, grain=0.1)
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 4
        for z0, z1 in ((8, 26), (32, 48)):
            r = (0.84 - 0.24 * (z0 - 2) / 60) * math.cos(math.pi / 8) - 0.02
            plate(1, 1, r, a, z0, z1, 0.2, niche, 0.03)
            plate(1, 1, r, a, z1, z1 + 4, 0.12, niche, 0.03)
            plate(1, 1, r, a, z1 + 4, z1 + 6, 0.05, niche, 0.03)
    frustum(1, 1, 0.84 - 0.104 + 0.016, 0.84 - 0.116 + 0.016, 28, 3, mat(team, 0.5, grain=0), 8, math.pi / 8, cap=False)
    frustum(1, 1, 0.62, 0.62, 56, 6, mat("#2f7d78", 0.4, grain=0.05), 8, math.pi / 8)
    for i in range(16):
        a = 2 * math.pi * i / 16
        box(1 + math.cos(a) * 0.6 - 0.05, 1 + math.sin(a) * 0.6 - 0.05, 0.1, 0.1, 62, 4, stone)
    lathe(1, 1, 62, [(0.34, 0), (0.3, 18)], mat("#c2a679", 0.9, grain=0.12), cap_top=True)


# ---------------------------------------------------------------- antennas (built in a local frame: a = boresight, b, c = across)


class Local:
    """Points of the antenna's frame before tilting: a along the boresight (built facing straight up), b along v, c along -u."""

    def __init__(self, pivot):
        self.Z = zp(pivot)

    def p(self, a, b, c):
        return (1 - c, 1 + b, self.Z + a)


def revolve(L, profile, material, segs=40, thickness=0.0, smooth=True):
    """Surface of revolution round the boresight: profile = [(radius, a)]."""
    bm = bmesh.new()
    rings = [[bm.verts.new(L.p(a, r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs))) for i in range(segs)] for r, a in profile]
    for x, y in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((x[i], x[j], y[j], y[i]))
    ob = _obj("rev", bm, material)
    for f in ob.data.polygons:
        f.use_smooth = smooth
    if thickness:
        ob.modifiers.new("solid", "SOLIDIFY").thickness = thickness
    return ob


def lbox(L, a0, a1, b0, b1, c0, c1, material):
    bm = bmesh.new()
    vs = [bm.verts.new(L.p(a, b, c)) for a in (a0, a1) for b in (b0, b1) for c in (c0, c1)]
    bmesh.ops.convex_hull(bm, input=vs)
    return _obj("lbox", bm, material)


def sheet(L, fn, b0, b1, c0, c1, nb, nc, material, thickness=0.02):
    """Curved sheet a = fn(b, c) over a grid."""
    bm = bmesh.new()
    g = [[bm.verts.new(L.p(fn(b0 + (b1 - b0) * i / nb, c0 + (c1 - c0) * k / nc), b0 + (b1 - b0) * i / nb, c0 + (c1 - c0) * k / nc)) for k in range(nc + 1)] for i in range(nb + 1)]
    for i in range(nb):
        for k in range(nc):
            bm.faces.new((g[i][k], g[i + 1][k], g[i + 1][k + 1], g[i][k + 1]))
    ob = _obj("sheet", bm, material)
    for f in ob.data.polygons:
        f.use_smooth = True
    ob.modifiers.new("solid", "SOLIDIFY").thickness = thickness
    return ob


def dish(L, R, f, shift, face, rim, strut, mesh=False, cassegrain=False):
    n = 14
    prof = [(R * i / n, (R * i / n) ** 2 / (4 * f) - shift) for i in range(n + 1)]
    prof[0] = (0.001, prof[0][1])
    revolve(L, prof, face, segs=48, thickness=0.02)
    ra = R * R / (4 * f) - shift
    revolve(L, [(R, ra - 0.02), (R + 0.04, ra - 0.02), (R + 0.04, ra + 0.02), (R, ra + 0.02)], rim, segs=48)
    if mesh:
        for i in range(12):
            th = 2 * math.pi * i / 12
            pts = [L.p((R * k / 8) ** 2 / (4 * f) - shift + 0.012, R * k / 8 * math.cos(th), R * k / 8 * math.sin(th)) for k in range(9)]
            for a, b in zip(pts, pts[1:]):
                rod(a, b, 0.006, rim, 4)
    # Radial ribs on the back of the reflector, down to the hub.
    for i in range(8):
        th = 2 * math.pi * i / 8 + 0.2
        pts = [L.p((R * k / 8) ** 2 / (4 * f) - shift - 0.11, R * k / 8 * math.cos(th), R * k / 8 * math.sin(th)) for k in range(1, 9)]
        for a, b in zip(pts, pts[1:]):
            rod(a, b, 0.014, strut, 6)
    revolve(L, [(0.001, -shift - 0.32), (0.16, -shift - 0.3), (0.16, -shift - 0.01)], strut, segs=20)
    if cassegrain:
        sub = f * 0.92 - shift
        for i in range(4):
            th = math.pi / 4 + i * math.pi / 2
            rod(L.p(ra - 0.01, R * 0.93 * math.cos(th), R * 0.93 * math.sin(th)), L.p(sub, 0.12 * math.cos(th), 0.12 * math.sin(th)), 0.014, strut)
        revolve(L, [(0.001, sub + 0.06), (0.12, sub + 0.03), (0.2, sub)], mat("#f0f2f4", 0.4, grain=0), segs=32, thickness=0.02)
        revolve(L, [(0.09, -shift), (0.07, -shift + 0.28)], mat("#d6d9dc", 0.5, grain=0), segs=20)
    else:
        focus = f - shift
        for i in range(3):
            th = math.pi / 2 + i * 2 * math.pi / 3
            rod(L.p(ra - 0.01, R * 0.95 * math.cos(th), R * 0.95 * math.sin(th)), L.p(focus, 0, 0), 0.02, strut)
        revolve(L, [(0.05, focus - 0.15), (0.09, focus), (0.09, focus + 0.04), (0.001, focus + 0.05)], mat("#d9dcdf", 0.5, grain=0), segs=20)


def ant_array(L, st):
    W, H = 1.25, 0.5
    lbox(L, -0.04, 0.03, -W, W, -H, H, mat("#7d8a5a", 0.75, grain=0.1))
    dip = mat("#d8d4b8", 0.6, grain=0)
    for i in range(10):
        for k in range(4):
            b = -W + (2 * W) * (i + 0.5) / 10
            c = -H + (2 * H) * (k + 0.5) / 4
            lbox(L, 0.03, 0.09, b - 0.06, b + 0.06, c - 0.012, c + 0.012, dip)
    frame = mat("#4a5232", 0.6, metal=0.3, grain=0)
    for b0, b1, c0, c1 in ((-W, W, H, H), (-W, W, -H, -H), (-W, -W, -H, H), (W, W, -H, H)):
        rod(L.p(0.0, b0, c0), L.p(0.0, b1, c1), 0.022, frame)
    for i in range(1, 10):
        b = -W + 2 * W * i / 10
        rod(L.p(0.035, b, -H), L.p(0.035, b, H), 0.006, frame, 4)
    for b in (-W, -W / 2, 0, W / 2, W):
        for c in (H, -H):
            rod(L.p(-0.04, b, c), L.p(-0.35, 0, 0), 0.012, frame)
    lbox(L, -0.02, 0.03, -W * 0.8, W * 0.8, H + 0.04, H + 0.15, mat("#8f9a6a", 0.7, grain=0.05))


def ant_peel(L, st):
    W, H, f = 1.3, 0.42, 1.0
    sheet(L, lambda b, c: (b * b + c * c * 2.2) / (4 * f) - 0.15, -W, W, -H + 0.1, H + 0.1, 24, 8, mat("#dfe2e5", 0.45, metal=0.3, grain=0.03), 0.025)
    strut = mat("#7c848c", 0.5, metal=0.6, grain=0)
    for i in range(12):
        b0, b1 = -W + 2 * W * i / 12, -W + 2 * W * (i + 1) / 12
        for c in (-H + 0.1, H + 0.1):
            rod(L.p((b0 * b0 + c * c * 2.2) / 4 - 0.15, b0, c), L.p((b1 * b1 + c * c * 2.2) / 4 - 0.15, b1, c), 0.012, strut, 4)
    for b in (-W, -W / 2, 0, W / 2, W):
        rod(L.p(b * b / 4 - 0.15 - 0.02, b, 0.1), L.p(-0.35, 0, 0), 0.016, strut)
    rod(L.p(-0.15, 0, -0.3), L.p(0.75, 0, -0.42), 0.025, strut)
    lbox(L, 0.6, 0.85, -0.12, 0.12, -0.5, -0.36, mat("#5d646c", 0.5, metal=0.5, grain=0))
    lbox(L, 0.0, 0.05, -1.0, 1.0, 0.62, 0.76, mat("#cfd3d6", 0.6, grain=0.03))
    for b in (-0.4, 0.4):
        rod(L.p(0.02, b, 0.5), L.p(0.02, b, 0.62), 0.012, strut)


class Style:
    def __init__(self, pivot, elevation, pedestal, antenna, yoke):
        self.pivot, self.elevation, self.pedestal, self.antenna, self.yoke = pivot, elevation, pedestal, antenna, yoke


STYLES = {
    "usa": Style(96, 0.62, ped_usa, lambda L, t: dish(L, 1.18, 0.46, 0.32, mat("#e8eaec", 0.45, grain=0.03), mat("#d4d8dc", 0.4, metal=0.4, grain=0), mat("#c8ccd0", 0.5, metal=0.3, grain=0)), "#d4d7da"),
    "russia": Style(88, 0.16, ped_russia, ant_array, "#5c6644"),
    "china": Style(94, 0.75, ped_china, lambda L, t: dish(L, 1.05, 0.36, 0.4, mat("#e4e7ea", 0.45, grain=0.03), mat("#c8333a", 0.5, grain=0), mat("#b8bdc3", 0.5, metal=0.3, grain=0), cassegrain=True), "#b8bdc3"),
    "europe": Style(90, 0.1, ped_europe, ant_peel, "#8a9198"),
    "islamic": Style(92, 0.55, ped_islamic, lambda L, t: dish(L, 1.08, 0.5, 0.32, mat("#d8d2bc", 0.35, metal=0.6, grain=0.02), mat("#c9a64a", 0.25, metal=0.9, grain=0), mat("#a8916a", 0.5, metal=0.4, grain=0), mesh=True), "#a8916a"),
}


def _parent(objs, empty):
    bpy.context.view_layer.update()
    inv = empty.matrix_world.inverted()
    for o in objs:
        o.parent = empty
        o.matrix_parent_inverse = inv


def radar(faction):
    st = STYLES[faction]
    team = TEAM[faction]
    height = st.pivot + TOP
    st.pedestal(team)
    pedestal = list(bpy.data.objects)
    render(f"radar-{faction}", (2, 2), height)
    for o in pedestal:
        if o.type == "MESH":
            o.hide_render = True
    sc = bpy.context.scene
    sc.cycles.samples = 24
    # Antenna: yoke turns with the azimuth empty, the reflector also tilts on the elevation empty.
    L = Local(st.pivot)
    before = set(bpy.data.objects)
    yoke = mat(st.yoke, 0.5, metal=0.4, grain=0.03)
    cylinder(1, 1, 0.3, st.pivot - 13, 3, yoke)
    for b in (-0.3, 0.3):
        rod((1, 1 + b, zp(st.pivot - 10)), (1 - 0.0, 1 + b, zp(st.pivot)), 0.04, yoke)
    rod((1, 0.62, zp(st.pivot)), (1, 1.38, zp(st.pivot)), 0.03, yoke)
    box(0.48, 0.86, 0.22, 0.28, st.pivot - 10, 6, mat("#5a5e62", 0.6, metal=0.5, grain=0))
    yoke_objs = [o for o in bpy.data.objects if o not in before]
    before = set(bpy.data.objects)
    st.antenna(L, team)
    ant_objs = [o for o in bpy.data.objects if o not in before]
    az = bpy.data.objects.new("az", None)
    sc.collection.objects.link(az)
    az.location = (1, 1, L.Z)
    tilt = bpy.data.objects.new("tilt", None)
    sc.collection.objects.link(tilt)
    tilt.location = (1, 1, L.Z)
    _parent(ant_objs, tilt)
    tilt.rotation_euler = (-(math.pi / 2 - st.elevation), 0, 0)
    _parent(yoke_objs + [tilt], az)
    for k in range(N_FRAMES):
        heading = 2 * math.pi * k / N_FRAMES
        # Game heading: from +u (Blender +y) towards +v (Blender +x).
        az.rotation_euler = (0, 0, -heading)
        name = f"radar-{faction}-ant{k:02d}"
        if k == 0:
            render(name, (2, 2), height)
        else:
            sc.render.filepath = os.path.join(OUT, f"building-{name}.png")
            bpy.ops.render.render(write_still=True)


MODELS = {f"radar-{n}": (lambda n=n: radar(n)) for n in TEAM}
