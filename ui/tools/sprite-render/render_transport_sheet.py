import numpy as np, math, sys
from PIL import Image
from scipy.ndimage import maximum_filter, binary_dilation

CELL = 256; SS = 2; R = CELL * SS
COLS, ROWS = 16, 9
E = math.radians(30)
V = np.array([0, math.cos(E), -math.sin(E)])      # view direction (into scene)
U = np.array([0, math.sin(E), math.cos(E)])       # screen up
EX = np.array([1.0, 0, 0])                         # screen right
Lt = -0.55 * EX + 0.75 * U + 0.35 * (-V); Lt /= np.linalg.norm(Lt)  # fixed light: upper-left
OUTLINE = np.array([0x1a, 0x1a, 0x1a], float)
INTERIOR = np.array([34, 34, 34], float)

def hx(h): h = h.lstrip('#'); return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)], float)

# ---------------------------------------------------------------- mesh
class Mesh:
    def __init__(s): s.t = []; s.ref = []; s.col = []; s.pid = []; s.inner = []
    def tri(s, a, b, c, ref, col, pid, inner=False):
        s.t.append((a, b, c)); s.ref.append(ref); s.col.append(col); s.pid.append(pid); s.inner.append(inner)
    def quad(s, a, b, c, d, ref, col, pid, inner=False):
        s.tri(a, b, c, ref, col, pid, inner); s.tri(a, c, d, ref, col, pid, inner)
    def arr(s):
        return (np.array(s.t, float), np.array(s.ref, float), np.array(s.col, float),
                np.array(s.pid, int), np.array(s.inner, bool))

def loft(m, secs, nseg, colfn, skipfn=None):
    rings = []
    for (x, zc, rw, rh) in secs:
        ring = []
        for k in range(nseg):
            t = 2 * math.pi * k / nseg; sn = math.sin(t)
            z = zc + rh * sn if sn >= 0 else zc - rh * (abs(sn) ** 0.55)
            ring.append(np.array([x, rw * math.cos(t), z]))
        rings.append(ring)
    for i in range(len(secs) - 1):
        xm = 0.5 * (secs[i][0] + secs[i+1][0]); zm = 0.5 * (secs[i][1] + secs[i+1][1])
        ref = np.array([xm, 0, zm])
        for k in range(nseg):
            tm = 2 * math.pi * (k + 0.5) / nseg
            if skipfn and skipfn(xm, tm): continue
            col, pid = colfn(xm, tm)
            a, b = rings[i][k], rings[i][(k+1) % nseg]; c, d = rings[i+1][(k+1) % nseg], rings[i+1][k]
            m.quad(a, b, c, d, ref, col, pid, True)
    for idx, sgn in ((0, 1), (len(secs) - 1, -1)):
        x, zc = secs[idx][0], secs[idx][1]
        tip = np.array([x + 0.15 * sgn, 0, zc]); ref = np.array([x - 2 * sgn, 0, zc])
        col, pid = colfn(x, math.pi / 2)
        for k in range(nseg):
            m.tri(rings[idx][k], rings[idx][(k+1) % nseg], tip, ref, col, pid, True)

def basis(d):
    d = d / np.linalg.norm(d); a = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(d, a); u /= np.linalg.norm(u); w = np.cross(d, u); return d, u, w

def cyl(m, o, d, prof, nseg, col, pid, c0=None, c1=None):
    d, u, w = basis(np.array(d, float)); o = np.array(o, float)
    rings = [[o + d * s + r * (math.cos(2*math.pi*k/nseg) * u + math.sin(2*math.pi*k/nseg) * w) for k in range(nseg)] for s, r in prof]
    for i in range(len(prof) - 1):
        ref = o + d * 0.5 * (prof[i][0] + prof[i+1][0])
        for k in range(nseg):
            m.quad(rings[i][k], rings[i][(k+1) % nseg], rings[i+1][(k+1) % nseg], rings[i+1][k], ref, col, pid)
    for idx, cc, sg in ((0, c0, -1), (len(prof) - 1, c1, 1)):
        if cc is None: continue
        cen = o + d * prof[idx][0]; ref = cen - d * sg * 1.0
        for k in range(nseg):
            m.tri(rings[idx][k], rings[idx][(k+1) % nseg], cen, ref, cc, pid)

