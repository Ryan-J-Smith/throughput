import { describe, expect, it } from 'vitest';
import { SimulationError } from '../../../sim/simulate';
import { STARTING_BLUEPRINTS, defaultBomConfig } from '../content';
import { makePart } from '../model';
import type { OwnedBlueprint } from '../model';
import type { BomRun } from '../rules';
import { ASSEMBLY_CHAIN, BomBot, BomScenario, GREEDY, StrategyBot, bomBots, classifyRun, planProduct, planShip, simulateBom } from '../sim';
import type { BomShopDecision, BuildDecision, Strategy } from '../sim';
import { clearRound, config, deckOf, flatTargets, runWith, shipAnything } from './helpers';

const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

describe('simulateBom', () => {
  for (const bot of bomBots()) {
    it(`${bot.name} plays legal, deterministic runs`, () => {
      const first = simulateBom(defaultBomConfig, bot, seeds);
      const again = simulateBom(defaultBomConfig, bot, seeds);
      expect(again).toEqual(first);
      for (const run of first) {
        expect(run.bot).toBe(bot.name);
        expect(run.rounds.map((r) => r.round)).toEqual(Array.from({ length: run.roundReached }, (_, i) => i + 1));
        expect(run.won).toBe(run.roundReached === 12 && run.rounds.every((r) => r.won));
        // Every purchase was offered in the same shop visit.
        for (const p of run.purchases) {
          expect(run.offers.some((o) => o.round === p.round && o.id === p.id && o.kind === p.kind)).toBe(true);
        }
      }
    });
  }

  it('wraps an illegal decision in a SimulationError naming the seed', () => {
    class ScrapForever extends BomBot {
      readonly name = 'scrapper';
      override buildTurn(run: BomRun): BuildDecision {
        return { action: 'scrap', parts: run.hand.slice(0, 1) };
      }
      override shopTurn(): BomShopDecision {
        return { action: 'leave' };
      }
    }
    expect(() => simulateBom(defaultBomConfig, new ScrapForever(), [7])).toThrow(SimulationError);
    expect(() => simulateBom(defaultBomConfig, new ScrapForever(), [7])).toThrow(/seed 7/);
  });
});

describe('BomScenario', () => {
  it('runs every bot, or only the named ones', () => {
    const scenario = new BomScenario('bom', 'test', defaultBomConfig, bomBots());
    expect(scenario.botNames).toEqual(['greedy', 'bargain-bin', 'assembly-chain', 'market-maker']);
    expect(new Set(scenario.simulate([1, 2]).map((r) => r.bot)).size).toBe(4);
    expect(scenario.simulate([1, 2], ['greedy']).map((r) => r.bot)).toEqual(['greedy', 'greedy']);
  });
});

