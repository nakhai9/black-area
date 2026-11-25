"""Underground missile silo (3 x 3), its own model (ART_GUIDE.md). Paint: dark moss green #18392b.

A flush concrete apron with the faction identity line (TEAM) round its edge, and in the middle the raised silo head:
a chamfered octagonal concrete collar painted moss green, the launch opening with a yellow / black warning ring and
the missile's nose cone just below the rim, closed by two armoured clamshell leaves hinged along u that swing open
(up to LID_OPEN degrees) on hydraulic rams. Round it: electrical cabinets on the collar sides, two ventilation stacks,
an antenna mast, sensor posts with lamps, a personnel hatch on the apron.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/building_render.py -- silo

Sprites (ui/public/sprites):
    building-silo-<nation>.png   apron + collar without the leaves (one per nation: the TEAM line is baked in)
    building-silo-lid<kk>.png        USA / Europe: the two clamshell leaves (and rams) alone at LID_FRAMES steps,
                                     kk = 00 closed ... last fully open
    building-silo-lid-round<kk>.png  Russia / China / Islamic: one round domed cap on a single hinge, same steps
                                 the collar is a holdout in the lid frames, so they stack exactly over the base picture.
All share one frame (footprint 3 x 3, HEIGHT art px), so originX / originY printed for the base fit every frame.
Coordinates: u, v in tiles (0..3), z in art px (kit.zp); the leaves turn about lines along u.
"""
import math
import os

import bpy

from kit import OUT, TEAM, box, cylinder, lathe, mat, prism, render, rod, zp

FOOT = (3, 3)
HEIGHT = 64  # art px the picture reaches above the ground
C = 1.5  # centre of the plot
LID_FRAMES = int(os.environ.get("SILO_LID_FRAMES", 8))
LID_OPEN = 112  # degrees, fully open
SAMPLES = int(os.environ.get("SILO_SAMPLES", 64))

PAD_H = 3  # apron thickness (sunk flush with the ground)
COLLAR_H = 12  # top of the collar
RIM_TOP = 13.6  # top of the rim ring = underside of the closed leaves
OPEN_R = 0.66  # launch opening radius (tiles)
HINGE_V = 0.78  # hinge lines at v = C +- HINGE_V
LEAF_U = 1.45  # leaf length along u
LEAF_T = 2.4  # leaf thickness (art px)
ROUND_NATIONS = ("russia", "china", "islamic")  # round single cap; usa / europe: the clamshell leaves
ROUND_R = 0.8  # round cap radius (tiles), over the rim ring
ROUND_HV = 0.86  # its hinge line at v = C + ROUND_HV
ROUND_T = 3.0  # cap thickness (art px) below its dome
ROUND_RAM_U = 0.32  # its two rams at u = C +- ROUND_RAM_U

GREEN = "#18392b"
GREEN_DARK = "#10261d"
GREEN_LIGHT = "#22493a"
CONCRETE = "#6d7067"
CONCRETE_DARK = "#575a52"
STEEL = "#5c6062"
BLACK = "#0b0d0c"
YELLOW = "#c9a227"
NOSE = "#c9ccc6"


def M():
    return dict(
        green=mat(GREEN, 0.62, grain=0.05, scale=22),
        green_dark=mat(GREEN_DARK, 0.6, grain=0.04),
        green_light=mat(GREEN_LIGHT, 0.6, grain=0.04),
        concrete=mat(CONCRETE, 0.85, grain=0.14, scale=14),
        concrete_dark=mat(CONCRETE_DARK, 0.85, grain=0.08),
        steel=mat(STEEL, 0.38, metal=0.8, grain=0.03),
        black=mat(BLACK, 0.9, grain=0),
        yellow=mat(YELLOW, 0.55, grain=0.03),
        nose=mat(NOSE, 0.45, grain=0.02),
        lamp=mat("#e8e2c8", 0.2, grain=0, emit="#ffe9a8"),
        glass=mat("#26313a", 0.1, grain=0, glass=True),
    )