def box8(m, P, col, pid):
    P = [np.array(p, float) for p in P]; ref = sum(P) / 8
    for f in ((0,1,2,3), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7)):
        m.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], ref, col, pid)

def box(m, c, h, col, pid):
    cx, cy, cz = c; a, b, e = h
    box8(m, [(cx-a,cy-b,cz-e),(cx+a,cy-b,cz-e),(cx+a,cy+b,cz-e),(cx-a,cy+b,cz-e),
             (cx-a,cy-b,cz+e),(cx+a,cy-b,cz+e),(cx+a,cy+b,cz+e),(cx-a,cy+b,cz+e)], col, pid)

def surface(m, st, tdir, colfn, pid, capcol=None):
    """st: list of (frac, LE, TE, th). airfoil loft. colfn(frac_mid, top)->col"""
    tdir = np.array(tdir, float); prof = []
    for f, le, te, th in st:
        le = np.array(le, float); te = np.array(te, float); ch = te - le
        prof.append([le, le + ch*0.2 + tdir*0.5*th, le + ch*0.55 + tdir*0.4*th, te + tdir*0.05*th,
                     le + ch*0.55 - tdir*0.25*th, le + ch*0.2 - tdir*0.35*th])
    for i in range(len(st) - 1):
        ref = (sum(prof[i]) + sum(prof[i+1])) / 12; fm = 0.5 * (st[i][0] + st[i+1][0])
        for j in range(6):
            col = colfn(fm, j < 3)
            m.quad(prof[i][j], prof[i][(j+1) % 6], prof[i+1][(j+1) % 6], prof[i+1][j], ref, col, pid)
    last = prof[-1]; cen = sum(last) / 6; ref = (sum(prof[-2]) / 6)
    for j in range(6):
        m.tri(last[j], last[(j+1) % 6], cen, ref, capcol if capcol is not None else colfn(st[-1][0], True), pid)

# ---------------------------------------------------------------- aircraft definitions
FACTIONS = {
 'china': dict(name='Y-20', body='#5b6a3a', team='#e8b10a', prop=False,
   secs=[(22.6,-0.6,0.2,0.2),(22.0,-0.5,1.5,1.5),(21.0,-0.3,2.35,2.35),(19.5,-0.1,2.95,2.95),(17.5,0,3.1,3.15),
         (8,0,3.1,3.15),(-6,0,3.1,3.15),(-8,0,3.1,3.15),(-10,0.2,3.05,2.95),(-14,0.9,2.6,2.3),(-17,1.5,2.0,1.6),
         (-20,2.0,1.4,1.1),(-23,2.4,0.8,0.7),(-24.6,2.6,0.3,0.3)],
   glass=(19.5,22.0), radome=None, stripe=(-8,-6), ramp=(-17,-10),
   windows=[10,7,4,-1], door=(-4.6,-3.4), sponson=((0,3.05,-2.45),(5.5,0.6,0.75)),
   wheel_r=0.65, gear_drop=0.9, mains=[-2.2,2.2], nose_x=16.0,
   wing=dict(y0=1.0,y1=22.9, le=lambda y: 4.5-(y-1)*0.466, te=lambda y: -4.0-(y-1)*0.196,
             z=lambda y: 2.9-(y-1)*0.052, th=lambda f: 0.8-0.52*f),
   engines=[7.5,13.5], nac_r=1.05, nac_front=3.2, nac_len=6.3, nac_drop=1.65,
   fin=[((-13.5,0,2.6),(-21.5,0,2.4),0.6),((-20.5,0,10.3),(-24.3,0,10.3),0.35)],
   stab=dict(z=10.4, root=(-20.3,-24.6), tip=(-23.3,-25.6), span=7.8),
   base_len=47.2),
 'europe': dict(name='C-130', body='#6a7884', team='#8a5cf6', prop=True,
   secs=[(13.9,-0.6,0.2,0.2),(13.3,-0.5,1.05,1.05),(12.4,-0.3,1.65,1.65),(11.3,-0.1,2.15,2.15),(10.0,0,2.4,2.45),
         (2,0,2.4,2.45),(-2.5,0,2.4,2.45),(-4.5,0,2.4,2.45),(-6.5,0.3,2.3,2.2),(-8.5,0.8,2.0,1.8),(-10.5,1.3,1.6,1.35),
         (-12.5,1.7,1.1,0.95),(-14.5,2.0,0.6,0.55),(-16.0,2.2,0.25,0.25)],
   glass=(11.3,12.4), radome=12.4, stripe=(-4.5,-2.5), ramp=(-10.5,-4.5),
   windows=[7,4.5,2], door=(-1.9,-1.0), sponson=((0,2.3,-1.85),(4.5,0.5,0.65)),
   wheel_r=0.55, gear_drop=0.75, mains=[-1.5,1.5], nose_x=9.5,
   wing=dict(y0=1.0,y1=18.0, le=lambda y: 2.6-(y-1)/17*0.8, te=lambda y: -2.3+(y-1)/17*1.3,
             z=lambda y: 2.3+(y-1)*0.03, th=lambda f: 0.6-0.32*f),
   engines=[5.2,10.2], nac_r=0.72, nac_front=2.6, nac_len=None, nac_drop=0.55,
   fin=[((-8.5,0,2.0),(-15.5,0,2.0),0.5),((-13.3,0,8.3),(-16.2,0,8.3),0.3)],
   stab=dict(z=8.4, root=(-13.0,-16.6), tip=(-14.6,-16.6), span=6.0),
   base_len=29.9),
}
NAC = hx('#5a6052'); GLASS = hx('#2c4560')
WFR = [0, 0.15, 0.27, 0.36, 0.5, 0.62, 0.72, 0.78, 0.86, 0.97, 1.0]
PROP_R = 2.0

