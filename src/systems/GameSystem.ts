/** A unit of game logic stepped on every fixed simulation tick. */
export interface GameSystem {
  update(dt: number): void;
}
