import { CAMERA_EDGE_MARGIN } from '../constants';
import type { Rect } from '../types';

export type InputEvent =
  | { type: 'click'; button: 'left' | 'right'; x: number; y: number; shift: boolean }
  | { type: 'boxSelect'; rect: Rect; shift: boolean }
  | { type: 'wheel'; deltaY: number; x: number; y: number }
  | { type: 'keyDown'; code: string };

const DRAG_THRESHOLD = 5;
/** When the cursor exits the window this close to an edge, keep scrolling that way. */
const EXIT_EDGE_MARGIN = 64;
const PREVENT_DEFAULT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});

/**
 * Collects raw DOM input and exposes it as polled state + a queue of discrete
 * events, so game logic consumes input at a well-defined point in the frame.
 * Pointer coordinates are CSS pixels relative to the target element.
 *
 * Edge scrolling is tracked against the *window* edges and keeps going after
 * the cursor leaves the browser window, until it comes back.
 */
export class InputHandler {
  /** `inside` = over the game canvas (not over UI panels). */
  readonly mouse = { x: 0, y: 0, inside: false };
  /** Edge-scroll direction (-1, 0, 1) per axis. */
  readonly edge = { x: 0, y: 0 };

  private readonly keys = new Set<string>();
  private queue: InputEvent[] = [];
  private pan = { x: 0, y: 0 };
  private middleDown = false;
  private leftDown = false;
  /** Where the right button went down; dragging from here sweeps a selection box. */
  private rightStart: { x: number; y: number } | null = null;
  private dragging = false;
  private readonly abort = new AbortController();

  constructor(private readonly target: HTMLElement) {
    const opts: AddEventListenerOptions = { signal: this.abort.signal };
    target.addEventListener('pointerdown', this.onPointerDown, opts);
    window.addEventListener('pointermove', this.onPointerMove, opts);
    window.addEventListener('pointerup', this.onPointerUp, opts);
    target.addEventListener('pointerenter', () => (this.mouse.inside = true), opts);
    target.addEventListener('pointerleave', () => (this.mouse.inside = false), opts);
    target.addEventListener('wheel', this.onWheel, { signal: this.abort.signal, passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    document.documentElement.addEventListener('mouseleave', this.onLeaveWindow, opts);
    window.addEventListener('keydown', this.onKeyDown, opts);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), opts);
    window.addEventListener('blur', this.onBlur, opts);
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Screen-space rectangle of an in-progress right-drag, or null. */
  get selectionRect(): Rect | null {
    return this.dragging && this.rightStart ? normalizeRect(this.rightStart, this.mouse) : null;
  }

  /** Returns and resets the accumulated middle-mouse drag delta (screen px). */
  consumePan(): { x: number; y: number } {
    const p = this.pan;
    this.pan = { x: 0, y: 0 };
    return p;
  }

  /** Returns all queued events since the last call. */
  drain(): InputEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  dispose(): void {
    this.abort.abort();
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.target.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private setEdgeFrom(clientX: number, clientY: number, margin: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.edge.x = clientX < margin ? -1 : clientX > w - margin ? 1 : 0;
    this.edge.y = clientY < margin ? -1 : clientY > h - margin ? 1 : 0;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const p = this.local(e);
    if (e.button === 0) {
      this.leftDown = true;
    } else if (e.button === 1) {
      this.middleDown = true;
      e.preventDefault();
    } else if (e.button === 2) {
      this.rightStart = p;
      this.dragging = false;
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.local(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    this.setEdgeFrom(e.clientX, e.clientY, CAMERA_EDGE_MARGIN);
    if (this.middleDown) {
      this.pan.x += e.movementX;
      this.pan.y += e.movementY;
    }
    if (this.rightStart && !this.dragging) {
      this.dragging = Math.hypot(p.x - this.rightStart.x, p.y - this.rightStart.y) > DRAG_THRESHOLD;
    }
  };

  /** Cursor left the browser window: keep scrolling toward the exit edge. */
  private readonly onLeaveWindow = (e: MouseEvent): void => {
    this.mouse.inside = false;
    this.setEdgeFrom(e.clientX, e.clientY, EXIT_EDGE_MARGIN);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0 && this.leftDown) {
      // Left button: always a click (select one / give an order); it never sweeps a box.
      this.leftDown = false;
      this.queue.push({ type: 'click', button: 'left', ...this.local(e), shift: e.shiftKey });
    } else if (e.button === 2 && this.rightStart) {
      // Right button: drag sweeps a selection box, a plain click deselects / cancels placing.
      const p = this.local(e);
      if (this.dragging) {
        this.queue.push({ type: 'boxSelect', rect: normalizeRect(this.rightStart, p), shift: e.shiftKey });
      } else {
        this.queue.push({ type: 'click', button: 'right', ...p, shift: e.shiftKey });
      }
      this.rightStart = null;
      this.dragging = false;
    } else if (e.button === 1) {
      this.middleDown = false;
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.queue.push({ type: 'wheel', deltaY: e.deltaY, ...this.local(e) });
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) this.queue.push({ type: 'keyDown', code: e.code });
    this.keys.add(e.code);
  };

  /** Window lost focus (alt-tab, click elsewhere): stop everything. */
  private readonly onBlur = (): void => {
    this.keys.clear();
    this.edge.x = 0;
    this.edge.y = 0;
    this.middleDown = false;
    this.leftDown = false;
    this.rightStart = null;
    this.dragging = false;
  };
}
