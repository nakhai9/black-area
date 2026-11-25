"""USA Barracks (5 × 3): West Point — Davis Barracks in the Military Academy's gray granite Gothic: a long six-storey
block with buttress piers, crenellated parapet and corner turrets, a tall glass atrium framed by two pale limestone
pylons with the Academy crest, an arched gate at its foot, solar tubes on the roof and a lamp-lit plaza in front.

ART_GUIDE detail pass (architecture unchanged): windows set back behind limestone frames with a mullion, lintel and
sill; granite coursing on both visible faces; a limestone string course over the ground floor; a coping on the
merlons; string courses and arrow slits on the turrets; roof membrane with joints, louvred plant boxes, a hatch and
vents beside the solar tubes; coursing on the pylons; a limestone surround with a keystone on the arched gate;
planter shrubs as irregular leaf clumps in two greens. Team colour (TEAM["usa"]): the crest centre (as before), a band
under the cornice on the front and side faces and a band on each pylon.
Own geometry only (kit primitives and materials)."""
from kit import box, dome, mat, render, TEAM
from models._damage import ruined_render

GRANITE = "#6d7076"
GRANITE_D = "#55585e"
LIME = "#c9c4b6"
GLASS = "#3d5a78"
FRAME = "#d8d4c8"
PAVE = "#b9b5ab"


def plate(face, u, v, w, d, s0, s1, z, h, m, t):
    if face == "left":
        box(u + s0, v + d, s1 - s0, t, z, h, m)
    else:
        box(u + w, v + d - s1, t, s1 - s0, z, h, m)


def windows(face, u, v, w, d, z, h, cols, rows, glass, frame, margin=0.04, fill=0.42):
    """Window grid set back behind a frame (jambs, mullion, lintel) with a sill, on a visible face."""
    L = w if face == "left" else d
    span = L * (1 - 2 * margin)
    fw = 0.014
    for c in range(cols):
        s0 = L * margin + span * (c + (1 - fill) / 2) / cols
        s1 = s0 + span * fill / cols
        for r in range(rows):
            z0 = z + h * (r + 0.2) / rows
            zh = h * 0.6 / rows
            plate(face, u, v, w, d, s0, s1, z0, zh, glass, 0.006)
            plate(face, u, v, w, d, s0 - fw, s0, z0, zh, frame, 0.02)
            plate(face, u, v, w, d, s1, s1 + fw, z0, zh, frame, 0.02)
            plate(face, u, v, w, d, (s0 + s1) / 2 - 0.006, (s0 + s1) / 2 + 0.006, z0, zh, frame, 0.016)
            plate(face, u, v, w, d, s0 - fw, s1 + fw, z0 + zh, 0.7, frame, 0.024)
            plate(face, u, v, w, d, s0 - fw * 1.5, s1 + fw * 1.5, z0 - 0.7, 0.6, frame, 0.03)


