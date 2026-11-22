"""
Ground scars: shell, rocket, bomb and missile craters left on the battlefield (ui/public/sprites/craters.webp).

    1) render (Blender, Cycles):  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/crater_render.py
    2) pack (plain Python, PIL):  python tools/blender/crater_render.py --pack

Step 1 writes 4 kinds × 4 variants into tools/blender/_cache/craters/*.png; step 2 downsamples (SS = 2) and packs them
into one WebP sheet (no PNG kept, ART_GUIDE section 8) and deletes the cache PNGs.

Sheet: 4 columns (variants) × 4 rows (kinds: 0 shell, 1 rocket, 2 bomb, 3 missile), cells of CELL_W × CELL_H px.
The crater centre (ground point of the impact) is the cell centre; the outer edge of the scar (radius 1 BU) spans
DIAMETER_PX px across the cell (ui/src/render/CraterSheet.ts uses the same numbers).

Model (own geometry, nothing shared with another asset): a 2 × 2 BU ground disc, displaced into a bowl with a torn,
raised rim, radial ejecta rays and fine soil noise; per-vertex colour (charred core, burnt soil, fresh upturned earth,
grey ash, black scorch rays) with alpha fading the scar into whatever ground it lands on; loose clods of earth and a
few stones thrown round the rim. Camera: orthographic, 30° above the ground (rotation x = 60°). Standard lighting
(ART_GUIDE section 2). Cycles, 64 samples, denoised, rendered at 2× and downscaled.
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, "_cache", "craters")
SHEET = os.path.join(ROOT, "ui", "public", "sprites", "craters.webp")

CELL_W = 512
CELL_H = 320
SS = 2
ORTHO = 2.2  # BU across the picture
VARIANTS = 4
KINDS = ["shell", "rocket", "bomb", "missile"]
DIAMETER_PX = CELL_W * 2 / ORTHO

# Per kind: bowl radius, depth, rim height / width, ejecta height, scorch reach, char strength, clods, stones, rays.
PARAMS = {
    "shell": dict(r0=0.26, depth=0.08, rim=0.022, rimw=0.07, ej=0.012, scorch=0.80, char=0.75, clods=26, stones=4, rays=9),
    "rocket": dict(r0=0.32, depth=0.12, rim=0.032, rimw=0.08, ej=0.018, scorch=0.88, char=0.85, clods=40, stones=6, rays=12),
    "bomb": dict(r0=0.46, depth=0.30, rim=0.075, rimw=0.11, ej=0.030, scorch=0.97, char=0.65, clods=80, stones=12, rays=14),
    "missile": dict(r0=0.38, depth=0.17, rim=0.045, rimw=0.09, ej=0.020, scorch=0.98, char=1.0, clods=48, stones=7, rays=16),
}


def pack():
    """Plain Python: SS downsample and pack the cached renders into the WebP sheet."""
    from PIL import Image

    sheet = Image.new("RGBA", (CELL_W * VARIANTS, CELL_H * len(KINDS)), (0, 0, 0, 0))
    done = []
    for row, kind in enumerate(KINDS):
        for col in range(VARIANTS):
            path = os.path.join(CACHE, f"crater_{kind}_{col}.png")
            with Image.open(path) as im:
                cell = im.convert("RGBA").resize((CELL_W, CELL_H), Image.LANCZOS)
            sheet.paste(cell, (col * CELL_W, row * CELL_H))
            done.append(path)
    sheet.save(SHEET, "WEBP", quality=90, method=6, alpha_quality=100)
    for p in done:
        os.remove(p)
    print(f"wrote {SHEET} ({os.path.getsize(SHEET) // 1024} KB), diameter {DIAMETER_PX:.1f} px")


if __name__ == "__main__" and "--pack" in sys.argv:
    pack()
    sys.exit(0)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector, noise  # noqa: E402


def lin(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


CHAR = lin("#15120f")
SCORCH = lin("#26201b")
ASH = lin("#57524c")
SOIL_DARK = lin("#2e231a")
SOIL = lin("#4a3828")
SOIL_FRESH = lin("#66503a")
STONE = lin("#77736c")


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = CELL_W * SS
    sc.render.resolution_y = CELL_H * SS
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    try:
        sc.view_settings.look = "Medium Contrast"
    except TypeError:
        pass
    world = bpy.data.worlds.new("sky")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.6, 0.66, 1)
    bg.inputs["Strength"].default_value = 0.6
    # Camera: orthographic, 30° above the ground.
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = ORTHO
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    co.rotation_euler = (math.radians(60), 0, math.radians(45))
    d = 10
    co.location = Vector((math.sin(math.radians(45)), -math.cos(math.radians(45)), 0)) * d * math.cos(math.radians(30)) + Vector((0, 0, d * math.sin(math.radians(30))))
    sc.camera = co
    # Key light and cool rim light (ART_GUIDE section 2).
    for name, direction, energy, color in (
        ("key", (-0.45, -0.35, 0.82), 2.8, (1.0, 0.97, 0.92)),
        ("rim", (0.7, -0.2, 0.45), 0.9, (0.82, 0.88, 1.0)),
    ):
        ld = bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.angle = math.radians(3)
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = Vector(direction).normalized().to_track_quat("Z", "Y").to_euler()
        sc.collection.objects.link(lo)


def ground_material():
    m = bpy.data.materials.new("scar")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "col"
    coords = nt.nodes.new("ShaderNodeTexCoord")
    grain = nt.nodes.new("ShaderNodeTexNoise")
    nt.links.new(coords.outputs["Object"], grain.inputs["Vector"])
    grain.inputs["Scale"].default_value = 70.0
    grain.inputs["Detail"].default_value = 12.0
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["To Min"].default_value = 0.78
    ramp.inputs["To Max"].default_value = 1.15
    nt.links.new(grain.outputs["Fac"], ramp.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(attr.outputs["Color"], mul.inputs["A"])
    nt.links.new(ramp.outputs["Result"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(attr.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.96
    # Fine grit catches the light.
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    nt.links.new(grain.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def solid_material(name, rgb, rough=0.95):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 40.0
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = 0.75
    mr.inputs["To Max"].default_value = 1.2
    nt.links.new(tex.outputs["Fac"], mr.inputs["Value"])
    mix_n = nt.nodes.new("ShaderNodeMix")
    mix_n.data_type = "RGBA"
    mix_n.blend_type = "MULTIPLY"
    mix_n.inputs["Factor"].default_value = 1.0
    mix_n.inputs["A"].default_value = (*rgb, 1)
    nt.links.new(mr.outputs["Result"], mix_n.inputs["B"])
    nt.links.new(mix_n.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    return m


# ---------------------------------------------------------------- crater


def build(kind, seed):
    P = PARAMS[kind]
    rng = random.Random(seed * 7919 + KINDS.index(kind) * 104729)
    s = seed * 3.17 + KINDS.index(kind) * 11.3
    r0 = P["r0"] * rng.uniform(0.9, 1.1)

    def n2(x, y, f, o=0.0):
        return noise.noise(Vector((x * f + s + o, y * f - s + o, s * 0.5 + o)))

    def outline(theta):
        # Irregular outline: low-frequency wobble of the radius round the crater.
        return 1 + 0.16 * noise.noise(Vector((math.cos(theta) * 1.6 + s, math.sin(theta) * 1.6 - s, s))) + 0.05 * noise.noise(Vector((math.cos(theta) * 5 + s, math.sin(theta) * 5, s + 3)))

    ray_phase = rng.uniform(0, math.tau)

    def ray(theta):
        # Ejecta rays: sharp radial streaks, uneven strength.
        a = 0.5 + 0.5 * math.cos(P["rays"] * theta + ray_phase + 1.7 * noise.noise(Vector((math.cos(theta) * 3, math.sin(theta) * 3, s + 9))))
        return a ** 3 * (0.6 + 0.4 * noise.noise(Vector((theta * 2.0, s, 1.0))))

    def height(x, y):
        r = math.hypot(x, y)
        th = math.atan2(y, x)
        rr = r / outline(th)
        z = 0.0
        if rr < r0:
            z -= P["depth"] * (0.5 + 0.5 * math.cos(math.pi * rr / r0)) ** 1.2
        z += P["rim"] * math.exp(-(((rr - r0) / P["rimw"]) ** 2)) * (0.75 + 0.5 * n2(x, y, 4.0, 5))
        if rr > r0:
            z += P["ej"] * max(0.0, 1 - (rr - r0) / (1 - r0)) ** 2 * ray(th) * 2.2
        z += 0.007 * n2(x, y, 26.0) + 0.003 * n2(x, y, 60.0, 2)
        return z * smooth(1.0, 0.86, r)

    def colour(x, y):
        r = math.hypot(x, y)
        th = math.atan2(y, x)
        rr = r / outline(th)
        g = 0.5 + 0.5 * n2(x, y, 9.0, 1)
        g2 = 0.5 + 0.5 * n2(x, y, 23.0, 4)
        if rr < r0:
            core = smooth(r0 * 0.95, r0 * 0.15, rr)
            c = mix(SOIL_DARK, CHAR, core * P["char"] + (g - 0.5) * 0.5)
            if g2 > 0.72:
                c = mix(c, ASH, (g2 - 0.72) * 2.2)
            return c, 1.0
        rim = math.exp(-(((rr - r0) / (P["rimw"] * 1.1)) ** 2))
        burn = ray(th)
        base = mix(SOIL, SOIL_FRESH, g * 0.8)
        base = mix(base, SCORCH, smooth(r0 * 2.6, r0, rr) * 0.85 * P["char"] + burn * 0.7)
        base = mix(base, CHAR, burn * smooth(P["scorch"], r0, rr) * 0.6 * P["char"])
        c = mix(base, SOIL_FRESH, rim * 0.45 * (0.3 + g))
        if g2 > 0.78:
            c = mix(c, ASH, (g2 - 0.78) * 2.5 * (1 - rim))
        # Fade into the terrain: solid round the bowl, then torn, streaky edges.
        reach = r0 + (P["scorch"] - r0) * (0.55 + 0.45 * burn)
        a = smooth(reach, r0 * 1.05, rr) * (0.3 + 0.7 * burn) * (0.6 + 0.4 * g) + rim * 0.85 + smooth(r0 * 1.6, r0, rr) * 0.5
        a *= smooth(0.99, 0.9, r)
        return c, max(0.0, min(1.0, a))

    # Ground disc.
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=420, y_segments=420, size=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.length > 1.0], context="VERTS")
    for v in bm.verts:
        v.co.z = height(v.co.x, v.co.y)
    me = bpy.data.meshes.new(f"scar_{kind}_{seed}")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    col = me.color_attributes.new("col", "FLOAT_COLOR", "POINT")
    for i, v in enumerate(me.vertices):
        c, a = colour(v.co.x, v.co.y)
        col.data[i].color = (*c, a)
    me.materials.append(ground_material())
    ob = bpy.data.objects.new(me.name, me)
    bpy.context.scene.collection.objects.link(ob)

    # Clods of earth and stones thrown out round the rim.
    clod_mats = [solid_material("clod_a", SOIL_FRESH), solid_material("clod_b", SOIL), solid_material("clod_c", SCORCH)]
    stone_mat = solid_material("stone", STONE, 0.8)
    for i in range(P["clods"] + P["stones"]):
        stone = i >= P["clods"]
        th = rng.uniform(0, math.tau)
        if rng.random() < 0.6:
            th = round(th * P["rays"] / math.tau) * math.tau / P["rays"] + ray_phase / P["rays"] + rng.gauss(0, 0.08)
        dist = r0 * rng.uniform(0.85, 1.25) if rng.random() < 0.55 else rng.uniform(r0 * 1.2, min(0.92, P["scorch"]))
        x, y = math.cos(th) * dist, math.sin(th) * dist
        size = rng.uniform(0.008, 0.022) * (1.6 if kind == "bomb" else 1.0) * (0.7 if stone else 1.0)
        size *= max(0.45, 1.15 - dist)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        c = bpy.context.active_object
        c.scale = (size * rng.uniform(0.8, 1.5), size * rng.uniform(0.7, 1.3), size * rng.uniform(0.45, 0.9))
        c.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 6.3))
        c.location = (x, y, height(x, y) + c.scale[2] * 0.35)
        bm2 = bmesh.new()
        bm2.from_mesh(c.data)
        for v in bm2.verts:
            v.co *= 1 + 0.35 * noise.noise(v.co * 2.5 + Vector((i, s, 0)))
        bm2.to_mesh(c.data)
        bm2.free()
        if not stone:
            for p in c.data.polygons:
                p.use_smooth = True
        c.data.materials.append(stone_mat if stone else rng.choice(clod_mats))


def main():
    os.makedirs(CACHE, exist_ok=True)
    only = os.environ.get("CRATER_ONLY")  # quick preview: "bomb:0"
    for kind in KINDS:
        for v in range(VARIANTS):
            if only and only != f"{kind}:{v}":
                continue
            reset()
            build(kind, v)
            bpy.context.scene.render.filepath = os.path.join(CACHE, f"crater_{kind}_{v}.png")
            bpy.ops.render.render(write_still=True)
            print(f"rendered {kind} {v}")


main()
