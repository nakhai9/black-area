"""Appends palm billboards (tools/blender/palm_render.py output) to the tree sheet ui/public/sprites/trees.webp.

    python tools/palm_sheet.py <palm png dir>

Keeps the first FIR_COLS columns (fir trees), then one 64 x 96 column per palm_*.png (sorted), each cropped to its
alpha box, fitted, centred, trunk base BASE_PAD px above the bottom edge (render/TreeSheet.ts).
"""
import glob
import os
import sys

from PIL import Image

FIR_COLS, CW, CH, BASE_PAD = 14, 64, 96, 2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "ui", "public", "sprites", "trees.webp")

palms = sorted(glob.glob(os.path.join(sys.argv[1], "palm_*.png")))
firs = Image.open(SHEET).convert("RGBA").crop((0, 0, FIR_COLS * CW, CH))
out = Image.new("RGBA", ((FIR_COLS + len(palms)) * CW, CH), (0, 0, 0, 0))
out.paste(firs, (0, 0))
for i, p in enumerate(palms):
    im = Image.open(p).convert("RGBA")
    im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox())
    s = min(CW / im.width, (CH - BASE_PAD) / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    out.alpha_composite(im, ((FIR_COLS + i) * CW + (CW - im.width) // 2, CH - BASE_PAD - im.height))
out.save(SHEET, "WEBP", quality=90, method=6)
print(f"{SHEET}: {FIR_COLS} firs + {len(palms)} palms")
