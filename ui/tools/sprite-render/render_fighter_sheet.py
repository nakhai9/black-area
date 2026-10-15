import numpy as np, math, sys
from PIL import Image
from render import (Mesh, loft, cyl, box, box8, surface, rotmat, proj, render_mesh, FX, compose,
                    add_fire, add_exhaust, hx, CELL, SS, R, COLS, ROWS, U, V)

GLASS = hx('#2c4560'); NAC = hx('#5a6052')
WFR = [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.8, 0.86, 0.97, 1.0]

P = {
 'russia': dict(name='Su-57', body='#2e3d36', team='#d22b2b', base_len=20.2,
   secs=[(10.2,0.1,0.1,0.1),(9.5,0.1,0.42,0.36),(8,0.2,0.75,0.6),(6,0.3,0.95,0.75),(3.5,0.35,1.0,0.8),(0,0.3,0.9,0.7),
         (-2.0,0.28,0.85,0.62),(-3.2,0.26,0.8,0.56),(-4,0.25,0.8,0.55),(-7,0.2,0.6,0.4),(-8.5,0.2,0.35,0.3),(-10.0,0.2,0.15,0.15)],
   stripe=(-3.2,-2.0),
   canopy=[(7.2,0.75,0.05,0.05),(6.6,0.85,0.38,0.32),(5.4,1.0,0.44,0.42),(4.2,0.95,0.38,0.3),(3.5,0.8,0.08,0.08)],
   nacelles=[(1.5,-0.25,3.0,-8.6,0.62)], intakes=[(4.6,2.8,1.5,-0.35,0.6,0.45)],
   nozzles=[(1.5,-0.25,-8.6,1.0,0.6)],
   wing=dict(ys=[0.6,2.6,7.05], le=[6.2,1.0,-3.9], te=[-6.6,-6.3,-5.5], z=0.15, th=(0.45,0.1)),
   canards=None,
   fins=[dict(y=2.0, cant=26, r=(-4.2,-8.0), t=(-6.9,-8.5), z0=0.25, h=2.5, th=(0.25,0.12))],
   stabs=dict(ys=[1.9,4.5], le=[-5.8,-8.6], te=[-9.0,-9.6], z=0.0),
   gear=dict(mains=[(-1.5,1.5,-0.87)], nose=(6.5,-0.4), r=0.42, zg=-1.77)),
 'usa': dict(name='F-35', body='#c2a66b', team='#2f6fe0', base_len=15.8,
   secs=[(7.9,0.0,0.08,0.08),(7.2,0.05,0.45,0.35),(5.8,0.1,0.85,0.6),(4.2,0.15,1.15,0.72),(1.5,0.15,1.5,0.8),
         (-2.0,0.1,1.45,0.75),(-2.4,0.1,1.42,0.74),(-3.4,0.08,1.3,0.7),(-4.5,0.05,1.15,0.65),(-6.3,0.0,0.75,0.55),(-6.9,0.0,0.62,0.5)],
   stripe=(-3.4,-2.4),
   canopy=[(6.4,0.55,0.05,0.05),(5.9,0.62,0.36,0.3),(4.8,0.78,0.42,0.4),(3.6,0.8,0.38,0.3),(3.0,0.72,0.1,0.1)],
   nacelles=[], intakes=[(3.6,1.8,1.35,0.05,0.42,0.4)],
   nozzles=[(0.0,0.0,-6.9,1.1,0.58)],
   wing=dict(ys=[1.2,5.35], le=[2.2,-2.8], te=[-4.6,-4.0], z=0.0, th=(0.35,0.1)),
   canards=None,
   fins=[dict(y=1.15, cant=22, r=(-3.4,-6.4), t=(-5.6,-6.7), z0=0.45, h=2.0, th=(0.22,0.1))],
   stabs=dict(ys=[0.9,3.4], le=[-5.0,-7.0], te=[-7.6,-7.9], z=0.0),
   gear=dict(mains=[(-1.4,1.3,-0.55)], nose=(5.2,-0.4), r=0.4, zg=-1.55)),
 'china': dict(name='J-15', body='#5b6a3a', team='#e8b10a', base_len=22.3,
   secs=[(11.3,0.25,0.08,0.08),(10.6,0.27,0.42,0.4),(9.0,0.33,0.72,0.66),(7.0,0.4,0.88,0.8),(5.0,0.45,0.95,0.85),(2.0,0.4,0.9,0.75),
         (-1.8,0.3,0.8,0.6),(-2.8,0.29,0.77,0.57),(-6.0,0.25,0.62,0.45),(-9.0,0.2,0.4,0.35),(-10.6,0.25,0.25,0.22),(-11.0,0.25,0.1,0.1)],
   stripe=(-2.8,-1.8),
   canopy=[(8.4,1.0,0.05,0.05),(7.8,1.08,0.38,0.33),(6.5,1.25,0.45,0.42),(5.2,1.2,0.4,0.32),(4.4,1.05,0.1,0.1)],
   nacelles=[(1.7,-0.45,2.8,-8.4,0.68)], intakes=[(4.8,2.8,1.7,-0.6,0.62,0.5)],
   nozzles=[(1.7,-0.45,-8.4,0.9,0.65)],
   wing=dict(ys=[0.6,2.6,7.35], le=[6.4,1.2,-4.6], te=[-6.2,-6.0,-5.9], z=0.15, th=(0.45,0.1)),
   canards=dict(ys=[1.0,3.2], le=[5.2,4.1], te=[3.7,3.5], z=0.55),
   fins=[dict(y=2.1, cant=0, r=(-4.4,-8.0), t=(-7.4,-8.7), z0=0.3, h=3.0, th=(0.25,0.12))],
   stabs=dict(ys=[1.9,4.9], le=[-6.4,-8.8], te=[-9.4,-9.9], z=-0.1),
   gear=dict(mains=[(-1.8,1.7,-1.13)], nose=(7.5,-0.4), r=0.45, zg=-2.0)),
 'europe': dict(name='Rafale', body='#6a7884', team='#8a5cf6', base_len=15.3,
   secs=[(7.8,0.1,0.06,0.06),(7.1,0.12,0.4,0.38),(5.6,0.2,0.66,0.62),(3.6,0.25,0.82,0.76),(1.0,0.2,1.0,0.75),
         (-1.4,0.15,1.02,0.7),(-2.4,0.13,1.03,0.68),(-3.0,0.1,1.05,0.66),(-5.6,0.05,0.95,0.56),(-6.6,0.05,0.85,0.5)],
   stripe=(-2.4,-1.4),
   canopy=[(5.9,0.78,0.05,0.05),(5.4,0.86,0.34,0.3),(4.2,1.02,0.4,0.4),(3.0,1.0,0.35,0.28),(2.3,0.88,0.1,0.1)],
   nacelles=[], intakes=[(2.6,0.6,1.05,-0.45,0.38,0.45)],
   nozzles=[(0.5,0.05,-6.6,0.9,0.45)],
   wing=dict(ys=[0.8,5.45], le=[2.4,-5.3], te=[-6.4,-6.5], z=-0.2, th=(0.4,0.08)),
   canards=dict(ys=[0.8,2.7], le=[3.6,2.6], te=[2.0,1.9], z=0.4),
   fins=[dict(y=0.0, cant=0, r=(-2.6,-6.4), t=(-5.6,-6.8), z0=0.6, h=2.6, th=(0.28,0.12))],
   stabs=None,
   gear=dict(mains=[(-2.2,1.6,-0.5)], nose=(4.6,-0.45), r=0.38, zg=-1.6)),
}

