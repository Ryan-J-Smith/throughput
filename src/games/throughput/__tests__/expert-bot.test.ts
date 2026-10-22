import { describe, expect, it } from 'vitest';
import { Rng } from '../../../engine/rng';
import { ALL_SCENARIOS } from '../../../sim/cli';
import { DEFAULT_CONFIG } from '../content';
import { ThroughputRun } from '../rules';
import { ExpertBot, ThroughputScenario } from '../sim';
import { easyConfig } from './fixtures';

/** The first Year of the default curve and a Q1: long enough for shop visits and a Board. */
const SHORT = { ...DEFAULT_CONFIG, targets: DEFAULT_CONFIG.targets.slice(0, 4) };

function startedBot(run: ThroughputRun): ExpertBot {
  const bot = new ExpertBot();
  bot.beginRun(run, new Rng(run.seed).fork('bot'));
  return bot;
}

describe('ExpertBot', () => {
  it('plays whole runs legally and deterministically', () => {
    const scenario = new ThroughputScenario([new ExpertBot()], SHORT, 500, 'throughput-expert');
    const stats = scenario.simulate([1, 2, 3]);
    expect(stats.map((s) => s.bot)).toEqual(['expert', 'expert', 'expert']);
    for (const run of stats) expect(run.rounds).toHaveLength(run.roundReached);
    expect(scenario.simulate([1, 2, 3])).toEqual(stats);
  });

  it('Retools a hand that cannot sell when the draw pile can fix it, and loads a hand that clears', () => {
    // No opener or refill guarantee, so some seed opens without a Ship; the target is out of reach either way.
    const loose = easyConfig({ openingHandTypes: [], hotOpener: false, shipRefill: false, targets: [500, 500, 500] });
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((s) => !new ThroughputRun(s, loose).hand.some((c) => c.def.stage === 'ship'));
    if (seed === undefined) throw new Error('no seed opens without a Ship');
    const stuck = new ThroughputRun(seed, loose);
    const retool = startedBot(stuck).shiftTurn(stuck);
    expect(retool.kind).toBe('retool');
    if (retool.kind === 'retool') expect(stuck.whyCannotRetool(retool.hand)).toBeNull();

    const easy = new ThroughputRun(1, easyConfig());
    const load = startedBot(easy).shiftTurn(easy);
    expect(load.kind).toBe('load');
    if (load.kind === 'load') expect(easy.whyCannotLoad(load.placements)).toBeNull();
  });

  it('spends Capital in the shop on a legal buy', () => {
    const run = new ThroughputRun(3, { ...SHORT, startingCapital: 60 });
    const bot = startedBot(run);
    for (let guard = 0; run.phase === 'shift' && guard < 100; guard++) {
      const d = bot.shiftTurn(run);
      if (d.kind === 'load') run.load(d.placements);
      else if (d.kind === 'retool') run.retool(d.hand);
      else if (d.kind === 'scrap') run.scrap(d.slots);
      else run.runShift();
    }
    expect(run.phase).toBe('shop');
    const buy = bot.shopTurn(run);
    expect(buy.kind).toBe('buy');
    if (buy.kind === 'buy') expect(run.whyCannotBuy(buy.offer, buy.target)).toBeNull();
  });

  it('runs as its own sim scenario, outside the default roster', () => {
    expect(ALL_SCENARIOS.find((s) => s.name === 'throughput-expert')?.botNames).toEqual(['expert']);
    expect(ALL_SCENARIOS.find((s) => s.name === 'throughput')?.botNames).not.toContain('expert');
  });
});
