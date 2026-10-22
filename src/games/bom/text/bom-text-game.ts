import type { ScoreContribution } from '../../../engine/scoring';
import { ReplayTextGame } from '../../../play/session';
import type { GameView, ReplayStep, SaveFile } from '../../../play/session';
import { partLabel } from '../model';
import type { Part } from '../model';
import { BomRun } from '../rules';
import type { BomConfig, BomPhase, RoundEnd, ShipQuote } from '../rules';
import { formatBomView } from './format-view';
import { formatPartRef, nameKey, parseBomAction } from './parse';
import type { BomCommand, PartRef } from './parse';
import { buildBomView, overtimePayText, refsFor, sortedHand } from './view';

const refuse = (reason: string): ReplayStep => ({ ok: false, reason });
/** The phase after a mutating call (TypeScript keeps the narrowing from before it otherwise). */
const phaseNow = (run: BomRun): BomPhase => run.phase;
const num = (n: number): string => String(Math.round(n * 100) / 100);

/** The Bill of Materials rules as a replayable text game for the CLI. */
export class BomTextGame extends ReplayTextGame<BomRun> {
  readonly name: string;
  private readonly config: () => BomConfig;

  constructor(name: string, config: () => BomConfig) {
    super();
    this.name = name;
    this.config = config;
  }

  protected override start(seed: number): BomRun {
    return new BomRun(this.config(), seed);
  }

  protected override describe(run: BomRun, save: SaveFile): GameView {
    const view = buildBomView(run, { game: this.name, seed: save.seed, actionsTaken: save.actions.length });
    return { text: formatBomView(view), legalActions: view.legalActions, state: view };
  }

  protected override step(run: BomRun, text: string): ReplayStep {
    const parsed = parseBomAction(text);
    if (!parsed.ok) return refuse(parsed.reason);
    try {
      return this.apply(run, parsed.command);
    } catch (error) {
      // Rules validate before mutating, so a throw here means a refused action with state intact.
      return refuse(error instanceof Error ? error.message : String(error));
    }
  }

  private apply(run: BomRun, command: BomCommand): ReplayStep {
    switch (command.kind) {
      case 'ship':
        return this.ship(run, command.product, command.parts);
      case 'preview': {
        const parts = resolve(run, command.parts);
        if (typeof parts === 'string') return refuse(parts);
        return { ok: true, log: previewLines(run, parts, command.parts), record: null };
      }
      case 'fab': {
        const parts = resolve(run, command.parts);
        if (typeof parts === 'string') return refuse(parts);
        const trash = command.trash === null ? undefined : resolve(run, [command.trash]);
        if (typeof trash === 'string') return refuse(trash);
        const why = run.whyCannotFabricate(parts, trash?.[0]);
        if (why !== null) return refuse(why);
        const trashRef = command.trash === null ? '' : ` trash ${formatPartRef(command.trash)}`;
        return this.fab(run, parts, trash?.[0], `fab ${command.parts.map(formatPartRef).join(' ')}${trashRef}`, '');
      }
      case 'stock': {
        const plan = run.stockPlan();
        if (plan === null) return refuse('Nothing to stock: no Sub part a Product needs can be fabricated from this hand without trashing');
        // Recorded as the concrete fab, so replays don't depend on the shortcut's choice.
        return this.fab(run, plan.parts, undefined, `fab ${refsFor(run, plan.parts)}`, ` for ${plan.product.def.name}`);
      }
      case 'scrap': {
        const parts = resolve(run, command.parts);
        if (typeof parts === 'string') return refuse(parts);
        const why = run.whyCannotScrap(parts);
        if (why !== null) return refuse(why);
        const result = run.scrap(parts);
        const log = [`Scrapped ${parts.map(partLabel).join(', ')} (${run.scrapsLeft} Scraps left)`, ...afterBuild(run, result.drawn, result.roundEnd)];
        return { ok: true, log, record: `scrap ${command.parts.map(formatPartRef).join(' ')}` };
      }
      case 'collect':
        return this.collect(run);
      case 'continue':
        if (run.phase === 'overtime') return this.collect(run);
        if (run.whyCannotLeaveShop() !== null) return refuse(run.phase === 'round' ? 'Round in progress: ship, fab or scrap' : (run.whyCannotLeaveShop() as string));
        run.leaveShop();
        const r = run.round;
        return { ok: true, log: [`Left the shop. Q${r.quarter} ${r.market.charAt(0).toUpperCase()}${r.market.slice(1)} starts: target ${r.target}`], record: 'continue' };
      case 'buy': {
        const target = command.blueprint === null ? undefined : { blueprintId: ownedId(run, command.blueprint), ...(command.choice ? { choice: command.choice } : {}) };
        const why = run.whyCannotBuy(command.slot - 1, target);
        if (why !== null) return refuse(why);
        const offer = run.buy(command.slot - 1, target);
        const what =
          offer.kind === 'facility' ? offer.facility.name
          : offer.kind === 'blueprint' ? `${offer.blueprint.name} blueprint`
          : offer.kind === 'part' ? `${partLabel(offer.part)} (added to your deck)`
          : `R&D Grant on ${target?.blueprintId}${target?.choice ? ` (${target.choice})` : ''}`;
        const record = ['buy', String(command.slot), ...(target ? [target.blueprintId] : []), ...(target?.choice ? [target.choice] : [])].join(' ');
        return { ok: true, log: [`Bought ${what} for $${offer.cost} (cash $${run.wallet.cash})`], record };
      }
      case 'sell': {
        const id = ownedId(run, command.id);
        const why = run.whyCannotSell(id);
        if (why !== null) return refuse(why);
        const value = run.sell(id);
        return { ok: true, log: [`Sold ${id} for $${value} (cash $${run.wallet.cash})`], record: `sell ${id}` };
      }
      case 'shred': {
        const why = run.whyCannotShred(command.category, command.grade);
        if (why !== null) return refuse(why);
        const part = run.shred(command.category, command.grade);
        return { ok: true, log: [`Shredded ${partLabel(part)} from your deck (cash $${run.wallet.cash})`], record: `shred ${command.category} ${command.grade}` };
      }
      case 'reroll': {
        const why = run.whyCannotReroll();
        if (why !== null) return refuse(why);
        const cost = run.shop.rerollCost;
        run.reroll();
        return { ok: true, log: [`Rerolled for $${cost} (cash $${run.wallet.cash}; next reroll $${run.shop.rerollCost})`], record: 'reroll' };
      }
    }
  }

