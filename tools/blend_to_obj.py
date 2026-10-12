"""
Blender-side helper: exports an opened .blend to OBJ + MTL (Y up, materials with absolute texture paths, modifiers
applied) so tools/aircraft_model_sheet.py can read it. Packed textures are unpacked next to the .blend first.
Usage: blender --background <model.blend> --python tools/blend_to_obj.py -- <out.obj>
"""
import sys

import bpy

out = sys.argv[sys.argv.index('--') + 1]
try:
    bpy.ops.file.unpack_all(method='WRITE_LOCAL')
except RuntimeError:
    pass  # nothing packed
bpy.ops.wm.obj_export(filepath=out, export_selected_objects=False, apply_modifiers=True, export_materials=True,
                      path_mode='ABSOLUTE', forward_axis='NEGATIVE_Z', up_axis='Y', export_uv=True, export_normals=False)
