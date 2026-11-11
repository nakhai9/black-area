"""Lived-in flat roofs per nation (shared by every model with a flat deck).

    deck(style, u, v, w, d, z, seed=0, avoid=())

style: "usa"    light TPO membrane with seams, HVAC units with fans, a timber water tank on stilts, vent stacks, roof hatch;
       "russia" dark tar with patched sheets, brick chimneys, ventilation shafts, a lattice radio mast;
       "europe" zinc deck with sedum (green roof) beds, solar-panel rows, skylights, chimney pots.
avoid: rectangles (u, v, w, d) already built on the roof (domes, towers) that the clutter must keep clear of.
"""
import math
import random

from kit import box, cylinder, mat, rod, zp


def _free(r, avoid, rects):
    u, v, w, d = r
    for a in list(avoid) + rects:
        au, av, aw, ad = a
        if u < au + aw + 0.04 and au < u + w + 0.04 and v < av + ad + 0.04 and av < v + d + 0.04:
            return False
    return True


def _place(rng, u, v, w, d, sw, sd, avoid, rects, tries=40):
    """A free spot (u, v) for an sw × sd item inside the deck, or None."""
    if sw > w - 0.16 or sd > d - 0.16:
        return None
    for _ in range(tries):
        pu = u + 0.08 + rng.random() * (w - 0.16 - sw)
        pv = v + 0.08 + rng.random() * (d - 0.16 - sd)
        r = (pu, pv, sw, sd)
        if _free(r, avoid, rects):
            rects.append(r)
            return pu, pv
    return None


def _membrane(u, v, w, d, z, base, seam, step=0.25, along="u"):
    """Deck slab plus thin seam strips (sheet joints) so the roof reads as a material, not a plane."""
    box(u, v, w, d, z, 0.3, mat(base, 0.95, grain=0.22, scale=14))
    sm = mat(seam, 0.9, grain=0.05)
    n = int((d if along == "u" else w) / step)
    for k in range(1, n):
        if along == "u":
            box(u, v + k * step - 0.006, w, 0.012, z + 0.3, 0.12, sm)
        else:
            box(u + k * step - 0.006, v, 0.012, d, z + 0.3, 0.12, sm)


def _hvac(cu, cv, z, s, body, grille):
    box(cu, cv, s * 1.6, s, z, 3.2, body, bevel=0.01)
    for k in range(2):
        cylinder(cu + s * (0.4 + 0.8 * k), cv + s * 0.5, s * 0.32, z + 3.2, 0.4, grille, segs=16)
        cylinder(cu + s * (0.4 + 0.8 * k), cv + s * 0.5, s * 0.08, z + 3.6, 0.3, body, segs=8)


def _water_tank(cu, cv, z, r, wood, steel):
    """Timber water tank on a steel stand with a conical cap (New York roofline)."""
    for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        rod((cu + du * r * 0.7, cv + dv * r * 0.7, zp(z)), (cu + du * r * 0.7, cv + dv * r * 0.7, zp(z + 6)), 0.008, steel)
    box(cu - r, cv - r, 2 * r, 2 * r, z + 6, 0.5, steel)
    cylinder(cu, cv, r, z + 6.5, 9, wood, segs=20)
    for hz in (8.5, 11.5, 14.0):
        cylinder(cu, cv, r * 1.03, z + hz, 0.35, steel, segs=20)
    from kit import lathe
    lathe(cu, cv, z + 15.5, [(r * 1.08, 0), (r * 0.05, 4.5), (0.0005, 4.6)], steel, segs=20, cap_bottom=True)


def _chimney(cu, cv, z, s, h, brick, cap):
    box(cu, cv, s, s, z, h, brick)
    box(cu - 0.01, cv - 0.01, s + 0.02, s + 0.02, z + h, 0.8, cap)


def _mast(cu, cv, z, h, steel, tip):
    for du, dv in ((0, 0), (0.06, 0), (0.03, 0.05)):
        rod((cu + du, cv + dv, zp(z)), (cu + 0.03, cv + 0.017, zp(z + h)), 0.006, steel)
    for k in range(1, 5):
        zz = z + h * k / 5
        f = 1 - k / 5
        rod((cu + 0.03 - 0.03 * f, cv + 0.017 - 0.017 * f, zp(zz)), (cu + 0.03 + 0.03 * f, cv + 0.017 - 0.017 * f, zp(zz)), 0.004, steel)
    cylinder(cu + 0.03, cv + 0.017, 0.018, z + h, 1.2, tip, segs=8)


