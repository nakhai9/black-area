#!/usr/bin/env python3
"""
Renders a static landmark from a 3D model (a .blend download, not kept in the repo) into one isometric picture,
public/sprites/<out>.png, drawn in the game's own building projection (IsoPainter: u right-down, v left-down, 2:1
tiles of TILE_W x TILE_H art px, heights in art px) so it sits on its footprint like the procedural buildings.
The picture is PX_PER_ART times the art size; its ground centre is the middle of the bottom-centre footprint diamond,
written beside it as <out>.json ({ anchorX, anchorY, scale }) for the drawing code.
Models: lenin (Lenin's Mausoleum, Red Square: footprint 4 x 3, the long side along u).
Usage: python -I tools/monument_model_sheet.py <model> <download folder>   (run from ui/)
"""
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tank_model_sheet as tm  # noqa: E402

BLENDER = os.environ.get('BLENDER', 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
HALF_TW, HALF_TH = 32, 16
PX_PER_ART = 3  # picture px per art px (the sprite cache rasterises at 2x; a little extra keeps it crisp when zoomed)
SS = 3

MODELS = {
    # Footprint in cells (w along u, d along v) and how tall the real building is against its length (art px per cell
    # of height: matched to the procedural capitals, ~22 art px per cell).
    'lenin': dict(blend='source/mausoleum/mausoleum.blend', texture='textures/mausoleum1.png', out='lenin-mausoleum',
                  footprint=(4, 3), z_px_per_cell=22),
    # Statue of Liberty (FBX): a 2 x 2 plot, tall — the statue on its pedestal stands about 5 cells high.
    'liberty': dict(src='source/Nintendo Switch - Animal Crossing_ New Horizons - Furniture - St/Statue of Liberty/Statue of Liberty.fbx',
                    texture='textures/mBody_Alb.png', out='statue-of-liberty', footprint=(2, 2), z_px_per_cell=22),
}

LIGHT = np.array([-0.45, 0.35, 0.82])
LIGHT /= np.linalg.norm(LIGHT)


def main():
    name, folder = sys.argv[1], sys.argv[2]
    cfg = MODELS[name]
    tmp = tempfile.mkdtemp()
    obj = os.path.join(tmp, 'model.obj')
    if 'blend' in cfg:
        subprocess.run([BLENDER, '--background', os.path.join(folder, cfg['blend']), '--python',
                        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blend_to_obj.py'), '--', obj], check=True, capture_output=True)
    else:
        import model_to_obj  # noqa: E402  (FBX / COLLADA → OBJ)
        model_to_obj.write_obj(model_to_obj.fbx_meshes(os.path.join(folder, cfg['src'])), obj)
    v, vt, tris, uvs, mats, objs, textures, kd = tm.load('', dict(obj=obj, mtl=obj[:-4] + '.mtl', skip=()))
    for m in np.unique(mats):
        textures[m] = os.path.join(folder, cfg['texture'])
        kd[m] = np.ones(3)
    p = v[np.unique(tris)]
    lo, hi = p.min(0), p.max(0)
    # OBJ is Y up: ground plane x / z. The longer ground side runs along u.
    ex, ez = hi[0] - lo[0], hi[2] - lo[2]
    long_x = ex >= ez
    fw, fd = cfg['footprint']
    cells_per_m = fw / (ex if long_x else ez)
    gu = ((v[:, 0] - lo[0]) if long_x else (v[:, 2] - lo[2])) * cells_per_m
    gv = ((v[:, 2] - lo[2]) if long_x else (hi[0] - v[:, 0])) * cells_per_m
    # Centre the short side on the footprint.
    gv += (fd - (ez if long_x else ex) * cells_per_m) / 2
    gz = (v[:, 1] - lo[1]) * cells_per_m * cfg['z_px_per_cell']
    model = np.stack([gu, gv, gz], 1)
    density = (HALF_TW * PX_PER_ART * SS * 1.4) ** 2 / 1.0
    pos, col, nrm, _ = tm.sample(model * np.array([1, 1, 1 / (HALF_TW)]), vt, tris, uvs, mats, textures, kd, density, (200, 200, 200))
    pos[:, 2] *= HALF_TW
    # Normals in a frame where z is scaled like u, v (for the light).
    n = nrm.copy()
    n = np.where((n @ np.array([0.4, 0.4, 0.8]))[:, None] < 0, -n, n)
    shade = 0.62 + 0.62 * np.clip(n @ LIGHT, 0, 1)
    rgb = np.clip(col * shade[:, None], 0, 255)
    # Projection (IsoPainter.project): x = (u - v) * HALF_TW, y = (u + v) * HALF_TH - z.
    sx = (pos[:, 0] - pos[:, 1]) * HALF_TW
    sy = (pos[:, 0] + pos[:, 1]) * HALF_TH - pos[:, 2]
    height = pos[:, 2].max()
    x0 = -fd * HALF_TW - 4
    y0 = -height - 4
    W = int(math.ceil((fw + fd) * HALF_TW + 8))
    H = int(math.ceil((fw + fd) * HALF_TH + height + 8))
    k = PX_PER_ART * SS
    px = ((sx - x0) * k).astype(int)
    py = ((sy - y0) * k).astype(int)
    depth = pos[:, 0] + pos[:, 1] + pos[:, 2] / HALF_TW  # nearer the viewer: further along u + v, or higher
    ok = (px >= 0) & (px < W * k) & (py >= 0) & (py < H * k)
    order = np.argsort(depth[ok], kind='stable')  # far first, near overwrite
    idx = np.nonzero(ok)[0][order]
    out = np.zeros((H * k, W * k, 4), np.uint8)
    out[py[idx], px[idx], :3] = rgb[idx]
    out[py[idx], px[idx], 3] = 255
    img = Image.fromarray(out, 'RGBA')
    filled = img.filter(ImageFilter.MaxFilter(3))
    a = np.asarray(img).copy()
    holes = (a[..., 3] == 0) & (np.asarray(img.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5))) > 0)
    a[holes] = np.asarray(filled)[holes]
    img = Image.fromarray(a, 'RGBA').resize((W * PX_PER_ART, H * PX_PER_ART), Image.LANCZOS)
    dest = f'public/sprites/{cfg["out"]}.png'
    img.save(dest, optimize=True)
    # Art-space origin (footprint corner u = v = 0, z = 0) inside the picture, in art px.
    meta = dict(originX=-x0, originY=-y0, scale=PX_PER_ART, footprint=list(cfg['footprint']), height=math.ceil(height))
    with open(f'public/sprites/{cfg["out"]}.json', 'w') as f:
        json.dump(meta, f)
    print(dest, img.size, meta)


if __name__ == '__main__':
    main()
