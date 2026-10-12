#!/usr/bin/env python3
"""
Converts a binary FBX or a COLLADA (.dae) model into a Wavefront OBJ + MTL (Y up, one `o` per mesh node, `usemtl` per
material, texture paths absolute), so tools/tank_model_sheet.py and tools/aircraft_model_sheet.py can read it.
No 3D package needed: both formats are parsed here (FBX binary 7.x; COLLADA triangles / polylist / polygons, node
matrices, effect → image textures).
Usage: python -I tools/model_to_obj.py <model.fbx|model.dae> <out.obj>
"""
import math
import os
import struct
import sys
import xml.etree.ElementTree as ET
import zlib

import numpy as np


# ------------------------------------------------------------------ FBX (binary)

def _fbx_read(path):
    data = open(path, 'rb').read()
    assert data[:20] == b'Kaydara FBX Binary  ', 'not a binary FBX'
    version = struct.unpack_from('<I', data, 23)[0]
    wide = version >= 7500

    def prop(pos):
        t = chr(data[pos]); pos += 1
        if t in 'YCILFD':
            fmt = {'Y': '<h', 'C': '<?', 'I': '<i', 'L': '<q', 'F': '<f', 'D': '<d'}[t]
            v = struct.unpack_from(fmt, data, pos)[0]
            return v, pos + struct.calcsize(fmt)
        if t in 'fdlib':
            n, enc, clen = struct.unpack_from('<III', data, pos); pos += 12
            raw = data[pos:pos + clen]; pos += clen
            if enc == 1:
                raw = zlib.decompress(raw)
            dt = {'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': '<u1'}[t]
            return np.frombuffer(raw, dt, n), pos
        if t in 'SR':
            n = struct.unpack_from('<I', data, pos)[0]; pos += 4
            raw = data[pos:pos + n]; pos += n
            return (raw.decode('utf-8', 'replace') if t == 'S' else raw), pos
        raise ValueError(f'FBX property type {t!r}')

    def node(pos):
        if wide:
            end, nprops, _plen = struct.unpack_from('<QQQ', data, pos); pos += 24
        else:
            end, nprops, _plen = struct.unpack_from('<III', data, pos); pos += 12
        nlen = data[pos]; pos += 1
        if end == 0:
            return None, pos
        name = data[pos:pos + nlen].decode('ascii', 'replace'); pos += nlen
        props = []
        for _ in range(nprops):
            v, pos = prop(pos)
            props.append(v)
        kids = []
        while pos < end:
            k, pos = node(pos)
            if k is None:
                break
            kids.append(k)
        return (name, props, kids), end

    pos, top = 27, []
    while pos < len(data) - 200:
        n, pos = node(pos)
        if n is None:
            break
        top.append(n)
    return top


def _kid(n, name):
    for k in n[2]:
        if k[0] == name:
            return k
    return None


def _p70(n):
    out = {}
    p = _kid(n, 'Properties70')
    if p:
        for k in p[2]:
            if k[0] == 'P':
                out[k[1][0]] = k[1][4:]
    return out


def _euler(r):
    """FBX XYZ euler (degrees) → matrix (applied X, then Y, then Z)."""
    x, y, z = (math.radians(a) for a in r)
    rx = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return rz @ ry @ rx


def _trs(p):
    m = np.eye(4)
    t = p.get('Lcl Translation', (0, 0, 0))
    r = p.get('Lcl Rotation', (0, 0, 0))
    s = p.get('Lcl Scaling', (1, 1, 1))
    pre = p.get('PreRotation', (0, 0, 0))
    m[:3, :3] = _euler(pre) @ _euler(r) @ np.diag(s)
    m[:3, 3] = t
    return m


