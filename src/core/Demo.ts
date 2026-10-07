import { DEMO_PRICE } from '../constants';

/** Is the current game a DEMO (solo test) game? Set once, before the game is built. */
export let demoActive = false;

export function setDemoActive(on: boolean): void {
  demoActive = on;
}

/** Price shown and paid: DEMO_PRICE in a DEMO game, else the normal one. */
export function demoPrice(cost: number): number {
  return demoActive ? DEMO_PRICE : cost;
}
