"""Procedural 16-direction engineer sheet (same layout as the other 'dir16' soldier sheets).

1536x1536, 16x16 cells of 96 px. Columns = screen directions (0 = up/north, clockwise).
Rows: 0 idle, 1-4 walk, 5 aim (wrench raised), 6 fire (wrench strike), 7-10 dying, 11-14 empty (no swim), 15 shadow.
The soldier stands ~36 px tall with the feet at (48, 66) of each cell.

Usage: python tools/engineer-render/render_engineer_sheet.py   (writes public/sprites/<fx>-engineer.png for all nations)
"""
import math
from PIL import Image, ImageDraw, ImageFilter

CELL = 96
SS = 4                      # supersampling
BIG = CELL * SS
FEET = (48 * SS, 66 * SS)
UNIT = 36 / 48 * SS         # model units (48 tall) -> big px
ELEV = math.radians(30)     # 2:1 isometric view

NATIONS = {
    'us': dict(uniform='#8a7a55', trousers='#5a5038', team='#2f6fe0'),
    'ru': dict(uniform='#7c7552', trousers='#4f4a34', team='#d22b2b'),
    'cn': dict(uniform='#6e7a4a', trousers='#4b5533', team='#e8b10a'),
    'eu': dict(uniform='#6a6a50', trousers='#4a4a38', team='#8a5cf6'),
}
HAT = '#f2c230'; SKIN = '#c99a72'; BOOT = '#2a2620'; STEEL = '#9aa3ab'; BELT = '#3b3326'; VEST = '#e8762a'
OUTLINE = (18, 16, 12, 255)