def build(F, gear=False, ramp_open=False, stopped=(), cut=None):
    m = Mesh(); meta = {}
    body = hx(F['body']); team = hx(F['team']); wingc = body * 0.88
    secs = F['secs']; rh_main = secs[5][3]; rw_main = secs[5][2]
    rx1, rx0 = F['ramp']  # rx1 rear end, rx0 hinge
    def in_ramp(x, t): return rx1 < x < rx0 and math.sin(t) < -0.35
    def colfn(x, t):
        sn = math.sin(t)
        if F['radome'] and x > F['radome']: return body * 0.78, 2
        if F['glass'][0] < x < F['glass'][1] and sn > 0.28: return GLASS, 3
        if F['stripe'][0] < x < F['stripe'][1] and sn > 0.2: return team, 1
        if in_ramp(x, t): return body * 0.9, 13
        return body, 1
    loft(m, secs, 22, colfn, (lambda x, t: rx1 < x < rx0 and math.sin(t) < 0.05) if ramp_open else None)
    # sponsons
    (sx, sy, sz), h = F['sponson']
    for s in (1, -1): box(m, (sx, s*sy, sz), h, body, 1)
    # windows + paratroop door (decals on fuselage sides)
    for s in (1, -1):
        y = s * (rw_main + 0.03); wsz = 0.45 if F['prop'] else 0.5
        for wx in F['windows']:
            m.quad((wx-wsz, y, 0.5-wsz), (wx+wsz, y, 0.5-wsz), (wx+wsz, y, 0.5+wsz), (wx-wsz, y, 0.5+wsz), (wx, 0, 0.5), GLASS*1.15, 1)
        d0, d1 = F['door']; y2 = s * (rw_main + 0.05)
        m.quad((d0, y2, -1.2), (d1, y2, -1.2), (d1, y2, 0.9), (d0, y2, 0.9), ((d0+d1)/2, 0, 0), body*0.62, 1)
    # ramp plate when open
    zg = -rh_main - F['gear_drop']; meta['zg'] = zg
    if ramp_open:
        def bot(x):
            for i in range(len(secs)-1):
                a, b = secs[i], secs[i+1]
                if b[0] <= x <= a[0]:
                    f = (a[0]-x)/(a[0]-b[0]); zc = a[1]+f*(b[1]-a[1]); rh = a[3]+f*(b[3]-a[3]); rw = a[2]+f*(b[2]-a[2])
                    return zc-rh, rw
        zh, wh = bot(rx0); ze, we = bot(rx1 + 0.01)
        Lr = math.hypot(rx0-rx1, zh-ze); drop = zh - zg; ex = rx0 - math.sqrt(max(Lr**2 - drop**2, 0.1))
        wh *= 0.95; we *= 0.95; th = 0.18
        box8(m, [(rx0,-wh,zh-th),(ex,-we,zg),(ex,we,zg),(rx0,wh,zh-th),(rx0,-wh,zh),(ex,-we,zg+th),(ex,we,zg+th),(rx0,wh,zh)], body*1.0, 13)
    # wings
    W = F['wing']; y0, y1 = W['y0'], W['y1']
    for s, pid in ((1, 4), (-1, 5)):
        fr = list(WFR)
        if cut is not None and s == -1: fr = [f for f in fr if f < cut] + [cut]
        st = []
        for f in fr:
            y = y0 + f * (y1 - y0)
            st.append((f, (W['le'](y), s*y, W['z'](y)), (W['te'](y), s*y, W['z'](y)), W['th'](f)))
        cf = lambda fm, top: team if (top and 0.86 < fm < 0.97) else wingc
        surface(m, st, (0, 0, 1), cf, pid, capcol=np.array([40, 30, 26.]) if (cut is not None and s == -1) else None)
    # engines
    engs = []
    ys = F['engines']
    for i, (s, y) in enumerate([(1, ys[1]), (1, ys[0]), (-1, ys[0]), (-1, ys[1])]):
        le, te, wz = W['le'](y), W['te'](y), W['z'](y)
        x0 = le + F['nac_front']; r = F['nac_r']
        L = F['nac_len'] if F['nac_len'] else (x0 - (te - 1.6))
        zc = wz - F['nac_drop']; yy = s * y; pid = 6 + i
        if F['prop']:
            prof = [(0, 0.82*r), (0.4, r), (0.8*L, 0.95*r), (L, 0.55*r)]
            cyl(m, (x0, yy, zc), (-1, 0, 0), prof, 14, NAC, pid, NAC*0.8, NAC*0.6)
            cyl(m, (x0, yy, zc), (1, 0, 0), [(0, 0.5*r), (0.45, 0.42*r), (0.9, 0.06)], 12, np.array([70, 72, 70.]), pid, None, np.array([60,60,60.]))
            pc = np.array([x0 + 0.3, yy, zc])
            if i in stopped:
                for k in range(4):
                    a = math.radians(45 + 90*k); dv = np.array([0, math.cos(a), math.sin(a)]); wv = np.array([0, -math.sin(a), math.cos(a)])
                    p0 = pc + dv*0.3; p1 = pc + dv*PROP_R; bw0, bw1, tx = 0.17, 0.12, 0.06
                    P = [p0 - wv*bw0 - [tx,0,0], p1 - wv*bw1 - [tx,0,0], p1 + wv*bw1 - [tx,0,0], p0 + wv*bw0 - [tx,0,0]]
                    P += [p + [2*tx, 0, 0] for p in P]
                    box8(m, P, np.array([48, 48, 50.]), 14 + i)
            engs.append(dict(front=pc, rear=np.array([x0 - L, yy, zc]), mid=np.array([x0 - L*0.6, yy, zc]), r=r))
        else:
            prof = [(0, 0.9*r), (0.35, r), (0.72*L, r), (L - 0.4, 0.82*r), (L, 0.64*r)]
            cyl(m, (x0, yy, zc), (-1, 0, 0), prof, 14, NAC, pid, np.array([38, 40, 38.]), np.array([45, 42, 40.]))
            engs.append(dict(front=np.array([x0, yy, zc]), rear=np.array([x0 - L, yy, zc]), mid=np.array([x0 - L*0.6, yy, zc]), r=r))
        # pylon
        pz0 = zc + r * 0.7; pz1 = wz
        box(m, (x0 - L*0.45, yy, (pz0+pz1)/2), (L*0.32, 0.18, (pz1-pz0)/2 + 0.1), NAC*0.9, pid)
    meta['eng'] = engs
    # T tail
    (le0, te0, t0), (le1, te1, t1) = F['fin']
    surface(m, [(0, le0, te0, t0), (1, le1, te1, t1)], (0, 1, 0), lambda f, top: body, 10)
    S = F['stab']
    for s in (1, -1):
        surface(m, [(0, (S['root'][0], 0, S['z']), (S['root'][1], 0, S['z']), 0.38),
                    (1, (S['tip'][0], s*S['span'], S['z']), (S['tip'][1], s*S['span'], S['z']), 0.22)], (0, 0, 1), lambda f, top: wingc, 11)
    # gear
    if gear:
        wr = F['wheel_r']; wc = zg + wr; tire = np.array([36, 36, 38.]); strut = np.array([88, 90, 88.])
        for s in (1, -1):
            for mx in F['mains']:
                yy = s * (rw_main + 0.15)
                cyl(m, (mx, yy - 0.28, wc), (0, 1, 0), [(0, wr), (0.56, wr)], 12, tire, 12, tire*0.8, tire*0.8)
                box(m, (mx, s*(rw_main-0.1), (wc + (-rh_main+0.1))/2), (0.12, 0.12, (-rh_main+0.1-wc)/2), strut, 12)
        for s in (1, -1):
            cyl(m, (F['nose_x'], s*0.42 - 0.2, wc + 0.1), (0, 1, 0), [(0, wr*0.8), (0.4, wr*0.8)], 12, tire, 12, tire*0.8, tire*0.8)
        box(m, (F['nose_x'], 0, (wc + secs[4][1]-secs[4][3])/2 + 0.3), (0.12, 0.12, (secs[4][1]-secs[4][3]+0.6-wc)/2), strut, 12)
    meta['wingtip_cut'] = None
    if cut is not None:
        y = y0 + cut*(y1-y0); meta['wingtip_cut'] = np.array([(W['le'](y)+W['te'](y))/2, -y, W['z'](y)])
    meta['top'] = np.array([0, 0, rh_main]); meta['rear_top'] = np.array([-6, 0, rh_main * 0.9])
    return m.arr(), meta