def deck(style, u, v, w, d, z, seed=0, avoid=(), team=None):
    rng = random.Random(f"{style}:{u:.2f}:{v:.2f}:{w:.2f}:{d:.2f}:{seed}")
    rects = []
    area = w * d
    zt = z + 0.42
    if style == "usa":
        _membrane(u, v, w, d, z, "#a9aba6", "#8e908b", along="u" if w >= d else "v")
        body = mat("#c8cbc9", 0.55, metal=0.4, grain=0.04)
        grille = mat("#2c2f31", 0.6, metal=0.5, grain=0)
        for _ in range(max(1, int(area * 0.9))):
            s = 0.16 + rng.random() * 0.06
            p = _place(rng, u, v, w, d, s * 1.6, s, avoid, rects)
            if p:
                _hvac(p[0], p[1], zt, s, body, grille)
        if area > 1.5:
            p = _place(rng, u, v, w, d, 0.3, 0.3, avoid, rects)
            if p:
                _water_tank(p[0] + 0.15, p[1] + 0.15, zt, 0.13, mat("#7a5634", 0.9, grain=0.3, scale=40), mat("#3b3d3e", 0.5, metal=0.6, grain=0))
        for _ in range(max(2, int(area * 1.5))):
            p = _place(rng, u, v, w, d, 0.05, 0.05, avoid, rects, tries=10)
            if p:
                cylinder(p[0] + 0.025, p[1] + 0.025, 0.022, zt, 2.5, mat("#6d7072", 0.5, metal=0.6, grain=0), segs=10)
        p = _place(rng, u, v, w, d, 0.16, 0.16, avoid, rects)
        if p:
            box(p[0], p[1], 0.16, 0.16, zt, 1.4, mat("#8a8d8f", 0.7, grain=0.05))
            box(p[0] + 0.02, p[1] + 0.02, 0.12, 0.12, zt + 1.4, 0.2, mat(team or "#2f6fe0", 0.5, grain=0))
    elif style == "russia":
        box(u, v, w, d, z, 0.3, mat("#4a4642", 0.97, grain=0.25, scale=8))
        patch = mat("#36332f", 0.98, grain=0.2, scale=12)
        for _ in range(max(3, int(area * 2))):
            pw, pd = 0.15 + rng.random() * 0.35, 0.12 + rng.random() * 0.3
            pu = u + 0.05 + rng.random() * max(0.01, w - pw - 0.1)
            pv = v + 0.05 + rng.random() * max(0.01, d - pd - 0.1)
            box(pu, pv, pw, pd, z + 0.3, 0.08, patch)
        brick = mat("#8b3b2c", 0.9, grain=0.25, scale=50)
        cap = mat("#3a3634", 0.9, grain=0.1)
        for _ in range(max(2, int(area * 0.8))):
            s = 0.1 + rng.random() * 0.05
            p = _place(rng, u, v, w, d, s, s, avoid, rects)
            if p:
                _chimney(p[0], p[1], zt, s, 4 + rng.random() * 3, brick, cap)
        shaft = mat("#9a948a", 0.85, grain=0.12)
        for _ in range(max(1, int(area * 0.5))):
            p = _place(rng, u, v, w, d, 0.26, 0.18, avoid, rects)
            if p:
                box(p[0], p[1], 0.26, 0.18, zt, 2.6, shaft)
                box(p[0] - 0.02, p[1] - 0.02, 0.3, 0.22, zt + 2.6, 0.5, mat("#5f6a5c", 0.6, metal=0.3, grain=0.05))
        if area > 1.2:
            p = _place(rng, u, v, w, d, 0.1, 0.1, avoid, rects)
            if p:
                _mast(p[0], p[1], zt, 18, mat("#c7c9c4", 0.5, metal=0.6, grain=0), mat(team or "#d22b2b", 0.4, emit=team or "#d22b2b"))
    else:  # europe
        _membrane(u, v, w, d, z, "#80878d", "#6b7177", step=0.12, along="v" if w >= d else "u")
        sedum = mat("#5f7d3a", 0.95, grain=0.35, scale=60)
        moss = mat("#8a8a3e", 0.95, grain=0.35, scale=60)
        for k in range(max(1, int(area * 0.5))):
            bw, bd = 0.35 + rng.random() * 0.3, 0.25 + rng.random() * 0.2
            p = _place(rng, u, v, w, d, bw, bd, avoid, rects)
            if p:
                box(p[0], p[1], bw, bd, zt, 0.6, mat("#9aa0a4", 0.8, grain=0.05))
                box(p[0] + 0.02, p[1] + 0.02, bw - 0.04, bd - 0.04, zt + 0.6, 0.25, sedum if k % 2 == 0 else moss)
        panel = mat("#1d2a44", 0.15, metal=0.4, grain=0.0)
        frame = mat("#c9ced2", 0.4, metal=0.7, grain=0)
        for _ in range(max(1, int(area * 0.5))):
            n = 3 + rng.randrange(3)
            p = _place(rng, u, v, w, d, 0.13 * n, 0.2, avoid, rects)
            if p:
                for i in range(n):
                    box(p[0] + i * 0.13, p[1], 0.12, 0.18, zt, 0.6, frame)
                    box(p[0] + i * 0.13 + 0.005, p[1] + 0.005, 0.11, 0.17, zt + 0.6, 1.4, panel)
        glass = mat("#9fc2d6", 0.1, grain=0, glass=True)
        for _ in range(max(1, int(area * 0.4))):
            p = _place(rng, u, v, w, d, 0.22, 0.14, avoid, rects)
            if p:
                box(p[0], p[1], 0.22, 0.14, zt, 0.9, frame)
                box(p[0] + 0.02, p[1] + 0.02, 0.18, 0.1, zt + 0.9, 0.5, glass)
        brick = mat("#a4553c", 0.9, grain=0.25, scale=50)
        pot = mat("#c1693f", 0.8, grain=0.1)
        for _ in range(max(1, int(area * 0.35))):
            p = _place(rng, u, v, w, d, 0.16, 0.08, avoid, rects)
            if p:
                box(p[0], p[1], 0.16, 0.08, zt, 3.5, brick)
                for i in range(3):
                    cylinder(p[0] + 0.027 + i * 0.053, p[1] + 0.04, 0.018, zt + 3.5, 1.2, pot, segs=10)
