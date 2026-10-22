import type { Rng } from '../../../engine/rng';
import { CATEGORIES } from '../model';
import type { Card, Category, Fixture, GrantLevels, Stage } from '../model';
import { designOnlyMod, scoreLine } from '../rules';
import type { BuyTarget, LineSlot, ShiftContext, ThroughputRun } from '../rules';
import { classifyBuild, loadProblem, planAssignment, scrapChoice } from './planner';
import type { LoadPlan, LoadProblem } from './planner';
import { ThroughputBot } from './throughput-bot';
import type { ShiftDecision, ShopDecision } from './throughput-bot';

/** Sampled opening hands per shop valuation (every candidate is screened on the first few), and redraws per Retool candidate. */
const HAND_SAMPLES = 12;
const SCREEN_SAMPLES = 4;
const SCREEN_KEEP = 4;
const RETOOL_SAMPLES = 8;
/** Retool utility: clearing this Shift is 1, partial progress at most this; a Retool must add `MIN_RETOOL_GAIN`. */
const PARTIAL_PROGRESS = 0.3;
const MIN_RETOOL_GAIN = 0.05;
/** Rerolls per shop visit, and the Capital a reroll must leave for a buy. */
const MAX_REROLLS = 3;
const REROLL_FLOOR = 5;
/** A buy must raise expected Shift-1 sales by at least this share of next round's target. */
const MIN_GAIN = 0.02;
/** Shift-1 value of perks the one-Shift valuation can't see, as a share of next round's target. */
const TRAINING_GAIN = 0.04;
const EXPAND_GAIN = 0.05;
const DESIGN_PERSISTENCE = 0.5;
/** Rounds ahead a shop valuation samples. */
const HORIZON = 2;

/** The parts of a run a purchase changes, for valuing it before buying. */
type Model = {
  readonly fixtures: readonly (Fixture | null)[];
  readonly deck: readonly Card[];
  readonly grants: Readonly<Record<Category, GrantLevels>>;
  readonly demand: Readonly<Record<Category, number>>;
};

/** A buy or a Fixture move, what it costs, the run it would leave (null: none to value), and a flat extra gain (share of the target). */
type Candidate = {
  readonly action: Extract<ShopDecision, { readonly kind: 'buy' | 'move' }>;
  readonly price: number;
  readonly model: Model | null;
  readonly flatGain: number;
};

/**
 * Approximates skilled (LLM-level) play, for tuning the curve without waiting on a playtest. Not in
 * the default roster, so the strategy bots' numbers stay comparable.
 *
 * - Shifts: plans the load with the shared planner, and when the plan can't clear the round, Retools
 *   the cards that help least if sampled redraws from the draw pile (its contents, not its order)
 *   make clearing this Shift clearly likelier.
 * - Shop: values every offer in every place it could go by how much it raises the expected best
 *   Shift-1 sales over sampled hands for the next rounds (their trends, Demand and bosses included),
 *   and buys the best gain per Capital until nothing clears the bar; then rerolls while it can still
 *   buy, and before leaving makes any Fixture move that pays (a slot the next boss welds, say).
 *
 * DESIGN_NOTES "Expert bot" has its calibration against the round-2 LLM playtest.
 */
export class ExpertBot extends ThroughputBot {
  readonly name = 'expert';
  private rng: Rng | null = null;
  private shiftKey = '';
  private visit = -1;
  private rerolls = 0;
  /** Per-card sort keys for each hand sample, so every valuation in a visit deals the same hands. */
  private keys = new Map<number, number[]>();
  /** Planned Shift-1 totals this visit, by Line and hand: most candidates leave most sampled hands unchanged. */
  private totals = new Map<string, number>();
  private nextHypotheticalUid = -1;

  override beginRun(_run: ThroughputRun, rng: Rng): void {
    this.rng = rng;
    this.shiftKey = '';
    this.visit = -1;
  }

  override archetypeOf(run: ThroughputRun): string {
    return classifyBuild(run);
  }

