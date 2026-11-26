"""Nordursia Reserve Capital (3 x 4): the Winter Palace (Saint Petersburg), Rastrelli's baroque palace.

Layout after the plans and photos, front on +u (the Palace Square side), long side along v:
- a closed quadrangle round a paved main courtyard: front, rear and two side wings, all the same height;
- a rusticated ground floor (stone courses) and two upper storeys: mint-green walls, every window in a white
  architrave with sill, sashes and keystone; the main floor carries alternating triangular and segmental pediments;
- white engaged columns in two orders (plinth, base, tapered shaft, gilded capital, abacus) between the window bays,
  a three-part entablature (architrave, frieze, dentil cornice) between the orders and a heavy modillion cornice;
- projecting pavilions (risalits) at the middle of the front and at the corners, with paired columns and their own cornice;
- the main gate in the middle risalit: three arched openings with gilded wrought-iron gates, a pediment with the gilded arms;
- on the roof: a balustrade round the outer edges with statues and urns on plinths, green-grey sheet-metal
  hipped roofs with standing seams, round dormers, chimneys with caps;
- the courtyard: grid stone paving, a round lawn bed and lamp posts; the square in front paved, with lamp posts.
Team colour (TEAM["russia"]): a band right under the cornice of the front and side faces.

Plot: u 0..3 (front +u), v 0..4. Own geometry only (kit primitives and materials).
Rendered at SCALE 5 (sharper than the default 3): ReserveCapital.ts carries scale 5 for this design.
"""
import math

import kit
from kit import box, cylinder, lathe, mat, roof, rod, zp, TEAM
from models._damage import ruined_render

W, D = 3, 4
Z0 = 1.0
GROUND = 7.0
UPPER = 15.0
CORNICE = Z0 + GROUND + UPPER
TOP = CORNICE + 7.5
RENDER_SCALE = 5


def _plate(face, at):
    def plate(s0, s1, z, h, m, out=0.0, thick=0.012, bevel=0.0):
        if face == "u":
            return box(at + out, s0, thick, s1 - s0, z, h, m, bevel)
        return box(s0, at + out, s1 - s0, thick, z, h, m, bevel)
    return plate


def _pt(face, at, out, s, z):
    return (at + out, s, zp(z)) if face == "u" else (s, at + out, zp(z))


def pediment(face, at, out, c, half, z, rise, m, r=0.006):
    """Triangular pediment: two raking cornices and a base."""
    a, b, t = _pt(face, at, out, c - half, z), _pt(face, at, out, c + half, z), _pt(face, at, out, c, z + rise)
    rod(a, t, r, m)
    rod(t, b, r, m)
    rod(a, b, r * 0.8, m)


def segmental(face, at, out, c, half, z, rise, m, r=0.006, n=6):
    """Segmental (arched) pediment: a shallow arc of short rods over a base."""
    pts = [_pt(face, at, out, c - half + 2 * half * k / n, z + rise * math.sin(math.pi * k / n)) for k in range(n + 1)]
    for p, q in zip(pts, pts[1:]):
        rod(p, q, r, m)
    rod(pts[0], pts[-1], r * 0.8, m)


def window(plate, face, at, c, hw, z, h, white, glass, frame, kind):
    """White architrave, glass set back, sash grid, sill, keystone and (main floor) a pediment."""
    plate(c - hw - 0.014, c + hw + 0.014, z - 0.45, h + 0.9, white, 0.004)
    plate(c - hw, c + hw, z, h, glass, 0.009)
    plate(c - hw * 0.08, c + hw * 0.08, z, h, frame, 0.0115)  # mullion
    for f in (0.33, 0.66):
        plate(c - hw, c + hw, z + h * f - 0.12, 0.24, frame, 0.0115)  # transoms
    plate(c - hw - 0.022, c + hw + 0.022, z - 0.75, 0.38, white, 0.006, 0.02)  # sill
    plate(c - hw * 0.22, c + hw * 0.22, z + h + 0.05, 0.7, white, 0.007, 0.016)  # keystone
    if kind == "tri":
        pediment(face, at, 0.016, c, hw + 0.03, z + h + 0.75, 1.2, white)
    elif kind == "seg":
        segmental(face, at, 0.016, c, hw + 0.03, z + h + 0.75, 1.0, white)


