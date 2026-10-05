import { TICK_RATE } from '../constants';

const MAX_FRAME_DT = 0.25;
const MAX_TICKS_PER_FRAME = 5;

/**
 * Fixed-timestep simulation with variable-rate rendering.
 * `tick` runs at TICK_RATE Hz (deterministic game logic);
 * `frame` runs once per animation frame (camera, input, drawing).
 */
export class GameLoop {
  private last = 0;
  private accumulator = 0;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly tick: (dt: number) => void,
    private readonly frame: (dt: number) => void,
    private readonly step = 1 / TICK_RATE,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    // rAF timestamps can predate start() after a long blocking task → clamp at 0.
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    this.accumulator += dt;
    let ticks = 0;
    while (this.accumulator >= this.step && ticks < MAX_TICKS_PER_FRAME) {
      this.tick(this.step);
      this.accumulator -= this.step;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.accumulator = 0; // drop backlog instead of spiralling

    this.frame(dt);
    this.rafId = requestAnimationFrame(this.loop);
  };
}