  private fab(run: BomRun, parts: readonly Part[], trash: Part | undefined, record: string, purpose: string): ReplayStep {
    const labels = parts.map(partLabel).join(' + ');
    const result = run.fabricate(parts, trash);
    const log = [`Fabricated ${result.sub.def.name} ${result.output.grade} from ${labels} → Bench${purpose} (1 Build used, ${run.buildsLeft} left)`];
    if (result.trashed) log.push(`Trashed ${partLabel(result.trashed)} from the Bench`);
    if (result.copiesBenched.length) log.push(`Kitting copy: ${result.copiesBenched.map(partLabel).join(', ')} → Bench`);
    if (result.copiesLost) log.push(`Kitting copy lost (Bench full)`);
    if (result.roundEnd?.cleared) log.push('Last Build used: the round cleared automatically.');
    log.push(...afterBuild(run, result.drawn, result.roundEnd));
    return { ok: true, log, record };
  }

  private ship(run: BomRun, productToken: string | null, refs: readonly PartRef[]): ReplayStep {
    const parts = resolve(run, refs);
    if (typeof parts === 'string') return refuse(parts);
    let productId: string;
    if (productToken === null) {
      const why = run.whyCannotShip(parts);
      if (why !== null) return refuse(why);
      const options = run.quoteOptions(parts);
      if (options.length > 1) {
        const sel = refs.map(formatPartRef).join(' ');
        return refuse(`Several Products fit; pick one: ${options.map((q) => `ship ${q.blueprint.id} ${sel} → $${q.revenue}`).join(' | ')}`);
      }
      productId = (options[0] as ShipQuote).blueprint.id;
    } else {
      productId = ownedId(run, productToken);
    }
    const why = run.whyCannotShip(parts, productId);
    if (why !== null) return refuse(why);
    const wasOvertime = run.phase === 'overtime';
    const result = run.ship(parts, productId);
    const product = result.quote.blueprint;
    const log = [`Shipped ${product.def.name}: $${result.quote.revenue} (revenue ${run.revenue}/${run.round.target})`, ...receipt(result.quote)];
    if (wasOvertime) {
      const cap = run.config.overtimeShip.cap;
      log.push(`OVERTIME SHIP: +$${result.overtimePay} cash with this round's payout ($${run.overtimeCash}/$${cap} this round)`);
    }
    if (result.growth > 0) log.push(`SOLD OUT: ${product.def.name} Demand +${result.growth} permanently (now ${product.demand})`);
    if (wasOvertime && result.roundEnd?.cleared) log.push('Last Build used: the round cleared automatically.');
    log.push(...afterBuild(run, result.drawn, result.roundEnd, !wasOvertime && phaseNow(run) === 'overtime'));
    return { ok: true, log, record: `ship ${productId} ${refs.map(formatPartRef).join(' ')}` };
  }

  private collect(run: BomRun): ReplayStep {
    const why = run.whyCannotCollect();
    if (why !== null) return refuse(why);
    return { ok: true, log: roundEndLines(run, run.collect()), record: 'collect' };
  }
}

/** Maps typed refs to parts (hand positions and Bench slots as currently displayed). */
function resolve(run: BomRun, refs: readonly PartRef[]): Part[] | string {
  const parts: Part[] = [];
  for (const ref of refs) {
    const zone = ref.zone === 'hand' ? sortedHand(run) : run.bench;
    const part = zone[ref.position - 1];
    if (part === undefined) {
      return ref.zone === 'hand' ? `No part at hand position ${ref.position} (hand has ${zone.length})` : `No part in Bench slot b${ref.position} (Bench has ${zone.length})`;
    }
    parts.push(part);
  }
  return parts;
}