def planform(m, d, colfn_team, pid_l, pid_r, cut=None, th=(0.3, 0.08), z=None, team=False, wingc=None, teamc=None):
    ys, le, te = d['ys'], d['le'], d['te']; y0, y1 = ys[0], ys[-1]; zz = d['z'] if z is None else z
    base = sorted(set(WFR + [(y - y0) / (y1 - y0) for y in ys]))
    for s, pid in ((1, pid_l), (-1, pid_r)):
        fr = list(base)
        if cut is not None and s == -1: fr = [f for f in fr if f < cut] + [cut]
        st = []
        for f in fr:
            y = y0 + f * (y1 - y0)
            st.append((f, (np.interp(y, ys, le), s*y, zz), (np.interp(y, ys, te), s*y, zz), th[0] + (th[1]-th[0]) * f))
        cf = (lambda fm, top: teamc if (top and 0.86 < fm < 0.97) else wingc) if team else (lambda fm, top: wingc)
        surface(m, st, (0, 0, 1), cf, pid, capcol=np.array([40, 30, 26.]) if (cut is not None and s == -1) else None)

def build(F, gear=False, canopy_open=False, cut=None):
    m = Mesh(); meta = {}
    body = hx(F['body']); team = hx(F['team']); wingc = body * 0.88
    def colfn(x, t):
        if F['stripe'][0] < x < F['stripe'][1] and math.sin(t) > 0.15: return team, 1
        return body, 1
    loft(m, F['secs'], 22, colfn)
    # cockpit tub (dark interior, only visible with canopy open) + canopy glass
    cs = F['canopy']
    loft(m, [(x, zc - 0.12, rw * 0.85, rh * 0.6) for x, zc, rw, rh in cs], 14, lambda x, t: (np.array([30, 30, 33.]), 15))
    n0 = len(m.t)
    loft(m, cs, 16, lambda x, t: (GLASS, 3))
    if canopy_open:
        hxp, hz = cs[0][0], cs[0][1]; a = math.radians(40)
        Rm = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]]); h = np.array([hxp, 0, hz])
        for i in range(n0, len(m.t)):
            m.t[i] = tuple(Rm @ (np.array(p) - h) + h for p in m.t[i]); m.ref[i] = Rm @ (np.array(m.ref[i]) - h) + h
    # nacelles / intakes
    for (y, z, x0, x1, r) in F['nacelles']:
        for s, pid in ((1, 6), (-1, 7)):
            cyl(m, (x0, s*y, z), (-1, 0, 0), [(0, r*0.9), (0.6, r), (x0 - x1, r*0.95)], 14, body*0.9, pid, body*0.7, None)
    for (x0, x1, y, z, hw, hh) in F['intakes']:
        for s, pid in ((1, 6), (-1, 7)):
            yy = s * y
            box8(m, [(x1, yy-hw, z-hh), (x0, yy-hw*0.9, z-hh), (x0, yy+hw*0.9, z-hh), (x1, yy+hw, z-hh),
                     (x1, yy-hw, z+hh), (x0, yy-hw*0.9, z+hh*0.85), (x0, yy+hw*0.9, z+hh*0.85), (x1, yy+hw, z+hh)], body*0.85, pid)
            m.quad((x0+0.02, yy-hw*0.75, z-hh*0.8), (x0+0.02, yy+hw*0.75, z-hh*0.8), (x0+0.02, yy+hw*0.75, z+hh*0.7),
                   (x0+0.02, yy-hw*0.75, z+hh*0.7), (x0-1, yy, z), np.array([26, 26, 28.]), pid)
    engs = []
    for (y, z, x0, L, r) in F['nozzles']:
        sides = (1, -1) if y > 0 else (0,)
        for s in sides:
            yy = s * y if s else 0.0; pid = 8 + len(engs)
            cyl(m, (x0, yy, z), (-1, 0, 0), [(0, r), (L*0.6, r*0.95), (L, r*0.82)], 14, NAC, pid, None, np.array([42, 36, 32.]))
            engs.append(dict(rear=np.array([x0 - L, yy, z]), mid=np.array([x0 + 0.8, yy, z]), r=r*0.85))
    meta['eng'] = engs
    # wings, canards, tails
    W = F['wing']; planform(m, W, None, 4, 5, cut=cut, th=W['th'], team=True, wingc=wingc, teamc=team)
    if F['canards']: planform(m, F['canards'], None, 11, 11, th=(0.16, 0.06), wingc=wingc)
    if F['stabs']: planform(m, F['stabs'], None, 12, 12, th=(0.2, 0.07), wingc=wingc)
    for fd in F['fins']:
        c = math.radians(fd['cant'])
        for s in ((1, -1) if fd['y'] > 0 else (0,)):
            y0 = s * fd['y'] if s else 0.0; sg = s if s else 0
            yt = y0 + sg * fd['h'] * math.sin(c); zt = fd['z0'] + fd['h'] * math.cos(c)
            surface(m, [(0, (fd['r'][0], y0, fd['z0']), (fd['r'][1], y0, fd['z0']), fd['th'][0]),
                        (1, (fd['t'][0], yt, zt), (fd['t'][1], yt, zt), fd['th'][1])],
                    (0, math.cos(c), -sg * math.sin(c)), lambda f, top: body, 10)
    # gear
    G = F['gear']; meta['zg'] = G['zg']
    if gear:
        wr = G['r']; wc = G['zg'] + wr; tire = np.array([36, 36, 38.]); strut = np.array([110, 112, 110.])
        for (mx, my, za) in G['mains']:
            for s in (1, -1):
                cyl(m, (mx, s*my - 0.18, wc), (0, 1, 0), [(0, wr), (0.36, wr)], 12, tire, 13, tire*0.8, tire*0.8)
                box(m, (mx, s*my, (wc + za) / 2), (0.08, 0.08, (za - wc) / 2), strut, 13)
        nx, za = G['nose']
        cyl(m, (nx, -0.14, wc), (0, 1, 0), [(0, wr*0.75), (0.28, wr*0.75)], 12, tire, 13, tire*0.8, tire*0.8)
        box(m, (nx, 0, (wc + za) / 2), (0.07, 0.07, (za - wc) / 2), strut, 13)
    ys = W['ys']
    if cut is not None:
        y = ys[0] + cut * (ys[-1] - ys[0]); meta['wingtip_cut'] = np.array([(np.interp(y, ys, W['le']) + np.interp(y, ys, W['te'])) / 2, -y, W['z']])
    top = F['secs'][4]; meta['top'] = np.array([-1.0, 0, top[1] + top[2] * 0.0 + top[3]])
    meta['rear_top'] = np.array([-4.0, 0, 0.6])
    meta['wing_r'] = np.array([np.interp(3.0, ys, W['le']) - 1.5, -3.0, W['z'] + 0.2])
    return m.arr(), meta