def octagon(c, r, ch):
    """Square of half side r round (c, c) with corners chamfered by ch (counter-clockwise)."""
    return [(c + r - ch, c - r), (c + r, c - r + ch), (c + r, c + r - ch), (c + r - ch, c + r),
            (c - r + ch, c + r), (c - r, c + r - ch), (c - r, c - r + ch), (c - r + ch, c - r)]


# ---------------------------------------------------------------- base (apron + collar)


def build_base(m, team_hex, round_lid=False):
    team = mat(team_hex, 0.5, grain=0)
    # apron: concrete slab with expansion joints and the faction line round its edge
    box(0, 0, 3, 3, 0, PAD_H, m["concrete"])
    for k in range(1, 4):
        t = k * 0.75
        box(t - 0.008, 0.1, 0.016, 2.8, PAD_H, 0.15, m["concrete_dark"])
        box(0.1, t - 0.008, 2.8, 0.016, PAD_H, 0.15, m["concrete_dark"])
    e, w = 0.07, 0.08
    for (u, v, a, b) in ((e, e, 3 - 2 * e, w), (e, 3 - e - w, 3 - 2 * e, w), (e, e, w, 3 - 2 * e), (3 - e - w, e, w, 3 - 2 * e)):
        box(u, v, a, b, PAD_H, 0.35, team)
    # collar: chamfered octagon, a plinth course then the painted wall, a coping on top
    prism(octagon(C, 1.12, 0.38), PAD_H, 2, m["concrete_dark"])
    prism(octagon(C, 1.06, 0.36), PAD_H + 2, COLLAR_H - PAD_H - 3, m["green"])
    prism(octagon(C, 1.1, 0.37), COLLAR_H - 1, 1, m["green_dark"])
    # panel seams on the collar walls
    for s in (-1, 1):
        for k in (-0.45, 0.45):
            box(C + s * 1.065 - 0.01, C + k - 0.01, 0.02, 0.02, PAD_H + 2, COLLAR_H - PAD_H - 3, m["green_dark"])
            box(C + k - 0.01, C + s * 1.065 - 0.01, 0.02, 0.02, PAD_H + 2, COLLAR_H - PAD_H - 3, m["green_dark"])
    # launch opening: dark shaft, the missile nose cone below the rim, rim ring with a warning band
    cylinder(C, C, OPEN_R, COLLAR_H, 0.08, m["black"], segs=48)
    lathe(C, C, COLLAR_H, [(0.5, 0.1), (0.46, 0.6), (0.36, 1.0), (0.2, 1.3), (0.05, 1.45), (0.0, 1.5)], m["nose"], segs=40, cap_bottom=True)
    lathe(C, C, COLLAR_H, [(OPEN_R, 0), (OPEN_R, RIM_TOP - COLLAR_H), (0.76, RIM_TOP - COLLAR_H), (0.76, 0)], m["green_dark"], segs=48)
    for k in range(24):
        a = 2 * math.pi * (k + 0.5) / 24
        r = 0.84
        box(C + r * math.cos(a) - 0.045, C + r * math.sin(a) - 0.045, 0.09, 0.09, COLLAR_H, 0.25, m["yellow"] if k % 2 == 0 else m["black"])
    if round_lid:
        # one hinge housing on the +v side for the round cap, its two rams' anchor blocks beside it
        box(C - 0.3, C + ROUND_HV - 0.07, 0.6, 0.14, COLLAR_H, RIM_TOP - COLLAR_H + 0.6, m["steel"])
        for k in (-ROUND_RAM_U, ROUND_RAM_U):
            box(C + k - 0.08, C + 1.0 - 0.06, 0.16, 0.12, COLLAR_H, 1.6, m["steel"])
    else:
        # hinge housings along u on both sides of the opening, rams' anchor blocks
        for s in (-1, 1):
            box(C - LEAF_U / 2, C + s * HINGE_V - 0.07, LEAF_U, 0.14, COLLAR_H, RIM_TOP - COLLAR_H + 0.6, m["steel"])
            for k in (-0.45, 0.45):
                box(C + k - 0.08, C + s * 1.0 - 0.06, 0.16, 0.12, COLLAR_H, 1.6, m["steel"])
    # electrical cabinets on the +u and -u collar sides, with doors and a lamp
    for s in (-1, 1):
        u0 = C + s * 1.12 - (0.18 if s > 0 else 0.0)
        box(u0, C - 0.4, 0.18, 0.8, PAD_H, 7, m["green_light"])
        box(u0 + (0.18 if s > 0 else -0.01), C - 0.35, 0.01, 0.32, PAD_H + 1, 5, m["green_dark"])
        box(u0 + (0.18 if s > 0 else -0.01), C + 0.03, 0.01, 0.32, PAD_H + 1, 5, m["green_dark"])
    # ventilation stacks on two apron corners, capped
    for (u, v) in ((0.42, 0.42), (2.58, 2.58)):
        cylinder(u, v, 0.14, PAD_H, 9, m["green"], segs=24)
        cylinder(u, v, 0.19, PAD_H + 9, 1.4, m["green_dark"], segs=24)
        cylinder(u, v, 0.12, PAD_H + 10.4, 1.6, m["black"], segs=20)
    # antenna mast with a small dish box, on the far corner
    au, av = 0.35, 2.65
    box(au - 0.1, av - 0.1, 0.2, 0.2, PAD_H, 2, m["concrete_dark"])
    rod((au, av, 0.001), (au, av, zp(HEIGHT - 6)), 0.025, m["steel"])
    box(au - 0.06, av - 0.06, 0.12, 0.12, HEIGHT - 20, 4, m["green_dark"])
    for k in range(3):
        rod((au, av, zp(HEIGHT - 12 - k * 8)), (au, av - 0.16, zp(HEIGHT - 12 - k * 8)), 0.012, m["steel"])
    # sensor posts with lamps on the other two corners
    for (u, v) in ((2.65, 0.35), (1.5, 2.8)):
        rod((u, v, zp(PAD_H)), (u, v, zp(PAD_H + 16)), 0.03, m["steel"])
        box(u - 0.07, v - 0.07, 0.14, 0.14, PAD_H + 16, 3, m["green_dark"])
        box(u - 0.04, v - 0.08, 0.08, 0.01, PAD_H + 16.6, 1.6, m["lamp"])
    # personnel hatch on the apron, with a raised coaming
    cylinder(0.55, 2.35, 0.2, PAD_H, 1.2, m["concrete_dark"], segs=28)
    cylinder(0.55, 2.35, 0.16, PAD_H + 1.2, 0.5, m["green"], segs=28)
    rod((0.47, 2.35, zp(PAD_H + 1.9)), (0.63, 2.35, zp(PAD_H + 1.9)), 0.012, m["steel"])


