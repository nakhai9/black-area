import { Truck, UserGroup, UserRoundCog, type IconNode } from 'lucide';
import { t } from '../i18n';
import type { Unit } from '../entities/Unit';

/** What is aboard a carrier / inside a structure, by kind of occupant. */
export interface Occupancy {
  /** Vehicles (repair vehicles not counted here). */
  vehicles: number;
  /** Soldiers (engineers not counted here). */
  soldiers: number;
  /** Engineers and repair vehicles. */
  crew: number;
}

/** Sorts occupants into vehicles, soldiers and crew (engineers + repair vehicles, counted only there). */
export function occupancyOf(units: readonly Unit[]): Occupancy {
  const o: Occupancy = { vehicles: 0, soldiers: 0, crew: 0 };
  for (const u of units) {
    const w = u as Unit & { isEngineer?: boolean; isRepair?: boolean; cargo?: unknown };
    if (w.isEngineer === true || w.isRepair === true) o.crew++;
    else if (w.cargo !== undefined) o.vehicles++;
    else o.soldiers++;
  }
  return o;
}

/** A lucide icon (24 × 24 stroke icon) as canvas paths: its path / circle / rect / line nodes. */
function iconPaths(node: IconNode): Path2D {
  const p = new Path2D();
  for (const [tag, a] of node) {
    const n = (k: string): number => Number((a as Record<string, unknown>)[k] ?? 0);
    if (tag === 'path') p.addPath(new Path2D(String((a as Record<string, unknown>).d)));
    else if (tag === 'circle') {
      p.moveTo(n('cx') + n('r'), n('cy'));
      p.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
    } else if (tag === 'rect') p.rect(n('x'), n('y'), n('width'), n('height'));
    else if (tag === 'line') {
      p.moveTo(n('x1'), n('y1'));
      p.lineTo(n('x2'), n('y2'));
    }
  }
  return p;
}

const TRUCK = iconPaths(Truck);
const USERS = iconPaths(UserGroup);
const CREW = iconPaths(UserRoundCog);

/**
 * Occupancy tag: `[Truck] n | [UserGroup] n | [UserRoundCog] n` on a yellow plate while there is room; a red plate
 * with a white "Full" once nothing more fits. Vehicles show only when some are aboard (soldiers only: just the
 * UserGroup part), the crew part only when an engineer or a repair vehicle is aboard. Drawn with its top-left at
 * (x, y), `k` = world px per screen px; `h` its height. Returns the width it took.
 */
export function drawOccupancyTag(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, k: number, o: Occupancy, full: boolean): number {
  ctx.save();
  ctx.font = `700 ${10 * k}px "Courier New", Courier, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const pad = 4 * k;
  const icon = 11 * k;
  const gap = 2 * k;
  if (full) {
    const text = t('Full');
    const w = ctx.measureText(text).width + pad * 2;
    ctx.fillStyle = '#d62d20';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = k;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x + pad, y + h / 2 + 0.3 * k);
    ctx.restore();
    return w;
  }
  const parts: { path: Path2D; n: number }[] = [];
  if (o.vehicles > 0) parts.push({ path: TRUCK, n: o.vehicles });
  if (o.soldiers > 0 || parts.length === 0) parts.push({ path: USERS, n: o.soldiers });
  if (o.crew > 0) parts.push({ path: CREW, n: o.crew });
  const texts = parts.map((p) => `: ${p.n}`);
  const sep = ' | ';
  const sepW = ctx.measureText(sep).width;
  const w = pad * 2 + parts.reduce((s, _p, i) => s + icon + gap + ctx.measureText(texts[i]!).width, 0) + sepW * (parts.length - 1);
  ctx.fillStyle = '#e0a21b';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = k;
  ctx.strokeRect(x, y, w, h);
  let cx = x + pad;
  parts.forEach((p, i) => {
    ctx.save();
    ctx.translate(cx, y + h / 2 - icon / 2);
    ctx.scale(icon / 24, icon / 24);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(p.path);
    ctx.restore();
    cx += icon + gap;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(texts[i]!, cx, y + h / 2 + 0.3 * k);
    cx += ctx.measureText(texts[i]!).width;
    if (i < parts.length - 1) {
      ctx.fillText(sep, cx, y + h / 2 + 0.3 * k);
      cx += sepW;
    }
  });
  ctx.restore();
  return w;
}
