import { computeInterest } from '../../../engine/economy';
import type { PayoutLine } from '../../../engine/economy';
import { PAINT, PREMIUM_PRICE, SUB_RND_GRADE, partLabel } from '../model';
import type { OwnedBlueprint, Part } from '../model';
import { fabricate, findRecipeParts, recipeText } from '../rules';
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
  /** Interest the next round clear would pay on the cash held now. */
  readonly interestNext: number;
  readonly interest: { readonly per: number; readonly amount: number; readonly cap: number };
  /** Rule numbers the text explains: sell-out growth, whether repeat Ships halve Demand, parts per Build. */
  readonly rules: { readonly sellOutGrowth: number; readonly demandHalves: boolean; readonly maxSelection: number };
  readonly hand: readonly PartView[];
  /** Deck piles: undrawn parts this round, and used/scrapped parts that return next round. */
  readonly piles: { readonly draw: number; readonly discard: number };
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
  /** Ships this run (Recall targets the most-shipped Product). */
  readonly shipsThisRun: number;
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
  /** Deck contents for Shred: "Chip 1" / "Paint 2 premium" → count. */
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
    interestNext: computeInterest(run.wallet.cash, run.config.interest),
    interest: run.config.interest,
    rules: { sellOutGrowth: run.mods.sellOutGrowth, demandHalves: run.mods.demandHalves, maxSelection: run.config.maxSelection },
    hand: sortedHand(run).map((p, i) => partView(p, String(i + 1))),
    piles: { draw: run.deck.drawPile.length, discard: run.deck.discardPile.length },
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
    shipsThisRun: b.shipsThisRun,
    growth: b.growth,
    scale: b.scaleLevels,
    premium: b.premiumLevels,
    sellValue: run.sellValue(b.def.cost),
  };
}

function offerText(run: BomRun, offer: BomOffer): string {
  switch (offer.kind) {
    case 'facility':
      return `[Facility · ${offer.facility.rarity}] ${offer.facility.name}: ${offer.facility.text}`;
    case 'blueprint': {
      const b = offer.blueprint;
      const stats = b.kind === 'product' ? `${b.units} Units · $${b.price} · Demand ${b.demand}` : `makes ${b.output}`;
      const missing = b.kind === 'product' ? missingSubs(run, b.recipe) : [];
      const needs = missing.length ? ` — needs the ${missing.join(' and ')} Sub${missing.length > 1 ? 's' : ''}, which you don't own` : '';
      return `[Blueprint · ${b.rarity}] ${b.name} (${b.kind}: ${recipeText(b.recipe)} · ${stats})${needs}`;
    }
    case 'rnd':
      return `[R&D Grant] +1 level on an owned blueprint. Scale: +½ base Units and Demand. Premium: +⅓ base Price. Sub: +${SUB_RND_GRADE} output grade`;
    case 'part': {
      const tag = offer.part.premium ? `; Premium tag: +$${PREMIUM_PRICE} Price when shipped, lost if fabricated` : '';
      const adds = offer.part.category === PAINT ? 'adds its grade to Price' : 'adds its grade to Units';
      return `[Part] ${partLabel(offer.part)} (joins your deck; ${adds}${tag})`;
    }
  }
}

/** Names of Subs a recipe needs that no owned Sub makes. */
function missingSubs(run: BomRun, recipe: readonly string[]): string[] {
  const subs = run.config.blueprints.filter((b) => b.kind === 'sub' && recipe.includes(b.output));
  return subs.filter((sub) => !run.blueprints.some((o) => o.id === sub.id)).map((sub) => sub.name);
}

/** Per-blueprint R&D effects, e.g. "desk-fan scale +8 Units/+25 Demand, premium +$2". */
function rndOptions(run: BomRun): string {
  return run.blueprints
    .map((b) => {
      if (b.def.kind === 'sub') return `${b.id} +${SUB_RND_GRADE} grade`;
      const d = b.def;
      return `${b.id} scale +${Math.ceil(d.units / 2)} Units/+${Math.ceil(d.demand / 2)} Demand, premium +$${Math.ceil(d.price / 3)}`;
    })
    .join(' · ');
}

function shopView(run: BomRun): ShopView {
  const deck: Record<string, number> = {};
  for (const p of run.deck.allCards) {
    const key = partLabel(p);
    deck[key] = (deck[key] ?? 0) + 1;
  }
  return {
    offers: run.shop.offers.flatMap((offer, i) =>
      offer === null
        ? []
        : [{ slot: i + 1, kind: offer.kind, text: offerText(run, offer), cost: offer.cost, problem: run.offerProblem(i) }],
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
      if (parts !== null) {
        out.push(`ship ${b.id} <parts…> — 1 Build: ${b.def.name} needs ${recipeText(b.def.recipe)}; extra parts are filler that add their grade (e.g. ship ${b.id} ${refsFor(run, parts)})`);
      }
    }
    out.push('preview <parts…> — projected revenue for every Product those parts fit (free, not recorded)');
  }
  if (inRound && run.buildsLeft > 0) {
    for (const b of run.blueprints) {
      if (b.def.kind !== 'sub') continue;
      const parts = findRecipeParts(b.def.recipe, available);
      if (parts === null) continue;
      const full = run.bench.filter((p) => !parts.includes(p)).length >= run.mods.benchSlots;
      const output = fabricate(b, parts, run.activeRules).output;
      out.push(
        `fab <parts…>${full ? ' trash bN' : ''} — 1 Build: ${b.def.name} = ${recipeText(b.def.recipe)} → Bench, grade 2 × (sum of input grades): ` +
          `${parts.map(partLabel).join(' + ')} → ${partLabel(output)} (e.g. fab ${refsFor(run, parts)}${full ? ' trash b1' : ''})`,
      );
    }
  }
  if (inRound && run.scrapsLeft > 0) out.push(`scrap <hand positions…> — discard 1–5 and redraw (${run.scrapsLeft} left)`);
  if (run.phase === 'overtime') out.push(`collect — end the round: +$${run.buildsLeft} for ${run.buildsLeft} unused Build(s), then the shop (a fab costs $1 of that)`);
  if (run.phase === 'shop') {
    run.shop.offers.forEach((offer, i) => {
      if (offer === null) return;
      if (run.offerProblem(i) !== null) return;
      if (offer.kind === 'rnd') {
        out.push(`buy ${i + 1} <blueprint> [scale|premium] — R&D Grant for $${offer.cost}: ${rndOptions(run)}`);
      } else {
        const name = offer.kind === 'facility' ? offer.facility.name : offer.kind === 'blueprint' ? offer.blueprint.name : partLabel(offer.part);
        out.push(`buy ${i + 1} — ${name} for $${offer.cost}`);
      }
    });
    if (run.whyCannotReroll() === null) out.push(`reroll — new Rack and Parts Counter for $${run.shop.rerollCost}`);
    if (!run.shop.shredUsed && run.wallet.canAfford(run.config.shop.shredCost)) {
      out.push(`shred <category> <grade> — PAY $${run.config.shop.shredCost} to remove one part from your deck permanently (once per shop visit; e.g. shred ${PAINT} 1)`);
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