  override shiftTurn(run: ThroughputRun): ShiftDecision {
    const key = `${run.round}/${run.shift}`;
    if (this.shiftKey !== key) {
      this.shiftKey = key;
      const slots = scrapChoice(run);
      if (slots.length > 0) return { kind: 'scrap', slots };
    }
    const problem = loadProblem(run, { designPersistence: DESIGN_PERSISTENCE });
    const plan = planAssignment(problem);
    if (plan.total < problem.needed) {
      const hand = this.retoolFor(run, problem, plan);
      if (hand !== null) return { kind: 'retool', hand };
    }
    return plan.assign.size > 0 ? { kind: 'load', placements: [...plan.assign].map(([slot, hand]) => ({ hand, slot })) } : { kind: 'run' };
  }

  /**
   * Hand cards to Retool, or null to keep the hand: the candidate discard (the 1–3 least useful
   * cards, or any mix of cards the plan leaves out) whose sampled redraws most raise the chance of
   * clearing this Shift, with partial progress worth a little. Digging only for progress burns the
   * cards later Shifts need (a Board that takes four Shifts runs out).
   */
  private retoolFor(run: ThroughputRun, problem: LoadProblem, plan: LoadPlan): number[] | null {
    if (run.whyCannotRetool([0]) !== null || run.drawPile.length === 0) return null;
    const rng = this.random();
    const progress = (total: number) => (total >= problem.needed ? 1 : 0) + PARTIAL_PROGRESS * Math.min(1, total / problem.needed);
    const kept = progress(plan.total);
    const usefulness = problem.hand.map((_, i) => (plan.assign.size > 0 && [...plan.assign.values()].includes(i) ? plan.total - totalWithout(problem, plan, i) : -1));
    const ranked = problem.hand.map((_, i) => i).sort((a, b) => (usefulness[a] as number) - (usefulness[b] as number));
    const unused = ranked.filter((i) => (usefulness[i] as number) < 0);
    const max = Math.min(run.config.retoolMax, run.drawPile.length);
    const candidates = new Map<string, number[]>();
    for (let k = 1; k <= max; k++) candidates.set(ranked.slice(0, k).join(','), ranked.slice(0, k));
    if (unused.length <= 5) for (const subset of subsets(unused, max)) candidates.set([...subset].sort((a, b) => a - b).join(','), subset);

    let best: { hand: number[]; value: number } | null = null;
    for (const discard of candidates.values()) {
      const rest = problem.hand.filter((_, i) => !discard.includes(i));
      let sum = 0;
      for (let s = 0; s < RETOOL_SAMPLES; s++) {
        const drawn = rng.shuffle(run.drawPile).slice(0, discard.length);
        sum += progress(planAssignment({ ...problem, hand: [...rest, ...drawn] }, true).total);
      }
      const value = sum / RETOOL_SAMPLES;
      if (best === null || value > best.value) best = { hand: discard, value };
    }
    return best !== null && best.value > kept + MIN_RETOOL_GAIN ? best.hand : null;
  }

  override shopTurn(run: ThroughputRun): ShopDecision {
    if (this.visit !== run.round) {
      this.visit = run.round;
      this.rerolls = 0;
      this.keys = new Map();
      this.totals = new Map();
    }
    const buy = this.bestAction(run, 'buy');
    if (buy !== null) return buy;
    if (this.rerolls < MAX_REROLLS && run.whyCannotReroll() === null && run.wallet.cash - run.rerollCost >= REROLL_FLOOR) {
      this.rerolls++;
      return { kind: 'reroll' };
    }
    // Rearranging waits until the buys are done: it only has to be right for the Line that leaves.
    return this.bestAction(run, 'move') ?? { kind: 'leave' };
  }

