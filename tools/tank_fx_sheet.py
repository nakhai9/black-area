#!/usr/bin/env python3
"""
Cuts the 16-frame tank explosion (panel "File 4: Abrams_Explosion" of resources/tank-fx/abrams_fx_ref.png, drawn over
a dark transparency checkerboard) into public/sprites/tank-blast.png: one row of 16 frames of CELL px, shared by every
nation's tanks (TankSheets.drawTankDeath).

The backdrop is near black, so opacity is taken from brightness: fire stays solid, smoke half see-through, and the
checkerboard goes clear; fire colours are un-premultiplied, smoke keeps its dark grey.
Usage: python -I tools/tank_fx_sheet.py   (run from the repo root)
"""
import numpy as np
from PIL import Image

SRC = 'resources/tank-fx/abrams_fx_ref.png'
OUT = 'public/sprites/tank-blast.png'
CELL = 64
SRC_CELL = 84
# Frame centres (x, y) in the reference: 6 per row, 4 in the last.
XS = [559, 642, 724, 809, 894, 977]
YS = [347, 430, 510]
FRAMES = 16
DARK = 24      # checkerboard and below: clear
FULL = 95      # this bright (brightest channel) and above: solid


def main():
    ref = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    sheet = Image.new('RGBA', (CELL * FRAMES, CELL), (0, 0, 0, 0))
    for i in range(FRAMES):
        cx, cy = XS[i % 6], YS[i // 6]
        h = SRC_CELL // 2
        a = ref[cy - h:cy + h, cx - h:cx + h]
        peak = a.max(-1)
        alpha = np.clip((peak - DARK) / (FULL - DARK), 0, 1)
        # Fire (coloured) is un-premultiplied to stay bright; smoke (grey) keeps its own dark colour.
        fire = (a.max(-1) - a.min(-1)) > 40
        rgb = np.where(fire[..., None], a / np.maximum(alpha[..., None], 1e-3), a)
        rgb = np.clip(rgb, 0, 255)
        # Soft round mask so no square edge of the cell shows.
        yy, xx = np.mgrid[-h:h, -h:h] / h
        alpha *= np.clip((1 - np.hypot(xx, yy)) / 0.15, 0, 1)
        im = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA').resize((CELL, CELL), Image.LANCZOS)
        sheet.alpha_composite(im, (i * CELL, 0))
    sheet.save(OUT, optimize=True)
    print('saved', OUT, sheet.size)


if __name__ == '__main__':
    main()