# ---------------------------------------------------------------- transforms / raster
def rotmat(heading, pitch=0, roll=0):
    th = math.radians(heading); f = np.array([math.sin(th), math.cos(th), 0]); l = np.array([-math.cos(th), math.sin(th), 0])
    Y = np.column_stack([f, l, [0, 0, 1]])
    a = math.radians(pitch); P = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    r = math.radians(roll); Rr = np.array([[1, 0, 0], [0, math.cos(r), -math.sin(r)], [0, math.sin(r), math.cos(r)]])
    return Y @ P @ Rr

def proj(p, S):
    p = np.asarray(p)
    return np.stack([R/2 + p[..., 0] * S, R/2 - (p @ U) * S, p @ V], -1)

def raster_tri(P, col, pid, zb, cb, ib):
    xs, ys = P[:, 0], P[:, 1]
    x0, x1 = max(int(math.floor(xs.min())), 0), min(int(math.ceil(xs.max())), R - 1)
    y0, y1 = max(int(math.floor(ys.min())), 0), min(int(math.ceil(ys.max())), R - 1)
    if x1 < x0 or y1 < y0: return
    A = (xs[1]-xs[0])*(ys[2]-ys[0]) - (xs[2]-xs[0])*(ys[1]-ys[0])
    if abs(A) < 1e-9: return
    X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    w0 = ((xs[1]-X)*(ys[2]-Y) - (xs[2]-X)*(ys[1]-Y)) / A
    w1 = ((xs[2]-X)*(ys[0]-Y) - (xs[0]-X)*(ys[2]-Y)) / A
    w2 = 1 - w0 - w1
    msk = (w0 >= -1e-7) & (w1 >= -1e-7) & (w2 >= -1e-7)
    if not msk.any(): return
    z = w0*P[0, 2] + w1*P[1, 2] + w2*P[2, 2]
    sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
    up = msk & (z < zb[sl])
    zb[sl][up] = z[up]; cb[sl][up] = col; ib[sl][up] = pid

