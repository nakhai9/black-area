/**
 * F9 timing overlay: how long each simulation step takes (ms per tick, averaged over the last second), slowest
 * first, plus the entity count. Off by default; when off, time() just runs the step.
 */
export class Profiler {
  private on = false;
  private readonly sums = new Map<string, number>();
  private ticks = 0;
  private frames = 0;
  private draw = 0;
  private windowStart = performance.now();
  private readonly el: HTMLPreElement;

  constructor() {
    this.el = document.createElement('pre');
    this.el.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:90;margin:0;padding:8px 10px;background:rgba(0,0,0,.8);color:#9fe;font:11px/1.35 monospace;pointer-events:none;white-space:pre;display:none';
    document.body.append(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F9' || e.repeat) return;
      e.preventDefault();
      this.on = !this.on;
      this.el.style.display = this.on ? 'block' : 'none';
      this.sums.clear();
      this.ticks = 0;
      this.windowStart = performance.now();
    });
  }

  time<T>(name: string, fn: () => T): T {
    if (!this.on) return fn();
    const t0 = performance.now();
    const r = fn();
    this.sums.set(name, (this.sums.get(name) ?? 0) + performance.now() - t0);
    return r;
  }

  /** Called once per drawn frame. */
  frame(): void {
    if (this.on) this.frames++;
  }

  /** Times the drawing of one frame. */
  drawTime<T>(fn: () => T): T {
    if (!this.on) return fn();
    const t0 = performance.now();
    const r = fn();
    this.draw += performance.now() - t0;
    return r;
  }

  /** Called once per simulation tick with the number of units on the field. */
  tick(units: number): void {
    if (!this.on) return;
    this.ticks++;
    const now = performance.now();
    if (now - this.windowStart < 1000 || this.ticks === 0) return;
    const rows = [...this.sums].sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((t, [, v]) => t + v, 0);
    this.el.textContent =
      `units ${units} · ticks/s ${this.ticks} · sim ${(total / this.ticks).toFixed(2)} ms/tick\n` +
      rows.slice(0, 18).map(([k, v]) => `${(v / this.ticks).toFixed(2).padStart(7)}  ${k}`).join('\n');
    this.sums.clear();
    this.ticks = 0;
    this.frames = 0;
    this.draw = 0;
    this.windowStart = now;
  }
}
