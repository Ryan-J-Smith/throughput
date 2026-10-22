import { Rng } from '../../../engine/rng';
import { SimulationError, RunRecorder } from '../../../sim/simulate';
import type { RunStats } from '../../../sim/simulate';
import { BomRun } from '../rules';
import type { BomConfig, BomOffer } from '../rules';
import type { BomBot } from './bom-bot';

/** Item id and kind for impact reports: facility/blueprint ids, "rnd-grant", and "part:<category>". */
export function offerItem(offer: BomOffer): { id: string; kind: string } {
  switch (offer.kind) {
    case 'facility':
      return { id: offer.facility.id, kind: 'facility' };
    case 'blueprint':
      return { id: offer.blueprint.id, kind: 'blueprint' };
    case 'rnd':
      return { id: 'rnd-grant', kind: 'rnd' };
    case 'part':
      return { id: `part:${offer.part.category}`, kind: 'part' };
  }
}

/** Plays one BoM run per seed with `bot` and records it in the shared RunStats shape. */
export function simulateBom(config: () => BomConfig, bot: BomBot, seeds: readonly number[], maxActions = 500): RunStats[] {
  return seeds.map((seed) => {
    try {
      return simulateOne(new BomRun(config(), seed), bot, seed, maxActions);
    } catch (error) {
      if (error instanceof SimulationError) throw error;
      throw new SimulationError(seed, `${bot.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function phaseOf(run: BomRun): string {
  return run.phase;
}

function simulateOne(run: BomRun, bot: BomBot, seed: number, maxActions: number): RunStats {
  const recorder = new RunRecorder(seed, bot.name);
  bot.beginRun(run, new Rng(seed).fork('bot'));
  const recordOffers = (): void => {
    for (const offer of run.shop.offers) {
      if (offer !== null) recorder.offer({ round: run.round.index + 1, ...offerItem(offer), price: offer.cost });
    }
  };
  const recordRound = (): void => {
    const end = run.lastRoundEnd;
    const r = run.round;
    recorder.round({
      round: r.index + 1,
      isBoss: r.market === 'boss',
      target: r.target,
      score: end?.revenue ?? run.revenue,
      won: end?.cleared ?? false,
      cash: run.wallet.cash,
    });
  };

  while (run.phase !== 'won' && run.phase !== 'lost') {
    for (let actions = 0; phaseOf(run) === 'round' || phaseOf(run) === 'overtime'; actions++) {
      if (actions >= maxActions) throw new SimulationError(seed, `${bot.name} exceeded ${maxActions} round actions`);
      const d = bot.buildTurn(run);
      if (d.action === 'ship') run.ship(d.parts, d.product);
      else if (d.action === 'fab') run.fabricate(d.parts, d.trash);
      else if (d.action === 'scrap') run.scrap(d.parts);
      else run.collect();
    }
    recordRound();
    if (phaseOf(run) !== 'shop') break;
    recordOffers();
    for (let actions = 0; ; actions++) {
      if (actions >= maxActions) throw new SimulationError(seed, `${bot.name} exceeded ${maxActions} shop actions`);
      const d = bot.shopTurn(run);
      if (d.action === 'leave') break;
      if (d.action === 'buy') {
        const offer = run.buy(d.slot, d.target);
        recorder.purchase({ round: run.round.index + 1, ...offerItem(offer), price: offer.cost });
      } else if (d.action === 'sell') run.sell(d.id);
      else if (d.action === 'shred') run.shred(d.category, d.grade);
      else {
        run.reroll();
        recordOffers();
      }
    }
    run.leaveShop();
  }

  return recorder.finish({ won: run.phase === 'won', roundReached: run.round.index + 1, archetype: bot.archetypeOf(run) });
}
