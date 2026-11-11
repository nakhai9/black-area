#!/usr/bin/env python3
"""
Builds the Russian Tu-160 strategic bomber as a 3D model in code (after its three-view blueprint) and renders it into
public/sprites/tu160-russia.png (wings spread) and
tu160-russia-turbo.png (wings swept, drawn while the turbo runs) with the renderer and camera of tools/aircraft_model_sheet.py, in its 'bomber' layout
(the one AircraftSheets.ts reads): 16 columns (screen headings clockwise from N) by 9 rows — 0 parked, 1-2 flying,
3 ramp (= parked), 4 banked left, 5 banked right, 6-7 crashing, 8 shadow — at 192 px cells (sharp when zoomed); side-on the aircraft spans
0.74 of a cell.
Blueprint features: 54 m slender fuselage with a long pointed nose and probe, stepped cockpit; the big fixed wing glove
blended into the body from just behind the cockpit; variable-geometry outer wings (swept back for flight, 65°); two
twin-engine nacelles under the glove (rectangular intakes, four round nozzles); tall swept fin with the tailplanes set
part-way up it and an all-moving upper fin; tail cone with the brake-chute fairing. Painted "White Swan" white.
The mesh is painted here (point colours on a finely split mesh) and rendered in Blender Cycles (tools/tu160_blender.py)
with the tank sheets' lighting: crisp edges, real shading and gloss.
Usage: python -I tools/tu160_model_sheet.py [spread|swept] [--preview out.png]   (env TU160_SAMPLES, default 32)   (run from ui/)
"""
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aircraft_model_sheet as am  # noqa: E402
import tank_model_sheet as tm  # noqa: E402
from awacs_model_sheet import Mesh, box, ellipsoid, glazing_paint, loft, noise, pane, radome_cap, sections_at, star, surface, wiper  # noqa: E402

CELL = 192  # twice the fighters' cells: a sharp picture when zoomed in
am.CELL = CELL

# Metres; u forward (nose +), v left, z up.
L = 54.1
NOSE = L / 2  # u of the nose tip
CZ = 2.7  # fuselage axis height
WING_Z = 2.75  # glove / wing plane height
BODY = 1.9  # fuselage drawn this much fatter than true scale: it must read as a body, not a toothpick, at sprite size
PIVOT_V = 9.6  # outer wing pivot, from the centre line
# Outer wing positions: spread (20°, span 55.7 m) normally, swept (65°, span 35.6 m) while the turbo runs.
WINGS = {
    'spread': dict(span=55.7 / 2 - PIVOT_V, sweep=lambda span: span * math.tan(math.radians(20)), out='tu160-russia'),
    'swept': dict(span=35.6 / 2 - PIVOT_V, sweep=lambda span: span * math.tan(math.radians(65)) * 0.55, out='tu160-russia-turbo'),
}


def nose_profile(keys, L, n=40):
    """Blueprint side / top outline of the nose -> loft profile rows (f, half-width, half-height, axis z offset).
    keys: (metres from the tip, crown z, belly z, half width) off the three-view; rows are spaced densely towards the
    tip (cosine) so the radome stays smooth."""
    k = np.array(keys, float)
    xe = k[-1, 0]
    rows = []
    for i in range(n):
        x = xe * (1 - math.cos(math.pi / 2 * i / n))
        top, bot, hw = (float(np.interp(x, k[:, 0], k[:, j])) for j in (1, 2, 3))
        rows.append((x / L, hw, (top - bot) / 2, (top + bot) / 2))
    return rows


# Tu-160 nose off the three-view (metres from the tip; heights and widths before BODY scaling: crown z, belly z, half width).
NOSE_KEYS = [
    (0.0, -0.55, -0.55, 0.02), (0.4, -0.42, -0.68, 0.16), (1.5, -0.22, -0.85, 0.40), (3.0, 0.00, -1.02, 0.66),
    (5.0, 0.25, -1.18, 0.92), (7.0, 0.52, -1.30, 1.12), (7.8, 0.70, -1.33, 1.20),  # windscreen base
    (8.8, 1.20, -1.37, 1.30), (10.0, 1.42, -1.40, 1.40), (11.5, 1.50, -1.43, 1.50), (0.26 * L, 1.45, -1.45, 1.62),
]


