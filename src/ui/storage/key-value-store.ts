/**
 * Small string storage for UI state that should outlive a page load (autosaves, settings,
 * dismissed hints). Implementations must never throw: storage is a convenience, and a page with
 * storage blocked still plays.
 */
export abstract class KeyValueStore {
  /** The stored value, or null if there is none or storage is unavailable. */
  abstract get(key: string): string | null;
  /** Stores `value`; silently does nothing if storage is unavailable or full. */
  abstract set(key: string, value: string): void;
  abstract remove(key: string): void;
}

/** The browser's localStorage, with every access guarded (private windows and blocked site data throw). */
export class BrowserStore extends KeyValueStore {
  private readonly prefix: string;

  constructor(prefix = 'shelf-life.') {
    super();
    this.prefix = prefix;
  }

  override get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(this.prefix + key) ?? null;
    } catch {
      return null;
    }
  }

  override set(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(this.prefix + key, value);
    } catch {
      // Storage is full or blocked; the game still plays without it.
    }
  }

  override remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(this.prefix + key);
    } catch {
      // As above.
    }
  }
}

/** In-memory storage for tests and for pages that shouldn't persist anything. */
export class MemoryStore extends KeyValueStore {
  private readonly values = new Map<string, string>();

  override get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  override set(key: string, value: string): void {
    this.values.set(key, value);
  }

  override remove(key: string): void {
    this.values.delete(key);
  }
}