def column(face, at, c, z, h, white, gold, r=0.02):
    uu, vv = (at + 0.022, c) if face == "u" else (c, at + 0.022)
    box(uu - r * 1.5, vv - r * 1.5, r * 3, r * 3, z, 0.45, white, 0.002)  # plinth
    lathe(uu, vv, z + 0.45, [(r * 1.35, 0), (r * 1.35, 0.2), (r * 1.1, 0.35), (r, 0.5)], white, segs=16, cap_bottom=True)
    lathe(uu, vv, z + 0.95, [(r, 0), (r * 0.92, h - 1.6)], white, segs=16)  # tapered shaft
    lathe(uu, vv, z + h - 0.65, [(r * 0.95, 0), (r * 1.25, 0.35), (r * 1.45, 0.55), (r * 1.45, 0.65)], gold, segs=16, cap_top=True)
    box(uu - r * 1.6, vv - r * 1.6, r * 3.2, r * 3.2, z + h, 0.2, white)  # abacus


def facade(face, a0, a1, at, wall, white, stone, glass, frame, gold, team, bays, pediments=True, paired=False):
    """One visible face ("u" = the +u front at u = at spanning v a0..a1; "v" = the +v side at v = at spanning u a0..a1)."""
    plate = _plate(face, at)
    span = a1 - a0
    plate(a0, a1, Z0, GROUND + UPPER, wall, -0.005, 0.01)
    # Rusticated ground floor: stone courses.
    plate(a0, a1, Z0, GROUND - 0.4, stone, 0.0, 0.008)
    for k in range(1, 6):
        plate(a0, a1, Z0 + k * 1.1, 0.12, wall, 0.0085, 0.002)
    plate(a0 - 0.01, a1 + 0.01, Z0, 0.6, white, 0.002, 0.016)  # base course
    for k in range(bays):
        c = a0 + (k + 0.5) * span / bays
        hw = span / bays * 0.19
        window(plate, face, at, c, hw, Z0 + 1.7, 3.4, white, glass, frame, None)
        kind = ("tri" if k % 2 == 0 else "seg") if pediments else None
        window(plate, face, at, c, hw, Z0 + GROUND + 1.4, 5.2, white, glass, frame, kind)
        window(plate, face, at, c, hw * 0.95, Z0 + GROUND + 9.4, 3.4, white, glass, frame, None)
        plate(c - hw * 0.8, c + hw * 0.8, Z0 + GROUND + 8.0, 0.6, white, 0.008, 0.008)  # panel between storeys
    for k in range(bays + 1):
        c = a0 + k * span / bays
        r = 0.016 if paired else 0.02
        for o in ((-0.022, 0.022) if paired else (0.0,)):
            column(face, at, c + o, Z0 + 0.6, GROUND - 1.2, white, gold, r)
            column(face, at, c + o, Z0 + GROUND + 0.6, UPPER - 1.4, white, gold, r)
    # Entablature between the orders: architrave, frieze, dentil cornice.
    ez = Z0 + GROUND - 0.6
    plate(a0, a1, ez, 0.35, white, 0.02, 0.03)
    plate(a0, a1, ez + 0.35, 0.5, wall, 0.018, 0.026)
    plate(a0 - 0.01, a1 + 0.01, ez + 0.85, 0.3, white, 0.024, 0.036)
    n = max(4, round(span / 0.03))
    for k in range(n):
        s = a0 + (k + 0.5) * span / n
        plate(s - 0.006, s + 0.006, ez + 0.6, 0.25, white, 0.045, 0.012)  # dentils
    # Upper entablature, team band and modillion cornice.
    plate(a0, a1, CORNICE - 2.0, 0.4, white, 0.02, 0.03)
    plate(a0, a1, CORNICE - 1.6, 0.9, team, 0.024, 0.012)
    plate(a0 - 0.02, a1 + 0.02, CORNICE - 0.7, 0.35, white, 0.028, 0.04, 0.003)
    m = max(4, round(span / 0.045))
    for k in range(m):
        s = a0 + (k + 0.5) * span / m
        plate(s - 0.008, s + 0.008, CORNICE - 0.4, 0.4, white, 0.05, 0.028)  # modillions
    plate(a0 - 0.035, a1 + 0.035, CORNICE, 0.7, white, 0.04, 0.05, 0.004)  # corona


