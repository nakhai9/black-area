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

/**
 * DEMO_ALL_FACTIONS: the nation currently commanded (the active one in the faction bar). Only it may attack; every
 * other nation holds fire (units, defences, silos). null = no restriction (normal games, single-faction demo).
 */
export let demoAttacker: number | null = null;

export function setDemoAttacker(id: number | null): void {
  demoAttacker = id;
}

/** May `owner` open fire? Always, except in an all-factions demo where only the active nation may. */
export const mayAttack = (owner: number): boolean => demoAttacker === null || owner === demoAttacker;
