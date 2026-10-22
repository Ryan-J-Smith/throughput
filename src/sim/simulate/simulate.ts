import { Rng } from '../../engine/rng';
import type { Run } from '../../engine/run';
import type { Bot } from '../bots';

export type RunFactory<TCard> = (seed: number) => Run<TCard>;

export type RoundStats = {
  readonly round: number;
  readonly isBoss: boolean;
  readonly target: number;
  readonly score: number;
  /** (score − target) / target; negative when the round was lost. */
  readonly margin: number;
  readonly won: boolean;
  /** Cash after the round's payout. */
  readonly cash: number;
};

/** One shop offer as shown (on restock or after a reroll). */
export type OfferRecord = {
  /** The round just cleared before this shop visit. */
  readonly round: number;
  readonly id: string;
  readonly kind: string;
  readonly price: number;
};

export type PurchaseRecord = {
  /** The round just cleared before this shop visit. */
  readonly round: number;
  readonly id: string;
  readonly kind: string;
  readonly price: number;
};

export type RunStats = {
  readonly seed: number;
  readonly bot: string;
  /** Strategy label from Bot.archetypeOf. */
  readonly archetype: string;
  readonly won: boolean;
  /** Last round played (equals the round count on a win). */
  readonly roundReached: number;
  /** Rounds cleared: roundReached on a win, one less on a loss. */
  readonly roundsCleared: number;
  readonly rounds: readonly RoundStats[];
  readonly offers: readonly OfferRecord[];
  readonly purchases: readonly PurchaseRecord[];
};

export type SimulateOptions = {
  /** Guard against bots that never finish a round or leave the shop. Default 1000. */
  readonly maxActionsPerPhase?: number;
};

/** Raised when a bot makes an illegal decision or loops; carries the seed for reproduction. */
export class SimulationError extends Error {
  readonly seed: number;

  constructor(seed: number, message: string) {
    super(`seed ${seed}: ${message}`);
    this.name = 'SimulationError';
    this.seed = seed;
  }
}

/** Plays one full run per seed with `bot` and records per-round stats. */
export function simulate<TCard>(
  runFactory: RunFactory<TCard>,
  bot: Bot<TCard>,
  seeds: readonly number[],
  options: SimulateOptions = {},
): RunStats[] {
  const maxActions = options.maxActionsPerPhase ?? 1000;
  return seeds.map((seed) => {
    try {
      return simulateOne(runFactory(seed), bot, seed, maxActions);
    } catch (error) {
      if (error instanceof SimulationError) throw error;
      throw new SimulationError(seed, `${bot.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/** Re-reads the phase (actions change it, which TS narrowing can't see). */
function inRound<TCard>(run: Run<TCard>): boolean {
  return run.phase === 'playing';
}

function simulateOne<TCard>(run: Run<TCard>, bot: Bot<TCard>, seed: number, maxActions: number): RunStats {
  const rounds: RoundStats[] = [];
  const purchases: PurchaseRecord[] = [];
  const offers: OfferRecord[] = [];
  const recordOffers = (): void => {
    for (const offer of run.shop.offers) {
      if (offer !== null) offers.push({ round: run.round.number, id: offer.def.id, kind: offer.def.kind, price: offer.price });
    }
  };
  bot.beginRun(run, new Rng(seed).fork('bot'));
  run.start();

  const recordRound = (): void => {
    const { number, isBoss, target } = run.round;
    const score = run.roundScore;
    rounds.push({
      round: number,
      isBoss,
      target,
      score,
      margin: target > 0 ? (score - target) / target : 0,
      won: run.phase !== 'lost',
      cash: run.wallet.cash,
    });
  };

  while (run.phase !== 'won' && run.phase !== 'lost') {
    switch (run.phase) {
      case 'setup':
        throw new SimulationError(seed, 'run did not start');
      case 'roundStart':
        run.startRound();
        for (let actions = 0; inRound(run); actions++) {
          if (actions >= maxActions) throw new SimulationError(seed, `${bot.name} exceeded ${maxActions} round actions`);
          const decision = bot.playTurn(run);
          if (decision.action === 'play') run.play(decision.cards);
          else run.discard(decision.cards);
        }
        recordRound();
        break;
      case 'playing':
        throw new SimulationError(seed, 'unexpected playing phase');
      case 'roundEnd':
        run.enterShop();
        recordOffers();
        break;
      case 'shop':
        for (let actions = 0; ; actions++) {
          if (actions >= maxActions) throw new SimulationError(seed, `${bot.name} exceeded ${maxActions} shop actions`);
          const decision = bot.shopTurn(run);
          if (decision.action === 'leave') break;
          if (decision.action === 'buy') {
            const offer = run.buy(decision.slot);
            purchases.push({ round: run.round.number, id: offer.def.id, kind: offer.def.kind, price: offer.price });
          } else if (decision.action === 'sell') {
            run.sell(decision.modifier);
          } else {
            run.reroll();
            recordOffers();
          }
        }
        run.leaveShop();
        break;
    }
  }

  const won = run.phase === 'won';
  const roundReached = run.round.number;
  return {
    seed,
    bot: bot.name,
    archetype: bot.archetypeOf(run),
    won,
    roundReached,
    roundsCleared: won ? roundReached : roundReached - 1,
    rounds,
    offers,
    purchases,
  };
}