def run(key, path):
    F = P[key]; body = hx(F['body'])
    meshes = {'ground': build(F, gear=True), 'canopy': build(F, gear=True, canopy_open=True),
              'fly': build(F), 'crash1': build(F), 'crash2': build(F, cut=0.72)}
    rows = [('ground', 0, 0), ('fly', 0, 0), ('fly', 0, 0), ('canopy', 0, 0), ('fly', 0, -25), ('fly', 0, 25),
            ('crash1', 20, -30), ('crash2', 45, -60), ('fly', 0, 0)]
    base = 192.0 / F['base_len']; ext = 0
    for r_, (mk, pt, rl) in enumerate(rows):
        T = meshes[mk][0][0].reshape(-1, 3)
        for c in range(COLS):
            Pp = T @ rotmat(c * 22.5, pt, rl).T
            if r_ == 8: Pp[:, 2] = 0
            q = proj(Pp, 1.0 / SS); ext = max(ext, np.abs(q[:, :2] - R / 2).max())
    scale = min(base, (128 - 8) / ext); S = scale * SS
    print(key, F['name'], 'scale', round(scale, 3), 'length px', round(scale * F['base_len'], 1))
    sheet = np.zeros((ROWS * CELL, COLS * CELL, 4)); rng = np.random.default_rng(11)
    fsz = 0.75
    for r_, (mk, pt, rl) in enumerate(rows):
        mesh, meta = meshes[mk]; E = meta['eng']
        for c in range(COLS):
            Mw = rotmat(c * 22.5, pt, rl)
            if r_ == 8:
                zb, cb, ib = render_mesh(mesh, Mw, S, flatten=True); cell = compose(zb, cb, ib, shadow=True)
            else:
                zb, cb, ib = render_mesh(mesh, Mw, S); fx = FX()
                if r_ in (1, 2, 4, 5):
                    add_exhaust(fx, meta, Mw, S, 2.6 if r_ != 2 else 1.8, 1.0 if r_ != 2 else 0.9)
                if r_ == 6:
                    e = E[-1]
                    add_fire(fx, meta, Mw, S, [(e['mid'], 1.0)], [(e['mid'], 1.0)], rng, fsz, 9, 4, body)
                if r_ == 7:
                    fp = [(E[-1]['mid'], 1.15), (meta['wingtip_cut'], 0.9), (meta['wing_r'], 0.85), (meta['top'], 0.95)]
                    if len(E) > 1: fp.append((E[0]['mid'], 0.9))
                    add_fire(fx, meta, Mw, S, fp, [(E[-1]['mid'], 1.35), (meta['top'], 1.2)], rng, fsz, 9, 6, body)
                cell = compose(zb, cb, ib, fx.draw(zb) if fx.items else None)
            sheet[r_*CELL:(r_+1)*CELL, c*CELL:(c+1)*CELL] = cell
            al = cell[..., 3] > 0.02
            if al[0].any() or al[-1].any() or al[:, 0].any() or al[:, -1].any(): print('WARN overflow', key, r_ + 1, c + 1)
    img = np.zeros_like(sheet); img[..., 3] = sheet[..., 3] * 255; img[..., :3] = sheet[..., :3]
    Image.fromarray(np.clip(np.round(img), 0, 255).astype(np.uint8), 'RGBA').save(path, optimize=True)
    print(key, 'saved')

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
