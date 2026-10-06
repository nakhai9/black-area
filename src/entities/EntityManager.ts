import { Building } from './Building';
import { Infantry } from './Infantry';
import { Unit } from './Unit';
import { Vehicle } from './Vehicle';
import type { Entity } from './Entity';

/** Owns all live entities; provides lookups and depth-sorted iteration. */
export class EntityManager {
  private readonly byId = new Map<number, Entity>();
  /** Bumped on add / remove; together with Unit.insideVersion it tells when the cached lists are stale. */
  private version = 0;
  private readonly lists = new Map<string, { key: string; list: readonly Entity[] }>();

  add<T extends Entity>(entity: T): T {
    this.byId.set(entity.id, entity);
    this.version++;
    return entity;
  }

  remove(id: number): void {
    if (this.byId.delete(id)) this.version++;
  }

  /**
   * The filtered lists below are asked for dozens of times per tick by every system; they are rebuilt only when
   * an entity was added / removed or a unit went in or out of a building. Callers must not mutate them.
   */
  private cached<T extends Entity>(name: string, build: () => T[]): readonly T[] {
    const key = `${this.version}:${Unit.insideVersion}`;
    const hit = this.lists.get(name);
    if (hit && hit.key === key) return hit.list as readonly T[];
    const list = build();
    this.lists.set(name, { key, list });
    return list;
  }

  get(id: number | null): Entity | undefined {
    return id === null ? undefined : this.byId.get(id);
  }

  all(): IterableIterator<Entity> {
    return this.byId.values();
  }

  buildings(): readonly Building[] {
    return this.cached('b', () => [...this.byId.values()].filter((e): e is Building => e instanceof Building));
  }

  units(): readonly Infantry[] {
    return this.cached('u', () => [...this.byId.values()].filter((e): e is Infantry => e instanceof Infantry));
  }

  vehicles(): readonly Vehicle[] {
    return this.cached('v', () => [...this.byId.values()].filter((e): e is Vehicle => e instanceof Vehicle));
  }

  /** Everything that moves under orders (soldiers, vehicles, aircraft) and is out on the map. */
  fieldMovers(): readonly Unit[] {
    return this.cached('m', () => [...this.byId.values()].filter((e): e is Unit => e instanceof Unit && e.visible));
  }

  /** Soldiers standing on the map (not stationed inside a building). */
  fieldUnits(): readonly Infantry[] {
    return this.cached('f', () => this.units().filter((u) => u.visible));
  }

  /** Back-to-front order for the painter's algorithm. */
  byDepth(): Entity[] {
    return [...this.byId.values()].sort((a, b) => a.depth - b.depth);
  }

  update(dt: number): void {
    for (const e of this.byId.values()) e.update(dt);
  }
}
