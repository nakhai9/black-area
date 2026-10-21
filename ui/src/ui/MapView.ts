import { CAPITAL_LOCATIONS, CONTESTED_NATIONS, type ContestedNationId, EARTH_TEXTURE_URL, GRID_HEIGHT, GRID_WIDTH, MAP_SEED, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { FACTIONS } from '../factions';
import { computeBiomes } from '../map/Biomes';
import { loadEarthData } from '../map/EarthData';
import { geoToWorld } from '../map/Geo';
import { RIVERS } from '../map/Rivers';
import { TerrainRenderer } from '../map/TerrainRenderer';
import { TileMap } from '../map/TileMap';
import { TreeLayer } from '../map/Trees';
import { buildWorld } from '../map/WorldGenerator';
import type { FactionId } from '../types';

/**
 * `?view=map`: the whole world map seen from above (the smooth base terrain the game draws when zoomed out, rivers
 * included), with capitals and river names. Drag to pan, wheel to zoom, double click to fit.
 */
export async function showMapView(root: HTMLElement): Promise<void> {
  document.title = 'Black Area — Map';
  const style = document.createElement('style');
  style.textContent = `
    html, body { height: 100%; overflow: hidden; margin: 0; background: #0b1420; }
    .mv-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2; padding: 8px 16px; display: flex; gap: 12px; align-items: center;
      background: rgba(10, 16, 24, 0.8); color: #d8dee4; font: 13px system-ui, sans-serif; flex-wrap: wrap; }
    .mv-bar a { color: inherit; }
    .mv-bar label { display: flex; gap: 4px; align-items: center; cursor: pointer; }
    .mv-stage { position: fixed; inset: 0; cursor: grab; touch-action: none; }
    .mv-stage.drag { cursor: grabbing; }
    .mv-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .mv-world canvas { display: block; image-rendering: auto; }
    .mv-pin { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; pointer-events: none;
      font: 600 11px system-ui, sans-serif; color: #fff; text-shadow: 0 0 3px #000, 0 0 2px #000; }
    .mv-pin i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; border: 1px solid #000; margin-right: 4px; vertical-align: -1px; }
    .mv-river { color: #bfe0ff; font-style: italic; font-weight: 500; }
    .mv-loading { position: fixed; inset: 0; display: grid; place-items: center; color: #d8dee4; font: 14px system-ui, sans-serif; }
  `;
  document.head.append(style);
  const loading = document.createElement('div');
  loading.className = 'mv-loading';
  loading.textContent = 'Loading map…';
  root.replaceChildren(loading);

  const earth = await loadEarthData(EARTH_TEXTURE_URL);
  const biomes = computeBiomes(GRID_WIDTH, GRID_HEIGHT, MAP_SEED);
  const map = new TileMap(GRID_WIDTH, GRID_HEIGHT);
  buildWorld(earth, biomes, map);
  const terrain = new TerrainRenderer(earth, map, biomes, new TreeLayer(map, biomes, MAP_SEED), MAP_SEED);

  const bar = document.createElement('div');
  bar.className = 'mv-bar';
  bar.innerHTML = `<b>WORLD MAP</b><a href="?">Back to the game</a><a href="?view=buildings">Buildings</a><a href="?view=units">Units</a>
    <label><input type="checkbox" data-layer="capital" checked> Capitals</label>
    <label><input type="checkbox" data-layer="river" checked> Rivers</label>
    <span style="opacity:.7">Drag: pan · Wheel: zoom · Double click: fit</span>`;
  const stage = document.createElement('div');
  stage.className = 'mv-stage';
  const world = document.createElement('div');
  world.className = 'mv-world';
  const W = terrain.canvas.width;
  const H = terrain.canvas.height;
  world.style.width = `${W}px`;
  world.style.height = `${H}px`;
  world.append(terrain.canvas);
  stage.append(world);
  root.replaceChildren(bar, stage);

  // Pins in texture px (world px scaled to the base canvas).
  const pin = (lon: number, lat: number, html: string, layer: string, cls = ''): void => {
    const p = geoToWorld({ lon, lat });
    const el = document.createElement('div');
    el.className = `mv-pin ${cls}`;
    el.dataset.layer = layer;
    el.style.left = `${(p.x / WORLD_WIDTH) * W}px`;
    el.style.top = `${(p.y / WORLD_HEIGHT) * H}px`;
    el.innerHTML = html;
    world.append(el);
  };
  for (const [id, site] of Object.entries(CAPITAL_LOCATIONS) as [FactionId, (typeof CAPITAL_LOCATIONS)[FactionId]][]) {
    pin(site.lon, site.lat, `<i style="background:${FACTIONS[id].colors.primary}"></i>${site.name}`, 'capital');
  }
  for (const id of Object.keys(CONTESTED_NATIONS) as ContestedNationId[]) {
    const n = CONTESTED_NATIONS[id];
    pin(n.site.lon, n.site.lat, `<i style="background:#bbb"></i>${n.name}`, 'capital');
  }
  for (const r of RIVERS) {
    const mid = r.course[Math.floor(r.course.length / 2)]!;
    pin(mid[0], mid[1], r.name, 'river', 'mv-river');
  }
  bar.querySelectorAll<HTMLInputElement>('input[data-layer]').forEach((box) => {
    box.addEventListener('change', () => {
      world.querySelectorAll<HTMLElement>(`[data-layer="${box.dataset.layer}"]`).forEach((el) => (el.style.display = box.checked ? '' : 'none'));
    });
  });

  // Pan / zoom; labels keep their screen size.
  let scale = 1;
  let ox = 0;
  let oy = 0;
  const apply = (): void => {
    world.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
    world.querySelectorAll<HTMLElement>('.mv-pin').forEach((el) => (el.style.transform = `translate(-50%, -50%) scale(${1 / scale})`));
  };
  const fit = (): void => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    ox = (innerWidth - W * scale) / 2;
    oy = (innerHeight - H * scale) / 2;
    apply();
  };
  fit();
  addEventListener('resize', fit);
  stage.addEventListener('dblclick', fit);
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * 0.0015);
      const next = Math.min(16, Math.max(Math.min(innerWidth / W, innerHeight / H) * 0.5, scale * k));
      ox = e.clientX - ((e.clientX - ox) * next) / scale;
      oy = e.clientY - ((e.clientY - oy) * next) / scale;
      scale = next;
      apply();
    },
    { passive: false },
  );
  let drag: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX - ox, y: e.clientY - oy };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('drag');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    ox = e.clientX - drag.x;
    oy = e.clientY - drag.y;
    apply();
  });
  const end = (): void => {
    drag = null;
    stage.classList.remove('drag');
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}
