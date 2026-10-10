import type { BulletSize } from '../render/BulletSheet';
import type { FactionId, InfantryLook } from '../types';

/** Short-lived visual effects drawn on top of units. Positions are world px. */
export type Effect =
  | { kind: 'tracer'; x0: number; y0: number; x1: number; y1: number; age: number; ttl: number; color: string; width: number; shell: boolean }
  | { kind: 'flash'; x: number; y: number; age: number; ttl: number; size: number }
  | { kind: 'blast'; x: number; y: number; age: number; ttl: number; radius: number }
  | { kind: 'smoke'; x: number; y: number; age: number; ttl: number; radius: number }
  /** Something blowing up, from the explosion sheet: fireball `size` iso px wide, one of its variants. */
  | { kind: 'explosion'; x: number; y: number; age: number; ttl: number; size: number; variant: number }
  /** A main battle tank blowing up and burning out, from its faction's tank sheet. */
  | { kind: 'tankDeath'; x: number; y: number; age: number; ttl: number; faction: FactionId }
  | { kind: 'repairDeath'; x: number; y: number; age: number; ttl: number; faction: FactionId; heading: number }
  | { kind: 'truckDeath'; x: number; y: number; age: number; ttl: number; faction: FactionId; heading: number; flatbed: boolean }
  /** A bomb from a nation's bomb sheet: falling from (x0, y0) to (x1, y1), its shadow from (gx, gy) to the impact. */
  | { kind: 'bombFall'; x0: number; y0: number; x1: number; y1: number; gx: number; gy: number; age: number; ttl: number; faction: FactionId }
  /** A Crazy Soldier's planted charge (position follows its target while it ticks) and its blast. */
  | { kind: 'charge'; x: number; y: number; age: number; ttl: number }
  | { kind: 'demoBlast'; x: number; y: number; age: number; ttl: number }
  /** A bullet from the shared bullet sheet, flying (x0, y0) → (x1, y1), sized by who fired it. */
  | { kind: 'bullet'; x0: number; y0: number; x1: number; y1: number; age: number; ttl: number; size: BulletSize }
  /** Its impact: flash, fireball and smoke. */
  | { kind: 'bulletHit'; x: number; y: number; age: number; ttl: number; size: BulletSize }
  /** A tank shell from the shared shell sheet, flying (x0, y0) → (x1, y1). */
  | { kind: 'shell'; x0: number; y0: number; x1: number; y1: number; age: number; ttl: number }
  /** Its impact: sparks off a vehicle's armour, or an explosion and scorch mark. */
  | { kind: 'shellImpact'; x: number; y: number; age: number; ttl: number; armour: boolean }
  /** An aircraft's missile from the shared missile sheet, flying (x0, y0) → (x1, y1). */
  | { kind: 'missile'; x0: number; y0: number; x1: number; y1: number; age: number; ttl: number }
  /** Its impact: a small burst on an aircraft (`air`), the large explosion on the ground. */
  | { kind: 'missileBlast'; x: number; y: number; age: number; ttl: number; air: boolean }
  /** The bomb sheet's explosion and burning crater. */
  | { kind: 'bombBlast'; x: number; y: number; age: number; ttl: number; faction: FactionId }
  /** A killed soldier falling and lying a moment, from their sheet's dying frames. */
  | { kind: 'soldierDeath'; x: number; y: number; age: number; ttl: number; look: InfantryLook; heading: number };

/** Holds and ages the active effects. */
export class EffectsLayer {
  readonly list: Effect[] = [];
  private static readonly MAX = 600;

  add(e: Effect): void {
    if (this.list.length < EffectsLayer.MAX) this.list.push(e);
  }

  update(dt: number): void {
    let w = 0;
    for (const e of this.list) {
      e.age += dt;
      if (e.age < e.ttl) this.list[w++] = e;
    }
    this.list.length = w;
  }
}
