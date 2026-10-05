import { Building } from './Building';
import { Infantry } from './Infantry';
import { Unit } from './Unit';
import { Vehicle } from './Vehicle';
import type { Entity } from './Entity';

/** Owns all live entities; provides lookups and depth-sorted iteration. */
export class EntityManager {
  private readonly byId = new Map<number, Entity>();

  add<T extends Entity>(entity: T): T {
    this.byId.set(entity.id, entity);
    return entity;
  }

  remove(id: number): void {
    this.byId.delete(id);
  }

  get(id: number | null): Entity | undefined {
    return id === null ? undefined : this.byId.get(id);
  }

  all(): IterableIterator<Entity> {
    return this.byId.values();
  }

  buildings(): Building[] {
    return [...this.byId.values()].filter((e): e is Building => e instanceof Building);
  }

  units(): Infantry[] {
    return [...this.byId.values()].filter((e): e is Infantry => e instanceof Infantry);
  }

  vehicles(): Vehicle[] {
    return [...this.byId.values()].filter((e): e is Vehicle => e instanceof Vehicle);
  }

  /** Everything that moves under orders (soldiers, vehicles, aircraft) and is out on the map. */
  fieldMovers(): Unit[] {
    return [...this.byId.values()].filter((e): e is Unit => e instanceof Unit && e.visible);
  }

  /** Soldiers standing on the map (not stationed inside a building). */
  fieldUnits(): Infantry[] {
    return this.units().filter((u) => u.visible);
  }

  /** Back-to-front order for the painter's algorithm. */
  byDepth(): Entity[] {
    return [...this.byId.values()].sort((a, b) => a.depth - b.depth);
  }

  update(dt: number): void {
    for (const e of this.byId.values()) e.update(dt);
  }
}
