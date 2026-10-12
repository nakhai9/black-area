#!/usr/bin/env python3
"""
Builds the LEGO-brick main battle tank sheets for every nation: public/sprites/tank-lego-<faction>-hull.png and
tank-lego-<faction>-turret.png. Both: 32 columns of 64 px (screen headings clockwise from N), 1 row. The tank is modelled
from bricks and plates with studs, rendered flat-shaded in the game's iso view (ground ratio ISO_Y / ISO_X); hull and turret
share the cell's pivot, so TankSheets.ts draws the turret cell straight over the hull cell and turns it on its own.
Usage: python -I tools/lego_tank_sheet.py [--preview out.png]   (run from the repo root)
"""
import math
import sys

from PIL import Image, ImageDraw, ImageFilter

CELL = 64
DIRS = 32
SS = 4  # supersampling
UNIT = 4.6  # sheet px per stud
PIVOT = (32, 36)  # ground point under the turret ring
SIN_E = 0.5  # ISO_Y / ISO_X
COS_E = math.sqrt(1 - SIN_E ** 2)
PLATE = 0.4
BRICK = 1.2
LIGHT = (-0.45, 0.35, 0.82)  # ground x right, ground y towards the viewer, z up

# faction: (main colour, dark trim)
COLOURS = {
    'usa': ((206, 172, 108), (120, 98, 58)),
    'europe': ((104, 116, 82), (58, 66, 46)),
    'russia': ((86, 112, 70), (48, 62, 40)),
    'islamic': ((176, 150, 96), (98, 82, 50)),
    'china': ((70, 98, 64), (40, 56, 36)),
}
TRACK = (52, 52, 56)
BARREL = (70, 72, 74)


def box(x0, x1, y0, y1, z0, z1, col):
    return ('box', (x0, x1, y0, y1, z0, z1), col)


def studs(x0, x1, y0, y1, z, col, skip=lambda x, y: False):
    out = []
    for i in range(round(x1 - x0)):
        for j in range(round(y1 - y0)):
            cx, cy = x0 + i + 0.5, y0 + j + 0.5
            if not skip(cx, cy):
                out.append(('stud', (cx, cy, z), col))
    return out


def hull_parts(main, trim):
    top = BRICK + 2 * PLATE
    return [
        box(-4.5, 4.5, -3, -1.8, 0, BRICK, TRACK), box(-4.5, 4.5, 1.8, 3, 0, BRICK, TRACK),  # tracks
        box(-4.6, 4.6, -3.1, -1.7, BRICK, BRICK + PLATE, trim), box(-4.6, 4.6, 1.7, 3.1, BRICK, BRICK + PLATE, trim),  # mudguards
        box(-4, 4, -1.8, 1.8, 0.3, BRICK + PLATE, main),  # hull body
        box(-4.6, 4.6, -1.8, 1.8, BRICK + PLATE, top, main),  # deck plate
        box(4.6, 5.0, -1.8, 1.8, 0.4, BRICK + PLATE, trim),  # front plate
    ] + studs(-4.5, 4.5, -1.5, 1.5, top, main, lambda x, y: -3 < x < 2) \
      + studs(-4.5, 4.5, -3, -2, BRICK + PLATE, trim) + studs(-4.5, 4.5, 2, 3, BRICK + PLATE, trim)


def turret_parts(main, trim):
    z0 = BRICK + 2 * PLATE
    z1 = z0 + BRICK
    return [
        box(-2.6, 1.8, -1.9, 1.9, z0, z1, main),
        box(-3.0, -2.6, -1.6, 1.6, z0 + 0.2, z1 - 0.1, trim),  # bustle
        box(1.8, 2.4, -1.2, 1.2, z0 + 0.1, z1 - 0.1, trim),  # mantlet
        box(2.4, 6.6, -0.28, 0.28, z0 + 0.5, z0 + 0.95, BARREL),
        box(6.2, 6.9, -0.38, 0.38, z0 + 0.42, z0 + 1.03, BARREL),  # muzzle
        box(-1.6, -0.6, 0.5, 1.5, z1, z1 + 0.5, trim),  # hatch
    ] + studs(-2.5, 1.5, -1.5, 1.5, z1, main, lambda x, y: -1.6 < x < -0.6 and 0.5 < y < 1.5)


