import type { Allegiance } from '../types';

export type EntityKind = 'building' | 'unit';

let nextEntityId = 1;

/** Base class for everything that lives on the battlefield. */
export abstract class Entity {
  readonly id = nextEntityId++;
  abstract readonly kind: EntityKind;
  hp: number;

  constructor(
    /** Owning player id (NEUTRAL_OWNER for shared landmarks). Changes on capture. */
    public owner: number,
    public faction: Allegiance,
    /** Grid position (top-left tile for buildings, fractional for units). */
    public x: number,
    public y: number,
    readonly maxHp: number,
  ) {
    this.hp = maxHp;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get hpRatio(): number {
    return this.hp / this.maxHp;
  }

  /** Painter's-algorithm sort key: higher draws later (in front). */
  abstract get depth(): number;

  /** Fixed-timestep simulation hook. */
  update(_dt: number): void {}

  /** Indestructible entities ignore all damage. */
  get indestructible(): boolean {
    return false;
  }

  damage(amount: number): void {
    if (this.indestructible) return;
    this.hp = Math.max(0, this.hp - amount);
  }
}
