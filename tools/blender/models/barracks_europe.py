"""Europe's Barracks (5 × 3): NATO headquarters, Brussels — interlocking glass "fingers" under arched roofs off a central spine."""
import math

import bmesh

from kit import _obj, box, mat, render, rod, zp

GLASS = "#3b4a5a"
FIN = "#c9ccd0"
ROOF = "#b9bcc0"
END = "#2b3036"
PAVE = "#c8c4ba"
LAWN = "#5f8a3e"
TEAM = "#6532d6"


def finger(v, d, u0, u1, h_low, h_high):
    """A wing d tiles deep running along u from u0 (its high end, at the spine) to u1 (its low outer end): glass sides with fins under a roof that
    arches smoothly down from h_high to h_low."""
    n = 28
    prof = lambda t: h_low + (h_high - h_low) * math.cos(t * math.pi / 2)
    bm = bmesh.new()
    sections = []
    for i in range(n + 1):
        t = i / n
        u = u0 + (u1 - u0) * t
        h = prof(t)
        sections.append([bm.verts.new(p) for p in ((u, v, 0), (u, v + d, 0), (u, v + d, zp(h)), (u, v, zp(h)))])
    for a, b in zip(sections, sections[1:]):
        bm.faces.new((a[0], b[0], b[3], a[3])).material_index = 0
        bm.faces.new((a[1], a[2], b[2], b[1])).material_index = 0
        bm.faces.new((a[3], b[3], b[2], a[2])).material_index = 1
    for s in (sections[0], sections[-1]):
        bm.faces.new(s).material_index = 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("finger", bm, [mat(GLASS, 0.1, grain=0, glass=True), mat(ROOF, 0.45, metal=0.6, grain=0.04), mat(END, 0.25, metal=0.4, grain=0)])
    # Slanted louvre fins on both long sides (the facade's diagonal pattern), kept under the roof line.
    fin = mat(FIN, 0.5, metal=0.3, grain=0)
    m = 30
    for i in range(1, m):
        t = i / m
        u = u0 + (u1 - u0) * t
        h = prof(t) - 1.2
        for vv in (v - 0.012, v + d - 0.008):
            rod((u, vv, zp(0.6)), (u + 0.06, vv, zp(h)), 0.009, fin, 4)
    # Roof edge trims.
    trim = mat("#8f9398", 0.4, metal=0.6, grain=0)
    for k in range(n):
        ta, tb = k / n, (k + 1) / n
        for vv in (v - 0.01, v + d - 0.01):
            rod((u0 + (u1 - u0) * ta, vv + 0.01, zp(prof(ta))), (u0 + (u1 - u0) * tb, vv + 0.01, zp(prof(tb))), 0.012, trim, 4)


def barracks_europe():
    # Paving with lawn strips between the wings.
    box(0.02, 0.02, 4.96, 2.96, 0, 0.6, mat(PAVE, 0.95, grain=0.1, scale=10))
    for k in range(5):
        v = 0.49 + k * 0.47
        box(0.15, v, 4.7, 0.08, 0.6, 0.4, mat(LAWN, 0.95, grain=0.25, scale=25))
    # Central spine across the wings (along v), lower than their crowns, glazed.
    box(2.3, 0.1, 0.4, 2.8, 0.6, 11, mat("#d8d8d4", 0.7, grain=0.05))
    box(2.28, 0.08, 0.44, 2.84, 11.6, 1.0, mat("#9a9da2", 0.5, metal=0.5, grain=0))
    box(2.7, 0.1, 0.012, 2.8, 3, 7, mat(GLASS, 0.1, grain=0, glass=True))
    # Four wings interlocking like fingers: they reach alternately from the left and the right end, each arching up
    # high at the spine and sloping down towards its outer end.
    d = 0.34
    for k in range(6):
        v = 0.12 + k * 0.47
        if k % 2 == 0:
            finger(v, d, 2.2, 4.85, 9, 22)
        else:
            finger(v, d, 2.8, 0.15, 9, 22)
    # Entrance on the front of the spine: dark portal under a team-colour canopy.
    box(2.35, 2.9, 0.3, 0.06, 0.6, 8, mat(END, 0.3, metal=0.4, grain=0))
    box(2.25, 2.9, 0.5, 0.2, 8.6, 0.8, mat(TEAM, 0.5, grain=0))
    render("barracks-europe", (5, 3), 36)


MODELS = {"barracks-europe": barracks_europe}
