"""
Blender-side helper: imports a .glb / .gltf into an empty scene and exports it to OBJ + MTL (Y up, embedded textures
written next to the OBJ) so tools/aircraft_model_sheet.py can read it.
Usage: blender --background --factory-startup --python tools/glb_to_obj.py -- <model.glb> <out.obj>
"""
import os
import sys

import bpy

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
folder = os.path.dirname(out)
for img in bpy.data.images:
    if img.packed_file:
        path = os.path.join(folder, bpy.path.clean_name(img.name) + '.png')
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
bpy.ops.wm.obj_export(filepath=out, export_selected_objects=False, apply_modifiers=True, export_materials=True,
                      path_mode='ABSOLUTE', forward_axis='NEGATIVE_Z', up_axis='Y', export_uv=True, export_normals=False)
