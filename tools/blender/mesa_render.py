"""
Red sandstone mesa (American West, Monument Valley style): neutral terrain scenery, 12 x 12 tiles.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/mesa_render.py

Writes ui/public/sprites/building-mesa-usa-west.png in the building projection (kit.render: orthographic, 30 deg
down, the game's 2:1 iso) and prints originX / originY for the PictureSpec (ui/src/render/sprites/Mesa.ts).

Shape (art units: 1 tile = 1 BU across, heights in art px via kit.zp):
  - organic island outline, base radius R_BASE tiles with a noisy rim (no square edge), skirt tapering to z = 0;
  - flat plateau (top TOP_Z art px), radius ~0.55 R, wide enough for tanks;
  - steep cliffs with horizontal sedimentary ledges (radial displacement banded by height + noise);
  - a straight, flat ramp RAMP_W tiles wide from the ground up to the plateau, facing the camera side;
  - slope-based material: Geometry Normal Z -> flat (top, ramp, talus) = compacted red-brown dirt,
    steep = terracotta rock with horizontal strata (wave texture along Z).
Self-contained: only kit's infrastructure (reset, _obj, zp, render) is used.
"""
import math
import os
import random
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = "mesa-usa-west"
FOOT = 12  # tiles, square plot (the art itself is round)
CU = CV = FOOT / 2
R_BASE = 5.35  # tiles: where the skirt meets the ground
TOP_Z = 70.0  # art px: plateau height
TOP_R = 0.74  # plateau radius as a share of the rim radius: room for a base up there
CLIFF = 0.07  # share of the rim radius the cliff drops over
TALUS_Z = 0.28  # talus top as a share of TOP_Z
RAMP_W = 3.0  # tiles (flat deck): two full cells of road for the game's pathing
RAMP_DIR = 0.0  # bearing in the (u, v) plane: straight down +u (towards the camera side, along the cell grid)
STEP = 0.045  # mesh spacing (tiles)

rnd = random.Random(4242)
# Low-frequency harmonics for the organic outline and the plateau edge.
RIM = [(k, rnd.uniform(0.02, 0.07) / k ** 0.6, rnd.uniform(0, 6.283)) for k in range(2, 9)]
EDGE = [(k, rnd.uniform(0.03, 0.08) / k ** 0.5, rnd.uniform(0, 6.283)) for k in range(2, 12)]
# Strata: band thicknesses (share of TOP_Z) and how far each ledge juts out (tiles, + = out).
BANDS = []
z = 0.0
while z < 1.0:
    t = rnd.uniform(0.05, 0.11)
    BANDS.append((z, z + t, rnd.uniform(-0.09, 0.07)))
    z += t


def harm(table, a):
    return sum(amp * math.sin(k * a + ph) for k, amp, ph in table)


def vnoise(x, y, seed=0):
    """Cheap smooth value noise (bilinear on a hashed lattice)."""
    def h(i, j):
        n = (i * 374761393 + j * 668265263 + seed * 982451653) & 0xFFFFFFFF
        n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
        return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0
    i, j = math.floor(x), math.floor(y)
    fx, fy = x - i, y - j
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = h(i, j) + (h(i + 1, j) - h(i, j)) * sx
    b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx
    return a + (b - a) * sy


def smooth(a, b, x):
    t = 0.0 if x <= a else 1.0 if x >= b else (x - a) / (b - a)
    return t * t * (3 - 2 * t)


def rim(a):
    return R_BASE * (1 + harm(RIM, a))


def ramp_frame(du, dv):
    """(along, across) of a point relative to the ramp axis (from the centre outwards)."""
    cu, su = math.cos(RAMP_DIR), math.sin(RAMP_DIR)
    return du * cu + dv * su, -du * su + dv * cu


