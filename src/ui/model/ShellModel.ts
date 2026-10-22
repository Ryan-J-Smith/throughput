import type { ShellActions, ShellView, ToastView } from '../types';

/**
 * What the shell needs from whatever owns game state: views, toasts, action callbacks and
 * change notifications. `getView` and `getToasts` must return the same object until the next
 * `notify()` so React's useSyncExternalStore can skip re-renders.
 */
export abstract class ShellModel {
  private readonly listeners = new Set<() => void>();

  abstract readonly actions: ShellActions;

  abstract getView(): ShellView;

  abstract getToasts(): readonly ToastView[];

  /** Registers a change listener and returns its unsubscribe. Bound, so it can be passed around. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
