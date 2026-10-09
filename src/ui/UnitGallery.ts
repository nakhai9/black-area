import { AVAILABLE_VEHICLES, CELL_SIZE, FACTION_ORDER } from '../constants';
import { Infantry } from '../entities/Infantry';
import type { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import { isoHeading } from '../core/IsoView';
import { FACTIONS } from '../factions';
import { drawAircraftSheet, loadAircraftSprites } from '../render/AircraftSheets';
import { drawSoldier, loadSoldierSprites } from '../render/InfantryArt';
import { drawRepairSheet, loadRepairSprites } from '../render/RepairSheets';
import { drawTankSheet, loadTankSprites } from '../render/TankSheets';
import { SQUASH, drawVehicle } from '../render/VehicleArt';
import type { FactionId, UnitTier, VehicleKind } from '../types';

/** Card picture size (CSS px). */
const PIC_W = 220;
const PIC_H = 170;
/** Seconds per full turn of the showcase rotation. */
const TURN_SECONDS = 12;
/** Picture zoom (CSS px per iso px) for soldiers, ground vehicles and aircraft. */
const ZOOM = { soldier: 11, ground: 9, air: 4 } as const;

interface Card {
  readonly canvas: HTMLCanvasElement;
  readonly unit: Unit;
}

/** One-line stats: cost, health, speed and weapon. */
function stats(u: Unit): string {
  const parts = [`${u.value} TB`, `${u.maxHp} HP`, `${(u.speed / CELL_SIZE).toFixed(2)} cells/s`];
  if (u.weapon) parts.push(`${u.weapon.kind} ${Math.round(u.weapon.damage)} dmg · ${(u.weapon.range / CELL_SIZE).toFixed(1)} cells`);
  else parts.push('unarmed');
  return parts.join(' · ');
}

/**
 * `?view=units`: a gallery of every soldier, vehicle and aircraft of every nation, drawn with the in-game art
 * (sprite sheets, or the vector art where a nation has none), slowly turning through all headings.
 */
export async function showUnitGallery(root: HTMLElement): Promise<void> {
  document.title = 'Black Area — Units';
  const style = document.createElement('style');
  style.textContent = `
    html, body { height: auto; overflow: auto; }
    .ug-page { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; }
    .ug-page h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 1px; }
    .ug-page > p { margin: 0 0 20px; color: var(--muted, #9aa4ad); }
    .ug-page a { color: inherit; }
    .ug-nation { margin: 28px 0 10px; display: flex; align-items: center; gap: 10px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
    .ug-swatch { width: 14px; height: 14px; border-radius: 3px; }
    .ug-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${PIC_W}px, 1fr)); gap: 12px; }
    .ug-card { margin: 0; background: #fff; color: #1a2128; border: 1px solid #d5dbe1; border-radius: 8px; overflow: hidden; }
    .ug-card canvas { display: block; width: 100%; height: ${PIC_H}px; background: #fff; }
    .ug-card div { padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
    .ug-card b { font-weight: 600; }
    .ug-card small { color: #5f6b76; }
  `;
  document.head.append(style);
  const page = document.createElement('div');
  page.className = 'ug-page';
  page.innerHTML = `<h1>UNITS</h1><p>Every soldier, vehicle and aircraft of every nation. <a href="?">Back to the game</a> · <a href="?view=buildings">Buildings</a></p>`;
  root.replaceChildren(page);

  // The pictures come from the same sheets the game draws with (missing ones fall back to the vector art).
  await Promise.allSettled([loadSoldierSprites(), loadTankSprites(), loadAircraftSprites(), loadRepairSprites()]);

  const at = { x: 0, y: 0 };
  const cards: Card[] = [];
  for (const id of FACTION_ORDER) {
    const f = FACTIONS[id];
    const h = document.createElement('h2');
    h.className = 'ug-nation';
    h.innerHTML = `<span class="ug-swatch" style="background:${f.colors.primary}"></span>${f.name}`;
    const grid = document.createElement('div');
    grid.className = 'ug-grid';
    page.append(h, grid);
    const units: { unit: Unit; note: string }[] = [];
    for (const tier of Object.keys(f.infantry) as UnitTier[]) units.push({ unit: new Infantry(0, id, tier, at), note: tier });
    for (const kind of Object.keys(f.vehicles) as VehicleKind[]) {
      if (!AVAILABLE_VEHICLES.includes(kind) && kind !== 'tanker') continue; // hidden vehicles (light, ifv) are left out
      units.push({ unit: new Vehicle(0, id, kind, at), note: kind });
    }
    for (const { unit, note } of units) {
      const card = document.createElement('figure');
      card.className = 'ug-card';
      const canvas = document.createElement('canvas');
      const label = document.createElement('div');
      const name = unit instanceof Vehicle ? unit.name : (unit as Infantry).profile.name;
      label.innerHTML = `<b>${name}</b><small>${note}${f.peaceful ? ' · peaceful nation' : ''}</small><small>${stats(unit)}</small>`;
      card.append(canvas, label);
      grid.append(card);
      cards.push({ canvas, unit });
    }
  }

  const frame = (now: number): void => {
    for (const c of cards) draw(c, now / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Draws the card's unit turning slowly (soldiers walking), as the game would draw it. */
function draw(card: Card, time: number): void {
  const { canvas, unit: u } = card;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || PIC_W;
  const h = PIC_H;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const heading = ((time % TURN_SECONDS) / TURN_SECONDS) * Math.PI * 2;
  u.heading = heading;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.imageSmoothingQuality = 'high';
  if (u instanceof Vehicle) {
    const air = u.aircraft;
    const zoom = air ? ZOOM.air : ZOOM.ground;
    ctx.scale(zoom, zoom);
    const y = air ? u.altitude / 2 : 0; // aircraft hover over their ground point: centre the whole picture
    // Sheet aircraft are drawn altitude + 1.5 px above their ground point: put the plane itself in the middle.
    const sheet = (air && drawAircraftSheet(ctx, u, 0, u.altitude + 1.5)) || (u.type === 'tank' && drawTankSheet(ctx, u, 0, y)) || (u.type === 'repair' && drawRepairSheet(ctx, u, 0, y));
    if (!sheet) drawVehicle(ctx, { x: 0, y, heading: isoHeading(heading, air ? 0.8 : SQUASH), phase: 0, moving: false, altitude: air ? u.altitude : undefined }, u.type, u.faction as FactionId);
  } else if (u instanceof Infantry) {
    ctx.scale(ZOOM.soldier, ZOOM.soldier);
    const f = FACTIONS[u.faction as FactionId];
    const walkPhase = (time * 6) % (Math.PI * 2);
    drawSoldier(ctx, { x: 0, y: 3, facing: Math.cos(heading) - Math.sin(heading) >= 0 ? 1 : -1, heading, walkPhase, moving: true }, u.profile.look, f.colors.primary, u.tier === 'special');
  }
  ctx.restore();
}