  /**
   * The legal buy (or Fixture move) with the best expected gain per Capital, if any gains enough.
   * Every candidate is screened on a few sampled hands; the best few are then valued on all of them.
   */
  private bestAction(run: ThroughputRun, kind: Candidate['action']['kind']): Candidate['action'] | null {
    const target = run.targetFor(run.round + 1);
    const base = this.modelOf(run);
    const all = kind === 'buy' ? this.buyCandidates(run, base) : this.moveCandidates(run, base);
    const legal = [...all].filter(({ action }) =>
      action.kind === 'buy' ? run.whyCannotBuy(action.offer, action.target) === null : run.whyCannotMove(action.from, action.to) === null,
    );
    if (legal.length === 0) return null;
    const score = (candidate: Candidate, samples: number, baseValue: number) => {
      const gain = (candidate.model === null ? 0 : this.value(run, candidate.model, samples) - baseValue) + candidate.flatGain * target;
      return { candidate, gain, score: gain / Math.max(1, candidate.price) };
    };
    const screenBase = this.value(run, base, SCREEN_SAMPLES);
    const shortlist = legal
      .map((c) => score(c, SCREEN_SAMPLES, screenBase))
      .sort((a, b) => b.score - a.score)
      .slice(0, SCREEN_KEEP);
    const fullBase = this.value(run, base, HAND_SAMPLES);
    let best: ReturnType<typeof score> | null = null;
    for (const { candidate } of shortlist) {
      const scored = score(candidate, HAND_SAMPLES, fullBase);
      if (scored.gain >= MIN_GAIN * target && (best === null || scored.score > best.score)) best = scored;
    }
    return best === null ? null : best.candidate.action;
  }

  /** Every offer in every place it could go, with the run each would leave. */
  private *buyCandidates(run: ThroughputRun, base: Model): Generator<Candidate> {
    for (const [i, offer] of run.offers.entries()) {
      if (offer === null) continue;
      const buy = (target: BuyTarget, model: Model | null, flatGain = 0): Candidate => ({ action: { kind: 'buy', offer: i, target }, price: offer.price, model, flatGain });
      switch (offer.kind) {
        case 'fixture': {
          const fixture: Fixture = { uid: this.hypotheticalUid(), def: offer.def, paid: offer.price, roundsOwned: 0 };
          const empty = base.fixtures.flatMap((f, slot) => (f === null ? [slot] : []));
          // A full Line replaces: buying onto a Fixture sells it as part of the buy.
          const slots = empty.length > 0 ? empty : base.fixtures.map((_, slot) => slot);
          for (const slot of slots) yield buy({ slot }, { ...base, fixtures: base.fixtures.map((f, s) => (s === slot ? fixture : f)) });
          break;
        }
        case 'card': {
          const card: Card = { uid: this.hypotheticalUid(), def: offer.def, category: offer.category, paid: offer.price, upgrades: 0, growth: 0 };
          yield buy({}, { ...base, deck: [...base.deck, card] });
          break;
        }
        case 'contract':
          yield* this.contractCandidates(run, base, offer.def.effect, buy);
          break;
      }
    }
  }

  /** Every Fixture move (a swap), so a slot the next boss welds and a better arrangement both show. */
  private *moveCandidates(run: ThroughputRun, base: Model): Generator<Candidate> {
    for (const [from, fixture] of base.fixtures.entries()) {
      if (fixture === null) continue;
      for (const [to, other] of base.fixtures.entries()) {
        if (to === from || (other !== null && to < from)) continue;
        const fixtures = base.fixtures.map((f, s) => (s === from ? other : s === to ? fixture : f));
        yield { action: { kind: 'move', from, to }, price: run.config.moveCost, model: { ...base, fixtures }, flatGain: 0 };
      }
    }
  }