def render_mesh(mesh, M, S, flatten=False):
    T, REF, COL, PID, INN = mesh
    Tw = T @ M.T; RW = REF @ M.T
    if flatten: Tw = Tw.copy(); Tw[..., 2] = 0
    n = np.cross(Tw[:, 1] - Tw[:, 0], Tw[:, 2] - Tw[:, 0]); nl = np.linalg.norm(n, axis=1); ok = nl > 1e-12
    n[ok] /= nl[ok, None]
    cen = Tw.mean(1); flip = np.einsum('ij,ij->i', n, cen - RW) < 0; n[flip] *= -1
    front = (n @ -V) > 0
    lam = np.clip(n @ Lt, 0, 1); s = 0.48 + 0.7 * lam; s = np.round(s / 0.07) * 0.07
    col = np.clip(COL * s[:, None], 0, 255)
    col[(~front) & INN] = INTERIOR
    P = proj(Tw, S)
    zb = np.full((R, R), 1e9); cb = np.zeros((R, R, 3)); ib = np.zeros((R, R), int)
    for i in range(len(T)):
        if ok[i]: raster_tri(P[i], col[i], PID[i], zb, cb, ib)
    return zb, cb, ib

# ---------------------------------------------------------------- effects
class FX:
    def __init__(s): s.items = []
    def circle(s, c2, r, d, rgb, a): s.items.append(('c', d, c2, r, np.array(rgb, float), a))
    def tri(s, P, rgb, a): s.items.append(('t', P[:, 2].mean(), P, None, np.array(rgb, float), a))
    def draw(s, zb):
        er = np.zeros((R, R, 3)); ea = np.zeros((R, R))
        for it in sorted(s.items, key=lambda q: -q[1]):
            k, d, g, r, rgb, a = it
            if k == 'c':
                cx, cy = g
                x0, x1 = max(int(cx - r - 1), 0), min(int(cx + r + 2), R); y0, y1 = max(int(cy - r - 1), 0), min(int(cy + r + 2), R)
                if x1 <= x0 or y1 <= y0: continue
                X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
                cov = np.clip(r - np.hypot(X - cx, Y - cy) + 0.5, 0, 1) * a
                sl = (slice(y0, y1), slice(x0, x1)); cov = cov * (zb[sl] > d)
            else:
                P = g; xs, ys = P[:, 0], P[:, 1]
                x0, x1 = max(int(xs.min()), 0), min(int(xs.max()) + 2, R); y0, y1 = max(int(ys.min()), 0), min(int(ys.max()) + 2, R)
                if x1 <= x0 or y1 <= y0: continue
                A = (xs[1]-xs[0])*(ys[2]-ys[0]) - (xs[2]-xs[0])*(ys[1]-ys[0])
                if abs(A) < 1e-9: continue
                X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
                w0 = ((xs[1]-X)*(ys[2]-Y) - (xs[2]-X)*(ys[1]-Y)) / A; w1 = ((xs[2]-X)*(ys[0]-Y) - (xs[0]-X)*(ys[2]-Y)) / A; w2 = 1 - w0 - w1
                m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0); z = w0*P[0, 2] + w1*P[1, 2] + w2*P[2, 2]
                sl = (slice(y0, y1), slice(x0, x1)); cov = (m & (zb[sl] > z)) * a
            er[sl] = er[sl] * (1 - cov[..., None]) + rgb * cov[..., None]; ea[sl] = ea[sl] * (1 - cov) + cov
        return er, ea

