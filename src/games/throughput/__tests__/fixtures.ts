import { BOSSES, DEFAULT_CONFIG, fixtureById } from '../content';
import type { ThroughputConfig } from '../content';
import { CATEGORIES } from '../model';
import type { BoardBoss, Card, CardDef, Category, Fixture, GrantLevels, TrendStage } from '../model';
import type { LineSlot, ShiftContext, Trends } from '../rules';

let uid = 1000;

export function card(def: CardDef, category: Category, extra: Partial<Pick<Card, 'upgrades' | 'growth' | 'paid'>> = {}): Card {
  return { uid: uid++, def, category, paid: 0, upgrades: 0, growth: 0, ...extra };
}

export function fixture(id: string, roundsOwned = 0): Fixture {
  const def = fixtureById(id);
  return { uid: uid++, def, paid: def.price, roundsOwned };
}

export function slot(fixtureValue: Fixture | null, cardValue: Card | null): LineSlot {
  return { fixture: fixtureValue, card: cardValue };
}

export function trends(overrides: Partial<Record<Category, TrendStage>> = {}): Trends {
  const out = {} as Record<Category, TrendStage>;
  for (const c of CATEGORIES) out[c] = overrides[c] ?? 'neutral';
  return out;
}

/** Demand left per Category: the starting Demand (20) unless overridden. */
export function demandLeft(overrides: Partial<Record<Category, number>> = {}): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) out[c] = overrides[c] ?? DEFAULT_CONFIG.demand.start;
  return out;
}

/** R&D Grant levels per Category: none unless overridden. */
export function grants(overrides: Partial<Record<Category, Partial<GrantLevels>>> = {}): Record<Category, GrantLevels> {
  const out = {} as Record<Category, GrantLevels>;
  for (const c of CATEGORIES) out[c] = { scale: 0, premium: 0, ...overrides[c] };
  return out;
}

export function context(overrides: Partial<ShiftContext> = {}): ShiftContext {
  return { config: DEFAULT_CONFIG, trends: trends(), demand: demandLeft(), demandLeft: demandLeft(), grants: grants(), hotPipsLeft: 2, stored: 0, boss: null, ...overrides };
}

export function boss(id: string): BoardBoss {
  const found = BOSSES.find((b) => b.id === id);
  if (found === undefined) throw new Error(`no boss ${id}`);
  return found;
}

/** Default config with easy targets, for driving whole runs in tests. */
export function easyConfig(overrides: Partial<ThroughputConfig> = {}): ThroughputConfig {
  return { ...DEFAULT_CONFIG, targets: [10, 10, 10], ...overrides };
}
