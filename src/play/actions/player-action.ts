/** A player command as typed at the CLI. Positions and slots are 1-based, as displayed. */
export type PlayerAction =
  | { readonly kind: 'play'; readonly positions: readonly number[] }
  | { readonly kind: 'discard'; readonly positions: readonly number[] }
  | { readonly kind: 'buy'; readonly slot: number }
  | { readonly kind: 'sell'; readonly position: number }
  | { readonly kind: 'reroll' }
  | { readonly kind: 'continue' };

export type ParseResult = { readonly ok: true; readonly action: PlayerAction } | { readonly ok: false; readonly reason: string };

const USAGE = 'expected: play <positions…> | discard <positions…> | buy <slot> | sell <position> | reroll | continue';

/** Parses e.g. "play 1 3 4", "buy 2", "continue". Case-insensitive; extra whitespace ignored. */
export function parseAction(text: string): ParseResult {
  const [verb, ...rest] = text.trim().toLowerCase().split(/\s+/);
  const numbers = rest.map(Number);
  if (numbers.some((n) => !Number.isInteger(n) || n < 1)) {
    return { ok: false, reason: `Positions must be whole numbers starting at 1 (got "${rest.join(' ')}")` };
  }
  switch (verb) {
    case 'play':
    case 'discard':
      if (numbers.length === 0) return { ok: false, reason: `${verb} needs at least one hand position` };
      if (new Set(numbers).size !== numbers.length) return { ok: false, reason: 'Each hand position may be listed once' };
      return { ok: true, action: { kind: verb, positions: numbers } };
    case 'buy':
    case 'sell': {
      const [n] = numbers;
      if (n === undefined || numbers.length !== 1) return { ok: false, reason: `${verb} needs exactly one number` };
      return { ok: true, action: verb === 'buy' ? { kind: 'buy', slot: n } : { kind: 'sell', position: n } };
    }
    case 'reroll':
    case 'continue':
      if (numbers.length > 0) return { ok: false, reason: `${verb} takes no arguments` };
      return { ok: true, action: { kind: verb } };
    default:
      return { ok: false, reason: `Unknown action "${verb ?? ''}"; ${USAGE}` };
  }
}

/** Canonical text for an action; parseAction(formatAction(a)) round-trips. */
export function formatAction(action: PlayerAction): string {
  switch (action.kind) {
    case 'play':
    case 'discard':
      return `${action.kind} ${action.positions.join(' ')}`;
    case 'buy':
      return `buy ${action.slot}`;
    case 'sell':
      return `sell ${action.position}`;
    case 'reroll':
    case 'continue':
      return action.kind;
  }
}