/** Resolves a typed name to an owned blueprint or facility id ("Desk Fan", "deskfan" → "desk-fan"). */
function ownedId(run: BomRun, token: string): string {
  const key = nameKey(token);
  const owned = [...run.blueprints.map((b) => ({ id: b.id, name: b.def.name })), ...run.facilities.map((f) => ({ id: f.id, name: f.name }))];
  return owned.find((o) => nameKey(o.id) === key || nameKey(o.name) === key)?.id ?? token;
}

function previewLines(run: BomRun, parts: readonly Part[], refs: readonly PartRef[]): string[] {
  const sel = refs.map(formatPartRef).join(' ');
  const lines = [`Preview of ${parts.map(partLabel).join(', ')}:`];
  const shipProblem = run.whyCannotShip(parts);
  if (shipProblem === null) {
    for (const q of run.quoteOptions(parts)) {
      const v = q.score.values();
      const need = run.round.target - run.revenue;
      const vsTarget =
        run.phase === 'overtime' ? `Overtime Ship: +$${run.overtimePayFor(q.revenue)} cash`
        : q.revenue >= need ? `clears the target${q.revenue > need ? ` ($${q.revenue - need} over is not paid)` : ''}`
        : `$${need - q.revenue} short of the target`;
      const sellOut = q.sellsOut ? ' · sells out' : q.blueprint.shipsThisRound > 0 ? ' · repeat Ship: no sell-out growth' : '';
      lines.push(`  ship ${q.blueprint.id} ${sel} → $${q.revenue} (min(${v.units} Units, ${v.demand} Demand) × $${v.price} × ${num(v.markup ?? 1)}) · ${vsTarget}${sellOut}`);
    }
  } else {
    lines.push(`  ship: ${shipProblem}`);
  }
  const sub = run.subFor(parts);
  if (sub !== undefined) {
    const fabProblem = run.whyCannotFabricate(parts);
    lines.push(`  fab ${sel} → ${sub.def.name}${fabProblem ? ` (${fabProblem})` : ''}`);
  }
  return lines;
}

function contributionLine(c: ScoreContribution): string {
  const stat = c.stat.charAt(0).toUpperCase() + c.stat.slice(1);
  if (c.op === 'set') return `  ${c.source}: ${stat} = ${num(c.amount)}`;
  if (c.op === 'multiply') return `  ${c.source}: ×${num(c.amount)}`;
  return `  ${c.source}: ${stat} ${c.amount >= 0 ? '+' : ''}${num(c.amount)} → ${num(c.after)}`;
}

/** Step-by-step receipt of a Ship, ending with the formula. */
function receipt(quote: ShipQuote): string[] {
  const v = quote.score.values();
  const name = quote.blueprint.def.name;
  const log = quote.score.log;
  // The first three entries set the blueprint's base Units, Price and Demand; show them as one line.
  const base = log.slice(0, 3).filter((c) => c.source === name && c.op === 'set');
  const baseLine = `  ${name} base: ${base.map((c) => (c.stat === 'price' ? `$${c.amount}` : `${c.amount} ${c.stat === 'units' ? 'Units' : 'Demand'}`)).join(', ')}`;
  return [
    baseLine,
    ...log.slice(base.length).map(contributionLine),
    `  = min(${v.units} Units, ${v.demand} Demand) × $${v.price} × ${num(v.markup ?? 1)} = $${quote.revenue}`,
  ];
}

function afterBuild(run: BomRun, drawn: readonly Part[], roundEnd: RoundEnd | null, enteredOvertime = false): string[] {
  if (roundEnd !== null) return roundEndLines(run, roundEnd);
  const lines: string[] = [];
  if (enteredOvertime) {
    lines.push(
      `TARGET REACHED (${run.revenue}/${run.round.target}): Overtime. Ships now pay cash (${overtimePayText(run)}); ` +
        `fab or stock to fill the Bench for next round; or collect $${run.buildsLeft} for unused Builds. Scraps are locked, and using the last Build ends the round.`,
    );
  }
  // The hand re-sorts after a draw, so say where the new parts landed.
  const hand = sortedHand(run);
  if (drawn.length > 0) lines.push(`Drew: ${drawn.map((p) => `${partLabel(p)} (now ${hand.indexOf(p) + 1})`).join(', ')}`);
  if (run.deck.drawPile.length === 0 && hand.length < run.deck.handSize) {
    lines.push(`Draw pile empty: the hand stays at ${hand.length} until next round (used and scrapped parts return then).`);
  }
  return lines;
}

function roundEndLines(run: BomRun, end: RoundEnd): string[] {
  if (!end.cleared) return [`ROUND FAILED at ${end.revenue}/${end.target}. RUN LOST in Q${run.round.quarter} ${run.round.market}.`];
  const payout = end.payout?.lines.map((l) => `${l.source} $${l.amount}`).join(', ') ?? '';
  const lines = [`ROUND CLEARED (${end.revenue}/${end.target}). Payout: ${payout} (cash $${run.wallet.cash})`];
  lines.push(run.phase === 'won' ? `RUN WON: all ${run.totalRounds} rounds cleared!` : 'The shop is open.');
  return lines;
}