def balustrade(face, a0, a1, at, white, statue, gold, step):
    """Roof balustrade along an edge: vase balusters, rail, plinths with statues and urns every `step` tiles."""
    if face == "u":
        box(at - 0.045, a0, 0.05, a1 - a0, CORNICE + 0.7, 0.4, white)
        box(at - 0.05, a0, 0.06, a1 - a0, CORNICE + 2.0, 0.3, white, 0.003)
    else:
        box(a0, at - 0.045, a1 - a0, 0.05, CORNICE + 0.7, 0.4, white)
        box(a0, at - 0.05, a1 - a0, 0.06, CORNICE + 2.0, 0.3, white, 0.003)
    n = max(2, round((a1 - a0) / 0.022))
    for k in range(n + 1):
        c = a0 + k * (a1 - a0) / n
        uu, vv = (at - 0.02, c) if face == "u" else (c, at - 0.02)
        lathe(uu, vv, CORNICE + 1.1, [(0.005, 0), (0.009, 0.3), (0.006, 0.7), (0.005, 0.9)], white, segs=8)
    m = max(2, round((a1 - a0) / step))
    for k in range(m + 1):
        c = a0 + k * (a1 - a0) / m
        uu, vv = (at - 0.02, c) if face == "u" else (c, at - 0.02)
        box(uu - 0.024, vv - 0.024, 0.048, 0.048, CORNICE + 2.3, 0.55, white)
        box(uu - 0.028, vv - 0.028, 0.056, 0.056, CORNICE + 2.85, 0.15, white)
        if k % 2 == 0:  # statue: drapery, torso, shoulders, neck, head, raised arm
            lathe(uu, vv, CORNICE + 3.0, [(0.017, 0), (0.015, 1.4), (0.011, 2.4), (0.014, 2.7), (0.006, 2.85),
                                           (0.007, 3.0), (0.008, 3.25), (0.004, 3.45), (0.0, 3.5)], statue, segs=12)
            rod((uu, vv + 0.012, zp(CORNICE + 5.6)), (uu + 0.004, vv + 0.022, zp(CORNICE + 6.8)), 0.0035, statue)
        else:  # urn with a gilded flame
            lathe(uu, vv, CORNICE + 3.0, [(0.008, 0), (0.012, 0.3), (0.021, 1.0), (0.023, 1.5), (0.014, 2.0),
                                           (0.018, 2.2), (0.0, 2.35)], statue, segs=14)
            lathe(uu, vv, CORNICE + 5.3, [(0.006, 0), (0.0, 0.9)], gold, segs=8)


def lamp(u, v, iron, glow):
    cylinder(u, v, 0.006, Z0, 4.5, iron, 8)
    lathe(u, v, Z0 + 4.5, [(0.012, 0), (0.016, 0.5), (0.008, 1.1), (0.0, 1.3)], glow, segs=10)