def fuselage(m):
    """Nose cone → stepped cockpit → barrel → tail cone rising to the fin; sections (u, v, z, half-width, half-height)."""
    secs = []
    profile = [
        # f along the length (0 nose, 1 tail), half-width, half-height, axis z offset
        # Blueprint nose: long slender pointed radome with a near-straight belly line, the crown rising gently to a
        # short steep windscreen, then the low canopy hump fairing into the spine (units before BODY scaling).
        *nose_profile(NOSE_KEYS, L),
        (0.260, 1.62, 1.45, 0.00),
        (0.700, 1.62, 1.45, 0.00),
        (0.780, 1.45, 1.35, 0.10),
        (0.860, 1.10, 1.15, 0.30),
        (0.930, 0.70, 0.85, 0.55),
        (0.975, 0.38, 0.50, 0.72),
        (1.000, 0.12, 0.18, 0.80),
    ]
    for f, rv, rz, dz in profile:
        secs.append((NOSE - f * L, 0, CZ + dz * BODY, rv * BODY, rz * BODY))
    loft(m, secs, 'body', n=36, cap_back='body')
    radome_cap(m, secs, NOSE - 5.0, n=36)
    cockpit(m, sections_at(secs))
    # Nose probe (refuelling / pitot) ahead of the radome.
    box(m, (NOSE - 0.3, 0, CZ - 0.55 * BODY), (NOSE + 2.2, 0, CZ - 0.55 * BODY - 0.03), 0.12, 0.12, 'probe')
    # Spine behind the cockpit, flowing into the fin.
    loft(m, [(NOSE - 0.21 * L, 0, CZ + 1.42 * BODY, 0.05, 0.05), (NOSE - 0.24 * L, 0, CZ + 1.35 * BODY, 0.75, 0.42),
             (NOSE - 0.80 * L, 0, CZ + 1.45 * BODY, 0.75, 0.42), (NOSE - 0.86 * L, 0, CZ + 1.6 * BODY, 0.05, 0.05)], 'body', n=14)


def cockpit(m, at):
    """Stepped fighter-like canopy on the hump: two front windscreen panes with wipers, framed side windows."""
    x = lambda m_: NOSE - m_  # blueprint metres from the tip -> u
    for t0, t1 in ((62, 88), (92, 118)):
        pane(m, at, x(7.85), x(8.75), t0, t1)
        wiper(m, at, x(7.9), t0 + 5, t1 - 5)
    for t0, t1 in ((28, 55), (125, 152)):
        pane(m, at, x(8.85), x(9.9), t0, t1)
    for t0, t1 in ((34, 52), (128, 146)):
        pane(m, at, x(10.0), x(10.8), t0, t1)


def glove(m):
    """Fixed wing glove: long, highly swept root from behind the cockpit out to the pivot, blended into the body."""
    for s in (1, -1):
        # Leading-edge root extension (thin, very swept) …
        surface(m, (13.5, s * 1.3, WING_Z), (0, s, 0), PIVOT_V - 1.3, 21.0, 9.0, 15.2, 0.07, 'glove', ns=8, nc=10)
        # … and the slim fairing that blends it into the fuselage side.
        loft(m, [(13.5, s * 1.35, WING_Z, 0.05, 0.05), (9.0, s * 1.55, WING_Z, 0.35, 0.35), (-6.0, s * 1.6, WING_Z, 0.4, 0.38),
                 (-9.0, s * 1.4, WING_Z, 0.05, 0.05)], 'body', n=10)


def outer_wings(m, pos):
    """Variable-geometry outer panels (WINGS[pos]): the leading edge runs from the glove's pivot back to the tip."""
    span = WINGS[pos]['span']
    sweep = WINGS[pos]['sweep'](span)
    for s in (1, -1):
        root = (-1.4, s * (PIVOT_V - 0.4), WING_Z + 0.05)
        surface(m, root, (0, s, 0), span + 0.4, 6.6, 2.4, sweep, 0.09, 'wing', ns=8, nc=8)


def nacelles(m):
    """Two twin-engine nacelles under the glove: boxy bodies, rectangular intakes with splitter plates, round nozzles."""
    zc, h, w = 1.6, 1.9, 3.5
    front, back = 3.0, -15.0
    for s in (1, -1):
        cv = s * 5.3
        box(m, (front, cv, zc), (back, cv, zc), w, h, 'nacelle')
        # Intake faces (dark), angled, and the splitter between the two ducts.
        for half in (-1, 1):
            v0, v1 = cv + half * 0.08, cv + half * (w / 2 - 0.05)
            m.quad((front + 0.02, v0, zc - h / 2 + 0.05), (front + 0.02, v1, zc - h / 2 + 0.05),
                   (front + 0.02, v1, zc + h / 2 - 0.05), (front + 0.02, v0, zc + h / 2 - 0.05), 'intake')
        box(m, (front + 0.9, cv, zc), (front - 0.2, cv, zc), 0.12, h * 0.98, 'nacelle')
        # Ramp lip ahead of the intake, lower edge.
        box(m, (front + 0.7, cv, zc - h / 2 + 0.05), (front, cv, zc - h / 2 + 0.05), w, 0.1, 'nacelle')
        # Pylon up into the glove.
        box(m, (front - 1.0, cv, zc + h / 2), (back + 1.0, cv, WING_Z), 1.2, 0.5, 'nacelle')
        # Four round nozzles (two per nacelle), past the nacelle's end.
        for half in (-1, 1):
            nv = cv + half * 0.9
            loft(m, [(back + 0.2, nv, zc, 0.82, 0.82), (back - 1.2, nv, zc, 0.78, 0.78), (back - 2.4, nv, zc, 0.68, 0.68)],
                 'nozzle', n=18, cap_back='exhaust')


