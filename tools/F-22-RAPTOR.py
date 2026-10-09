"""
SMOOTH-TURN aircraft sheet: 64 facings (5.625 deg steps) with banking frames, so a plane can
change heading smoothly and visibly lean into the turn.
Cell = aircraft cell, 16 columns x 24 rows.
  R0-3    LEVEL            64 facings
  R4-7    BANK LEFT  30    64 facings   (gentle left turn)
  R8-11   BANK RIGHT 30    64 facings   (gentle right turn)
  R12-15  BANK LEFT  60    64 facings   (hard left turn)
  R16-19  BANK RIGHT 60    64 facings   (hard right turn)
  R20-23  SHADOW           64 facings
Facing f (0..63): heading = f * 5.625 deg, 0 = screen-up, clockwise. Facing 4k matches facing k of
the 16-step rows and facing 2k matches the 32-facing rows of the normal sheets.
Usage:  python3 turn_sprites.py f22 | su35 | tu16 | b52
"""
import sys
import numpy as np
from PIL import Image
import bomber_sprites as bs
from bomber_sprites import shade, shadow_layer, rot_model

ROWS = [(0, 0), (4, -30), (8, 30), (12, -60), (16, 60)]   # (first row, roll deg; negative = left wing down)

def build_turn_sheet(ac, path):
    cs = ac.cell
    sheet = np.zeros((24 * cs, 16 * cs, 4))
    def put(img, r, c): sheet[r * cs:(r + 1) * cs, c * cs:(c + 1) * cs] = img
    arr = ac.build().arrays()
    for f in range(64):
        hd = f * 5.625
        for r0, roll in ROWS:
            put(shade(ac, arr, rot_model(hd, 0, roll), bs.SCALE, cs, cs), r0 + f // 16, f % 16)
        put(shadow_layer(arr[0] @ rot_model(hd).T, bs.SCALE, cs, cs), 20 + f // 16, f % 16)
        if f % 16 == 15: print(ac.name, "facing", f, flush=True)
    rgb, a = sheet[..., :3], sheet[..., 3:4]
    straight = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0)
    Image.fromarray((np.clip(np.concatenate([straight, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8),
                    "RGBA").save(path, optimize=True)
    print("saved", path)

if __name__ == "__main__":
    out = "/mnt/user-data/outputs/"
    which = sys.argv[1] if len(sys.argv) > 1 else "f22"
    if which == "f22":
        from f22_sprites import F22; build_turn_sheet(F22(), out + "f22_raptor_turn_sheet.png")
    elif which == "su35":
        from green_faction import Su35; build_turn_sheet(Su35(), out + "islamic_su35_turn_sheet.png")
    elif which == "tu16":
        build_turn_sheet(bs.Tu16(), out + "tu16_turn_sheet.png")
    elif which == "b52":
        build_turn_sheet(bs.B52(), out + "b52_turn_sheet.png")