def inside(c2, r, margin=10 * SS):
    return (c2[0] - r > margin and c2[0] + r < R - margin and c2[1] - r > margin and c2[1] + r < R - margin)

def add_exhaust(fx, meta, M, S, length, rscale):
    fwd = M[:, 0]
    for e in meta['eng']:
        p0 = M @ e['rear']; n = 9
        for i in range(n):
            t = i / (n - 1); p = p0 - fwd * (0.3 + length * t); q = proj(p, S)
            rgb = (1 - t) * np.array([255, 196, 140]) + t * np.array([225, 225, 225])
            if not inside(q[:2], e['r'] * S * (0.75 - 0.4 * t) * rscale, 4 * SS): break
            fx.circle(q[:2], e['r'] * S * (0.75 - 0.4 * t) * rscale, q[2], rgb, 0.5 * (1 - t) ** 1.2)

def add_props(fx, meta, M, S, phase, skip=()):
    l, u = M[:, 1], M[:, 2]
    for i, e in enumerate(meta['eng']):
        if i in skip: continue
        c = M @ e['front']; n = 28
        pts = [c + PROP_R * (math.cos(2*math.pi*k/n) * l + math.sin(2*math.pi*k/n) * u) for k in range(n)]
        for k in range(n):
            fx.tri(proj(np.array([c, pts[k], pts[(k+1) % n]]), S), (215, 220, 225), 0.36)
        for b in range(2):
            a0 = math.radians(phase + 20 + 180 * b)
            seg = [c + PROP_R * 0.97 * (math.cos(a0 + j*0.13) * l + math.sin(a0 + j*0.13) * u) for j in range(5)]
            for j in range(4):
                fx.tri(proj(np.array([c, seg[j], seg[j+1]]), S), (40, 40, 44), 0.55)

