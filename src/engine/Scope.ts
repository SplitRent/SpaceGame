/**
 * A Scope owns disposable resources (event subscriptions, GPU objects, DOM listeners,
 * timers, child scopes). Disposing a scope releases everything it owns exactly once.
 * Every location, UI panel and transient system gets its own scope so nothing leaks
 * across transitions.
 */
export type Disposer = () => void;

export interface DisposableLike {
  dispose(): void;
}

export class Scope {
  private disposers: Disposer[] = [];
  private children = new Set<Scope>();
  private _disposed = false;
  readonly name: string;

  constructor(name = 'scope', private parent?: Scope) {
    this.name = name;
    parent?.children.add(this);
  }

  get disposed(): boolean {
    return this._disposed;
  }

  /** Create a child scope that is disposed with this scope. */
  child(name: string): Scope {
    this.assertAlive();
    return new Scope(`${this.name}/${name}`, this);
  }

  add(fn: Disposer): Disposer {
    this.assertAlive();
    this.disposers.push(fn);
    return fn;
  }

  /** Track an object with a dispose() method (three.js geometry/material/texture, etc.). */
  own<T extends DisposableLike>(obj: T): T {
    this.add(() => obj.dispose());
    return obj;
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (ev: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    fn: (ev: DocumentEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  listen(target: EventTarget, type: string, fn: (ev: any) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: (ev: any) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.add(() => target.removeEventListener(type, fn, opts));
  }

  timeout(fn: () => void, ms: number): void {
    const id = setTimeout(fn, ms);
    this.add(() => clearTimeout(id));
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const c of [...this.children]) c.dispose();
    this.children.clear();
    // Dispose in reverse order of registration (LIFO), like stack unwinding.
    for (let i = this.disposers.length - 1; i >= 0; i--) {
      try {
        this.disposers[i]();
      } catch (err) {
        console.error(`[Scope ${this.name}] disposer failed`, err);
      }
    }
    this.disposers.length = 0;
    this.parent?.children.delete(this);
  }

  private assertAlive(): void {
    if (this._disposed) throw new Error(`Scope "${this.name}" already disposed`);
  }
}
