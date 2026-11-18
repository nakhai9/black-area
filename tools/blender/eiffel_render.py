"""
Eiffel Tower (Paris) symbol monument, rendered from an imported FBX model (real metres: 125 m base, 330 m tall).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/eiffel_render.py

Env: EIFFEL_FBX=<path> (default ~/Downloads/eiffel-tower/source/eiffel-exterior.fbx).
Writes ui/public/sprites/building-eiffel-tower.png (then rename to eiffel-tower.png and run tools/to_webp.py).
Game plot 3 x 3; the 125 m base fills the plot and the height keeps the real proportion.
"""
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

FOOT = 3
FBX = os.environ.get("EIFFEL_FBX", os.path.expanduser("~/Downloads/eiffel-tower/source/eiffel-exterior.fbx"))

kit.reset()
bpy.context.scene.cycles.samples = 32
bpy.ops.import_scene.fbx(filepath=FBX)
for o in list(bpy.context.scene.objects):
    if o.type == "CAMERA" or o.type == "LIGHT":
        bpy.data.objects.remove(o)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
s = FOOT / max(hi.x - lo.x, hi.y - lo.y)
root = bpy.data.objects.new("eiffel_root", None)
bpy.context.scene.collection.objects.link(root)
for o in bpy.context.scene.objects:
    if o is not root and o.parent is None:
        o.parent = root
root.scale = (s, s, s)
root.location = (-lo.x * s, -lo.y * s, -lo.z * s)
bpy.context.view_layer.update()
height_px = (hi.z - lo.z) * s * kit.Z_PX_PER_BU / kit.ZS
bpy.context.scene["ground_sunk"] = True  # no paving plate to sink
kit.render("eiffel-tower", (FOOT, FOOT), height_px + 2)
print(f"[eiffel] height art px = {height_px:.1f}")
