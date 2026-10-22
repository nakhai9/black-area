import { MOUNTAIN_RANGES, NEUTRAL_OWNER } from '../constants';

/** Seconds after the last hit during which a radar alert ring stays on an own unit / building. */
const RADAR_ALERT_SECONDS = 5;
/** Radius (minimap px) of the red circle round a place under attack; hits closer than this share one circle. */
const RADAR_ALERT_RADIUS = 14;
import type { Camera } from '../core/Camera';
import type { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';
import { teamColors } from '../factions';
import { geoToWorld } from '../map/Geo';
import type { TerrainRenderer } from '../map/TerrainRenderer';
import { createCanvas, get2d } from '../render/Canvas';
import type { WorldPoint } from '../types';

/**
 * RA2-style radar: a scaled copy of the prerendered Earth, faction markers
 * and the camera frustum. Click or drag to move the camera.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private dpr = 1;
  private dragging = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly terrain: TerrainRenderer,
    private readonly camera: Camera,
    private readonly onNavigate: (world: WorldPoint) => void,
    /** Left click on the radar: true when it was taken as an order for the selected units (the camera then stays). */
    private readonly onPick: (world: WorldPoint) => boolean = () => false,
  ) {
    this.ctx = get2d(canvas);
    // Right button: the camera goes there. Left button: the selected units go there (no selection: the camera goes).
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      // Radar offline (no Radar Tower): the map cannot be clicked at all — no orders, no camera jumps.
      if (!this.online) return;
      if (e.button === 0 && this.onPick(this.toWorld(e))) return;
      if (e.button !== 0 && e.button !== 2) return;
      this.dragging = true;
      canvas.setPointerCapture(e.pointerId);
      this.navigate(e);
    });
    canvas.addEventListener('pointermove', (e) => this.dragging && this.online && this.navigate(e));
    canvas.addEventListener('pointerup', () => (this.dragging = false));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);

    const t = this.terrain;
    this.scale = Math.min(r.width / t.width, r.height / t.height);
    this.offX = (r.width - t.width * this.scale) / 2;
    this.offY = (r.height - t.height * this.scale) / 2;

    const { canvas, ctx } = createCanvas(this.canvas.width, this.canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      t.canvas,
      this.offX * this.dpr,
      this.offY * this.dpr,
      t.width * this.scale * this.dpr,
      t.height * this.scale * this.dpr,
    );
    // Mountain ranges: a smooth reddish-brown curve along each crest line, so the radar shows where the mountains are.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.strokeStyle = 'rgba(150,62,38,0.9)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const range of MOUNTAIN_RANGES) {
      const pts = range.points.map(([lon, lat]) => this.toMinimap(geoToWorld({ lon, lat })));
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let k = 1; k < pts.length - 1; k++) {
        const mx = (pts[k]!.x + pts[k + 1]!.x) / 2;
        const my = (pts[k]!.y + pts[k + 1]!.y) / 2;
        ctx.quadraticCurveTo(pts[k]!.x, pts[k]!.y, mx, my);
      }
      const last = pts[pts.length - 1]!;
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    this.base = canvas;
  }

  /**
   * Draws the radar. It runs on a Radar Tower: with one every unit and structure shows; without one it is
   * offline — no unit or structure markers (only the under-attack rings), and it takes no clicks.
   */
  /** Radar online (a Radar Tower is owned): only then can the map be clicked. */
  private online = false;

  render(buildings: readonly Building[], units: readonly Unit[], viewerOwner: number, online: boolean, time = 0): void {
    this.online = online;
    if (!this.online) this.dragging = false;
    const shown = (_owner: number): boolean => online;
    if (!this.base) return;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    for (const b of buildings) {
      if (!shown(b.owner)) continue;
      const c = this.toMinimap(b.centerWorld());
      ctx.fillStyle = teamColors(b.faction).primary;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      // A small round dot per structure (radius 2.2 px, outlined in black); neutral / unowned ones are triangles.
      ctx.beginPath();
      if (b.owner === NEUTRAL_OWNER) {
        ctx.moveTo(c.x, c.y - 3.2);
        ctx.lineTo(c.x + 3, c.y + 2.2);
        ctx.lineTo(c.x - 3, c.y + 2.2);
        ctx.closePath();
      } else ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const u of units) {
      if (!shown(u.owner)) continue;
      const c = this.toMinimap({ x: u.px, y: u.py });
      ctx.fillStyle = teamColors(u.faction).primary;
      ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
    }

    // Under-attack alert: a pulsing red ring around each own unit / building hit in the last RADAR_ALERT_SECONDS.
    // Things that stopped being hit, or died (no longer in the lists), lose their ring.
    const hits: WorldPoint[] = [];
    for (const b of buildings) if (b.owner === viewerOwner && time - b.lastAttackedAt < RADAR_ALERT_SECONDS) hits.push(this.toMinimap(b.centerWorld()));
    for (const u of units) if (u.owner === viewerOwner && time - u.lastAttackedAt < RADAR_ALERT_SECONDS) hits.push(this.toMinimap({ x: u.px, y: u.py }));
    if (hits.length) {
      // Merge hits closer than 10 px into one ring so a big fight shows one circle, not dozens.
      const rings: { x: number; y: number; n: number }[] = [];
      for (const h of hits) {
        const r = rings.find((g) => Math.hypot(g.x / g.n - h.x, g.y / g.n - h.y) < RADAR_ALERT_RADIUS);
        if (r) {
          r.x += h.x;
          r.y += h.y;
          r.n++;
        } else rings.push({ x: h.x, y: h.y, n: 1 });
      }
      // A wide red circle round the area: faint red fill, a thick pulsing rim.
      const pulse = (Math.sin(time * 6) + 1) / 2;
      for (const g of rings) {
        const r = RADAR_ALERT_RADIUS + 3 * pulse;
        ctx.beginPath();
        ctx.arc(g.x / g.n, g.y / g.n, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,30,30,${0.12 + 0.1 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,40,40,${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }

    // The isometric view covers a diamond-like quadrilateral of the map.
    const cam = this.camera;
    const corners = [cam.screenToWorld(0, 0), cam.screenToWorld(cam.viewWidth, 0), cam.screenToWorld(cam.viewWidth, cam.viewHeight), cam.screenToWorld(0, cam.viewHeight)].map((c) => this.toMinimap(c));
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
  }

  private toMinimap(w: WorldPoint): WorldPoint {
    return { x: w.x * this.scale + this.offX, y: w.y * this.scale + this.offY };
  }

  private navigate(e: PointerEvent): void {
    this.onNavigate(this.toWorld(e));
  }

  private toWorld(e: PointerEvent): WorldPoint {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.offX) / this.scale,
      y: (e.clientY - r.top - this.offY) / this.scale,
    };
  }
}