  private *contractCandidates(run: ThroughputRun, base: Model, effect: string, buy: (target: BuyTarget, model: Model | null, flatGain?: number) => Candidate): Generator<Candidate> {
    switch (effect) {
      case 'expand':
        // A slot is also room for a later Fixture, which one round's hands can't show.
        yield buy({}, { ...base, fixtures: [...base.fixtures, null] }, EXPAND_GAIN);
        return;
      case 'tooling':
        for (const index of distinctCards(base.deck)) {
          const card = base.deck[index] as Card;
          yield buy({ deckCard: index }, { ...base, deck: base.deck.map((c, j) => (j === index ? { ...card, upgrades: card.upgrades + 1 } : c)) });
        }
        return;
      case 'clone':
        for (const index of distinctCards(base.deck)) {
          const card = base.deck[index] as Card;
          yield buy({ deckCard: index }, { ...base, deck: [...base.deck, { ...card, uid: this.hypotheticalUid() }] });
        }
        return;
      case 'downsize':
        for (const index of distinctCards(base.deck)) yield buy({ deckCard: index }, { ...base, deck: base.deck.filter((_, j) => j !== index) });
        return;
      case 'grant':
        for (const category of CATEGORIES) {
          const levels = base.grants[category];
          const scale = { ...base.grants, [category]: { ...levels, scale: levels.scale + 1 } };
          const demand = { ...base.demand, [category]: base.demand[category] + run.config.grant.scaleDemand };
          yield buy({ category, option: 'scale' }, { ...base, grants: scale, demand });
          yield buy({ category, option: 'premium' }, { ...base, grants: { ...base.grants, [category]: { ...levels, premium: levels.premium + 1 } } });
        }
        return;
      case 'training':
        // More Retools a round: worth it while there are rounds left to dig in (one is enough).
        if (run.perks.retools === 0 && run.round + 3 <= run.rounds) yield buy({}, null, TRAINING_GAIN);
        return;
      default:
        // Ad Campaign and Treasury Bond pay off outside one Shift; the expert skips them.
        return;
    }
  }

  /** The run as it stands, for valuation. */
  private modelOf(run: ThroughputRun): Model {
    return { fixtures: run.line.map((s) => s.fixture), deck: run.deck, grants: run.grants, demand: run.demand };
  }

  /**
   * Expected best Shift-1 sales for `model` over the first `samples` of this visit's sampled hands.
   * Samples alternate between the next `HORIZON` rounds (their trends, Demand cuts and bosses), so
   * one round's Hot Category doesn't decide a buy that stays for the run. Plans quickly (see
   * `planAssignment`): every candidate shares the same bias.
   */
  private value(run: ThroughputRun, model: Model, samples: number): number {
    const last = Math.min(run.lastPlannedRound, run.round + HORIZON);
    const rounds = Array.from({ length: Math.max(1, last - run.round) }, (_, i) => run.round + 1 + i);
    const base: LineSlot[] = model.fixtures.map((fixture) => ({ fixture, card: null }));
    const setups = rounds.map((round) => {
      const ctx = nextRoundContext(run, model, round);
      const open = base.flatMap((slot, i) => (slot.fixture?.def.kind === 'station' || (ctx.boss?.isWelded(i) ?? false) ? [] : [i]));
      return { round, ctx, open, types: openingTypes(run, model, ctx) };
    });
    const modelKey = `${model.fixtures.map((f) => f?.uid ?? '-').join(',')}|${CATEGORIES.map((c) => `${model.grants[c].scale}.${model.grants[c].premium}.${model.demand[c]}`).join(',')}`;
    let sum = 0;
    for (let k = 0; k < samples; k++) {
      const { round, ctx, open, types } = setups[k % setups.length] as (typeof setups)[number];
      const hand = this.sampleHand(model.deck, k, run.config.handSize, types);
      const key = `${round}|${modelKey}|${hand.map((c) => `${c.uid}.${c.upgrades}.${c.growth}`).join(',')}`;
      let total = this.totals.get(key);
      if (total === undefined) {
        const problem: LoadProblem = { base, hand, open, ctx, needed: run.targetFor(round), shiftsAfter: 0, maxDesigns: base.length, designPersistence: 0 };
        total = planAssignment(problem, true).total;
        this.totals.set(key, total);
      }
      sum += total;
    }
    return sum / samples;
  }

