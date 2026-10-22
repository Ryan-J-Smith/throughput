import type { PayoutLine } from '../../../engine/economy';
import { PAINT, partLabel } from '../model';
import type { OwnedBlueprint, Part } from '../model';
import { findRecipeParts, recipeText } from '../rules';
import type { BomOffer, BomRun } from '../rules';

/** JSON-safe snapshot of a BoM run for the CLI (`--json` prints it as `state`). */
export type BomView = {
  readonly game: string;
  readonly seed: number;
  readonly actionsTaken: number;
  readonly phase: string;
  readonly round: {
    readonly number: number;
    readonly of: number;
    readonly quarter: number;
    readonly market: string;
    readonly target: number;
    readonly revenue: number;
    readonly disruption: { readonly name: string; readonly text: string } | null;
  };
  readonly builds: number;
  readonly scraps: number;
  readonly cash: number;
  readonly hand: readonly PartView[];
  readonly bench: { readonly slots: number; readonly parts: readonly PartView[] };
  readonly products: readonly ProductView[];
  readonly subs: readonly { readonly id: string; readonly name: string; readonly recipe: string; readonly output: string; readonly rndLevels: number }[];
  readonly facilities: readonly { readonly id: string; readonly name: string; readonly text: string; readonly sellValue: number }[];
  readonly facilitySlots: number;
  readonly blueprintSlots: number;
  /** Revealed disruptions by quarter. */
  readonly disruptions: readonly { readonly quarter: number; readonly name: string; readonly text: string }[];
  readonly shop: ShopView | null;
  /** The round after this one (while in the shop). */
  readonly next: { readonly quarter: number; readonly market: string; readonly target: number; readonly disruption: string | null } | null;
  readonly lastPayout: readonly PayoutLine[] | null;
  readonly legalActions: readonly string[];
};

export type PartView = {
  readonly ref: string;
  readonly label: string;
  readonly category: string;
  readonly grade: number;
  readonly premium: boolean;
};

export type ProductView = {
  readonly id: string;
  readonly name: string;
  readonly recipe: string;
  readonly units: number;
  readonly price: number;
  /** Base Demand (R&D and sell-out growth included). */
  readonly demand: number;
  /** Demand the next Ship of it would get this round, before facilities. */
  readonly nextDemand: number;
  readonly shipsThisRound: number;
  readonly growth: number;
  readonly scale: number;
  readonly premium: number;
  readonly sellValue: number;
};

export type ShopView = {
  readonly offers: readonly { readonly slot: number; readonly kind: string; readonly text: string; readonly cost: number; readonly problem: string | null }[];
  readonly rerollCost: number;
  readonly shredCost: number;
  readonly shredUsed: boolean;
  /** Deck contents for Shred: "Chip 1" → count. */
  readonly deck: Readonly<Record<string, number>>;
};

const CATEGORY_ORDER = ['shell', 'chip', 'bolt', 'paint'];

/**
 * The hand in display order: by category (Shell, Chip, Bolt, Paint, then others), grade high to
 * low, Premium first. Hand positions typed at the CLI refer to this order.
 */
