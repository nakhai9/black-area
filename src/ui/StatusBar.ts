import { formatGeo, worldToGeo } from '../map/Geo';
import { TERRITORIES } from '../map/Territories';
import type { TileMap } from '../map/TileMap';
import type { TerrainType, WorldPoint } from '../types';

const UPDATE_INTERVAL = 0.1;

const TERRAIN_LABELS: Readonly<Record<TerrainType, string>> = {
  water: 'Ocean',
  sand: 'Coast',
  grass: 'Plains',
  forest: 'Forest',
  desert: 'Desert',
  rock: 'Mountains',
  snow: 'Ice',
};

/** Bottom-left readout: coordinates, terrain, territory, zoom and FPS. */
export class StatusBar {
  private timer = UPDATE_INTERVAL;
  private frames = 0;
  private fps = 0;
  private fpsTimer = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly map: TileMap,
  ) {}

  update(dt: number, world: WorldPoint | null, zoom: number): void {
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.timer += dt;
    if (this.timer < UPDATE_INTERVAL) return;
    this.timer = 0;

    let place = '—';
    const cell = world ? this.map.cellAt(world.x, world.y) : null;
    if (world && cell) {
      const type = this.map.typeAt(cell.x, cell.y) ?? 'water';
      const h = Math.round(this.map.heightAt(cell.x, cell.y));
      const territory = TERRITORIES[this.map.territory[this.map.index(cell.x, cell.y)] - 1];
      place = `${formatGeo(worldToGeo(world))} · ${TERRAIN_LABELS[type]} · ${h} m${territory ? ` · ${territory.name}` : ''}`;
    }
    this.el.textContent = `${place}   |   Zoom ${zoom.toFixed(2)}×   |   ${this.fps} FPS`;
  }
}