def west_point(damage=0):
    gran = mat(GRANITE, 0.9, grain=0.28, scale=40)
    gran_d = mat(GRANITE_D, 0.9, grain=0.25, scale=40)
    lime = mat(LIME, 0.75, grain=0.12, scale=20)
    lime_d = mat("#aaa496", 0.8, grain=0.05)
    glass = mat(GLASS, 0.1, grain=0, glass=True)
    frame = mat(FRAME, 0.6, grain=0)
    dark = mat("#2a2c30", 0.5, grain=0)
    team = mat(TEAM["usa"], 0.5, grain=0)

    # Plaza in front (sunk flush with the ground by kit.render) with a darker paved centre and joints.
    box(0.02, 0.02, 4.96, 2.96, 0, 1, mat(PAVE, 0.95, grain=0.12, scale=10))
    box(1.9, 2.0, 1.2, 0.98, 1, 0.1, mat("#8f8c85", 0.95, grain=0.15, scale=14))
    pj = mat("#8e8a82", 0.95, grain=0)
    for k in range(1, 12):
        box(k * 0.42, 2.0, 0.006, 0.98, 1, 0.08, pj)
    for k in range(1, 4):
        box(0.02, 2.0 + k * 0.24, 4.96, 0.006, 1, 0.08, pj)

    # Main block: plinth course, six storeys, cornice band.
    u0, v0, w, d, H = 0.1, 0.25, 4.8, 1.7, 40
    box(u0 - 0.03, v0 - 0.03, w + 0.06, d + 0.06, 1, 4, gran_d)
    box(u0, v0, w, d, 1, H, gran)
    for k in range(1, 9):  # granite coursing on the visible faces
        zz = 5 + k * (H - 5) / 9
        box(u0, v0 + d, w, 0.003, zz, 0.2, gran_d)
        box(u0 + w, v0, 0.003, d, zz, 0.2, gran_d)
    for face in ("left", "right"):
        windows(face, u0, v0, w, d, 5, H - 6, 18 if face == "left" else 6, 6, glass, frame, margin=0.04, fill=0.42)
    box(u0 - 0.012, v0 - 0.012, w + 0.024, d + 0.024, 8.4, 0.5, lime)  # string course over the ground floor
    box(u0 - 0.014, v0 - 0.014, w + 0.028, d + 0.028, H - 0.2, 0.9, team)  # team band under the cornice
    box(u0 - 0.02, v0 - 0.02, w + 0.04, d + 0.04, H + 1, 1.2, lime)
    # Buttress piers up the front and side, stepping in near the top, with weathering caps.
    for k in range(11):
        u = u0 + 0.05 + k * (w - 0.18) / 10
        box(u, v0 + d, 0.08, 0.06, 1, H - 4, gran_d)
        box(u - 0.004, v0 + d + 0.002, 0.088, 0.062, H - 4.4, 0.5, lime)
        box(u + 0.01, v0 + d, 0.06, 0.03, H - 3, 5, gran_d)
    for k in range(4):
        v = v0 + 0.05 + k * (d - 0.18) / 3
        box(u0 + w, v, 0.06, 0.08, 1, H - 4, gran_d)
        box(u0 + w + 0.002, v - 0.004, 0.062, 0.088, H - 4.4, 0.5, lime)
    # Crenellated parapet with coping.
    pz = H + 2.2
    box(u0, v0, w, 0.06, pz, 2, gran)
    box(u0, v0 + d - 0.06, w, 0.06, pz, 2, gran)
    box(u0, v0, 0.06, d, pz, 2, gran)
    box(u0 + w - 0.06, v0, 0.06, d, pz, 2, gran)
    n = 24
    for k in range(n):
        u = u0 + 0.05 + k * (w - 0.15) / (n - 1)
        box(u, v0 + d - 0.07, 0.07, 0.08, pz + 2, 2.2, gran)
        box(u, v0 - 0.01, 0.07, 0.08, pz + 2, 2.2, gran)
        box(u - 0.006, v0 + d - 0.076, 0.082, 0.092, pz + 4.2, 0.35, lime)
        box(u - 0.006, v0 - 0.016, 0.082, 0.092, pz + 4.2, 0.35, lime)
    for k in range(7):
        v = v0 + 0.05 + k * (d - 0.15) / 6
        box(u0 + w - 0.07, v, 0.08, 0.07, pz + 2, 2.2, gran)
        box(u0 + w - 0.076, v - 0.006, 0.092, 0.082, pz + 4.2, 0.35, lime)
    # Corner turrets with their own battlements, string courses and arrow slits.
    for u, v in ((u0 - 0.05, v0 - 0.05), (u0 + w - 0.25, v0 - 0.05), (u0 - 0.05, v0 + d - 0.25), (u0 + w - 0.25, v0 + d - 0.25)):
        box(u, v, 0.3, 0.3, 1, H + 8, gran_d)
        for zz in (H * 0.33, H * 0.66, H + 1.5):
            box(u - 0.008, v - 0.008, 0.316, 0.316, zz, 0.6, lime)
        for zz in (H * 0.15, H * 0.45, H * 0.78):
            box(u + 0.13, v + 0.3, 0.04, 0.004, zz, 3, dark)
            box(u + 0.3, v + 0.13, 0.004, 0.04, zz, 3, dark)
        for du, dv in ((0, 0), (0.22, 0), (0, 0.22), (0.22, 0.22)):
            box(u + du, v + dv, 0.08, 0.08, H + 9, 2.5, gran_d)
            box(u + du - 0.005, v + dv - 0.005, 0.09, 0.09, H + 11.5, 0.35, lime)
    # Roof: membrane with joints, solar collector tube rows, louvred plant boxes, a hatch and vents.
    box(u0 + 0.06, v0 + 0.06, w - 0.12, d - 0.12, H + 2.2, 0.15, mat("#4f5258", 0.9, grain=0.15, scale=20))
    jm = mat("#62656a", 0.9, grain=0)
    for k in range(1, 16):
        box(u0 + 0.06 + k * (w - 0.12) / 16 - 0.003, v0 + 0.06, 0.006, d - 0.12, H + 2.35, 0.05, jm)
    for k in range(1, 6):
        box(u0 + 0.06, v0 + 0.06 + k * (d - 0.12) / 6 - 0.003, w - 0.12, 0.006, H + 2.35, 0.05, jm)
    tubes = mat("#2b3440", 0.2, metal=0.6, grain=0)
    rail = mat("#8a8d92", 0.4, metal=0.7, grain=0)
    for k in range(9):
        box(u0 + 0.35 + k * 0.48, v0 + 0.25, 0.32, d - 0.5, H + 2.4, 1.0, tubes)
        for j in range(1, 8):  # individual tubes
            box(u0 + 0.35 + k * 0.48 + j * 0.04 - 0.003, v0 + 0.25, 0.006, d - 0.5, H + 3.4, 0.1, rail)
        box(u0 + 0.35 + k * 0.48, v0 + 0.25, 0.32, 0.02, H + 3.4, 0.4, rail)  # header manifold
    plant = mat("#9a9da2", 0.6, metal=0.4, grain=0)
    louvre = mat("#3a3d42", 0.5, metal=0.5, grain=0)
    for pu in (u0 + 0.5, u0 + 3.9):
        box(pu, v0 + 0.6, 0.4, 0.3, H + 2.4, 3, plant)
        box(pu - 0.01, v0 + 0.59, 0.42, 0.32, H + 5.4, 0.3, louvre)
        for k in range(6):
            box(pu + 0.03 + k * 0.06, v0 + 0.9, 0.035, 0.004, H + 2.9, 2.0, louvre)
            box(pu + 0.4, v0 + 0.63 + k * 0.04, 0.004, 0.025, H + 2.9, 2.0, louvre)
    box(u0 + 2.05, v0 + 0.1, 0.14, 0.14, H + 2.4, 0.8, gran_d)  # roof hatch
    for pu in (u0 + 1.2, u0 + 3.3):
        box(pu, v0 + 0.12, 0.05, 0.05, H + 2.4, 2.2, mat("#7c7f84", 0.5, metal=0.6, grain=0))

    # Central atrium: tall glass bay between two limestone pylons that rise above the roof, crest on top, arched gate.
    cu = u0 + w / 2
    fv = v0 + d
    box(cu - 0.32, fv - 0.1, 0.64, 0.32, 1, H + 12, lime)
    box(cu - 0.2, fv + 0.222, 0.4, 0.015, 9, H - 4, glass)
    for k in range(1, 5):
        box(cu - 0.2 + k * 0.08, fv + 0.236, 0.012, 0.01, 9, H - 4, frame)
    for k in range(1, 9):
        box(cu - 0.2, fv + 0.236, 0.4, 0.01, 9 + k * (H - 4) / 9, 0.5, frame)
    for s in (-1, 1):
        u = cu + s * 0.27 - 0.07
        box(u, fv - 0.1, 0.14, 0.38, 1, H + 18, lime)
        box(u + 0.02, fv + 0.26, 0.1, 0.03, H + 18, 2, lime)
        box(u - 0.004, fv - 0.104, 0.148, 0.388, H + 6, 1.0, team)  # team band on the pylon
        for zz in range(6, int(H + 16), 4):  # limestone coursing
            box(u, fv + 0.28, 0.14, 0.003, zz, 0.2, lime_d)
            box(u + 0.14, fv - 0.1, 0.003, 0.38, zz, 0.2, lime_d)
    box(cu - 0.2, fv + 0.2, 0.4, 0.05, H + 8, 8, lime)
    box(cu - 0.09, fv + 0.245, 0.18, 0.012, H + 9, 6, mat("#a39d8c", 0.6, grain=0.05))
    box(cu - 0.05, fv + 0.25, 0.1, 0.01, H + 11, 2.5, team)
    # Arched gate: limestone surround, dark opening with a pointed head, keystone.
    box(cu - 0.17, fv + 0.236, 0.34, 0.016, 1, 10.2, lime_d)
    box(cu - 0.14, fv + 0.24, 0.28, 0.016, 1, 7, dark)
    box(cu - 0.1, fv + 0.24, 0.2, 0.016, 8, 1.5, dark)
    box(cu - 0.02, fv + 0.25, 0.04, 0.012, 9.4, 1.4, lime)

    # Plaza: lamp posts and two planters with shrubs.
    post = mat("#1d1f22", 0.4, metal=0.6, grain=0)
    lamp = mat("#fff1c4", 0.3, grain=0, emit="#ffe6a0")
    for u in (1.3, 1.75, 3.25, 3.7):
        box(u - 0.01, 2.54, 0.05, 0.05, 1, 0.8, post)
        box(u, 2.55, 0.03, 0.03, 1, 9, post)
        box(u - 0.025, 2.545, 0.08, 0.04, 10, 2, lamp)
        box(u - 0.03, 2.54, 0.09, 0.05, 12, 0.4, post)
    leaf = mat("#4f7a33", 0.9, grain=0.3, scale=30)
    leaf2 = mat("#3c6328", 0.9, grain=0.3, scale=30)
    soil = mat("#4a3a2a", 0.95, grain=0.3)
    for u in (0.6, 4.1):
        box(u, 2.3, 0.4, 0.3, 1, 2, gran_d)
        box(u - 0.01, 2.29, 0.42, 0.32, 3, 0.3, lime)  # coping
        box(u + 0.04, 2.34, 0.32, 0.22, 3, 0.4, soil)
        for k, (du, dv, r, hh) in enumerate(((0.1, 0.1, 0.07, 3.0), (0.2, 0.08, 0.06, 2.6), (0.29, 0.14, 0.065, 2.8), (0.15, 0.2, 0.06, 2.4), (0.26, 0.22, 0.05, 2.2))):
            dome(u + du, 2.3 + dv, r, 3.3, hh, leaf if k % 2 == 0 else leaf2, segs=10, rings=5)
    ruined_render("barracks-usa-westpoint", (5, 3), 66, damage, flag=(2.5, 2.05, 52), seed=1)


MODELS = {"barracks-usa-westpoint": west_point, **{f"barracks-usa-westpoint-d{d}": (lambda d=d: west_point(d)) for d in (1, 2, 3)}}