describe('StrategyBot', () => {
  it('fabricates a missing Sub part before settling for a weak Ship', () => {
    const deck = deckOf(['shell', 4], ['chip', 4], ['bolt', 4], ['bolt', 1], ['chip', 1], ['shell', 1], ['paint', 1], ['paint', 1]);
    const run = runWith({ startingDeck: deck });
    const decision = new StrategyBot(GREEDY).buildTurn(run);
    expect(decision.action).toBe('fab');
    if (decision.action === 'fab') expect(decision.parts.map((p) => `${p.category} ${p.grade}`)).toEqual(['chip 4', 'bolt 4']);
  });

  it('uses Bench parts only for the recipe, never as filler', () => {
    const deck = deckOf(['shell', 4], ['shell', 3], ['chip', 2], ['chip', 1], ['bolt', 2], ['bolt', 1], ['paint', 1], ['paint', 1]);
    const run = runWith({ startingDeck: deck, startingBench: () => [makePart('motor', 10, { fabricated: true }), makePart('motor', 8, { fabricated: true })] });
    const fan = run.blueprint('desk-fan');
    const quote = fan === undefined ? null : planShip(run, fan, [...run.hand, ...run.bench]);
    expect(quote?.parts.filter((p) => p.category === 'motor').map((p) => p.grade)).toEqual([10]);
  });

  it('plans a Fabricate before the Ship, projecting the part it will make', () => {
    const deck = deckOf(['shell', 4], ['chip', 4], ['bolt', 4], ['bolt', 1], ['chip', 1], ['shell', 1], ['paint', 1], ['paint', 1]);
    const run = runWith({ startingDeck: deck });
    const plan = planProduct(run, run.blueprint('desk-fan') as OwnedBlueprint);
    expect(plan?.builds).toBe(2);
    expect(plan?.fabs[0]?.inputs.map((p) => `${p.category} ${p.grade}`)).toEqual(['chip 4', 'bolt 4']);
    expect(plan?.quote.parts.find((p) => p.category === 'motor')?.grade).toBe(16);
  });

  it('clears the target without spending Bench WIP when it can', () => {
    const run = runWith({ targets: flatTargets(1), startingBench: () => [makePart('motor', 10, { fabricated: true })] });
    const decision = new StrategyBot(ASSEMBLY_CHAIN).buildTurn(run);
    expect(decision.action).toBe('ship');
    if (decision.action === 'ship') expect(decision.parts.some((p) => run.bench.includes(p))).toBe(false);
  });

  it('before a revealed Warehouse Fire, Ships for cash instead of stocking the Bench', () => {
    const deck = deckOf(['shell', 4], ['chip', 4], ['bolt', 4], ['shell', 3], ['chip', 3], ['bolt', 3], ['shell', 2], ['chip', 2], ['bolt', 2], ['paint', 1]);
    const inBigOvertime = (seed: number): BomRun => {
      const run = runWith({ targets: flatTargets(1), startingDeck: deck }, seed);
      clearRound(run);
      run.leaveShop();
      shipAnything(run);
      return run;
    };
    const fire = Array.from({ length: 50 }, (_, i) => i + 1).find((seed) => runWith({}, seed).roundInfo(2).disruption?.id === 'warehouse-fire');
    const calm = Array.from({ length: 50 }, (_, i) => i + 1).find((seed) => runWith({}, seed).roundInfo(2).disruption?.id !== 'warehouse-fire');
    if (fire === undefined || calm === undefined) throw new Error('no seeds');
    const burning = inBigOvertime(fire);
    expect(burning.phase).toBe('overtime');
    expect(new StrategyBot(ASSEMBLY_CHAIN).buildTurn(burning).action).toBe('ship');
    expect(new StrategyBot(ASSEMBLY_CHAIN).buildTurn(inBigOvertime(calm)).action).toBe('fab');
  });

  it('sells an idle Sub to make room for a wanted Blueprint', () => {
    const strategy: Strategy = { ...GREEDY, name: 'kettle-fan', wants: ['kettle'], buyAnything: false };
    for (let seed = 1; seed <= 500; seed++) {
      const run = runWith({ targets: flatTargets(1), startingCash: 50, startingBlueprints: [...STARTING_BLUEPRINTS, 'frame', 'board'] }, seed);
      clearRound(run);
      const slot = run.shop.offers.findIndex((o) => o?.kind === 'blueprint' && o.blueprint.id === 'kettle');
      if (slot < 0) continue;
      const bot = new StrategyBot(strategy);
      expect(bot.shopTurn(run)).toEqual({ action: 'sell', id: 'frame' });
      run.sell('frame');
      expect(bot.shopTurn(run)).toEqual({ action: 'buy', slot });
      return;
    }
    throw new Error('no Kettle offer found');
  });

  it('labels runs by the archetype whose key facilities it owns', () => {
    expect(classifyRun(runWith())).toBe('unbuilt');
    expect(classifyRun(runWith({ startingFacilities: ['paint-shop'] }))).toBe('unbuilt');
    expect(classifyRun(runWith({ startingFacilities: ['paint-shop', 'flagship-store', 'stockroom'] }))).toBe('bargain-bin');
    expect(classifyRun(runWith({ startingFacilities: ['precision-tooling', 'kitting-station'] }))).toBe('assembly-chain');
  });
});

describe('tuned targets', () => {
  it('grow at least 20× from Q1 Small to the Q4 Boss', () => {
    const targets = config().targets;
    expect((targets[3]?.[2] ?? 0) / (targets[0]?.[0] ?? 1)).toBeGreaterThanOrEqual(20);
  });
});