  /** Sample `k`'s opening hand: the cards with the lowest keys, fixed up like the run's opener. */
  private sampleHand(deck: readonly Card[], k: number, size: number, types: readonly Stage[]): Card[] {
    const ordered = [...deck].sort((a, b) => this.keyOf(a.uid, k) - this.keyOf(b.uid, k));
    const hand = ordered.slice(0, size);
    const pile = ordered.slice(size);
    for (const stage of types) {
      if (hand.some((c) => c.def.stage === stage)) continue;
      const next = pile.findIndex((c) => c.def.stage === stage);
      if (next < 0) continue;
      const count = (s: Stage) => hand.filter((c) => c.def.stage === s).length;
      const surplus = (['design', 'make', 'ship'] as const).filter((s) => s !== stage).reduce((a, b) => (count(b) > count(a) ? b : a));
      const out = hand.map((c) => c.def.stage).lastIndexOf(surplus);
      if (out < 0) continue;
      hand[out] = pile.splice(next, 1)[0] as Card;
    }
    return hand;
  }

  private keyOf(uid: number, k: number): number {
    let keys = this.keys.get(uid);
    if (keys === undefined) {
      const rng = this.random();
      keys = Array.from({ length: HAND_SAMPLES }, () => rng.next());
      this.keys.set(uid, keys);
    }
    return keys[k] as number;
  }

  private hypotheticalUid(): number {
    return this.nextHypotheticalUid--;
  }

  private random(): Rng {
    if (this.rng === null) throw new Error('ExpertBot: beginRun was not called');
    return this.rng;
  }
}

/** The Shift-1 context of a coming `round` with `model`'s Demand and Grants. */
function nextRoundContext(run: ThroughputRun, model: Model, round: number): ShiftContext {
  const trends = run.trends[round - 1] ?? run.trendsNow;
  const boss = run.bossOf(round);
  const demandLeft = Object.fromEntries(
    CATEGORIES.map((c) => [c, Math.floor(model.demand[c] * (trends[c] === 'saturated' ? run.config.demand.saturatedMul : 1) * (boss?.demandMul() ?? 1))]),
  ) as Record<Category, number>;
  const quota = boss?.shiftQuota() ?? null;
  return {
    ...run.shiftContext(),
    trends,
    boss,
    shift: 1,
    shiftCap: quota === null ? null : Math.floor(quota * run.targetFor(round)),
    demand: model.demand,
    demandLeft,
    grants: model.grants,
    hotPipsLeft: run.hotPipsPerRound,
  };
}

/** The Stages the run's opener would guarantee for `model`'s Line. */
function openingTypes(run: ThroughputRun, model: Model, ctx: ShiftContext): readonly Stage[] {
  const types = run.config.openingHandTypes;
  if (!run.config.designOpener || types.includes('design')) return types;
  const designMod = model.fixtures.some((f, i) => f !== null && !(ctx.boss?.isWelded(i) ?? false) && designOnlyMod(f.def));
  return designMod ? [...types, 'design'] : types;
}

/** The plan's total with hand card `index` taken off the Line (nothing re-planned). */
function totalWithout(problem: LoadProblem, plan: LoadPlan, index: number): number {
  const line = problem.base.map((slot, i) => {
    const hand = plan.assign.get(i);
    return hand === undefined || hand === index ? slot : { fixture: slot.fixture, card: problem.hand[hand] as Card };
  });
  return scoreLine(line, problem.ctx, { trace: false }).total;
}

/** One deck index per distinct card (definition, Category, upgrades and growth). */
function distinctCards(deck: readonly Card[]): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  deck.forEach((card, i) => {
    const key = `${card.def.id}/${card.category}/${card.upgrades}/${card.growth}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(i);
  });
  return out;
}

/** Non-empty subsets of `items` of at most `max` elements. */
function subsets(items: readonly number[], max: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, current: number[]) => {
    if (current.length > 0) out.push(current);
    if (current.length === max) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...current, items[i] as number]);
  };
  walk(0, []);
  return out;
}