def tail(m):
    """Tall swept fin; the tailplanes sit about a third of the way up it; the top part is the all-moving fin."""
    root_u, root_z = -15.6, CZ + 1.2 * BODY
    surface(m, (root_u, 0, root_z), (0, 0, 1), 4.0, 11.5, 7.0, 4.6, 0.08, 'fin', ns=6, nc=10, up=(0, 1, 0))
    surface(m, (root_u - 4.6, 0, root_z + 4.0), (0, 0, 1), 4.6, 7.0, 3.2, 5.6, 0.08, 'finTop', ns=6, nc=8, up=(0, 1, 0))
    # Fairing where the tailplanes cross the fin.
    loft(m, [(root_u - 2.0, 0, root_z + 2.3, 0.05, 0.05), (root_u - 4.0, 0, root_z + 2.3, 0.42, 0.42),
             (root_u - 10.5, 0, root_z + 2.3, 0.42, 0.42), (root_u - 12.0, 0, root_z + 2.3, 0.05, 0.05)], 'fin', n=12)
    for s in (1, -1):
        surface(m, (root_u - 4.4, s * 0.35, root_z + 2.3), (0, s, 0), 6.9, 6.8, 2.4, 4.8, 0.07, 'tail', ns=6, nc=8)
    # Ventral strake under the tail cone.
    surface(m, (-19.0, 0, CZ - 0.6 * BODY), (0, 0, -1), 0.9, 4.0, 2.5, 1.2, 0.06, 'fin', ns=3, nc=6, up=(0, 1, 0))


def build(pos):
    m = Mesh()
    fuselage(m)
    glove(m)
    outer_wings(m, pos)
    nacelles(m)
    tail(m)
    v = np.array(m.v, float)
    v[:, 2] -= v[:, 2].min()
    tris = np.arange(len(v)).reshape(-1, 3)
    return v, tris, np.array(m.m)


# ------------------------------------------------------------------ paint

WHITE = (226, 228, 231)
RED = (196, 30, 30)


def paint(pos, nrm, parts, col):
    """All white ("White Swan"), body, wings, tail and nacelles alike; only the glazing, intakes and nozzles are dark,
    and a red star on the fin is the one marking."""
    u, v, z = pos[:, 0], pos[:, 1], pos[:, 2]
    col[:] = WHITE
    col[parts == 'intake'] = (30, 32, 36)
    col[parts == 'nozzle'] = (96, 90, 84)
    col[parts == 'exhaust'] = (44, 38, 34)
    col[parts == 'probe'] = (200, 202, 206)
    col[parts == 'radome'] = (212, 214, 216)  # radome: a shade off the airframe white
    # Faint panel lines only: the white must stay white.
    seam = ((parts == 'body') & (np.mod(u, 1.8) < 0.05)) | (np.isin(parts, ('wing', 'glove', 'tail')) & (np.mod(np.abs(v), 2.0) < 0.05))
    col[seam] *= 0.9
    # Red star (white-edged) on the fin, both sides.
    fin_side = np.isin(parts, ('fin', 'finTop')) & (np.abs(nrm[:, 1]) > 0.6)
    fin_side &= z > np.percentile(z[parts == 'body'], 90)  # the fin, not the ventral strake under the tail
    if fin_side.any():
        fz0 = z[fin_side].min()
        fu = u[fin_side & (z < fz0 + 3.0)].mean() - 0.8
        fz = fz0 + 2.4
        st = fin_side & star(u - fu, z - fz, 1.9)
        col[st] = (240, 240, 238)
        col[st & star(u - fu, z - fz, 1.55)] = RED
    glazing_paint(parts, col)
    return np.clip(col, 0, 255)


# ------------------------------------------------------------------ render