# ---------------------------------------------------------------- leaves


def _hinge_empty(s):
    """Empty on a hinge line (Blender x = v, y = u, z up)."""
    e = bpy.data.objects.new(f"hinge{s}", None)
    bpy.context.scene.collection.objects.link(e)
    e.location = (C + s * HINGE_V, C, zp(RIM_TOP))
    return e


def build_leaves(m):
    """The two leaves, each parented to its hinge empty; returns the empties."""
    hinges = []
    for s in (-1, 1):
        before = set(bpy.data.objects)
        v0 = min(C, C + s * HINGE_V)  # the leaf spans its hinge line -> the centre line
        u0 = C - LEAF_U / 2
        box(u0, v0, LEAF_U, HINGE_V, RIM_TOP, LEAF_T, m["green"], bevel=0.01)
        # stiffening ribs across the leaf and a seal strip on the meeting edge
        for k in (0.2, 0.5, 0.8):
            box(u0 + LEAF_U * k - 0.04, v0 + 0.06, 0.08, HINGE_V - 0.12, RIM_TOP + LEAF_T, 0.8, m["green_light"])
        box(u0, C - 0.02 if s < 0 else C, LEAF_U, 0.02, RIM_TOP + 0.2, LEAF_T - 0.2, m["black"])
        # hinge knuckles on the outer edge
        for k in (0.15, 0.5, 0.85):
            box(u0 + LEAF_U * k - 0.09, C + s * HINGE_V - 0.05, 0.18, 0.1, RIM_TOP - 0.2, LEAF_T + 0.4, m["steel"])
        objs = [o for o in bpy.data.objects if o not in before]
        e = _hinge_empty(s)
        bpy.context.view_layer.update()
        inv = e.matrix_world.inverted()
        for o in objs:
            o.parent = e
            o.matrix_parent_inverse = inv
        hinges.append((s, e))
    return hinges


