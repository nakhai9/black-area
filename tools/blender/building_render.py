"""
Renders structures in Blender into ui/public/sprites/building-<name>.png in the game's building projection.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/building_render.py -- powerplant-usa ...
    ... -- all              every model
    ... -- powerplant       every model whose name starts with "powerplant"

The modelling kit (projection, materials, primitives, camera) is in kit.py; each kind of structure has its own
module in models/ exporting MODELS = {name: build function}.
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kit  # noqa: E402

MODELS = {}
for fn in sorted(os.listdir(os.path.join(HERE, "models"))):
    if fn.endswith(".py") and not fn.startswith("_"):
        MODELS.update(importlib.import_module(f"models.{fn[:-3]}").MODELS)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    names = [n for n in MODELS if not args or args == ["all"] or any(n == a or n.startswith(a) for a in args)]
    for name in names:
        kit.reset()
        MODELS[name]()


main()
