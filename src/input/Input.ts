import { Scope } from '../engine/Scope';

/**
 * Input with an explicit context stack. Only the top context receives actions,
 * which prevents conflicts (e.g. jumping while a menu is open, opening the
 * inventory during a cinematic). Bindings are data and can be rebound.
 */
export type InputContext = 'gameplay' | 'flight' | 'panel' | 'ui' | 'dialogue' | 'cinematic' | 'menu';

export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch'
  | 'interact' | 'cycleView' | 'scan' | 'primary' | 'secondary' | 'toolNext'
  | 'inventory' | 'journal' | 'map' | 'pause' | 'quicksave' | 'quickload'
  | 'up' | 'down' | 'rollLeft' | 'rollRight' | 'boost' | 'flightAssist' | 'exitSeat' | 'flashlight'
  | 'skip' | 'debug' | 'dock' | 'target';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  interact: ['KeyE'],
  cycleView: ['KeyV'],
  scan: ['KeyF'],
  primary: ['Mouse0'],
  secondary: ['Mouse2'],
  toolNext: ['KeyQ'],
  inventory: ['Tab', 'KeyI'],
  journal: ['KeyJ'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  quicksave: ['F6'],
  quickload: ['F9'],
  up: ['Space'],
  down: ['KeyC', 'ControlLeft'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  boost: ['ShiftLeft'],
  flightAssist: ['KeyZ'],
  exitSeat: ['KeyX'],
  flashlight: ['KeyL'],
  skip: ['Space', 'Enter'],
  dock: ['KeyG'],
  target: ['KeyT'],
  debug: ['Backquote'],
};

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private stack: InputContext[] = ['menu'];
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  mouseDX = 0;
  mouseDY = 0;
  /** Cursor position in normalized device coords (-1..1), valid when pointer is unlocked. */
  cursorX = 0;
  cursorY = 0;
  wheel = 0;
  sensitivity = 0.0022;
  invertY = false;
  /** Whether the current top context wants the pointer locked. */
  private wantsLock = false;
  private lastLockChange = 0;
  private motionAvg = 0;
  /** Set when we release the lock ourselves, so the async pointerlockchange isn't mistaken for Esc. */
  private expectUnlock = false;
  /** Time of the last lock/unlock/context operation we initiated (events can arrive out of order). */
  private lastLockOp = 0;
  /** Called when the pointer lock is lost unexpectedly (e.g. the player pressed Esc). */
  onUnexpectedUnlock: (() => void) | null = null;
  readonly scope = new Scope('input');

  constructor(private canvas: HTMLCanvasElement) {
    const s = this.scope;
    s.listen(window, 'keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Tab' || e.code === 'F6' || e.code === 'F9' || (e.code === 'Space' && e.target === document.body)) {
        e.preventDefault();
      }
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    s.listen(window, 'keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    s.listen(window, 'blur', () => this.down.clear());
    s.listen(window, 'mousedown', (e) => {
      const code = `Mouse${e.button}`;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    s.listen(window, 'mouseup', (e) => {
      const code = `Mouse${e.button}`;
      this.down.delete(code);
      this.released.add(code);
    });
    s.listen(window, 'mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        // Browsers occasionally deliver a single bogus, huge movement delta (notably right
        // after locking, or when the OS cursor warps). Those read as a sudden camera "flick":
        // drop the event just after a lock change, and any spike far above recent motion.
        const mag = Math.hypot(e.movementX, e.movementY);
        const sinceLock = performance.now() - this.lastLockChange;
        if (sinceLock < 120 || (mag > 150 && mag > this.motionAvg * 10 + 60)) return;
        this.motionAvg += (mag - this.motionAvg) * 0.1;
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else {
        const r = this.canvas.getBoundingClientRect();
        this.cursorX = ((e.clientX - r.left) / r.width) * 2 - 1;
        this.cursorY = -((e.clientY - r.top) / r.height) * 2 + 1;
      }
    });
    s.listen(window, 'wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    s.listen(window, 'contextmenu', (e) => e.preventDefault());
    s.listen(this.canvas, 'click', () => {
      if (this.wantsLock && document.pointerLockElement !== this.canvas) this.requestLock();
    });
    s.listen(document, 'pointerlockchange', () => {
      this.lastLockChange = performance.now();
      this.motionAvg = 0;
      if (document.pointerLockElement === this.canvas) return;
      if (this.expectUnlock) {
        this.expectUnlock = false;
        return;
      }
      // Lock/unlock requests settle asynchronously; only a loss during steady gameplay means Esc.
      if (performance.now() - this.lastLockOp < 900) return;
      if (this.wantsLock && (this.context === 'gameplay' || this.context === 'flight')) this.onUnexpectedUnlock?.();
    });
  }

  /* ------------------------------ context ------------------------------ */

  get context(): InputContext {
    return this.stack[this.stack.length - 1];
  }

  push(ctx: InputContext): void {
    this.stack.push(ctx);
    this.clearTransient();
    this.updateLock();
  }

  /** Pops the given context if it is on top (no-op otherwise, avoids double-pops). */
  pop(ctx: InputContext): void {
    const i = this.stack.lastIndexOf(ctx);
    if (i < 0 || this.stack.length === 1) return;
    this.stack.splice(i, 1);
    this.clearTransient();
    this.updateLock();
  }

  /** Replace the base (bottom) context, e.g. gameplay <-> flight. */
  setBase(ctx: InputContext): void {
    this.stack[0] = ctx;
    this.clearTransient();
    this.updateLock();
  }

  has(ctx: InputContext): boolean {
    return this.stack.includes(ctx);
  }

  private updateLock(): void {
    this.lastLockOp = performance.now();
    const ctx = this.context;
    // Panels use a free cursor to click physical controls; gameplay/flight capture the mouse.
    this.wantsLock = ctx === 'gameplay' || ctx === 'flight';
    if (this.wantsLock) this.requestLock();
    else this.releaseLock();
  }

  requestLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    this.lastLockOp = performance.now();
    try {
      // Raw (unaccelerated) mouse input where supported: steadier aim, fewer OS-induced jumps.
      const req = this.canvas.requestPointerLock as unknown as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
      let p: Promise<void> | undefined;
      try {
        p = req.call(this.canvas, { unadjustedMovement: true });
      } catch {
        p = undefined;
      }
      p?.catch?.(() => {
        // Not supported on this platform: fall back to a plain lock.
        try {
          (this.canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined);
        } catch {
          /* needs a user gesture */
        }
      });
    } catch {
      /* ignore: requires user gesture */
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /* ------------------------------- queries ------------------------------ */

  private matches(action: Action, set: Set<string>): boolean {
    for (const k of this.bindings[action]) if (set.has(k)) return true;
    return false;
  }

  /** Held, only in ctx. */
  held(action: Action, ctx: InputContext): boolean {
    return this.context === ctx && this.matches(action, this.down);
  }

  /** Pressed this frame, only in ctx. */
  justPressed(action: Action, ctx: InputContext | InputContext[]): boolean {
    const ok = Array.isArray(ctx) ? ctx.includes(this.context) : this.context === ctx;
    return ok && this.matches(action, this.pressed);
  }

  justReleased(action: Action, ctx: InputContext): boolean {
    return this.context === ctx && this.matches(action, this.released);
  }

  /** Raw key query regardless of context (debug only). */
  rawPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  axis(neg: Action, pos: Action, ctx: InputContext): number {
    return (this.held(pos, ctx) ? 1 : 0) - (this.held(neg, ctx) ? 1 : 0);
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY * (this.invertY ? -1 : 1) };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  /** Called at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.wheel = 0;
  }

  private clearTransient(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  /** Test hook: simulate key state. */
  simulate(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
      this.released.add(code);
    }
  }

  dispose(): void {
    this.scope.dispose();
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