def set_lid(hinges, opening, m, rams):
    """Opens both leaves to `opening` (0 closed .. 1 fully open) and redraws the hydraulic rams."""
    a = math.radians(LID_OPEN) * opening
    for s, e in hinges:
        # +v leaf: its free edge lies towards -x of the hinge; a +y turn lifts it. The -v leaf turns the other way.
        e.rotation_euler = (0, a if s > 0 else -a, 0)
    for o in rams:
        bpy.data.objects.remove(o, do_unlink=True)
    rams.clear()
    for s, _ in hinges:
        for k in (-0.45, 0.45):
            # anchor on the collar block; rod end 0.38 tile from the hinge on the leaf's underside
            base = (C + k, C + s * 1.0, zp(COLLAR_H + 1.2))  # (u, v, z) as kit.rod wants
            d = 0.38
            hv = C + s * HINGE_V
            tip = (C + k, hv - s * d * math.cos(a), zp(RIM_TOP) + d * math.sin(a))
            rams.append(rod(base, tip, 0.035, m["steel"]))
            mid = tuple(base[i] + (tip[i] - base[i]) * 0.45 for i in range(3))
            rams.append(rod(base, mid, 0.055, m["green_dark"]))


def build_round_cap(m):
    """Russia / China / Islamic: one round armoured cap with a low dome, radial ribs and a hinge arm, on the +v hinge."""
    before = set(bpy.data.objects)
    lathe(C, C, RIM_TOP, [(ROUND_R, 0), (ROUND_R, ROUND_T), (ROUND_R - 0.06, ROUND_T + 0.6), (0.62, ROUND_T + 2.6), (0.42, ROUND_T + 4.0), (0.2, ROUND_T + 4.8), (0.0, ROUND_T + 5.0)], m["green"], segs=56, cap_bottom=True)
    lathe(C, C, RIM_TOP + 0.6, [(ROUND_R + 0.012, 0), (ROUND_R + 0.012, 0.8)], m["green_dark"], segs=56)
    for k in range(8):
        a = 2 * math.pi * k / 8
        p0 = (C + 0.32 * math.cos(a), C + 0.32 * math.sin(a), zp(RIM_TOP + ROUND_T + 4.3))
        p1 = (C + 0.74 * math.cos(a), C + 0.74 * math.sin(a), zp(RIM_TOP + ROUND_T + 0.9))
        rod(p0, p1, 0.022, m["green_light"])
    cylinder(C, C, 0.14, RIM_TOP + ROUND_T + 4.6, 1.0, m["green_dark"], segs=24)
    # hinge arm from the cap to the hinge line, knuckles
    box(C - 0.22, C + 0.5, 0.44, ROUND_HV - 0.5 + 0.04, RIM_TOP + 0.4, ROUND_T + 0.4, m["green_dark"])
    for k in (-0.18, 0.18):
        box(C + k - 0.07, C + ROUND_HV - 0.05, 0.14, 0.1, RIM_TOP - 0.2, ROUND_T + 0.8, m["steel"])
    objs = [o for o in bpy.data.objects if o not in before]
    e = bpy.data.objects.new("hinge_round", None)
    bpy.context.scene.collection.objects.link(e)
    e.location = (C + ROUND_HV, C, zp(RIM_TOP))  # Blender x = v, y = u
    bpy.context.view_layer.update()
    inv = e.matrix_world.inverted()
    for o in objs:
        o.parent = e
        o.matrix_parent_inverse = inv
    return e


