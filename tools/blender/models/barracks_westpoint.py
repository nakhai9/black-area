"""USA Barracks (5 × 3): West Point — Davis Barracks in the Military Academy's gray granite Gothic: a long six-storey
block with buttress piers, crenellated parapet and corner turrets, a tall glass atrium framed by two pale limestone
pylons with the Academy crest, an arched gate at its foot, solar tubes on the roof and a lamp-lit plaza in front."""
from kit import box, mat, render, windows, TEAM

GRANITE = "#6d7076"
GRANITE_D = "#55585e"
LIME = "#c9c4b6"
GLASS = "#3d5a78"
FRAME = "#d8d4c8"
PAVE = "#b9b5ab"


def west_point():
    gran = mat(GRANITE, 0.9, grain=0.28, scale=40)
    gran_d = mat(GRANITE_D, 0.9, grain=0.25, scale=40)
    lime = mat(LIME, 0.75, grain=0.12, scale=20)
    glass = mat(GLASS, 0.1, grain=0, glass=True)
    frame = mat(FRAME, 0.6, grain=0)
    dark = mat("#2a2c30", 0.5, grain=0)
    team = mat(TEAM["usa"], 0.5, grain=0)

    # Plaza in front (sunk flush with the ground by kit.render) with a darker paved centre.
    box(0.02, 0.02, 4.96, 2.96, 0, 1, mat(PAVE, 0.95, grain=0.12, scale=10))
    box(1.9, 2.0, 1.2, 0.98, 1, 0.1, mat("#8f8c85", 0.95, grain=0.15, scale=14))

    # Main block: plinth course, six storeys, cornice band.
    u0, v0, w, d, H = 0.1, 0.25, 4.8, 1.7, 40
    box(u0 - 0.03, v0 - 0.03, w + 0.06, d + 0.06, 1, 4, gran_d)
    box(u0, v0, w, d, 1, H, gran)
    for face in ("left", "right"):
        windows(face, u0, v0, w, d, 5, H - 6, 18 if face == "left" else 6, 6, glass, frame, margin=0.04, fill=0.42)
    box(u0 - 0.02, v0 - 0.02, w + 0.04, d + 0.04, H + 1, 1.2, lime)
    # Buttress piers up the front and side, stepping in near the top.
    for k in range(11):
        u = u0 + 0.05 + k * (w - 0.18) / 10
        box(u, v0 + d, 0.08, 0.06, 1, H - 4, gran_d)
        box(u + 0.01, v0 + d, 0.06, 0.03, H - 3, 5, gran_d)
    for k in range(4):
        v = v0 + 0.05 + k * (d - 0.18) / 3
        box(u0 + w, v, 0.06, 0.08, 1, H - 4, gran_d)
    # Crenellated parapet.
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
    for k in range(7):
        v = v0 + 0.05 + k * (d - 0.15) / 6
        box(u0 + w - 0.07, v, 0.08, 0.07, pz + 2, 2.2, gran)
    # Corner turrets with their own battlements.
    for u, v in ((u0 - 0.05, v0 - 0.05), (u0 + w - 0.25, v0 - 0.05), (u0 - 0.05, v0 + d - 0.25), (u0 + w - 0.25, v0 + d - 0.25)):
        box(u, v, 0.3, 0.3, 1, H + 8, gran_d)
        for du, dv in ((0, 0), (0.22, 0), (0, 0.22), (0.22, 0.22)):
            box(u + du, v + dv, 0.08, 0.08, H + 9, 2.5, gran_d)
    # Roof: solar collector tube rows and plant boxes.
    tubes = mat("#2b3440", 0.2, metal=0.6, grain=0)
    for k in range(9):
        box(u0 + 0.35 + k * 0.48, v0 + 0.25, 0.32, d - 0.5, H + 2.2, 1.0, tubes)
    box(u0 + 0.5, v0 + 0.6, 0.4, 0.3, H + 2.2, 3, mat("#9a9da2", 0.6, metal=0.4, grain=0))
    box(u0 + 3.9, v0 + 0.6, 0.4, 0.3, H + 2.2, 3, mat("#9a9da2", 0.6, metal=0.4, grain=0))

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
    box(cu - 0.2, fv + 0.2, 0.4, 0.05, H + 8, 8, lime)
    box(cu - 0.09, fv + 0.245, 0.18, 0.012, H + 9, 6, mat("#a39d8c", 0.6, grain=0.05))
    box(cu - 0.05, fv + 0.25, 0.1, 0.01, H + 11, 2.5, team)
    # Arched gate: dark opening with a pointed head.
    box(cu - 0.14, fv + 0.24, 0.28, 0.012, 1, 7, dark)
    box(cu - 0.1, fv + 0.24, 0.2, 0.012, 8, 1.5, dark)

    # Plaza: lamp posts and two planters.
    post = mat("#1d1f22", 0.4, metal=0.6, grain=0)
    lamp = mat("#fff1c4", 0.3, grain=0, emit="#ffe6a0")
    for u in (1.3, 1.75, 3.25, 3.7):
        box(u, 2.55, 0.03, 0.03, 1, 9, post)
        box(u - 0.025, 2.545, 0.08, 0.04, 10, 2, lamp)
    leaf = mat("#4f7a33", 0.9, grain=0.3, scale=30)
    for u in (0.6, 4.1):
        box(u, 2.3, 0.4, 0.3, 1, 2, gran_d)
        box(u + 0.05, 2.33, 0.3, 0.24, 3, 2.5, leaf)
    render("barracks-usa-westpoint", (5, 3), 66)


MODELS = {"barracks-usa-westpoint": west_point}