def reserve_capital_russia(damage=0):
    team = mat(TEAM["russia"], 0.5, grain=0)
    wall = mat("#7fb59c", 0.72, grain=0.08, scale=60)  # Winter Palace mint green
    stone = mat("#76aa92", 0.8, grain=0.14, scale=90)  # rusticated ground floor
    white = mat("#eeeae0", 0.55, grain=0.05, scale=80)
    gold = mat("#d4af4f", 0.25, metal=0.95, grain=0)
    glass = mat("#26343f", 0.06, grain=0, glass=True)
    frame = mat("#f4f1ea", 0.5, grain=0)
    statue = mat("#c9c3b4", 0.6, grain=0.1, scale=120)
    roof_m = mat("#5f6e66", 0.5, metal=0.45, grain=0.06, scale=40)
    seam = mat("#4b5851", 0.45, metal=0.5, grain=0)
    paving = mat("#9b958b", 0.85, grain=0.18, scale=70)
    joint = mat("#7f7a71", 0.9, grain=0.1)
    lawn = mat("#5d7a43", 0.95, grain=0.3, scale=120)
    iron = mat("#22262a", 0.45, metal=0.7, grain=0)
    glow = mat("#fff1c4", 0.3, grain=0, emit="#ffe9a8")

    box(0, 0, W, D, 0, 1, paving)  # the square round it (sunk flush by kit.render)
    for k in range(1, 15):  # paving joints
        box(k * 0.2, 0, 0.004, D, 1.0, 0.05, joint)
    for k in range(1, 20):
        box(0, k * 0.2, W, 0.004, 1.0, 0.05, joint)

    u_lo, u_hi, v_lo, v_hi = 0.25, 2.75, 0.2, 3.8
    wings = (
        (2.15, v_lo, u_hi - 2.15, v_hi - v_lo),  # front wing
        (u_lo, v_lo, 0.55, v_hi - v_lo),  # rear wing
        (u_lo, v_lo, u_hi - u_lo, 0.55),  # -v side wing
        (u_lo, v_hi - 0.55, u_hi - u_lo, 0.55),  # +v side wing
    )
    for wu, wv, ww, wd in wings:
        box(wu, wv, ww, wd, Z0, GROUND + UPPER, wall)
        box(wu - 0.01, wv - 0.01, ww + 0.02, wd + 0.02, CORNICE - 0.6, 1.0, white)

    # Courtyard: grid paving, round lawn bed with a stone border, lamp posts, window rows on the inner faces.
    box(0.8, 0.75, 1.35, 2.5, Z0, 0.3, paving)
    for k in range(1, 7):
        box(0.8 + k * 0.19, 0.75, 0.004, 2.5, Z0 + 0.3, 0.05, joint)
    for k in range(1, 13):
        box(0.8, 0.75 + k * 0.19, 1.35, 0.004, Z0 + 0.3, 0.05, joint)
    cylinder(1.47, 2.0, 0.42, Z0 + 0.3, 0.3, white, 48)
    cylinder(1.47, 2.0, 0.40, Z0 + 0.3, 0.45, lawn, 48)
    for (lu, lv) in ((1.0, 1.0), (1.95, 1.0), (1.0, 3.0), (1.95, 3.0)):
        lamp(lu, lv, iron, glow)
    for k in range(10):
        c = 0.85 + k * 0.24
        for z in (Z0 + 1.8, Z0 + GROUND + 2, Z0 + GROUND + 9.5):
            h = 3.6 if z > Z0 + 2 else 3.0
            box(0.8, c, 0.008, 0.08, z, h, glass)
            box(0.803, c - 0.012, 0.006, 0.104, z - 0.4, 0.4, white)
            if c < 2.1:
                box(c - 0.04, 0.75, 0.08, 0.008, z, h, glass)
                box(c - 0.052, 0.753, 0.104, 0.006, z - 0.4, 0.4, white)

    # Visible facades: the long front (+u) and the +v side.
    facade("u", v_lo, v_hi, u_hi, wall, white, stone, glass, frame, gold, team, 16)
    facade("v", u_lo, u_hi, v_hi, wall, white, stone, glass, frame, gold, team, 11)

    # Risalits with paired columns.
    for (r0, r1) in ((1.65, 2.35), (v_lo, v_lo + 0.45), (v_hi - 0.45, v_hi)):
        box(u_hi, r0, 0.08, r1 - r0, Z0, GROUND + UPPER, wall)
        facade("u", r0, r1, u_hi + 0.08, wall, white, stone, glass, frame, gold, team, 3, paired=True)
        box(u_hi - 0.02, r0 - 0.02, 0.14, r1 - r0 + 0.04, CORNICE - 0.6, 1.4, white, 0.004)
    for (r0, r1) in ((u_hi - 0.45, u_hi), (u_lo, u_lo + 0.45)):
        box(r0, v_hi, r1 - r0, 0.08, Z0, GROUND + UPPER, wall)
        facade("v", r0, r1, v_hi + 0.08, wall, white, stone, glass, frame, gold, team, 3, paired=True)
        box(r0 - 0.02, v_hi - 0.02, r1 - r0 + 0.04, 0.14, CORNICE - 0.6, 1.4, white, 0.004)

    # Main gate: three arched openings with gilded wrought-iron gates.
    for k in range(3):
        c = 1.78 + k * 0.22
        box(u_hi + 0.088, c - 0.01, 0.01, 0.18, Z0, 5.6, white)
        box(u_hi + 0.092, c, 0.008, 0.16, Z0, 4.6, iron)
        pts = [(u_hi + 0.1, c + 0.08 - 0.08 * math.cos(math.pi * j / 8), zp(Z0 + 4.6 + 0.9 * math.sin(math.pi * j / 8))) for j in range(9)]
        for p, q in zip(pts, pts[1:]):
            rod(p, q, 0.005, gold)
        for j in range(7):
            box(u_hi + 0.1, c + 0.01 + j * 0.023, 0.005, 0.004, Z0, 4.6, gold)
            lathe(u_hi + 0.102, c + 0.012 + j * 0.023, Z0 + 4.6, [(0.004, 0), (0.0, 0.5)], gold, segs=6)
        box(u_hi + 0.1, c, 0.006, 0.16, Z0 + 2.2, 0.25, gold)
    # Pediment over the middle risalit with the gilded double-headed arms.
    box(u_hi + 0.06, 1.75, 0.05, 0.5, CORNICE + 0.7, 0.4, white)
    box(u_hi + 0.065, 1.78, 0.03, 0.44, CORNICE + 1.1, 1.6, white)
    pediment("u", u_hi, 0.1, 2.0, 0.27, CORNICE + 0.8, 3.0, white, 0.012)
    box(u_hi + 0.1, 1.95, 0.008, 0.1, CORNICE + 1.3, 1.4, gold)
    for s in (-1, 1):
        rod((u_hi + 0.104, 2.0, zp(CORNICE + 2.0)), (u_hi + 0.104, 2.0 + s * 0.07, zp(CORNICE + 2.9)), 0.006, gold)
    lathe(u_hi + 0.104, 2.0, CORNICE + 2.7, [(0.012, 0), (0.014, 0.4), (0.0, 0.9)], gold, segs=10)

    # Roofs: hipped sheet metal, standing seams, round dormers, chimneys with caps.
    for wu, wv, ww, wd in wings:
        roof(wu + 0.05, wv + 0.05, ww - 0.1, wd - 0.1, CORNICE + 0.6, 4.0, roof_m, kind="hip", ridge="v" if wd > ww else "u", overhang=0.0)
        if wd > ww:
            for k in range(1, int(wd / 0.06)):
                box(wu + 0.07, wv + k * 0.06, ww - 0.14, 0.004, CORNICE + 0.7, 0.5, seam)
        else:
            for k in range(1, int(ww / 0.06)):
                box(wu + k * 0.06, wv + 0.07, 0.004, wd - 0.14, CORNICE + 0.7, 0.5, seam)
    for k in range(8):
        dv = v_lo + 0.4 + k * 0.4
        box(u_hi - 0.13, dv - 0.03, 0.05, 0.06, CORNICE + 1.0, 2.0, white)
        box(u_hi - 0.081, dv - 0.018, 0.004, 0.036, CORNICE + 1.5, 1.1, glass)
    for k in range(5):
        du = u_lo + 0.3 + k * 0.4
        box(du - 0.03, v_hi - 0.13, 0.06, 0.05, CORNICE + 1.0, 2.0, white)
        box(du - 0.018, v_hi - 0.081, 0.036, 0.004, CORNICE + 1.5, 1.1, glass)
    for (cu, cv) in ((2.45, 0.6), (2.45, 1.4), (2.45, 2.6), (2.45, 3.4), (0.5, 1.2), (0.5, 2.8), (1.4, 3.5), (1.4, 0.5)):
        box(cu - 0.03, cv - 0.04, 0.06, 0.08, CORNICE + 2.0, 3.2, wall)
        box(cu - 0.032, cv - 0.042, 0.064, 0.084, CORNICE + 2.6, 0.2, white)
        box(cu - 0.036, cv - 0.046, 0.072, 0.092, CORNICE + 5.2, 0.35, white, 0.003)
        for o in (-0.02, 0.02):
            cylinder(cu, cv + o, 0.008, CORNICE + 5.55, 0.6, iron, 8)

    balustrade("u", v_lo, v_hi, u_hi + 0.06, white, statue, gold, 0.22)
    balustrade("v", u_lo, u_hi, v_hi + 0.06, white, statue, gold, 0.22)
    balustrade("u", v_lo, v_hi, u_lo + 0.04, white, statue, gold, 0.44)  # rear edge (seen over the roof)
    balustrade("v", u_lo, u_hi, v_lo + 0.04, white, statue, gold, 0.44)

    for k in range(6):  # lamp posts on the square in front
        lamp(2.92, 0.45 + k * 0.62, iron, glow)

    kit.SCALE = RENDER_SCALE
    ruined_render("reservecapital-russia", (W, D), TOP + 4, damage, seed=11, cut_u=1.5)


MODELS = {"reservecapital-russia": reserve_capital_russia, **{f"reservecapital-russia-d{d}": (lambda d=d: reserve_capital_russia(d)) for d in (1, 2, 3)}}
