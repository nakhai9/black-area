/** Short-lived visual effects drawn on top of units. Positions are world px. */
export type Effect =
  | { kind: 'tracer'; x0: number; y0: number; x1: number; y1: number; age: number; ttl: number; color: string; width: number; shell: boolean }
  | { kind: 'flash'; x: number; y: number; age: number; ttl: number; size: number }
  | { kind: 'blast'; x: number; y: number; age: number; ttl: number; radius: number }
  | { kind: 'smoke'; x: number; y: number; age: number; ttl: number; radius: number };

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
