import { Rng } from '../../../engine/rng';
import { Scenario } from '../../../sim/scenarios';
import { RunRecorder, SimulationError } from '../../../sim/simulate';
import type { RunStats } from '../../../sim/simulate';
import { DEFAULT_CONFIG } from '../content';
import type { ThroughputConfig } from '../content';
import { ThroughputRun } from '../rules';
import type { Offer } from '../rules';
import { throughputBots } from './bots';
import type { ThroughputBot } from './throughput-bot';

/** `npm run sim -- --scenario throughput`: each bot plays full THROUGHPUT runs. */
export class ThroughputScenario extends Scenario {
  readonly name = 'throughput';
  readonly description = 'THROUGHPUT + Trends (seed-03): factory Line, trend conveyor, Board bosses';
  readonly botNames: readonly string[];
  private readonly bots: readonly ThroughputBot[];
  private readonly config: ThroughputConfig;
  private readonly maxActionsPerPhase: number;

  constructor(bots: readonly ThroughputBot[] = throughputBots(), config: ThroughputConfig = DEFAULT_CONFIG, maxActionsPerPhase = 500) {
    super();
    this.bots = bots;
    this.botNames = bots.map((b) => b.name);
    this.config = config;
    this.maxActionsPerPhase = maxActionsPerPhase;
  }

  override simulate(seeds: readonly number[], botNames?: readonly string[]): RunStats[] {
    const bots = botNames === undefined ? this.bots : this.bots.filter((b) => botNames.includes(b.name));
    return bots.flatMap((bot) => seeds.map((seed) => this.playOne(bot, seed)));
  }

  private playOne(bot: ThroughputBot, seed: number): RunStats {
    const run = new ThroughputRun(seed, this.config);
    const recorder = new RunRecorder(seed, bot.name);
    bot.beginRun(run, new Rng(seed).fork('bot'));
    const fail = (message: string): never => {
      throw new SimulationError(seed, `${bot.name}: ${message}`);
    };
    const recordOffers = () => {
      for (const offer of run.offers) if (offer !== null) recorder.offer({ round: run.round, ...offerRecord(offer) });
    };

    let actions = 0;
    let phaseKey = '';
    while (run.phase === 'shift' || run.phase === 'shop') {
      const key = `${run.phase}/${run.round}/${run.shift}`;
      if (key !== phaseKey) {
        phaseKey = key;
        actions = 0;
        if (run.phase === 'shop') recordOffers();
      }
      if (++actions > this.maxActionsPerPhase) fail(`exceeded ${this.maxActionsPerPhase} actions in ${key}`);

      if (run.phase === 'shift') {
        const decision = bot.shiftTurn(run);
        const reason = shiftReason(run, decision);
        if (reason !== null) fail(`illegal ${decision.kind}: ${reason}`);
        if (decision.kind === 'load') run.load(decision.placements);
        else if (decision.kind === 'retool') run.retool(decision.hand);
        else if (decision.kind === 'scrap') run.scrap(decision.slots);
        else {
          const rounds = run.history.length;
          run.runShift();
          const ended = run.history[rounds];
          if (ended !== undefined) {
            recorder.round({ round: ended.round, isBoss: ended.isBoard, target: ended.target, score: ended.sales, won: ended.won, cash: ended.capital });
          }
        }
        continue;
      }

      const decision = bot.shopTurn(run);
      switch (decision.kind) {
        case 'buy': {
          const reason = run.whyCannotBuy(decision.offer, decision.target);
          if (reason !== null) fail(`illegal buy: ${reason}`);
          const offer = run.buy(decision.offer, decision.target);
          recorder.purchase({ round: run.round, ...offerRecord(offer) });
          break;
        }
        case 'sellFixture':
          if (run.whyCannotSellFixture(decision.slot) !== null) fail('illegal sell');
          run.sellFixture(decision.slot);
          break;
        case 'sellCard':
          if (run.whyCannotSellCard(decision.deckCard) !== null) fail('illegal sell');
          run.sellCard(decision.deckCard);
          break;
        case 'move':
          if (run.whyCannotMove(decision.from, decision.to) !== null) fail('illegal move');
          run.moveFixture(decision.from, decision.to);
          break;
        case 'reroll':
          if (run.whyCannotReroll() !== null) fail('illegal reroll');
          run.reroll();
          recordOffers();
          break;
        case 'leave':
          run.continueToNextRound();
          break;
      }
    }
    return recorder.finish({ won: run.phase === 'won', roundReached: run.round, archetype: bot.archetypeOf(run) });
  }
}

function shiftReason(run: ThroughputRun, decision: ReturnType<ThroughputBot['shiftTurn']>): string | null {
  switch (decision.kind) {
    case 'load':
      return run.whyCannotLoad(decision.placements);
    case 'retool':
      return run.whyCannotRetool(decision.hand);
    case 'scrap':
      return run.whyCannotScrap(decision.slots);
    case 'run':
      return run.whyCannotRun();
  }
}

/** Impact reports group by item, so card offers drop their Category. */
function offerRecord(offer: Offer): { id: string; kind: string; price: number } {
  return { id: offer.def.id, kind: offer.kind, price: offer.price };
}
