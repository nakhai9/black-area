import { HALF_TH, HALF_TW } from '../constants';
import { shade } from './Color';

/** Local building coordinates: u/v in tiles along the grid axes, z in pixels up. */
export type Vec3 = readonly [u: number, v: number, z: number];
/** The two vertical faces visible from the fixed camera: +v (left) and +u (right). */
export type Face = 'left' | 'right';
export type Paint = string | CanvasGradient | CanvasPattern;

/** Relative brightness per face — light comes from the upper right. */
export const LIGHT = { top: 1.0, right: 0.86, left: 0.7 } as const;
const EDGE = 'rgba(20,16,12,0.35)';

export interface BoxStyle {
  top?: Paint;
  left?: Paint;
  right?: Paint;
  edge?: string | null;
}

/**
 * Isometric vector-drawing toolkit used to author building sprites in code.
 * Shapes are given in the building's local grid space and projected with the
 * same math as the terrain, so sprites line up exactly with their footprint.
 *
 * Painter's algorithm: call primitives back-to-front (low u+v first).
 */
export class IsoPainter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly ox: number,
    readonly oy: number,
  ) {}

  project(u: number, v: number, z = 0): [number, number] {
    return [this.ox + (u - v) * HALF_TW, this.oy + (u + v) * HALF_TH - z];
  }

  polygon(points: readonly Vec3[], fill: Paint, edge: string | null = EDGE): void {
    const { ctx } = this;
    ctx.beginPath();
    points.forEach(([u, v, z], i) => {
      const [x, y] = this.project(u, v, z);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 0.75;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /** Flat horizontal rectangle (lawns, pools, plaza paving). */
  topRect(u0: number, v0: number, u1: number, v1: number, z: number, fill: Paint, edge: string | null = null): void {
    this.polygon(
      [
        [u0, v0, z],
        [u1, v0, z],
        [u1, v1, z],
        [u0, v1, z],
      ],
      fill,
      edge,
    );
  }

  /** Axis-aligned box: origin (u, v, z), size (w, d) tiles × h pixels. */
  box(u: number, v: number, w: number, d: number, z: number, h: number, color: string, style: BoxStyle = {}): void {
    const z1 = z + h;
    const edge = style.edge === undefined ? EDGE : style.edge;
    this.polygon(
      [
        [u, v + d, z],
        [u + w, v + d, z],
        [u + w, v + d, z1],
        [u, v + d, z1],
      ],
      style.left ?? shade(color, LIGHT.left),
      edge,
    );
    this.polygon(
      [
        [u + w, v, z],
        [u + w, v + d, z],
        [u + w, v + d, z1],
        [u + w, v, z1],
      ],
      style.right ?? shade(color, LIGHT.right),
      edge,
    );
    this.polygon(
      [
        [u, v, z1],
        [u + w, v, z1],
        [u + w, v + d, z1],
        [u, v + d, z1],
      ],
      style.top ?? shade(color, LIGHT.top),
      edge,
    );
  }

  /**
   * Fills a sub-rectangle of a box's visible face.
   * s ∈ [0,1] runs left→right on screen, t ∈ [0,1] bottom→top.
   */
  faceRect(
    face: Face,
    u: number,
    v: number,
    w: number,
    d: number,
    z: number,
    h: number,
    s0: number,
    s1: number,
    t0: number,
    t1: number,
    fill: Paint,
  ): void {
    const pt = (s: number, t: number): Vec3 =>
      face === 'left' ? [u + s * w, v + d, z + t * h] : [u + w, v + d - s * d, z + t * h];
    this.polygon([pt(s0, t0), pt(s1, t0), pt(s1, t1), pt(s0, t1)], fill, null);
  }

  /** Regular grid of windows on a face. */
  windows(
    face: Face,
    u: number,
    v: number,
    w: number,
    d: number,
    z: number,
    h: number,
    cols: number,
    rows: number,
    fill: Paint,
    margin = 0.1,
    gap = 0.45,
  ): void {
    const cw = (1 - 2 * margin) / cols;
    const rh = (1 - 2 * margin) / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const s0 = margin + c * cw + (cw * gap) / 2;
        const t0 = margin + r * rh + (rh * gap) / 2;
        this.faceRect(face, u, v, w, d, z, h, s0, s0 + cw * (1 - gap), t0, t0 + rh * (1 - gap), fill);
      }
    }
  }

  /** Dark recess with evenly spaced columns (porticos, temple halls). */
  colonnade(
    face: Face,
    u: number,
    v: number,
    w: number,
    d: number,
    z: number,
    h: number,
    count: number,
    column: Paint,
    recess: Paint,
  ): void {
    this.faceRect(face, u, v, w, d, z, h, 0, 1, 0, 1, recess);
    const step = 1 / count;
    for (let i = 0; i < count; i++) {
      const s0 = i * step + step * 0.25;
      this.faceRect(face, u, v, w, d, z, h, s0, s0 + step * 0.5, 0, 1, column);
    }
  }

  /**
   * Runs `draw` in a face-aligned local space: origin at (u, v, z), x grows
   * to the screen-right along the face (1 unit = 1 screen px), y grows up.
   * Ideal for doors, arches and clock faces.
   */
  faceTransform(face: Face, u: number, v: number, z: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const [x, y] = this.project(u, v, z);
    const { ctx } = this;
    ctx.save();
    ctx.transform(1, face === 'left' ? 0.5 : -0.5, 0, -1, x, y);
    draw(ctx);
    ctx.restore();
  }

  /** Screen radii of a horizontal circle with radius r tiles. */
  private radii(r: number): [number, number] {
    return [r * Math.SQRT2 * HALF_TW, r * Math.SQRT2 * HALF_TH];
  }

  cylinder(cu: number, cv: number, r: number, z: number, h: number, color: string, stripes = 0): void {
    const { ctx } = this;
    const [rx, ry] = this.radii(r);
    const [cx, yb] = this.project(cu, cv, z);
    const yt = yb - h;

    const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, shade(color, 0.58));
    g.addColorStop(0.6, shade(color, 0.98));
    g.addColorStop(0.8, shade(color, 1.06));
    g.addColorStop(1, shade(color, 0.8));

    ctx.beginPath();
    ctx.moveTo(cx - rx, yt);
    ctx.lineTo(cx - rx, yb);
    ctx.ellipse(cx, yb, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(cx + rx, yt);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 0.75;
    ctx.stroke();

    if (stripes > 0) {
      ctx.strokeStyle = shade(color, 0.62);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 1; i < stripes; i++) {
        const a = Math.PI - (i / stripes) * Math.PI;
        const x = cx + Math.cos(a) * rx;
        const dy = Math.sin(a) * ry;
        ctx.moveTo(x, yt + dy);
        ctx.lineTo(x, yb + dy);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(cx, yt, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, 1.04);
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.stroke();
  }

  /** Hemispherical dome sitting on a circle of radius r at height z. */
  dome(cu: number, cv: number, r: number, z: number, h: number, color: string): void {
    const { ctx } = this;
    const [rx, ry] = this.radii(r);
    const [cx, cy] = this.project(cu, cv, z);
    const g = ctx.createRadialGradient(cx + rx * 0.35, cy - h * 0.65, 1, cx, cy - h * 0.3, rx * 1.3);
    g.addColorStop(0, shade(color, 1.18));
    g.addColorStop(0.5, shade(color, 0.95));
    g.addColorStop(1, shade(color, 0.6));
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy);
    ctx.ellipse(cx, cy, rx, h, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  /** Russian onion dome, optionally with a swirling stripe colour. */
  onion(cu: number, cv: number, r: number, z: number, h: number, color: string, stripe?: string): void {
    const { ctx } = this;
    const [rx, ry] = this.radii(r);
    const [cx, cy] = this.project(cu, cv, z);
    const path = new Path2D();
    path.moveTo(cx - rx * 0.8, cy);
    path.bezierCurveTo(cx - rx * 1.45, cy - h * 0.25, cx - rx * 0.9, cy - h * 0.62, cx, cy - h);
    path.bezierCurveTo(cx + rx * 0.9, cy - h * 0.62, cx + rx * 1.45, cy - h * 0.25, cx + rx * 0.8, cy);
    path.ellipse(cx, cy, rx * 0.8, ry * 0.8, 0, 0, Math.PI);
    path.closePath();

    const g = ctx.createLinearGradient(cx - rx * 1.3, 0, cx + rx * 1.3, 0);
    g.addColorStop(0, shade(color, 0.55));
    g.addColorStop(0.62, shade(color, 1.12));
    g.addColorStop(1, shade(color, 0.75));
    ctx.fillStyle = g;
    ctx.fill(path);

    if (stripe) {
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = stripe;
      ctx.lineWidth = Math.max(1.2, rx * 0.3);
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * rx * 0.55 - rx * 0.4, cy + ry);
        ctx.quadraticCurveTo(cx + i * rx * 0.55 + rx * 0.7, cy - h * 0.45, cx + i * rx * 0.15, cy - h);
        ctx.stroke();
      }
      const sh = ctx.createLinearGradient(cx - rx * 1.3, 0, cx + rx * 1.3, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.4)');
      sh.addColorStop(0.6, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = sh;
      ctx.fill(path);
      ctx.restore();
    }
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 0.75;
    ctx.stroke(path);
  }

  /** Square-based pyramid (tower spires). */
  pyramid(u: number, v: number, w: number, d: number, z: number, h: number, color: string): void {
    const apex: Vec3 = [u + w / 2, v + d / 2, z + h];
    this.polygon([[u, v, z], [u + w, v, z], apex], shade(color, 0.92));
    this.polygon([[u, v, z], [u, v + d, z], apex], shade(color, 0.76));
    this.polygon([[u + w, v, z], [u + w, v + d, z], apex], shade(color, LIGHT.right));
    this.polygon([[u, v + d, z], [u + w, v + d, z], apex], shade(color, LIGHT.left));
  }

  /**
   * Hip roof over a rectangle, with overhanging eaves. `curl` lifts the eave
   * corners (in px) for the upturned look of Chinese palace roofs.
   */
  hipRoof(u: number, v: number, w: number, d: number, z: number, h: number, overhang: number, color: string, curl = 0): void {
    const U0 = u - overhang;
    const V0 = v - overhang;
    const U1 = u + w + overhang;
    const V1 = v + d + overhang;
    const zc = z + curl;
    const c00: Vec3 = [U0, V0, zc];
    const c10: Vec3 = [U1, V0, zc];
    const c11: Vec3 = [U1, V1, zc];
    const c01: Vec3 = [U0, V1, zc];
    const ww = U1 - U0;
    const dd = V1 - V0;
    const top = z + h;

    // Each face: first two points are the eave corners. Ordered back → front.
    let faces: [Vec3[], number][];
    if (ww >= dd) {
      const r1: Vec3 = [U0 + dd / 2, V0 + dd / 2, top];
      const r2: Vec3 = [U1 - dd / 2, V0 + dd / 2, top];
      faces = [
        [[c00, c10, r2, r1], 1.0],
        [[c01, c00, r1], 0.82],
        [[c10, c11, r2], 0.95],
        [[c01, c11, r2, r1], 0.76],
      ];
    } else {
      const r1: Vec3 = [U0 + ww / 2, V0 + ww / 2, top];
      const r2: Vec3 = [U0 + ww / 2, V1 - ww / 2, top];
      faces = [
        [[c00, c10, r1], 1.0],
        [[c01, c00, r1, r2], 0.82],
        [[c10, c11, r2, r1], 0.95],
        [[c01, c11, r2], 0.76],
      ];
    }

    const { ctx } = this;
    for (const [pts, light] of faces) {
      const [a, b, ...rest] = pts;
      const [ax, ay] = this.project(a[0], a[1], a[2]);
      const [bx, by] = this.project(b[0], b[1], b[2]);
      const [mx, my] = this.project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z - curl);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      for (const p of rest) {
        const [x, y] = this.project(p[0], p[1], p[2]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = shade(color, light);
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.45);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  /** Gable roof with the ridge along v; triangular gable faces the viewer (+v). */
  gableRoofV(u: number, v: number, w: number, d: number, z: number, h: number, gable: string, roof: string): void {
    const um = u + w / 2;
    const top = z + h;
    this.polygon([[u, v, z], [u, v + d, z], [um, v + d, top], [um, v, top]], shade(roof, 0.82));
    this.polygon([[um, v, top], [um, v + d, top], [u + w, v + d, z], [u + w, v, z]], shade(roof, 0.98));
    this.polygon([[u, v + d, z], [u + w, v + d, z], [um, v + d, top]], shade(gable, LIGHT.left + 0.1));
  }

  /** Vertical pole with a small finial (flagpoles, spire tips). */
  pole(u: number, v: number, z: number, h: number, color = '#d8d8d8'): void {
    const { ctx } = this;
    const [x, y] = this.project(u, v, z);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();
    ctx.fillStyle = '#e8c45a';
    ctx.beginPath();
    ctx.arc(x, y - h, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}
