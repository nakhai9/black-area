"""Chinese curved hip roof shared by the Chinese designs (techcenter_pku.py, barracks.py bayi)."""
import bmesh

from kit import _obj, box, rod, zp


def curved_roof(u0, v0, w, d, z, H, over, tile, ridge_m, eave_m, lift=3.2, step=0.09, row_r=0.012):
    """Hip roof over (u0, v0, w, d) with eaves `over` beyond it, its ridge along the longer side: concave slopes that
    flare out towards the eaves, corners swept up by `lift` art px, raised tile rows down every slope, hip ridges, a
    main ridge with end ornaments and a dark eave board along the edge."""
    a0, a1, b0, b1 = u0 - over, u0 + w + over, v0 - over, v0 + d + over
    along_v = (b1 - b0) >= (a1 - a0)
    hw = min(a1 - a0, b1 - b0) / 2
    reach = min(0.55, hw)

    def zf(u, v):
        du, dv = min(u - a0, a1 - u), min(v - b0, b1 - v)
        t = max(0.0, min(1.0, min(du, dv) / hw))
        du, dv = max(du, 0.0), max(dv, 0.0)
        up = lift * max(0.0, 1 - du / reach) ** 2 * max(0.0, 1 - dv / reach) ** 2
        return z + H * t**1.7 + up

    n = 48
    bm = bmesh.new()
    grid = [[bm.verts.new((a0 + (a1 - a0) * i / n, b0 + (b1 - b0) * j / n, 0)) for j in range(n + 1)] for i in range(n + 1)]
    for row in grid:
        for vert in row:
            vert.co.z = zp(zf(vert.co.x, vert.co.y))
    for i in range(n):
        for j in range(n):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    ob = _obj("roof", bm, tile)
    ob.modifiers.new("solid", "SOLIDIFY").thickness = 0.03
    for f in ob.data.polygons:
        f.use_smooth = True

    def polyline(pts, r, m, dz=0.35):
        for (ua, va), (ub, vb) in zip(pts, pts[1:]):
            rod((ua, va, zp(zf(ua, va) + dz)), (ub, vb, zp(zf(ub, vb) + dz)), r, m, 4)

    k = 10
    # Raised tile rows: down each slope from the eave, stopping where it meets a hip.
    for fixed_v in (True, False):
        lo, hi, e0, e1 = (b0, b1, a0, a1) if fixed_v else (a0, a1, b0, b1)
        x = lo + step
        while x < hi - step / 2:
            for side in (e0, e1):
                to_mid = (e0 + e1) / 2 - side
                limit = min(x - lo, hi - x)
                pts = []
                for q in range(k + 1):
                    off = to_mid * q / k
                    if abs(off) > limit + 1e-6:
                        break
                    pts.append((side + off, x) if fixed_v else (x, side + off))
                if len(pts) > 1:
                    polyline(pts, row_r, tile)
            x += step
    # Hip ridges from the swept-up corners to the ridge ends, the main ridge, its end ornaments.
    cu, cv = (a0 + a1) / 2, (b0 + b1) / 2
    if along_v:
        e_a, e_b = (cu, b0 + hw), (cu, b1 - hw)
    else:
        e_a, e_b = (a0 + hw, cv), (a1 - hw, cv)
    for corner, end in (((a0, b0), e_a), ((a1, b0), e_a if along_v else e_b), ((a0, b1), e_b if along_v else e_a), ((a1, b1), e_b)):
        polyline([(corner[0] + (end[0] - corner[0]) * q / k, corner[1] + (end[1] - corner[1]) * q / k) for q in range(k + 1)], row_r * 2.5, ridge_m)
    rz = zf(cu, cv)
    if along_v:
        box(cu - 0.05, e_a[1], 0.1, max(0.02, e_b[1] - e_a[1]), rz, 2.2, ridge_m)
        ends = ((cu - 0.06, e_a[1] - 0.04, 0.12, 0.1), (cu - 0.06, e_b[1] - 0.06, 0.12, 0.1))
    else:
        box(e_a[0], cv - 0.05, max(0.02, e_b[0] - e_a[0]), 0.1, rz, 2.2, ridge_m)
        ends = ((e_a[0] - 0.04, cv - 0.06, 0.1, 0.12), (e_b[0] - 0.06, cv - 0.06, 0.1, 0.12))
    for u, v, ww, dd in ends:
        box(u, v, ww, dd, rz + 1.5, 4, ridge_m)
    # Eave board along the edge.
    for (ua, va), (ub, vb) in (((a0, b0), (a1, b0)), ((a1, b0), (a1, b1)), ((a1, b1), (a0, b1)), ((a0, b1), (a0, b0))):
        pts = [(ua + (ub - ua) * q / 24, va + (vb - va) * q / 24) for q in range(25)]
        for (pa, qa), (pb, qb) in zip(pts, pts[1:]):
            rod((pa, qa, zp(zf(pa, qa) - 0.6)), (pb, qb, zp(zf(pb, qb) - 0.6)), 0.025, eave_m, 4)
