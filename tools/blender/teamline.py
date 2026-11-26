"""
Faction identity line (ART_GUIDE §6: every unit carries a band in the exact TEAM colour) for the tank sheet scripts.

Infrastructure only (a material change, no geometry): paints a horizontal stripe in the TEAM colour round the sides of
a turret, following its surface exactly. Call it after the model is built and scaled, before rendering:

    import teamline; teamline.band(tur, "usa")

The stripe lies between `lo` and `hi` (shares of the turret body's height, world Z) and only on faces that stand up
(|normal z| < 0.55), so the roof stays the hull colour. Only the turret's big pieces (its shell, cheeks, bustle) are
painted, not hatches, sights or antennas. Their materials are copied first, so the hull is never touched.
"""
import bpy
from mathutils import Vector

TEAM = {"usa": "#2f6fe0", "russia": "#d22b2b", "china": "#e8b10a", "europe": "#6532d6", "islamic": "#1f9d4a",
        "neutral": "#c8c8c8"}  # neutral: the game tints the -team mask with the owner's colour (ART_GUIDE)

# (copy material, mask-pass material) of every painted material, filled by band(); used by mask_mode().
_PAINTED = {}


def _srgb(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def _bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _paint(mat, z0, z1, colour):
    m = mat.copy()
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return mat
    N, L = nt.nodes, nt.links
    geo = N.new("ShaderNodeNewGeometry")
    pos = N.new("ShaderNodeSeparateXYZ")
    L.new(geo.outputs["Position"], pos.inputs[0])
    nrm = N.new("ShaderNodeSeparateXYZ")
    L.new(geo.outputs["Normal"], nrm.inputs[0])
    above = N.new("ShaderNodeMath")
    above.operation = "GREATER_THAN"
    above.inputs[1].default_value = z0
    L.new(pos.outputs["Z"], above.inputs[0])
    below = N.new("ShaderNodeMath")
    below.operation = "LESS_THAN"
    below.inputs[1].default_value = z1
    L.new(pos.outputs["Z"], below.inputs[0])
    absn = N.new("ShaderNodeMath")
    absn.operation = "ABSOLUTE"
    L.new(nrm.outputs["Z"], absn.inputs[0])
    side = N.new("ShaderNodeMath")
    side.operation = "LESS_THAN"
    side.inputs[1].default_value = 0.55
    L.new(absn.outputs[0], side.inputs[0])
    m1 = N.new("ShaderNodeMath")
    m1.operation = "MULTIPLY"
    L.new(above.outputs[0], m1.inputs[0])
    L.new(below.outputs[0], m1.inputs[1])
    mask = N.new("ShaderNodeMath")
    mask.operation = "MULTIPLY"
    L.new(m1.outputs[0], mask.inputs[0])
    L.new(side.outputs[0], mask.inputs[1])
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    L.new(mask.outputs[0], mix.inputs["Factor"])
    base = bsdf.inputs["Base Color"]
    if base.is_linked:
        L.new(base.links[0].from_socket, mix.inputs[6])
    else:
        mix.inputs[6].default_value = base.default_value
    mix.inputs[7].default_value = colour
    L.new(mix.outputs[2], base)
    # Paint, not bare metal: the stripe stays matte under the key light.
    rough = N.new("ShaderNodeMix")
    rough.data_type = "FLOAT"
    L.new(mask.outputs[0], rough.inputs["Factor"])
    r = bsdf.inputs["Roughness"]
    if r.is_linked:
        L.new(r.links[0].from_socket, rough.inputs[2])
    else:
        rough.inputs[2].default_value = r.default_value
    rough.inputs[3].default_value = 0.6
    L.new(rough.outputs[0], r)
    # Mask-pass twin: the stripe lit white (real shading), everything else holdout (transparent in the sheet).
    k = m.copy()
    kt = k.node_tree
    kb = next(n for n in kt.nodes if n.type == "BSDF_PRINCIPLED")
    for inp in ("Base Color", "Roughness"):
        for lk in list(kb.inputs[inp].links):
            kt.links.remove(lk)
    kb.inputs["Base Color"].default_value = (1, 1, 1, 1)
    kb.inputs["Roughness"].default_value = 0.6
    kb.inputs["Metallic"].default_value = 0.0
    kmask = next(n for n in kt.nodes if n.type == "MATH" and n.operation == "MULTIPLY" and n.outputs[0].links and any(l.to_node.type == "MIX" and l.to_node.data_type == "RGBA" for l in n.outputs[0].links))
    out = next(n for n in kt.nodes if n.type == "OUTPUT_MATERIAL")
    hold = kt.nodes.new("ShaderNodeHoldout")
    mixs = kt.nodes.new("ShaderNodeMixShader")
    kt.links.new(kmask.outputs[0], mixs.inputs[0])
    kt.links.new(hold.outputs[0], mixs.inputs[1])
    kt.links.new(kb.outputs[0], mixs.inputs[2])
    kt.links.new(mixs.outputs[0], out.inputs["Surface"])
    _PAINTED[m.name] = k
    return m


def band(turret, faction, lo=0.32, hi=0.68):
    """Paints the TEAM stripe of `faction` round `turret` (its object and children)."""
    bpy.context.view_layer.update()
    parts = [o for o in [turret] + list(turret.children_recursive) if o.type == "MESH"]
    if not parts:
        return
    vols = {}
    for o in parts:
        a, b = _bbox(o)
        vols[o] = (b.x - a.x) * (b.y - a.y) * (b.z - a.z)
    big = max(vols.values())
    body = [o for o in parts if vols[o] >= big * 0.12]
    zlo = min(_bbox(o)[0].z for o in body)
    zhi = max(_bbox(o)[1].z for o in body)
    z0, z1 = zlo + (zhi - zlo) * lo, zlo + (zhi - zlo) * hi
    colour = _srgb(TEAM[faction])
    done = {}
    for o in body:
        for slot in o.material_slots:
            if slot.material is None or not slot.material.use_nodes:
                continue
            key = slot.material.name
            if key not in done:
                done[key] = _paint(slot.material, z0, z1, colour)
            slot.link = "OBJECT"
            slot.material = done[key]
    print(f"[teamline] {faction}: {len(body)} turret pieces, stripe z {z0:.2f}..{z1:.2f}")


def mask_mode(meshes):
    """Switches the scene to the faction-mask pass: painted turret pieces show only their stripe (lit white), every
    other mesh is holdout (cut out, no shadow). Render the turret sheet again after this for the -team mask."""
    hold = bpy.data.materials.get("teamline_holdout")
    if hold is None:
        hold = bpy.data.materials.new("teamline_holdout")
        hold.use_nodes = True
        nt = hold.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(nt.nodes.new("ShaderNodeHoldout").outputs[0], out.inputs["Surface"])
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            twin = _PAINTED.get(m.name) if m else None
            slot.link = "OBJECT"
            slot.material = twin if twin else hold