export function sortedHand(run: BomRun): Part[] {
  const rank = (p: Part): number => {
    const i = CATEGORY_ORDER.indexOf(p.category);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  return [...run.hand].sort((a, b) => rank(a) - rank(b) || b.grade - a.grade || Number(b.premium) - Number(a.premium));
}

export function buildBomView(run: BomRun, context: { game: string; seed: number; actionsTaken: number }): BomView {
  const round = run.round;
  const disruption = round.disruption;
  const inShop = run.phase === 'shop';
  const next = run.nextRound;
  return {
    ...context,
    phase: run.phase,
    round: {
      number: round.index + 1,
      of: run.totalRounds,
      quarter: round.quarter,
      market: round.market,
      target: round.target,
      revenue: run.revenue,
      disruption: disruption === null ? null : { name: disruption.name, text: disruption.text },
    },
    builds: run.buildsLeft,
    scraps: run.scrapsLeft,
    cash: run.wallet.cash,
    hand: sortedHand(run).map((p, i) => partView(p, String(i + 1))),
    bench: { slots: run.mods.benchSlots, parts: run.bench.map((p, i) => partView(p, `b${i + 1}`)) },
    products: run.blueprints.filter((b) => b.def.kind === 'product').map((b) => productView(run, b)),
    subs: run.blueprints.flatMap((b) =>
      b.def.kind === 'sub' ? [{ id: b.id, name: b.def.name, recipe: recipeText(b.def.recipe), output: b.def.output, rndLevels: b.subLevels }] : [],
    ),
    facilities: run.facilities.map((f) => ({ id: f.id, name: f.name, text: f.text, sellValue: run.sellValue(f.cost) })),
    facilitySlots: run.config.shop.maxFacilities,
    blueprintSlots: run.config.shop.maxBlueprints,
    disruptions: run.config.targets.flatMap((_, q) => {
      const d = run.revealedDisruption(q + 1);
      return d === null ? [] : [{ quarter: q + 1, name: d.name, text: d.text }];
    }),
    shop: inShop ? shopView(run) : null,
    next:
      inShop && next !== null
        ? { quarter: next.quarter, market: next.market, target: next.target, disruption: next.market === 'boss' ? (run.revealedDisruption(next.quarter)?.name ?? null) : null }
        : null,
    lastPayout: inShop || run.phase === 'won' ? (run.lastRoundEnd?.payout?.lines ?? null) : null,
    legalActions: legalActions(run),
  };
}

function partView(part: Part, ref: string): PartView {
  return { ref, label: partLabel(part), category: part.category, grade: part.grade, premium: part.premium };
}

function productView(run: BomRun, b: OwnedBlueprint): ProductView {
  // Ship counts only matter inside a round; they reset when the next one starts.
  const inRound = run.phase === 'round' || run.phase === 'overtime';
  const shipsThisRound = inRound ? b.shipsThisRound : 0;
  const halves = run.mods.demandHalves ? shipsThisRound : 0;
  return {
    id: b.id,
    name: b.def.name,
    recipe: recipeText(b.def.recipe),
    units: b.units,
    price: b.price,
    demand: b.demand,
    nextDemand: Math.floor(b.demand / 2 ** halves),
    shipsThisRound,
    growth: b.growth,
    scale: b.scaleLevels,
    premium: b.premiumLevels,
    sellValue: run.sellValue(b.def.cost),
  };
}

function offerText(offer: BomOffer): string {
  switch (offer.kind) {
    case 'facility':
      return `[Facility · ${offer.facility.rarity}] ${offer.facility.name}: ${offer.facility.text}`;
    case 'blueprint': {
      const b = offer.blueprint;
      const stats = b.kind === 'product' ? `${b.units} Units · $${b.price} · Demand ${b.demand}` : `makes ${b.output}`;
      return `[Blueprint · ${b.rarity}] ${b.name} (${b.kind}: ${recipeText(b.recipe)} · ${stats})`;
    }
    case 'rnd':
      return '[R&D Grant] +1 level on an owned blueprint (Product: scale or premium; Sub: +3 grade)';
    case 'part':
      return `[Part] ${partLabel(offer.part)} (joins your deck)`;
  }
}

function shopView(run: BomRun): ShopView {
  const deck: Record<string, number> = {};
  for (const p of run.deck.allCards) {
    const key = `${partLabel({ ...p, premium: false })}`;
    deck[key] = (deck[key] ?? 0) + 1;
  }
  return {
    offers: run.shop.offers.flatMap((offer, i) =>
      offer === null
        ? []
        : [{ slot: i + 1, kind: offer.kind, text: offerText(offer), cost: offer.cost, problem: run.offerProblem(i) }],
    ),
    rerollCost: run.shop.rerollCost,
    shredCost: run.config.shop.shredCost,
    shredUsed: run.shop.shredUsed,
    deck,
  };
}

/** Hand positions and Bench refs for some parts, in display form. */
export function refsFor(run: BomRun, parts: readonly Part[]): string {
  const hand = sortedHand(run);
  return parts.map((p) => (run.bench.includes(p) ? `b${run.bench.indexOf(p) + 1}` : String(hand.indexOf(p) + 1))).join(' ');
}

export function legalActions(run: BomRun): string[] {
  const out: string[] = [];
  const available = [...sortedHand(run), ...run.bench];
  const inRound = run.phase === 'round' || run.phase === 'overtime';
  if (run.phase === 'round' && run.buildsLeft > 0) {
    for (const b of run.blueprints) {
      if (b.def.kind !== 'product') continue;
      const parts = findRecipeParts(b.def.recipe, available);
      if (parts !== null) out.push(`ship ${b.id} <parts…> — ${b.def.name} needs ${recipeText(b.def.recipe)}; extra parts are filler (e.g. ship ${b.id} ${refsFor(run, parts)})`);
    }
    out.push('preview <parts…> — projected revenue for every Product those parts fit (free, not recorded)');
  }
  if (inRound && run.buildsLeft > 0) {
    for (const b of run.blueprints) {
      if (b.def.kind !== 'sub') continue;
      const parts = findRecipeParts(b.def.recipe, available);
      if (parts === null) continue;
      const full = run.bench.filter((p) => !parts.includes(p)).length >= run.mods.benchSlots;
      out.push(`fab <parts…>${full ? ' trash bN' : ''} — ${b.def.name} = ${recipeText(b.def.recipe)} → Bench, grade 2×inputs (e.g. fab ${refsFor(run, parts)}${full ? ' trash b1' : ''})`);
    }
  }
  if (inRound && run.scrapsLeft > 0) out.push(`scrap <hand positions…> — discard 1–5 and redraw (${run.scrapsLeft} left)`);
  if (run.phase === 'overtime') out.push(`collect — end the round: +$${run.buildsLeft} for ${run.buildsLeft} unused Build(s), then the shop`);
  if (run.phase === 'shop') {
    run.shop.offers.forEach((offer, i) => {
      if (offer === null) return;
      if (run.offerProblem(i) !== null) return;
      if (offer.kind === 'rnd') {
        out.push(`buy ${i + 1} <blueprint> [scale|premium] — R&D Grant for $${offer.cost}`);
      } else {
        const name = offer.kind === 'facility' ? offer.facility.name : offer.kind === 'blueprint' ? offer.blueprint.name : partLabel(offer.part);
        out.push(`buy ${i + 1} — ${name} for $${offer.cost}`);
      }
    });
    if (run.whyCannotReroll() === null) out.push(`reroll — new Rack and Parts Counter for $${run.shop.rerollCost}`);
    if (!run.shop.shredUsed && run.wallet.canAfford(run.config.shop.shredCost)) {
      out.push(`shred <category> <grade> — destroy one deck part for $${run.config.shop.shredCost} (e.g. shred ${PAINT} 1)`);
    }
    const sellable = [
      ...run.facilities.filter((f) => run.whyCannotSell(f.id) === null).map((f) => `${f.id} $${run.sellValue(f.cost)}`),
      ...run.blueprints.filter((b) => run.whyCannotSell(b.id) === null).map((b) => `${b.id} $${run.sellValue(b.def.cost)}`),
    ];
    if (sellable.length > 0) out.push(`sell <id> — for half its cost: ${sellable.join(' · ')}`);
    const next = run.nextRound;
    if (next !== null) out.push(`continue — leave the shop for Q${next.quarter} ${capitalize(next.market)} (target ${next.target})`);
  }
  return out;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
