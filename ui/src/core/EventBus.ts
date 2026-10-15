type Listener<T> = (payload: T) => void;

/** Minimal strongly-typed publish/subscribe bus. */
export class EventBus<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Subscribes to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    const set = this.listeners.get(type) ?? new Set<Listener<never>>();
    this.listeners.set(type, set);
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.listeners.get(type)?.forEach((listener) => (listener as Listener<Events[K]>)(payload));
  }
}