def add_fire(fx, meta, M, S, pts, smoke_from, rng, size, smoke_n, debris_n, body):
    fwd = M[:, 0]; trail = -fwd + np.array([0, 0, 0.55]); trail /= np.linalg.norm(trail)
    for sp, thick in smoke_from:
        p0 = M @ sp
        for k in range(smoke_n):
            jitter = rng.normal(0, 0.35, 3)
            p = p0 + trail * (1.2 + k * 1.15 * size) + jitter * size
            r = (0.75 + 0.22 * k) * size * thick
            q = proj(p, S); rp = r * S
            if not inside(q[:2], rp): break
            sh = min(30 + 4 * k, 70)
            fx.circle(q[:2], rp, q[2] + 0.5, (sh, sh, sh), 0.88)
            fx.circle(q[:2] + np.array([-0.3, -0.3]) * rp, rp * 0.55, q[2] + 0.4, (sh + 22, sh + 22, sh + 22), 0.55)
    for fp, fs in pts:
        p0 = M @ fp
        for i in range(4):
            p = p0 + trail * i * 0.55 * size * fs + rng.normal(0, 0.12, 3) * size
            q = proj(p, S); rr = size * fs * (1 - 0.2 * i) * S; d = q[2] - 1.0
            if not inside(q[:2], rr, 6 * SS): continue
            fx.circle(q[:2], rr, d, (205, 45, 20), 0.95)
            fx.circle(q[:2], rr * 0.68, d - 0.05, (255, 135, 30), 0.98)
            fx.circle(q[:2], rr * 0.36, d - 0.1, (255, 228, 110), 1.0)
    for j in range(debris_n):
        src = M @ pts[j % len(pts)][0]
        p = src + trail * rng.uniform(1.5, 5.0) * size + rng.normal(0, 1.0, 3) * size
        q = proj(p, S)
        if not inside(q[:2], 6 * SS): continue
        sz = rng.uniform(2.0, 3.6) * SS; a = rng.uniform(0, 6.28)
        P = np.array([[q[0] + sz*math.cos(a + k*2.2), q[1] + sz*math.sin(a + k*2.2), q[2] - 0.5] for k in range(3)])
        fx.tri(P, (40, 40, 40) if j % 2 else body * 0.6, 1.0)

# ---------------------------------------------------------------- compose
def down(a):
    return a.reshape(CELL, SS, CELL, SS, *a.shape[2:]).mean((1, 3))

def compose(zb, cb, ib, fxbuf=None, shadow=False):
    mask = ib > 0
    if shadow:
        a = down(mask.astype(float)); out = np.zeros((CELL, CELL, 4)); out[..., 3] = a; return out
    cb = cb.copy()
    # internal part lines (1px at final)
    line = np.zeros((R, R), bool)
    for ax in (0, 1):
        a_i = ib; b_i = np.roll(ib, -1, ax); a_z = zb; b_z = np.roll(zb, -1, ax)
        edge = (a_i > 0) & (b_i > 0) & ((a_i != b_i) | (np.abs(a_z - b_z) > 1.6))
        if ax == 0: edge[-1, :] = False
        else: edge[:, -1] = False
        far_a = edge & (a_z >= b_z); far_b = edge & (a_z < b_z)
        line |= far_a; line |= np.roll(far_b, 1, ax)
    line = binary_dilation(line, np.array([[0, 0, 0], [0, 1, 1], [0, 1, 1]], bool)) & mask
    cb[line] = cb[line] * 0.15 + OUTLINE * 0.85
    a = down(mask.astype(float)); rgbp = down(cb * mask[..., None])
    yy, xx = np.mgrid[-2:3, -2:3]; fp = (xx**2 + yy**2) <= 5
    od = maximum_filter(a, footprint=fp)
    rgb = rgbp + OUTLINE * od[..., None] * (1 - a[..., None]); al = a + od * (1 - a)
    if fxbuf is not None:
        er, ea = fxbuf; er, ea = down(er), down(ea)
        rgb = er + rgb * (1 - ea[..., None]); al = ea + al * (1 - ea)
    out = np.zeros((CELL, CELL, 4)); out[..., 3] = al
    nz = al > 1e-6; out[nz, :3] = rgb[nz] / al[nz, None]
    return out