def fbx_meshes(path):
    top = {n[0]: n for n in _fbx_read(path)}
    objs = {}
    for n in top['Objects'][2]:
        objs[n[1][0]] = n
    conns = [(c[1][1], c[1][2], c[1][3] if len(c[1]) > 3 else None) for c in top['Connections'][2] if c[0] == 'C']
    parent, kids = {}, {}
    for a, b, _ in conns:
        kids.setdefault(b, []).append(a)
        if objs.get(a, ('',))[0] == 'Model' and objs.get(b, ('',))[0] == 'Model':
            parent[a] = b
    world = {}

    def wm(mid):
        if mid not in world:
            m = _trs(_p70(objs[mid]))
            world[mid] = (wm(parent[mid]) @ m) if mid in parent else m
        return world[mid]

    folder = os.path.dirname(path)

    def tex_of(mat_id):
        for t in kids.get(mat_id, []):
            if objs.get(t, ('',))[0] == 'Texture':
                for k in ('RelativeFilename', 'FileName'):
                    f = _kid(objs[t], k)
                    if f and f[1][0]:
                        name = os.path.basename(f[1][0].replace('\\', '/'))
                        if os.path.exists(os.path.join(folder, name)):
                            return os.path.join(folder, name)
        return None

    out = []
    for mid, n in objs.items():
        if n[0] != 'Model':
            continue
        geo = mats = None
        mats = [c for c in kids.get(mid, []) if objs.get(c, ('',))[0] == 'Material']
        for c in kids.get(mid, []):
            if objs.get(c, ('',))[0] == 'Geometry' and _kid(objs[c], 'Vertices'):
                geo = objs[c]
        if geo is None:
            continue
        p = _p70(n)
        gm = np.eye(4)
        gm[:3, :3] = _euler(p.get('GeometricRotation', (0, 0, 0))) @ np.diag(p.get('GeometricScaling', (1, 1, 1)))
        gm[:3, 3] = p.get('GeometricTranslation', (0, 0, 0))
        m = wm(mid) @ gm
        v = np.asarray(_kid(geo, 'Vertices')[1][0], np.float64).reshape(-1, 3)
        v = (np.c_[v, np.ones(len(v))] @ m.T)[:, :3]
        pvi = np.asarray(_kid(geo, 'PolygonVertexIndex')[1][0], np.int64)
        uvl = _kid(geo, 'LayerElementUV')
        uv = uvi = None
        uv_map = ''
        if uvl:
            uv = np.asarray(_kid(uvl, 'UV')[1][0], np.float64).reshape(-1, 2)
            uv_map = _kid(uvl, 'MappingInformationType')[1][0]
            ref = _kid(uvl, 'ReferenceInformationType')[1][0]
            ui = _kid(uvl, 'UVIndex')
            uvi = np.asarray(ui[1][0], np.int64) if ui and ref == 'IndexToDirect' else None
        mel = _kid(geo, 'LayerElementMaterial')
        pmat = None
        if mel:
            arr = np.asarray(_kid(mel, 'Materials')[1][0], np.int64)
            pmat = arr if _kid(mel, 'MappingInformationType')[1][0] == 'ByPolygon' else None
        polys, poly_uv, poly_m = [], [], []
        cur, cur_uv, pi = [], [], 0
        for k, idx in enumerate(pvi):
            last = idx < 0
            vi = ~idx if last else idx
            cur.append(vi)
            if uv is not None:
                if uv_map == 'ByPolygonVertex':
                    cur_uv.append(uvi[k] if uvi is not None else k)
                else:
                    cur_uv.append(uvi[vi] if uvi is not None else vi)
            if last:
                polys.append(cur); poly_uv.append(cur_uv)
                poly_m.append(int(pmat[pi]) if pmat is not None and pi < len(pmat) else 0)
                cur, cur_uv, pi = [], [], pi + 1
        mat_names = [objs[c][1][1].split('\x00')[0] or f'mat{c}' for c in mats] or ['default']
        mat_tex = [tex_of(c) for c in mats] or [None]
        name = n[1][1].split('\x00')[0] or f'model{mid}'
        out.append(dict(name=name, v=v, uv=uv if uv is not None else np.zeros((1, 2)), polys=polys, poly_uv=poly_uv,
                        poly_mat=[mat_names[min(i, len(mat_names) - 1)] for i in poly_m],
                        tex={mn: t for mn, t in zip(mat_names, mat_tex)}, up='Y'))
    return out


# ------------------------------------------------------------------ COLLADA

