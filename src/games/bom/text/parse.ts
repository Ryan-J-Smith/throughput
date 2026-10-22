import type { RndChoice } from '../model';

/** A part reference as typed: a 1-based hand position or a 1-based Bench slot (`b1`). */
export type PartRef = { readonly zone: 'hand' | 'bench'; readonly position: number };

export type BomCommand =
  | { readonly kind: 'ship'; readonly product: string | null; readonly parts: readonly PartRef[] }
  | { readonly kind: 'preview'; readonly parts: readonly PartRef[] }
  | { readonly kind: 'fab'; readonly parts: readonly PartRef[]; readonly trash: PartRef | null }
  | { readonly kind: 'scrap'; readonly parts: readonly PartRef[] }
  | { readonly kind: 'collect' }
  | { readonly kind: 'continue' }
  | { readonly kind: 'buy'; readonly slot: number; readonly blueprint: string | null; readonly choice: RndChoice | null }
  | { readonly kind: 'sell'; readonly id: string }
  | { readonly kind: 'shred'; readonly category: string; readonly grade: number }
  | { readonly kind: 'reroll' };

export type BomParse = { readonly ok: true; readonly command: BomCommand } | { readonly ok: false; readonly reason: string };

export const ACTION_SUMMARY =
  'ship [product] <parts…> | preview <parts…> | fab <parts…> [trash bN] | scrap <positions…> | collect | ' +
  'buy <slot> [blueprint scale|premium] | sell <id> | shred <category> <grade> | reroll | continue';

const PART_TOKEN = /^(b?)(\d+)$/;

function partRef(token: string): PartRef | null {
  const m = PART_TOKEN.exec(token);
  if (m === null) return null;
  const position = Number(m[2]);
  if (position < 1) return null;
  return { zone: m[1] === 'b' ? 'bench' : 'hand', position };
}

function partRefs(tokens: readonly string[]): PartRef[] | string {
  const refs: PartRef[] = [];
  for (const token of tokens) {
    const ref = partRef(token);
    if (ref === null) return `"${token}" is not a part (use hand positions like 3, or Bench slots like b1)`;
    if (refs.some((r) => r.zone === ref.zone && r.position === ref.position)) return `"${token}" is listed twice`;
    refs.push(ref);
  }
  return refs.length > 0 ? refs : 'Select at least one part';
}

/** Parses one BoM command; product and blueprint names are resolved later against owned ones. */
export function parseBomAction(text: string): BomParse {
  const [verb, ...args] = text.trim().toLowerCase().split(/\s+/);
  const fail = (reason: string): BomParse => ({ ok: false, reason });
  switch (verb) {
    case 'ship': {
      const hasProduct = args[0] !== undefined && partRef(args[0]) === null;
      const parts = partRefs(hasProduct ? args.slice(1) : args);
      if (typeof parts === 'string') return fail(parts);
      return { ok: true, command: { kind: 'ship', product: hasProduct ? (args[0] as string) : null, parts } };
    }
    case 'preview': {
      const parts = partRefs(args);
      return typeof parts === 'string' ? fail(parts) : { ok: true, command: { kind: 'preview', parts } };
    }
    case 'fab':
    case 'fabricate': {
      const t = args.indexOf('trash');
      const parts = partRefs(t >= 0 ? args.slice(0, t) : args);
      if (typeof parts === 'string') return fail(parts);
      if (t < 0) return { ok: true, command: { kind: 'fab', parts, trash: null } };
      const trash = args.length === t + 2 ? partRef(args[t + 1] as string) : null;
      if (trash === null || trash.zone !== 'bench') return fail('trash needs one Bench slot, e.g. "trash b2"');
      return { ok: true, command: { kind: 'fab', parts, trash } };
    }
    case 'scrap': {
      const parts = partRefs(args);
      if (typeof parts === 'string') return fail(parts);
      if (parts.some((p) => p.zone === 'bench')) return fail('Only hand parts can be scrapped');
      return { ok: true, command: { kind: 'scrap', parts } };
    }
    case 'collect':
    case 'reroll':
    case 'continue':
      if (args.length > 0) return fail(`${verb} takes no arguments`);
      return { ok: true, command: { kind: verb } };
    case 'buy': {
      const slot = Number(args[0]);
      if (!Number.isInteger(slot) || slot < 1) return fail('buy needs a slot number, e.g. "buy 2"');
      const choice = args[2] ?? null;
      if (choice !== null && choice !== 'scale' && choice !== 'premium') return fail('R&D choice must be scale or premium');
      if (args.length > 3) return fail('Too many arguments for buy');
      return { ok: true, command: { kind: 'buy', slot, blueprint: args[1] ?? null, choice } };
    }
    case 'sell':
      if (args.length !== 1) return fail('sell needs one facility or blueprint id, e.g. "sell gizmo"');
      return { ok: true, command: { kind: 'sell', id: args[0] as string } };
    case 'shred': {
      const grade = Number(args[1]);
      if (args.length !== 2 || !Number.isInteger(grade)) return fail('shred needs a category and grade, e.g. "shred paint 1"');
      return { ok: true, command: { kind: 'shred', category: args[0] as string, grade } };
    }
    default:
      return fail(`Unknown action "${verb ?? ''}"; expected: ${ACTION_SUMMARY}`);
  }
}

export function formatPartRef(ref: PartRef): string {
  return ref.zone === 'bench' ? `b${ref.position}` : String(ref.position);
}

/** Normalizes a name or id for matching: "Desk Fan", "desk-fan" and "deskfan" are equal. */
export function nameKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}
