#!/usr/bin/env python3
"""
The five AWACS (tools/awacs_model_sheet.py models and paint) rendered sharp like the bombers: painted mesh, Blender
Cycles with the tank sheets' lighting, 192 px cells (tools/tu160_model_sheet.py render_sheet) into
public/sprites/awacs-<faction>.png, the 16 x 9 'bomber' layout AircraftSheets.ts reads.
Usage: python -I tools/awacs_blender_sheet.py [faction ...]   (run from ui/, env TU160_SAMPLES)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import awacs_model_sheet as aw  # noqa: E402
import tu160_model_sheet as base  # noqa: E402  (imported after awacs_model_sheet: sets the 192 px cell)
import aircraft_model_sheet as am  # noqa: E402

am.CELL = base.CELL


def main():
    factions = [a for a in sys.argv[1:] if a in aw.BUILDERS] or list(aw.BUILDERS)
    for f in factions:
        base.render_sheet(
            f, None,
            build=lambda _f, f=f: aw.build(f),
            paint=lambda pos, nrm, parts, col, f=f: aw.paint(f, pos, nrm, parts, col),
            outs={f: dict(out=f'awacs-{f}')},
        )


if __name__ == '__main__':
    main()