def hx(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def tint(rgb, k):
    return tuple(max(0, min(255, int(v * k))) for v in rgb)


def rot(v, axis, a):
    """Rotate vector v=(f, r, z) about 'r' (pitch) or 'z' (yaw) axis."""
    f, r, z = v
    c, s = math.cos(a), math.sin(a)
    if axis == 'r':
        return (f * c - z * s, r, f * s + z * c)
    return (f * c - r * s, f * s + r * c, z)


class Pose:
    def __init__(self, phase=0.0, moving=False, arm='idle', fall=0.0):
        self.phase, self.moving, self.arm, self.fall = phase, moving, arm, fall


def skeleton(p):
    """Returns parts: list of (kind, pts, radius, colour) in model space (f forward, r right, z up)."""
    s = math.sin(p.phase) if p.moving else 0.0
    c = math.cos(p.phase) if p.moving else 0.0
    bob = abs(c) * 0.8 if p.moving else 0.0
    hipz = 23 + bob
    parts = []
    # Legs: swing forward/back, knee bends on the forward swing.
    for side, sg in ((-1, 1), (1, -1)):
        sw = 0.45 * s * sg
        hip = (0, 3.4 * side, hipz)
        knee = (math.sin(sw) * 11, 3.6 * side, hipz - math.cos(sw) * 11)
        bend = max(0.0, 0.5 * math.sin(p.phase + (0 if sg > 0 else math.pi))) if p.moving else 0.0
        foot = (knee[0] + math.sin(sw - bend) * 11, 3.6 * side, max(1.2, knee[2] - math.cos(sw - bend) * 11))
        toe = (foot[0] + 3.2, foot[1], foot[2] - 0.2)
        parts += [('cap', (hip, knee), 3.0, 'trousers'), ('cap', (knee, foot), 2.6, 'trousers'),
                  ('cap', (foot, toe), 2.0, BOOT)]
    # Torso, belt, safety-vest, backpack toolbox.
    chest = (0.6, 0, hipz + 13)
    parts += [('cap', ((0, 0, hipz + 1), chest), 5.6, 'uniform'),
              ('cap', ((0.2, -4.6, hipz + 9), (0.2, 4.6, hipz + 9)), 3.6, VEST),
              ('cap', ((0, -3.6, hipz + 1.5), (0, 3.6, hipz + 1.5)), 2.6, BELT),
              ('cap', ((-5.2, -3, hipz + 6), (-5.2, 3, hipz + 11)), 3.0, '#56503a')]
    # Arms.
    sh_l, sh_r = (0.4, -6.4, hipz + 12.5), (0.4, 6.4, hipz + 12.5)
    sa = 0.5 * s
    el_l = (math.sin(-sa) * 7, -7.2, sh_l[2] - math.cos(sa) * 7)
    ha_l = (el_l[0] + 4 + math.sin(-sa) * 3, -7.0, el_l[2] - 6)
    if p.arm == 'aim':
        el_r, ha_r = (4.5, 7.2, sh_r[2] - 2.5), (9.5, 5.5, sh_r[2] + 1.5)
    elif p.arm == 'fire':
        el_r, ha_r = (5.5, 7.0, sh_r[2] - 4), (10, 5.0, sh_r[2] - 9)
    else:
        el_r = (math.sin(sa) * 7, 7.2, sh_r[2] - math.cos(sa) * 7)
        ha_r = (el_r[0] + 4 + math.sin(sa) * 3, 7.0, el_r[2] - 6)
    parts += [('cap', (sh_l, el_l), 2.3, 'uniform'), ('cap', (el_l, ha_l), 2.0, 'uniform'),
              ('ball', (ha_l,), 1.8, SKIN), ('ball', ((0.4, -6.9, hipz + 11.5),), 2.4, 'team'),
              ('cap', (sh_r, el_r), 2.3, 'uniform'), ('cap', (el_r, ha_r), 2.0, 'uniform'),
              ('ball', (ha_r,), 1.8, SKIN)]
    # Wrench in the right hand: handle + jaw.
    if p.arm == 'aim':
        tip = (ha_r[0] + 3, ha_r[1], ha_r[2] + 9)
    elif p.arm == 'fire':
        tip = (ha_r[0] + 9, ha_r[1], ha_r[2] - 2)
    else:
        tip = (ha_r[0] + 4, ha_r[1], ha_r[2] - 8)
    parts += [('cap', (ha_r, tip), 1.0, STEEL), ('ball', (tip,), 2.2, STEEL)]
    # Head + hard hat (dome + brim).
    head = (1.0, 0, hipz + 19.5)
    parts += [('cap', ((0.6, 0, hipz + 14.5), (0.8, 0, hipz + 16.5)), 2.0, SKIN),
              ('ball', (head,), 4.2, SKIN),
              ('cap', ((head[0] - 0.6, 0, head[2] + 2.2), (head[0] + 2.6, 0, head[2] + 1.6)), 4.6, HAT),
              ('ball', ((head[0] - 0.2, 0, head[2] + 3.2),), 4.4, HAT)]
    # Dying: tip over backwards around the feet.
    if p.fall > 0:
        a = -p.fall * math.radians(88)
        parts = [(k, tuple(lift(rot(q, 'r', a), p.fall) for q in pts), rad, col) for k, pts, rad, col in parts]
    return parts


def lift(q, fall):
    f, r, z = q
    return (f - fall * 4, r, max(z, 2.2 * fall))


def project(q, yaw):
    f, r, z = rot(q, 'z', yaw)
    # Ground: x to the right on screen, y = depth (towards the viewer). Facing yaw 0 = screen east.
    x, y = f, r
    sx = FEET[0] + x * UNIT
    sy = FEET[1] + (y * math.sin(ELEV) - z * math.cos(ELEV)) * UNIT
    return sx, sy, y * math.cos(ELEV) + z * math.sin(ELEV)


def draw_cell(nat, pose, col):
    theta = col * math.pi / 8 - math.pi / 2           # screen angle (0 = east, clockwise)
    yaw = math.atan2(math.sin(theta) / math.sin(ELEV), math.cos(theta))
    img = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    items = []
    for kind, pts, rad, colour in skeleton(pose):
        pp = [project(q, yaw) for q in pts]
        depth = sum(p[2] for p in pp) / len(pp)
        rgb = hx(nat[colour]) if colour in nat else hx(colour)
        items.append((depth, kind, pp, rad * UNIT, rgb))
    items.sort(key=lambda t: t[0])
    for _, kind, pp, r, rgb in items:
        shade(d, pp, r, tint(rgb, 0.72))
        # Highlight from the upper-left light.
        hp = [(x - r * 0.25, y - r * 0.3, z) for x, y, z in pp]
        shade(d, hp, r * 0.62, rgb)
        hp = [(x - r * 0.4, y - r * 0.45, z) for x, y, z in pp]
        shade(d, hp, r * 0.25, tint(rgb, 1.25))
    # Clip highlights to the silhouette by re-masking, then add a dark outline.
    mask = Image.new('L', (BIG, BIG), 0)
    md = ImageDraw.Draw(mask)
    for _, kind, pp, r, _ in items:
        shade(md, pp, r, 255)
    body = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    body.paste(img, (0, 0), mask)
    outline = mask.filter(ImageFilter.MaxFilter(2 * SS + 1))
    out = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    out.paste(Image.new('RGBA', (BIG, BIG), OUTLINE), (0, 0), outline)
    out.alpha_composite(body)
    return out.resize((CELL, CELL), Image.LANCZOS)


def shade(d, pp, r, fill):
    for x, y, _ in pp:
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)
    if len(pp) == 2:
        (x0, y0, _), (x1, y1, _) = pp
        L = math.hypot(x1 - x0, y1 - y0) or 1e-6
        nx, ny = -(y1 - y0) / L * r, (x1 - x0) / L * r
        d.polygon([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], fill=fill)


def shadow_cell():
    img = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rx, ry = 10 * UNIT, 5 * UNIT
    d.ellipse((FEET[0] - rx, FEET[1] - ry, FEET[0] + rx, FEET[1] + ry), fill=(0, 0, 0, 200))
    return img.filter(ImageFilter.GaussianBlur(SS * 1.5)).resize((CELL, CELL), Image.LANCZOS)


def rows():
    r = [Pose()]
    r += [Pose(phase=i * math.pi / 2 + math.pi / 4, moving=True) for i in range(4)]
    r += [Pose(arm='aim'), Pose(arm='fire')]
    r += [Pose(fall=(i + 1) / 4) for i in range(4)]
    return r


def main():
    shadow = shadow_cell()
    for fx, nat in NATIONS.items():
        sheet = Image.new('RGBA', (CELL * 16, CELL * 16), (0, 0, 0, 0))
        for ri, pose in enumerate(rows()):
            for col in range(16):
                sheet.alpha_composite(draw_cell(nat, pose, col), (col * CELL, ri * CELL))
        for col in range(16):
            sheet.alpha_composite(shadow, (col * CELL, 15 * CELL))
        path = f'public/sprites/{fx}-engineer.png'
        sheet.save(path, optimize=True)
        print(path, 'written')


if __name__ == '__main__':
    main()