def height(u, v):
    """Ground height (art px) of the mesa at (u, v); negative = outside the island."""
    du, dv = u - CU, v - CV
    r = math.hypot(du, dv)
    a = math.atan2(dv, du)
    rb = rim(a)
    if r >= rb:
        return -1.0
    rp = rb * (TOP_R + harm(EDGE, a) * 0.5)
    rc = rp + rb * CLIFF
    s = r / rb
    if r <= rp:
        h = TOP_Z
    elif r <= rc:
        # Steep cliff: almost vertical, slightly convex at the lip.
        t = (r - rp) / (rc - rp)
        h = TOP_Z - (TOP_Z * (1 - TALUS_Z)) * (t ** 0.8)
    else:
        # Talus / skirt: concave, easing out to 0 at the rim.
        t = (r - rc) / (rb - rc)
        h = TOP_Z * TALUS_Z * (1 - smooth(0, 1, t)) ** 1.6
    h += (vnoise(u * 3.1, v * 3.1, 1) - 0.5) * 2.5 * (1 if r > rc else 0.25)
    # Ramp: a raised, flat-decked causeway from the rim to the plateau lip.
    al, ac = ramp_frame(du, dv)
    if al > 0:
        # Measured along the ramp's own axis (not per point): the deck is level across its width.
        ra = rim(RAMP_DIR)
        lip = ra * (TOP_R + harm(EDGE, RAMP_DIR) * 0.5) * 0.85
        foot = ra * 0.95
        if lip - 0.3 <= al <= foot:
            deck = TOP_Z * (1 - min(1.0, (al - lip) / (foot - lip))) if al > lip else TOP_Z
            half = RAMP_W / 2
            shoulder = 0.18 + 0.12 * (deck / TOP_Z)
            w = 1 - smooth(half, half + shoulder, abs(ac))
            if w > 0:
                fill = deck if abs(ac) <= half else deck - (abs(ac) - half) / shoulder * deck * 0.9
                if fill > h:
                    h += (fill - h) * w  # embankment below the deck
                elif al > lip:
                    h += (deck - h) * w  # cutting through a plateau spur that reaches over the ramp
    return max(0.0, h * smooth(rb, rb * 0.97, r) if r > rb * 0.97 else h)


def strata_push(u, v, h):
    """Horizontal ledge displacement (tiles, along the outward normal) for a cliff point at height h."""
    zf = h / TOP_Z
    for z0, z1, out in BANDS:
        if z0 <= zf < z1:
            t = (zf - z0) / (z1 - z0)
            # Each band: hard cap rock at its top, softer, eroded base (undercut).
            prof = out + (0.03 if t > 0.8 else -0.02 * (1 - t))
            return prof * (0.7 + 0.6 * vnoise(u * 1.7, v * 1.7 + z0 * 40, 3))
    return 0.0