def part_centre(part):
    kind, g, _ = part
    if kind == 'box':
        x0, x1, y0, y1, z0, z1 = g
        return (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    return g[0], g[1], g[2] + 0.11


def faces(part):
    kind, g, col = part
    if kind == 'box':
        x0, x1, y0, y1, z0, z1 = g
        c = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        q = lambda *i: [c[k] for k in i]
        return [q(1, 3, 7, 5), q(0, 2, 6, 4), q(4, 5, 7, 6), q(0, 1, 3, 2), q(2, 3, 7, 6), q(0, 1, 5, 4)]
    cx, cy, z = g
    r, h, n = 0.3, 0.22, 10
    ring = [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    out = [[(x, y, z + h) for x, y in ring]]
    for k in range(n):
        (ax, ay), (bx, by) = ring[k], ring[(k + 1) % n]
        out.append([(ax, ay, z), (bx, by, z), (bx, by, z + h), (ax, ay, z + h)])
    return out


def render(parts, heading, shadow):
    """`heading`: screen direction of the nose, radians clockwise from up."""
    gx, gy = math.sin(heading), -math.cos(heading) / SIN_E
    n = math.hypot(gx, gy)
    fx, fy = gx / n, gy / n  # nose direction on the ground (x right, y towards the viewer)
    lx, ly = -fy, fx

    def world(p):
        u, v, z = p
        return u * fx + v * lx, u * fy + v * ly, z

    def proj(w):
        x, y, z = w
        return (PIVOT[0] + x * UNIT) * SS, (PIVOT[1] + (y * SIN_E - z * COS_E) * UNIT) * SS

    img = Image.new('RGBA', (CELL * SS, CELL * SS))
    if shadow:
        sh = Image.new('L', img.size)
        ImageDraw.Draw(sh).polygon([proj(world((u * 5.2, v * 3.4, 0))) for u, v in ((1, 1), (1, -1), (-1, -1), (-1, 1))], fill=110)
        img = Image.new('RGBA', img.size, (0, 0, 0, 0))
        img.putalpha(sh.filter(ImageFilter.GaussianBlur(2 * SS)))
    polys = []
    for part in parts:
        cw = world(part_centre(part))
        for pts in faces(part):
            w = [world(p) for p in pts]
            a, b, c = w[0], w[1], w[2]
            nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
            ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
            nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            mid = [sum(p[i] for p in w) / len(w) for i in range(3)]
            if nx * (mid[0] - cw[0]) + ny * (mid[1] - cw[1]) + nz * (mid[2] - cw[2]) < 0:
                nx, ny, nz = -nx, -ny, -nz
            ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            nx, ny, nz = nx / ln, ny / ln, nz / ln
            if ny * COS_E + nz * SIN_E <= 0.01:
                continue  # facing away from the camera
            depth = mid[1] * COS_E + mid[2] * SIN_E
            shade = 0.5 + 0.6 * max(0.0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2])
            rgb = tuple(min(255, int(ch * shade)) for ch in part[2])
            polys.append((depth, [proj(p) for p in w], rgb))
    d = ImageDraw.Draw(img)
    for _, pts, rgb in sorted(polys, key=lambda t: t[0]):
        d.polygon(pts, fill=rgb + (255,), outline=tuple(int(ch * 0.6) for ch in rgb) + (255,))
    return img.resize((CELL, CELL), Image.LANCZOS)


def main():
    sheets = {}
    for faction, (main_c, trim) in COLOURS.items():
        for name, parts, shadow in (('hull', hull_parts(main_c, trim), True), ('turret', turret_parts(main_c, trim), False)):
            sheet = Image.new('RGBA', (CELL * DIRS, CELL))
            for d in range(DIRS):
                sheet.alpha_composite(render(parts, d / DIRS * 2 * math.pi, shadow), (d * CELL, 0))
            sheet.save(f'public/sprites/tank-lego-{faction}-{name}.png', optimize=True)
            sheets[faction, name] = sheet
    if '--preview' in sys.argv:
        pv = Image.new('RGBA', (CELL * 8, CELL * len(COLOURS)), (90, 110, 70, 255))
        for r, f in enumerate(COLOURS):
            for c in range(8):
                pv.alpha_composite(sheets[f, 'hull'].crop((c * 4 * CELL, 0, (c * 4 + 1) * CELL, CELL)), (c * CELL, r * CELL))
                t = (c * 4 + r * 3) % DIRS
                pv.alpha_composite(sheets[f, 'turret'].crop((t * CELL, 0, (t + 1) * CELL, CELL)), (c * CELL, r * CELL))
        pv.resize((pv.width * 2, pv.height * 2), Image.LANCZOS).save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
