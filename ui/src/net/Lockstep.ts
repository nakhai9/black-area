import type { FactionId } from '../types';
import type { NetClient } from './NetClient';

/** Simulation ticks in one lockstep turn (the server sends a turn every TURN_TICKS / TICK_RATE s = 100 ms). */
export const TURN_TICKS = 3;
/** Every this many turns each machine sends a fingerprint of the game state; the server compares them. */
export const HASH_EVERY_TURNS = 10;

/** One turn from the server: the commands every player gave since the last one, in the order they arrived. */
export interface Turn {
  n: number;
  cmds: { f: FactionId; c: unknown }[];
}

/**
 * Multiplayer lockstep: no machine runs a command when it is given. Commands go to the server, which sends every
 * TURN_TICKS ticks a turn holding everyone's commands; every machine runs the same commands at the start of the same
 * turn, then the same TURN_TICKS ticks, so all of them keep the very same game.
 */
export class Lockstep {
  private readonly turns: Turn[] = [];
  private ticksLeft = 0;

  constructor(private readonly net: NetClient) {}

  /** Turns received and not yet played (a big backlog: this machine is behind and catches up). */
  get backlog(): number {
    return this.turns.length;
  }

  push(turn: Turn): void {
    this.turns.push(turn);
  }

  /** A command of this player, for the next turn. */
  send(cmd: unknown): void {
    this.net.send({ t: 'cmd', data: cmd });
  }

  /** State fingerprint at the start of turn `n` (the server warns when machines disagree). */
  hash(n: number, h: number): void {
    this.net.send({ t: 'hash', n, h });
  }

  /**
   * Before each simulation tick: false while the next turn has not arrived (the game waits). On the first tick of a
   * turn its commands are handed to `apply` first.
   */
  nextTick(apply: (turn: Turn) => void): boolean {
    if (this.ticksLeft === 0) {
      const turn = this.turns.shift();
      if (!turn) return false;
      apply(turn);
      this.ticksLeft = TURN_TICKS;
    }
    this.ticksLeft--;
    return true;
  }
}