def subdivide(tri, parts, edge=0.16):
    """Splits every triangle along its longest edge until no edge is longer than `edge` metres, so the painted
    details (stars, flag, windows, panel lines) survive as corner colours in Blender."""
    for _ in range(40):
        e = np.stack([np.linalg.norm(tri[:, 1] - tri[:, 0], axis=1), np.linalg.norm(tri[:, 2] - tri[:, 1], axis=1),
                      np.linalg.norm(tri[:, 0] - tri[:, 2], axis=1)], 1)
        big = e.max(1) > edge
        if not big.any():
            break
        t, pt = tri[big], parts[big]
        k = e[big].argmax(1)
        # Rotate each triangle so its longest edge is corners 0-1.
        idx = np.stack([k, (k + 1) % 3, (k + 2) % 3], 1)
        t = np.take_along_axis(t, idx[:, :, None], 1)
        mid = (t[:, 0] + t[:, 1]) / 2
        a = np.stack([t[:, 0], mid, t[:, 2]], 1)
        b = np.stack([mid, t[:, 1], t[:, 2]], 1)
        tri = np.concatenate([tri[~big], a, b])
        parts = np.concatenate([parts[~big], pt, pt])
    return tri, parts


def render_sheet(wings, preview, build=build, paint=paint, outs=WINGS):
    """Renders one wing position's sheet; build / paint / outs let other aircraft (b1_model_sheet.py) reuse it."""
    v, tris, mats = build(wings)
    ext = v.max(0) - v.min(0)
    scale = CELL * 0.74 / ext[0]  # by the length: both wing positions come out the same size
    zmid = (v[:, 2].max() + v[:, 2].min()) / 2
    tri, parts = subdivide(v[tris], mats[np.arange(len(tris))])
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1), 1e-9)[:, None]
    corners = tri.reshape(-1, 3)
    cparts = np.repeat(parts, 3)
    colours = paint(corners, np.repeat(nrm, 3, 0), cparts, np.zeros((len(corners), 3)))
    names = np.unique(parts)
    tmp = tempfile.mkdtemp()
    npz = os.path.join(tmp, 'mesh.npz')
    np.savez(npz, corners=corners, colours=colours / 255.0, parts=np.searchsorted(names, parts), names=names)
    raw = os.path.join(tmp, 'poses.npy')
    print(f'{wings}: {len(tri)} triangles, rendering in Blender…', flush=True)
    subprocess.run([am.BLENDER, '-b', '--factory-startup', '-P', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tu160_blender.py'),
                    '--', npz, raw, str(CELL), str(scale), str(zmid), os.environ.get('TU160_SAMPLES', '32')], check=True, capture_output=True)
    poses = np.load(raw)  # 5 rows: level, bank left, bank right, crash 1, crash 2
    pose = lambda i, tint=1.0: Image.fromarray(np.dstack([np.clip(poses[i * CELL:(i + 1) * CELL, :, :3] * tint, 0, 1),
                                                          poses[i * CELL:(i + 1) * CELL, :, 3:]]).__mul__(255).round().astype(np.uint8), 'RGBA')
    rows = [pose(0), pose(0), pose(0), pose(0), pose(1), pose(2), pose(3, 0.6), pose(4, 0.4)]
    dirs = 32  # 32 RA2 facings, like the tanks (column 0 = screen North, clockwise)
    sheet = Image.new('RGBA', (CELL * dirs, CELL * 9))
    for r, img in enumerate(rows):
        sheet.paste(img, (0, r * CELL))
    # Shadow row: the silhouette on the ground, from the point renderer.
    kd = {p: np.ones(3) for p in np.unique(mats)}
    density = (scale * am.SS * 1.0) ** 2
    pos, _, pn, _ = tm.sample(v, np.zeros((1, 2)), tris, np.zeros_like(tris), mats, {}, kd, density, (255, 255, 255))
    for d in range(dirs):
        sheet.alpha_composite(am.render(pos, np.zeros((len(pos), 3)), pn, d / dirs * 2 * math.pi, scale, zmid, 1, True), (d * CELL, 8 * CELL))
    out = f"public/sprites/{outs[wings]['out']}.png"
    sheet.save(out, optimize=True)
    print(f'{out}  length {ext[0]:.1f} m, span {ext[1]:.1f} m, height {ext[2]:.1f} m')
    if preview:
        pv = Image.new('RGBA', (CELL * 8, CELL * 2), (96, 116, 74, 255))
        for i, r in enumerate((1, 4)):
            for c in range(8):
                pv.alpha_composite(sheet.crop((c * 4 * CELL, r * CELL, (c * 4 + 1) * CELL, (r + 1) * CELL)), (c * CELL, i * CELL))
        pv.save(preview.replace('.png', f'-{wings}.png'))


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    only = [a for a in sys.argv[1:] if a in WINGS]
    for wings in only or WINGS:
        render_sheet(wings, preview)


if __name__ == '__main__':
    main()
