import { Infantry } from '../entities/Infantry';
import type { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import { isoHeading } from '../core/IsoView';
import { FACTIONS } from '../factions';
import { drawAircraftSheet } from '../render/AircraftSheets';
import { drawSoldier } from '../render/InfantryArt';
import { drawRepairSheet } from '../render/RepairSheets';
import { drawMantisSheet } from '../render/MantisSheet';
import { drawTruckSheet } from '../render/TruckSheets';
import { drawTankSheet } from '../render/TankSheets';
import { SQUASH, drawVehicle } from '../render/VehicleArt';
import { drawBridgeLayerSheet } from '../render/BridgeLayerSheets';
import type { FactionId } from '../types';

/** Card picture size (CSS px). */
const PIC_W = 220;
const PIC_H = 170;
/** Seconds per full turn of the showcase rotation. */
const TURN_SECONDS = 12;
/** Picture zoom (CSS px per iso px) for soldiers, ground vehicles and aircraft. */
const ZOOM = { soldier: 11, ground: 9, air: 4 } as const;

export interface UnitCard {
  readonly canvas: HTMLCanvasElement;
  readonly unit: Unit;
  /** A fixed heading (radians) instead of the slow showcase turn. */
  readonly heading?: number;
}

/** Draws the card's unit turning slowly (soldiers walking), as the game would draw it. */
export function drawUnitCard(card: UnitCard, time: number): void {
  const { canvas, unit: u } = card;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || PIC_W;
  const h = canvas.clientHeight || PIC_H;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const heading = card.heading ?? ((time % TURN_SECONDS) / TURN_SECONDS) * Math.PI * 2;
  u.heading = heading;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  // Pictures larger or smaller than a gallery card scale with it.
  const fit = Math.min(w / PIC_W, h / PIC_H);
  ctx.scale(fit, fit);
  ctx.imageSmoothingQuality = 'high';
  if (u instanceof Vehicle) {
    const air = u.aircraft || u.isDrone;
    const zoom = air ? ZOOM.air : ZOOM.ground;
    ctx.scale(zoom, zoom);
    const y = air ? u.altitude / 2 : 0; // aircraft hover over their ground point: centre the whole picture
    // Sheet aircraft are drawn altitude + 1.5 px above their ground point: put the plane itself in the middle.
    const sheet = (air && drawAircraftSheet(ctx, u, 0, u.altitude + 1.5)) || (u.type === 'tank' && drawTankSheet(ctx, u, 0, y)) || (u.type === 'repair' && drawRepairSheet(ctx, u, 0, y)) || (u.type === 'mantis' && drawMantisSheet(ctx, u, 0, y)) || (u.type === 'truck' && drawTruckSheet(ctx, u, 0, y)) || (u.type === 'bridgeLayer' && drawBridgeLayerSheet(ctx, u, 0, y));
    if (!sheet) drawVehicle(ctx, { x: 0, y, heading: isoHeading(heading, air ? 0.8 : SQUASH), phase: 0, moving: false, altitude: air ? u.altitude : undefined }, u.type, u.faction as FactionId);
  } else if (u instanceof Infantry) {
    ctx.scale(ZOOM.soldier, ZOOM.soldier);
    const f = FACTIONS[u.faction as FactionId];
    const walkPhase = (time * 6) % (Math.PI * 2);
    drawSoldier(ctx, { x: 0, y: 3, facing: Math.cos(heading) - Math.sin(heading) >= 0 ? 1 : -1, heading, walkPhase, moving: true }, u.profile.look, f.colors.primary, u.tier === 'special');
  }
  ctx.restore();
}
