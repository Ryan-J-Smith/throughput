import { describe, expect, it } from 'vitest';
import { SimulationError } from '../../../sim/simulate';
import { defaultBomConfig } from '../content';
import { makePart } from '../model';
import type { BomRun } from '../rules';
import { BomBot, BomScenario, GREEDY, StrategyBot, bomBots, classifyRun, planShip, simulateBom } from '../sim';
import type { BomShopDecision, BuildDecision } from '../sim';
import { config, deckOf, runWith } from './helpers';

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

  it('labels runs by the archetype whose key facilities it owns', () => {
    expect(classifyRun(runWith())).toBe('unbuilt');
    expect(classifyRun(runWith({ startingFacilities: ['paint-shop'] }))).toBe('unbuilt');
    expect(classifyRun(runWith({ startingFacilities: ['paint-shop', 'flagship-store', 'stockroom'] }))).toBe('bargain-bin');
    expect(classifyRun(runWith({ startingFacilities: ['precision-tooling', 'kitting-station'] }))).toBe('assembly-chain');
  });
});

describe('tuned targets', () => {
  it('keep the doc Q1 targets', () => {
    expect(config().targets[0]).toEqual([120, 180, 240]);
  });
});