def set_round(e, opening, m, rams):
    """Opens the round cap to `opening` (0 closed .. 1 fully open) and redraws its two rams."""
    a = math.radians(LID_OPEN) * opening
    e.rotation_euler = (0, a, 0)
    for o in rams:
        bpy.data.objects.remove(o, do_unlink=True)
    rams.clear()
    for k in (-ROUND_RAM_U, ROUND_RAM_U):
        base = (C + k, C + 1.0, zp(COLLAR_H + 1.2))
        d = 0.42
        tip = (C + k, C + ROUND_HV - d * math.cos(a), zp(RIM_TOP) + d * math.sin(a))
        rams.append(rod(base, tip, 0.035, m["steel"]))
        mid = tuple(base[i] + (tip[i] - base[i]) * 0.45 for i in range(3))
        rams.append(rod(base, mid, 0.055, m["green_dark"]))


# ---------------------------------------------------------------- models


def silo(nation):
    m = M()
    bpy.context.scene.cycles.samples = SAMPLES
    # the base alone: the leaves (closed or open) come from the silo-lid frames drawn over it
    build_base(m, TEAM[nation], nation in ROUND_NATIONS)
    render(f"silo-{nation}", FOOT, HEIGHT)


def silo_lid():
    """Leaf frames: the base is built as a holdout so the leaves are cut where the collar hides them."""
    m = M()
    sc = bpy.context.scene
    sc.cycles.samples = SAMPLES
    build_base(m, "#c8c8c8")
    base = [o for o in bpy.data.objects if o.type == "MESH"]
    hinges = build_leaves(m)
    rams = []
    for o in base:
        o.is_holdout = True
    for k in range(LID_FRAMES):
        set_lid(hinges, k / (LID_FRAMES - 1), m, rams)
        name = f"silo-lid{k:02d}"
        if k == 0:
            render(name, FOOT, HEIGHT)
        else:
            sc.render.filepath = os.path.join(OUT, f"building-{name}.png")
            bpy.ops.render.render(write_still=True)


def silo_lid_round():
    """Round cap frames (Russia, China, Islamic), as silo_lid."""
    m = M()
    sc = bpy.context.scene
    sc.cycles.samples = SAMPLES
    build_base(m, "#c8c8c8", True)
    base = [o for o in bpy.data.objects if o.type == "MESH"]
    cap = build_round_cap(m)
    rams = []
    for o in base:
        o.is_holdout = True
    for k in range(LID_FRAMES):
        set_round(cap, k / (LID_FRAMES - 1), m, rams)
        name = f"silo-lid-round{k:02d}"
        if k == 0:
            render(name, FOOT, HEIGHT)
        else:
            sc.render.filepath = os.path.join(OUT, f"building-{name}.png")
            bpy.ops.render.render(write_still=True)


MODELS = {f"silo-{n}": (lambda n=n: silo(n)) for n in TEAM}
MODELS["silo-lid"] = silo_lid
MODELS["silo-lid-round"] = silo_lid_round

from models._utilwreck import variant  # noqa: E402

for _f in TEAM:
    for _d in (1, 2, 3):
        MODELS[f"silo-{_f}-d{_d}"] = (lambda f=_f, d=_d: variant(globals(), lambda: silo(f), d, side=(1.0, 0.5), stub=3, frag=8, flat=True, keep_low=1.5))
