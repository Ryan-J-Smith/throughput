import { StrategyBot } from './strategy-bot';
import type { Strategy } from './strategy-bot';

/** Baseline: buys whatever it can afford, Premium R&D on the starters, never stocks the Bench. */
export const GREEDY: Strategy = {
  name: 'greedy',
  wants: [],
  buyAnything: true,
  rnd: [{ id: 'desk-fan' }, { id: 'flatpack' }, { id: 'gizmo' }],
  counter: [],
  shred: [],
  overtimeFab: false,
  reserve: 0,
  rerolls: 0,
};

/** Tempo (doc §4 "Bargain Bin"): flat Price and Units from cheap commons, Paint-heavy products, spend everything. */
export const BARGAIN_BIN: Strategy = {
  name: 'bargain-bin',
  wants: ['paint-shop', 'flagship-store', 'kettle', 'desk-lamp', 'discount-warehouse', 'product-catalog', 'smartwatch', 'market-research', 'outlet-mall', 'flatpack', 'gizmo'],
  rnd: [{ id: 'kettle' }, { id: 'desk-lamp' }, { id: 'desk-fan' }],
  counter: ['paint', 'shell'],
  shred: [['bolt', 1], ['chip', 1]],
  overtimeFab: true,
  reserve: 0,
  rerolls: 1,
};

/** Slow-burn (doc §4 "Assembly Chain"): Subs and the Bench compound grades into Rare Products. */
export const ASSEMBLY_CHAIN: Strategy = {
  name: 'assembly-chain',
  wants: ['precision-tooling', 'drone', 'e-bike', 'smartwatch', 'stockroom', 'board', 'frame', 'kitting-station', 'patent-office', 'lean-line', 'desk-fan', 'motor'],
  rnd: [{ id: 'motor' }, { id: 'drone' }, { id: 'e-bike' }, { id: 'desk-fan' }],
  counter: ['chip', 'bolt'],
  shred: [['paint', 1], ['paint', 2]],
  overtimeFab: true,
  reserve: 5,
  rerolls: 1,
};

/** Slow-burn (doc §4 "Market Maker"): grow Demand through sell-outs and keep shipping the same Product. */
export const MARKET_MAKER: Strategy = {
  name: 'market-maker',
  wants: ['bookshelf', 'conveyor-belt', 'viral-marketing', 'frame', 'continuous-production', 'discount-warehouse', 'market-research', 'flatpack', 'e-bike', 'desk-fan', 'motor'],
  rnd: [{ id: 'bookshelf', choice: 'scale' }, { id: 'desk-fan', choice: 'scale' }, { id: 'flatpack', choice: 'scale' }],
  counter: ['shell', 'bolt'],
  shred: [['paint', 1], ['chip', 1]],
  overtimeFab: true,
  reserve: 5,
  rerolls: 1,
};

export const BOM_STRATEGIES: readonly Strategy[] = [GREEDY, BARGAIN_BIN, ASSEMBLY_CHAIN, MARKET_MAKER];

/** Fresh bots for every strategy (bots hold per-run state, so scenarios get their own). */
export function bomBots(): StrategyBot[] {
  return BOM_STRATEGIES.map((s) => new StrategyBot(s));
}
