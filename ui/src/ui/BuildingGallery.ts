import { CONTESTED_NATIONS, type ContestedNationId, FACTION_ORDER } from '../constants';
import type { FactionId } from '../types';
import { FACTIONS } from '../factions';
import { bunkerPreview, loadBunkerSprites } from '../render/BunkerSheet';
import { IsoPainter } from '../render/IsoPainter';
import { type Sprite, SpriteCache } from '../render/SpriteCache';
import { BUILDING_ART } from '../render/sprites';
import { BUILD_OPTIONS } from '../systems/ConstructionSystem';

/** Card picture size (CSS px). */
const PIC_W = 280;
const PIC_H = 220;

/** Display name of a sprite key ("type:owner"). */
function displayName(type: string, owner: string): string {
  if (type === 'capital') return FACTIONS[owner as keyof typeof FACTIONS]?.capital.name ?? 'Capital';
  if (type === 'nation') return `${CONTESTED_NATIONS[owner as ContestedNationId]?.capital ?? 'Capital'} (${CONTESTED_NATIONS[owner as ContestedNationId]?.name ?? owner})`;
  if (type === 'bank') return 'Global Monitoring Center';
  if (type === 'monument') return 'Pyramids of Giza';
  if (type === 'oil') return 'Oil Derrick';
  return BUILD_OPTIONS.find((o) => o.id === type)?.name ?? type;
}

interface Card {
  readonly canvas: HTMLCanvasElement;
  readonly sprite: Sprite;
  /** Bunkers are drawn from their pre-drawn sheet, not from building art. */
  readonly bunker?: FactionId;
}

/**
 * `?view=buildings`: a gallery of every structure in the game, grouped by nation (plus the contested nations' capitals
 * and the neutral ones), each
 * drawn with its animated layer (flags, lights, pumpjacks) running.
 */
export function showBuildingGallery(root: HTMLElement): void {
  document.title = 'Black Area — Buildings';
  const style = document.createElement('style');
  style.textContent = `
    html, body { height: auto; overflow: auto; }
    .bg-page { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; }
    .bg-page h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 1px; }
    .bg-page > p { margin: 0 0 20px; color: var(--muted, #9aa4ad); }
    .bg-page a { color: inherit; }
    .bg-nation { margin: 28px 0 10px; display: flex; align-items: center; gap: 10px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
    .bg-swatch { width: 14px; height: 14px; border-radius: 3px; }
    .bg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${PIC_W}px, 1fr)); gap: 12px; }
    .bg-card { background: #c3cbd3; color: #1a2128; border: 1px solid #7d8994; border-radius: 8px; overflow: hidden; }
    .bg-card canvas { display: block; width: 100%; height: ${PIC_H}px; background: #8e9aa6; }
    .bg-card div { padding: 8px 10px; display: flex; justify-content: space-between; gap: 8px; }
    .bg-card b { font-weight: 600; }
    .bg-card small { color: #5f6b76; white-space: nowrap; }
  `;
  document.head.append(style);

  const cache = new SpriteCache(BUILDING_ART);
  loadBunkerSprites().catch(() => undefined);
  const page = document.createElement('div');
  page.className = 'bg-page';
  page.innerHTML = `<h1>BUILDINGS</h1><p>Every structure of every nation. <a href="?">Back to the game</a> · <a href="?view=units">Units</a></p>`;
  root.replaceChildren(page);

  const groups: { name: string; color: string; match: (type: string, owner: string) => boolean }[] = [
    ...FACTION_ORDER.map((f) => ({ name: FACTIONS[f].name, color: FACTIONS[f].colors.primary, match: (_t: string, o: string) => o === f })),
    { name: 'Contested nations', color: '#8a8f96', match: (t: string) => t === 'nation' },
    { name: 'Neutral', color: '#c9c3b2', match: (_t: string, o: string) => o === 'world' || o === 'giza' },
  ];
  const cards: Card[] = [];
  for (const g of groups) {
    const keys = Object.keys(BUILDING_ART).filter((k) => {
      const [type = '', owner = ''] = k.split(':');
      return g.match(type, owner);
    });
    if (keys.length === 0) continue;
    const h = document.createElement('h2');
    h.className = 'bg-nation';
    h.innerHTML = `<span class="bg-swatch" style="background:${g.color}"></span>${g.name}`;
    const grid = document.createElement('div');
    grid.className = 'bg-grid';
    page.append(h, grid);
    for (const key of keys) {
      const [type = '', owner = ''] = key.split(':');
      const art = BUILDING_ART[key];
      if (!art) continue;
      const sprite = cache.get(key);
      const card = document.createElement('figure');
      card.className = 'bg-card';
      card.style.margin = '0';
      const canvas = document.createElement('canvas');
      const size = `${Math.round(art.footprint.w * (art.scale ?? 1))} × ${Math.round(art.footprint.d * (art.scale ?? 1))}`;
      const label = document.createElement('div');
      label.innerHTML = `<b>${displayName(type, owner)}</b><small>${size} cells · ${key}</small>`;
      card.append(canvas, label);
      grid.append(card);
      cards.push({ canvas, sprite, bunker: type === 'bunker' ? (owner as FactionId) : undefined });
    }
  }

  const frame = (now: number): void => {
    for (const c of cards) draw(c, now / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Static sprite fitted into the card, then its animated layer in the same art space. */
function draw(card: Card, time: number): void {
  const { canvas, sprite: s } = card;
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
  const sheet = card.bunker ? bunkerPreview(card.bunker) : null;
  if (card.bunker) {
    // The intact bunker facing south, cut out of its nation's sheet (blank until the sheet has downloaded).
    if (sheet) {
      const k = Math.min(w, h) - 20;
      ctx.drawImage(sheet, (w - k) / 2, (h - k) / 2, k, k);
    }
    return;
  }
  // A turning antenna rises above the static sprite: fit the art's full height instead.
  const reach = s.centerY - s.groundHalfH - s.art.height * s.artScale;
  const b = s.art.fitHeight && reach < s.bounds.y ? { ...s.bounds, y: reach, h: s.bounds.y + s.bounds.h - reach } : s.bounds;
  const k = Math.min((w - 20) / b.w, (h - 20) / b.h);
  // Sprite top-left so that its opaque bounds sit centred in the card.
  const left = (w - b.w * k) / 2 - b.x * k;
  const top = (h - b.h * k) / 2 - b.y * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.canvas, left, top, s.width * k, s.height * k);
  if (s.art.drawAnimated) {
    ctx.save();
    ctx.translate(left + s.centerX * k, top + s.centerY * k);
    ctx.scale(k * s.artScale, k * s.artScale);
    s.art.drawAnimated(new IsoPainter(ctx, s.originX / s.artScale, s.originY / s.artScale, s.zScale), time, true);
    ctx.restore();
  }
}
