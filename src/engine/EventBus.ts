import type { Scope } from './Scope';

/**
 * Strongly typed synchronous event bus. Subscriptions must be bound to a Scope,
 * which guarantees they are removed when the owning system/location is disposed.
 */
export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(payload: any) => void>>();

  on<K extends keyof Events>(scope: Scope, type: K, fn: (payload: Events[K]) => void): void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    scope.add(() => set!.delete(fn));
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${String(type)}" failed`, err);
      }
    }
  }

  listenerCount(type?: keyof Events): number {
    if (type) return this.handlers.get(type)?.size ?? 0;
    let n = 0;
    for (const s of this.handlers.values()) n += s.size;
    return n;
  }
}