def build_mesh():
    n = int(FOOT / STEP) + 1
    bm = bmesh.new()
    grid = {}
    for i in range(n):
        for j in range(n):
            u, v = i * STEP, j * STEP
            h = height(u, v)
            if h < 0:
                # Just outside the rim: pulled onto the rim curve (h = 0), so the outline is smooth, not grid steps.
                du, dv = u - CU, v - CV
                r = math.hypot(du, dv)
                rb = rim(math.atan2(dv, du))
                if r > rb + STEP * 1.5:
                    continue
                u, v, h = CU + du / r * rb, CV + dv / r * rb, 0.0
            grid[(i, j)] = (u, v, h)
    # Slope (art px per tile) by finite differences: steep points get the strata push.
    verts = {}
    flats = []
    for (i, j), (u, v, h) in grid.items():
        hu = grid.get((i + 1, j), (0, 0, h))[2] - grid.get((i - 1, j), (0, 0, h))[2]
        hv = grid.get((i, j + 1), (0, 0, h))[2] - grid.get((i, j - 1), (0, 0, h))[2]
        g = math.hypot(hu, hv) / (2 * STEP)
        pu, pv = u, v
        if g > 60 and 2 < h < TOP_Z - 1:
            du, dv = u - CU, v - CV
            r = math.hypot(du, dv) or 1
            k = strata_push(u, v, h) * smooth(60, 140, g)
            pu, pv = u + du / r * k, v + dv / r * k
        verts[(i, j)] = bm.verts.new((pu, pv, kit.zp(h)))
        # Walkable / loose ground (plateau, ramp deck, talus) vs cliff: drives the dirt / rock split with the normal.
        flats.append(1.0 - smooth(45, 90, g))
    for i in range(n - 1):
        for j in range(n - 1):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            if all(p in verts for p in q):
                bm.faces.new([verts[p] for p in q])
    ob = kit._obj("mesa", bm, mesa_material())
    at = ob.data.attributes.new("flat", "FLOAT", "POINT")
    at.data.foreach_set("value", flats)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def mesa_material():
    m = bpy.data.materials.new("mesa")
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.92
    geo = N.new("ShaderNodeNewGeometry")
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(geo.outputs["Normal"], sep.inputs[0])
    # Flat (normal z high) -> dirt, steep -> rock.
    slope = N.new("ShaderNodeMapRange")
    slope.inputs["From Min"].default_value = 0.86
    slope.inputs["From Max"].default_value = 0.95
    L.new(sep.outputs["Z"], slope.inputs["Value"])
    # Rock: strata bands along object Z, broken by noise.
    pos = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Object"], pos.inputs[0])
    wnoise = N.new("ShaderNodeTexNoise")
    wnoise.inputs["Scale"].default_value = 3.0
    wnoise.inputs["Detail"].default_value = 6
    L.new(tc.outputs["Object"], wnoise.inputs["Vector"])
    zmix = N.new("ShaderNodeMath")
    zmix.operation = "MULTIPLY_ADD"
    zmix.inputs[1].default_value = 0.08
    L.new(wnoise.outputs["Fac"], zmix.inputs[0])
    L.new(pos.outputs["Z"], zmix.inputs[2])
    comb = N.new("ShaderNodeCombineXYZ")
    L.new(zmix.outputs[0], comb.inputs["Z"])
    wave = N.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 3.2
    wave.inputs["Distortion"].default_value = 2.5
    wave.inputs["Detail"].default_value = 4
    L.new(comb.outputs["Vector"], wave.inputs["Vector"])
    rock = N.new("ShaderNodeValToRGB")
    els = rock.color_ramp.elements
    els[0].position, els[0].color = 0.0, kit.srgb("#7a3420")
    els[1].position, els[1].color = 1.0, kit.srgb("#c97b52")
    e = els.new(0.45)
    e.color = kit.srgb("#a5492b")
    e = els.new(0.7)
    e.color = kit.srgb("#b8603a")
    L.new(wave.outputs["Fac"], rock.inputs["Fac"])
    # Desert varnish: dark vertical streaks running down the cliff faces (noise stretched along Z).
    vmap = N.new("ShaderNodeMapping")
    vmap.inputs["Scale"].default_value = (7.0, 7.0, 0.6)
    L.new(tc.outputs["Object"], vmap.inputs["Vector"])
    vn = N.new("ShaderNodeTexNoise")
    vn.inputs["Scale"].default_value = 4.0
    vn.inputs["Detail"].default_value = 5
    L.new(vmap.outputs["Vector"], vn.inputs["Vector"])
    vr = N.new("ShaderNodeMapRange")
    vr.inputs["From Min"].default_value = 0.52
    vr.inputs["From Max"].default_value = 0.7
    vr.inputs["To Max"].default_value = 0.55
    L.new(vn.outputs["Fac"], vr.inputs["Value"])
    varn = N.new("ShaderNodeMix")
    varn.data_type = "RGBA"
    L.new(vr.outputs["Result"], varn.inputs["Factor"])
    L.new(rock.outputs["Color"], varn.inputs[6])
    varn.inputs[7].default_value = kit.srgb("#3e2219")
    # Large patches of tone (iron-rich vs bleached sandstone).
    pn = N.new("ShaderNodeTexNoise")
    pn.inputs["Scale"].default_value = 0.6
    L.new(tc.outputs["Object"], pn.inputs["Vector"])
    tone = N.new("ShaderNodeMix")
    tone.data_type = "RGBA"
    tone.blend_type = "OVERLAY"
    tone.inputs["Factor"].default_value = 0.35
    L.new(varn.outputs[2], tone.inputs[6])
    L.new(pn.outputs["Color"], tone.inputs[7])
    # Fine grain on both.
    grain = N.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 60.0
    grain.inputs["Detail"].default_value = 10
    L.new(tc.outputs["Object"], grain.inputs["Vector"])
    dirt = N.new("ShaderNodeValToRGB")
    d = dirt.color_ramp.elements
    d[0].color = kit.srgb("#7d4630")
    d[1].color = kit.srgb("#a86a4a")
    L.new(grain.outputs["Fac"], dirt.inputs["Fac"])
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    flat = N.new("ShaderNodeAttribute")
    flat.attribute_name = "flat"
    both = N.new("ShaderNodeMath")
    both.operation = "MAXIMUM"
    L.new(slope.outputs["Result"], both.inputs[0])
    L.new(flat.outputs["Fac"], both.inputs[1])
    L.new(both.outputs[0], mix.inputs["Factor"])
    L.new(tone.outputs[2], mix.inputs[6])
    L.new(dirt.outputs["Color"], mix.inputs[7])
    # Grime: 4 % darkening noise over everything.
    gm = N.new("ShaderNodeMix")
    gm.data_type = "RGBA"
    gm.blend_type = "MULTIPLY"
    gm.inputs["Factor"].default_value = 0.12
    L.new(mix.outputs[2], gm.inputs[6])
    L.new(grain.outputs["Color"], gm.inputs[7])
    L.new(gm.outputs[2], bsdf.inputs["Base Color"])
    # Bump: strata ridges on rock, grain on dirt.
    bmix = N.new("ShaderNodeMath")
    bmix.operation = "ADD"
    L.new(wave.outputs["Fac"], bmix.inputs[0])
    L.new(grain.outputs["Fac"], bmix.inputs[1])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.02
    L.new(bmix.outputs[0], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def boulders():
    """Fallen blocks on the talus (real mesas shed them); never on the plateau or the ramp."""
    rock = bpy.data.materials.get("mesa")
    placed = 0
    tries = 0
    while placed < 38 and tries < 4000:
        tries += 1
        a = rnd.uniform(0, 6.283)
        rb = rim(a)
        r = rb * rnd.uniform(0.72, 0.93)
        u, v = CU + math.cos(a) * r, CV + math.sin(a) * r
        al, ac = ramp_frame(u - CU, v - CV)
        if al > 0 and abs(ac) < RAMP_W / 2 + 0.9:
            continue
        h = height(u, v)
        if h <= 0 or h > TOP_Z * TALUS_Z:
            continue
        s = rnd.uniform(0.07, 0.2)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        for vt in bm.verts:
            vt.co.x = u + vt.co.x * s * rnd.uniform(0.8, 1.3)
            vt.co.y = v + vt.co.y * s * rnd.uniform(0.8, 1.3)
            vt.co.z = kit.zp(h) + vt.co.z * s * 0.7
        kit._obj("boulder", bm, rock)
        placed += 1


FIELD_STEP = 0.25  # tiles between height samples written for the game


def export_field():
    """Writes the ground height the game drives on (ui/src/data/mesa-usa-west.json): art px of z at every
    FIELD_STEP tiles over the plot, from the same height() the mesh is built from (MesaField.ts reads it)."""
    import json

    n = int(FOOT / FIELD_STEP) + 1
    h = [round(max(0.0, height(i * FIELD_STEP, j * FIELD_STEP)), 1) for j in range(n) for i in range(n)]
    path = os.path.join(kit.ROOT, "ui", "src", "data", f"{NAME}.json")
    with open(path, "w", encoding="utf8") as fh:
        json.dump({"foot": FOOT, "step": FIELD_STEP, "n": n, "zs": kit.ZS, "h": h}, fh, separators=(",", ":"))
    print(f"[mesa] height field -> {path}")


def main():
    export_field()
    kit.reset()
    sc = bpy.context.scene
    sc.cycles.samples = int(os.environ.get("MESA_SAMPLES", "64"))
    try:
        sc.view_settings.look = "Medium Contrast"  # ART_GUIDE §2
    except TypeError:
        pass
    build_mesh()
    boulders()
    # Supersampled: render at SS x the sprite scale (kit.SCALE), the game draws it down.
    kit.render(NAME, (FOOT, FOOT), TOP_Z + 6)


main()