NS = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}


def dae_meshes(path):
    root = ET.parse(path).getroot()
    folder = os.path.dirname(path)
    up = (root.find('c:asset/c:up_axis', NS).text or 'Y_UP')[0]
    ids = {e.get('id'): e for e in root.iter() if e.get('id')}
    images = {}
    for im in root.iterfind('.//c:library_images/c:image', NS):
        f = im.find('c:init_from', NS)
        if f is not None and f.text:
            images[im.get('id')] = f.text
    effect_tex = {}
    for eff in root.iterfind('.//c:library_effects/c:effect', NS):
        params = {np_.get('sid'): np_ for np_ in eff.iter('{%s}newparam' % NS['c'])}
        t = eff.find('.//c:diffuse/c:texture', NS)
        col = eff.find('.//c:diffuse/c:color', NS)
        img = None
        if t is not None:
            s = t.get('texture')
            while s in params:
                p = params[s]
                src = p.find('.//c:source', NS)
                ini = p.find('.//c:init_from', NS)
                s = src.text if src is not None else (ini.text if ini is not None else None)
            img = images.get(s, s)
        effect_tex[eff.get('id')] = (img, [float(x) for x in col.text.split()[:3]] if col is not None else None)
    mat_info = {}
    for m in root.iterfind('.//c:library_materials/c:material', NS):
        ie = m.find('c:instance_effect', NS)
        mat_info[m.get('id')] = effect_tex.get(ie.get('url')[1:], (None, None)) if ie is not None else (None, None)

    def resolve(img):
        if not img:
            return None
        img = img.replace('file:///', '').replace('%20', ' ')
        for cand in (img, os.path.join(folder, img), os.path.join(folder, os.path.basename(img))):
            if os.path.exists(cand):
                return os.path.abspath(cand)
        return None

    out = []

    def geom(g, m, binds, name):
        mesh = g.find('c:mesh', NS)
        srcs = {s.get('id'): np.array(s.find('c:float_array', NS).text.split(), np.float64) for s in mesh.iterfind('c:source', NS)
                if s.find('c:float_array', NS) is not None and s.find('c:float_array', NS).text}
        strides = {s.get('id'): int(s.find('.//c:accessor', NS).get('stride', '1')) for s in mesh.iterfind('c:source', NS)
                   if s.find('.//c:accessor', NS) is not None}
        vin = mesh.find('c:vertices/c:input[@semantic="POSITION"]', NS).get('source')[1:]
        pos = srcs[vin].reshape(-1, strides[vin])[:, :3]
        pos = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
        polys, puv, pmat, uvs_all, tex = [], [], [], [np.zeros((1, 2))], {}
        uv_base = 1
        for prim in list(mesh):
            tag = prim.tag.split('}')[1]
            if tag not in ('triangles', 'polylist', 'polygons'):
                continue
            inputs = prim.findall('c:input', NS)
            nin = max(int(i.get('offset')) for i in inputs) + 1
            voff = [int(i.get('offset')) for i in inputs if i.get('semantic') == 'VERTEX'][0]
            tin = [i for i in inputs if i.get('semantic') == 'TEXCOORD']
            mat = prim.get('material') or 'default'
            mid = binds.get(mat, mat)
            img, col = mat_info.get(mid, (None, None))
            tex[mid] = (resolve(img), col)
            if tin:
                sid = tin[0].get('source')[1:]
                uvs_all.append(srcs[sid].reshape(-1, strides[sid])[:, :2])
                toff = int(tin[0].get('offset'))
            if tag == 'polygons':
                chunks = [np.array(p.text.split(), np.int64) for p in prim.findall('c:p', NS) if p.text]
                counts = [len(c) // nin for c in chunks]
                idx = np.concatenate(chunks) if chunks else np.zeros(0, np.int64)
            else:
                pe = prim.find('c:p', NS)
                if pe is None or not pe.text:
                    continue
                idx = np.array(pe.text.split(), np.int64)
                if tag == 'triangles':
                    counts = [3] * (len(idx) // (3 * nin))
                else:
                    counts = [int(x) for x in prim.find('c:vcount', NS).text.split()]
            idx = idx.reshape(-1, nin)
            k = 0
            for c in counts:
                polys.append(list(idx[k:k + c, voff]))
                puv.append(list(idx[k:k + c, toff] + uv_base) if tin else [0] * c)
                pmat.append(mid)
                k += c
            if tin:
                uv_base += len(uvs_all[-1])
        if polys:
            out.append(dict(name=name, v=pos, uv=np.concatenate(uvs_all), polys=polys, poly_uv=puv, poly_mat=pmat,
                            tex=tex, up=up))

    def walk(node, m):
        mm = m.copy()
        for t in node:
            tag = t.tag.split('}')[1]
            if tag == 'matrix':
                mm = mm @ np.array(t.text.split(), np.float64).reshape(4, 4)
            elif tag == 'translate':
                a = np.eye(4); a[:3, 3] = [float(x) for x in t.text.split()]; mm = mm @ a
            elif tag == 'scale':
                a = np.diag([float(x) for x in t.text.split()] + [1]); mm = mm @ a
            elif tag == 'rotate':
                x, y, z, ang = (float(q) for q in t.text.split())
                c, s, ax = math.cos(math.radians(ang)), math.sin(math.radians(ang)), np.array([x, y, z]) / (math.sqrt(x * x + y * y + z * z) or 1)
                K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
                a = np.eye(4); a[:3, :3] = np.eye(3) + s * K + (1 - c) * K @ K; mm = mm @ a
        for t in node:
            tag = t.tag.split('}')[1]
            if tag == 'instance_geometry':
                binds = {b.get('symbol'): b.get('target')[1:] for b in t.iterfind('.//c:instance_material', NS)}
                geom(ids[t.get('url')[1:]], mm, binds, node.get('name') or node.get('id') or 'mesh')
            elif tag == 'instance_node':
                walk(ids[t.get('url')[1:]], mm)
            elif tag == 'node':
                walk(t, mm)

    scene = root.find('.//c:library_visual_scenes/c:visual_scene', NS)
    for n in scene.findall('c:node', NS):
        walk(n, np.eye(4))
    return out


# ------------------------------------------------------------------ OBJ out

def write_obj(meshes, out):
    base = os.path.splitext(out)[0]
    mtl = {}
    with open(out, 'w', encoding='utf-8') as f:
        f.write(f'mtllib {os.path.basename(base)}.mtl\n')
        vo = to = 0
        for k, m in enumerate(meshes):
            v = m['v']
            if m['up'] == 'Z':
                v = np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1)
            f.write(f'o {m["name"].replace(" ", "_")}_{k}\n')
            f.write(''.join(f'v {a:.5f} {b:.5f} {c:.5f}\n' for a, b, c in v))
            f.write(''.join(f'vt {a:.5f} {b:.5f}\n' for a, b in m['uv']))
            cur = None
            for poly, puv, mat in zip(m['polys'], m['poly_uv'], m['poly_mat']):
                if mat != cur:
                    f.write(f'usemtl {mat}\n'); cur = mat
                    t = m['tex'].get(mat)
                    mtl.setdefault(mat, t)
                f.write('f ' + ' '.join(f'{a + 1 + vo}/{b + 1 + to}' for a, b in zip(poly, puv)) + '\n')
            vo += len(v)
            to += len(m['uv'])
    with open(base + '.mtl', 'w', encoding='utf-8') as f:
        for name, t in mtl.items():
            f.write(f'newmtl {name}\n')
            img, col = t if isinstance(t, tuple) else (t, None)
            if col:
                f.write('Kd {:.3f} {:.3f} {:.3f}\n'.format(*col))
            if img:
                f.write(f'map_Kd {img}\n')


def main():
    src, out = sys.argv[1], sys.argv[2]
    meshes = fbx_meshes(src) if src.lower().endswith('.fbx') else dae_meshes(src)
    print(len(meshes), 'meshes,', sum(len(m['polys']) for m in meshes), 'polygons')
    write_obj(meshes, out)


if __name__ == '__main__':
    main()