# ---------------------------------------------------------------- main
def run(key, path):
    F = FACTIONS[key]; body = hx(F['body']); isprop = F['prop']
    burn_eng = 3
    meshes = {
        'ground': build(F, gear=True, stopped=(0, 1, 2, 3)),
        'ramp': build(F, gear=True, ramp_open=True, stopped=(0, 1, 2, 3)),
        'fly': build(F),
        'crash1': build(F, stopped=(burn_eng,)),
        'crash2': build(F, stopped=(2, 3), cut=0.78),
    }
    rows = [('ground', 0, 0), ('fly', 0, 0), ('fly', 0, 0), ('ramp', 0, 0), ('fly', 0, -25), ('fly', 0, 25),
            ('crash1', 20, -30), ('crash2', 45, -60), ('fly', 0, 0)]
    # auto-fit scale so nothing exits cell (margin for outline)
    base = 192.0 / F['base_len']
    ext = 0
    for r_, (mk, pt, rl) in enumerate(rows):
        T = meshes[mk][0][0].reshape(-1, 3)
        for c in range(COLS):
            Mw = rotmat(c * 22.5, pt, rl); P = T @ Mw.T
            if r_ == 8: P[:, 2] = 0
            q = proj(P, 1.0 / SS)  # 1 px per unit at final res, centred
            sx = (q[:, 0] - R/2); sy = (q[:, 1] - R/2)
            ext = max(ext, np.abs(sx).max(), np.abs(sy).max())
    scale = min(base, (128 - 8) / ext); S = scale * SS
    print(key, 'base', round(base, 3), 'used', round(scale, 3), 'length px', round(scale * F['base_len'], 1))
    sheet = np.zeros((ROWS * CELL, COLS * CELL, 4))
    rng = np.random.default_rng(7)
    for r_, (mk, pt, rl) in enumerate(rows):
        mesh, meta = meshes[mk]
        for c in range(COLS):
            Mw = rotmat(c * 22.5, pt, rl)
            if r_ == 8:
                zb, cb, ib = render_mesh(mesh, Mw, S, flatten=True); cell = compose(zb, cb, ib, shadow=True)
            else:
                zb, cb, ib = render_mesh(mesh, Mw, S)
                fx = FX()
                if r_ in (1, 2, 4, 5):
                    if isprop: add_props(fx, meta, Mw, S, 0 if r_ != 2 else 45)
                    else: add_exhaust(fx, meta, Mw, S, 4.8 if r_ != 2 else 3.4, 1.0 if r_ != 2 else 0.9)
                if r_ == 6:
                    if isprop: add_props(fx, meta, Mw, S, (c * 37) % 90, skip=(burn_eng,))
                    e = meta['eng'][burn_eng]
                    add_fire(fx, meta, Mw, S, [(e['mid'], 1.0)], [(e['mid'], 1.0)], rng, 1.7 if not isprop else 1.25, 9, 4, body)
                if r_ == 7:
                    if isprop: add_props(fx, meta, Mw, S, (c * 53) % 90, skip=(2, 3))
                    e3, e2, e1 = meta['eng'][3], meta['eng'][2], meta['eng'][1]
                    fp = [(e3['mid'], 1.15), (e2['mid'], 1.0), (meta['wingtip_cut'], 0.9), (meta['top'], 0.95), (meta['rear_top'], 0.8)]
                    add_fire(fx, meta, Mw, S, fp, [(e3['mid'], 1.35), (meta['top'], 1.2)], rng, 1.6 if not isprop else 1.2, 9, 6, body)
                cell = compose(zb, cb, ib, fx.draw(zb) if fx.items else None)
            sheet[r_*CELL:(r_+1)*CELL, c*CELL:(c+1)*CELL] = cell
            # bounds check
            al = cell[..., 3] > 0.02
            if al[0].any() or al[-1].any() or al[:, 0].any() or al[:, -1].any():
                print('WARN overflow', key, r_ + 1, c + 1)
        print(key, 'row', r_ + 1, 'done'); sys.stdout.flush()
    img = np.zeros_like(sheet); img[..., 3] = sheet[..., 3] * 255; img[..., :3] = sheet[..., :3]
    Image.fromarray(np.clip(np.round(img), 0, 255).astype(np.uint8), 'RGBA').save(path, optimize=True)

if __name__ == '__main__':
    k = sys.argv[1]; run(k, sys.argv[2])
