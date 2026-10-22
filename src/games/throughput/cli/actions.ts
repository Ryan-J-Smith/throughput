import type { Placement } from '../rules';

/** A parsed text command. Numbers are 0-based here; the text uses 1-based. */
export type ThroughputAction =
  | { readonly verb: 'load'; readonly placements: readonly Placement[] }
  | { readonly verb: 'unload' | 'scrap'; readonly slots: readonly number[] }
  | { readonly verb: 'retool'; readonly hand: readonly number[] }
  | { readonly verb: 'buy'; readonly offer: number; readonly target: number | null }
  | { readonly verb: 'sell'; readonly what: 'fixture' | 'card'; readonly index: number }
  | { readonly verb: 'move'; readonly from: number; readonly to: number }
  | { readonly verb: 'run' | 'reroll' | 'continue' | 'rules' | 'deck' };

export type ParsedAction = { readonly ok: true; readonly action: ThroughputAction } | { readonly ok: false; readonly reason: string };

const BARE = ['run', 'reroll', 'continue', 'rules', 'deck'] as const;

export function parseAction(text: string): ParsedAction {
  const [verb = '', ...args] = text.trim().toLowerCase().split(/\s+/);
  const fail = (reason: string): ParsedAction => ({ ok: false, reason });
  const bare = BARE.find((b) => b === verb);
  if (bare !== undefined) return args.length === 0 ? { ok: true, action: { verb: bare } } : fail(`"${verb}" takes no arguments`);

  switch (verb) {
    case 'load': {
      if (args.length === 0) return fail('load needs <hand>:<slot> pairs, e.g. "load 3:1 5:4"');
      const placements: Placement[] = [];
      for (const arg of args) {
        const match = /^(\d+):(\d+)$/.exec(arg);
        const hand = number(match?.[1]);
        const slot = number(match?.[2]);
        if (hand === null || slot === null) return fail(`"${arg}" is not <hand>:<slot> (e.g. 3:1)`);
        placements.push({ hand, slot });
      }
      return { ok: true, action: { verb: 'load', placements } };
    }
    case 'unload':
    case 'scrap': {
      const slots = numbers(args);
      return slots === null ? fail(`${verb} needs slot numbers, e.g. "${verb} 2"`) : { ok: true, action: { verb, slots } };
    }
    case 'retool': {
      const hand = numbers(args);
      return hand === null ? fail('retool needs hand card numbers, e.g. "retool 2 6"') : { ok: true, action: { verb, hand } };
    }
    case 'buy': {
      const [offer, target, ...rest] = args.map(number);
      if (offer == null || rest.length > 0 || target === null) return fail('buy needs an offer number and maybe a slot or deck card, e.g. "buy 1 3"');
      return { ok: true, action: { verb, offer, target: target ?? null } };
    }
    case 'sell': {
      const [what, raw, ...rest] = args;
      const index = number(raw);
      if ((what !== 'fixture' && what !== 'card') || index === null || rest.length > 0) {
        return fail('sell needs "fixture <slot>" or "card <deck card>"');
      }
      return { ok: true, action: { verb, what, index } };
    }
    case 'move': {
      const [from, to, ...rest] = args.map(number);
      if (from == null || to == null || rest.length > 0) return fail('move needs two slot numbers, e.g. "move 1 4"');
      return { ok: true, action: { verb, from, to } };
    }
    default:
      return fail(`unknown command "${verb}"; try "rules"`);
  }
}

/** Canonical 1-based text for the save file. */
export function formatAction(action: ThroughputAction): string {
  const one = (n: number) => String(n + 1);
  switch (action.verb) {
    case 'load':
      return `load ${action.placements.map((p) => `${one(p.hand)}:${one(p.slot)}`).join(' ')}`;
    case 'unload':
    case 'scrap':
      return `${action.verb} ${action.slots.map(one).join(' ')}`;
    case 'retool':
      return `retool ${action.hand.map(one).join(' ')}`;
    case 'buy':
      return `buy ${one(action.offer)}${action.target === null ? '' : ` ${one(action.target)}`}`;
    case 'sell':
      return `sell ${action.what} ${one(action.index)}`;
    case 'move':
      return `move ${one(action.from)} ${one(action.to)}`;
    default:
      return action.verb;
  }
}

/** A 1-based positive integer as 0-based, or null. */
function number(text: string | undefined): number | null {
  if (text === undefined || !/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 ? n - 1 : null;
}

function numbers(args: readonly string[]): number[] | null {
  if (args.length === 0) return null;
  const out = args.map(number);
  return out.every((n): n is number => n !== null) ? out : null;
}
