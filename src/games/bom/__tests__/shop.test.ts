import { describe, expect, it } from 'vitest';
import { Rng } from '../../../engine/rng';
import { BLUEPRINTS, FACILITIES, STARTING_BLUEPRINTS, defaultBomConfig } from '../content';
import { BomShop } from '../rules';
import type { BomOffer, BomRun, RackOffer } from '../rules';
import { clearRound, flatTargets, runWith } from './helpers';

const context = { ownedBlueprints: new Set(STARTING_BLUEPRINTS), ownedFacilities: new Set<string>(), guaranteeUncommon: false };

function rackRolls(n: number, guarantee = false): RackOffer[] {
  const shop = new BomShop(defaultBomConfig().shop, BLUEPRINTS, FACILITIES, new Rng(7));
  const rolls: RackOffer[] = [];
  for (let i = 0; i < n; i++) {
    shop.restock({ ...context, guaranteeUncommon: guarantee });
    rolls.push(...(shop.offers.slice(0, 3).filter((o): o is RackOffer => o !== null && o.kind !== 'part')));
  }
  return rolls;
}

const rarityOf = (offer: RackOffer): string =>
  offer.kind === 'facility' ? offer.facility.rarity : offer.kind === 'blueprint' ? offer.blueprint.rarity : 'none';

function toShop(overrides = {}, seed = 1): BomRun {
  const run = runWith({ targets: flatTargets(1), ...overrides }, seed);
  clearRound(run);
  return run;
}

describe('BoM shop stock', () => {
  it('offers 3 Rack slots and 2 Parts Counter slots', () => {
    const run = toShop();
    expect(run.shop.offers).toHaveLength(5);
    expect(run.shop.offers.slice(3).every((o) => o?.kind === 'part')).toBe(true);
  });

  it('rolls Facility 55% / Blueprint 30% / R&D 15%', () => {
    const rolls = rackRolls(1500);
    const share = (kind: string) => rolls.filter((r) => r.kind === kind).length / rolls.length;
    expect(share('facility')).toBeCloseTo(0.55, 1);
    expect(share('blueprint')).toBeCloseTo(0.3, 1);
    expect(share('rnd')).toBeCloseTo(0.15, 1);
  });

  it('rolls rarity Common 70% / Uncommon 25% / Rare 5%', () => {
    const rolls = rackRolls(1500).filter((r) => r.kind !== 'rnd');
    const share = (rarity: string) => rolls.filter((r) => rarityOf(r) === rarity).length / rolls.length;
    expect(share('common')).toBeCloseTo(0.7, 1);
    expect(share('uncommon')).toBeCloseTo(0.25, 1);
    expect(share('rare')).toBeGreaterThan(0.02);
    expect(share('rare')).toBeLessThan(0.09);
  });

  it('never offers owned blueprints, starters, or the same item twice in one visit', () => {
    const shop = new BomShop(defaultBomConfig().shop, BLUEPRINTS, FACILITIES, new Rng(3));
    for (let i = 0; i < 300; i++) {
      shop.restock({ ...context, ownedBlueprints: new Set([...STARTING_BLUEPRINTS, 'kettle']), ownedFacilities: new Set(['lean-line']) });
      const ids = shop.offers.flatMap((o) => (o?.kind === 'facility' ? [o.facility.id] : o?.kind === 'blueprint' ? [o.blueprint.id] : []));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('kettle');
      expect(ids).not.toContain('lean-line');
      for (const id of STARTING_BLUEPRINTS) expect(ids).not.toContain(id);
    }
  });

  it('after a Boss clear, the first Rack slot is an Uncommon-or-better Facility or Blueprint', () => {
    const shop = new BomShop(defaultBomConfig().shop, BLUEPRINTS, FACILITIES, new Rng(9));
    for (let i = 0; i < 300; i++) {
      shop.restock({ ...context, guaranteeUncommon: true });
      const first = shop.offers[0] as RackOffer;
      expect(['uncommon', 'rare']).toContain(rarityOf(first));
    }
  });

  it('Parts Counter: grade 3–5 (Paint 2–3), $3, Premium 25% for +$1', () => {
    const shop = new BomShop(defaultBomConfig().shop, BLUEPRINTS, FACILITIES, new Rng(4));
    const parts: Extract<BomOffer, { kind: 'part' }>[] = [];
    for (let i = 0; i < 1000; i++) {
      shop.restock(context);
      for (const o of shop.offers) if (o?.kind === 'part') parts.push(o);
    }
    for (const { part, cost } of parts) {
      const [low, high] = part.category === 'paint' ? [2, 3] : [3, 5];
      expect(part.grade).toBeGreaterThanOrEqual(low);
      expect(part.grade).toBeLessThanOrEqual(high);
      expect(cost).toBe(part.premium ? 4 : 3);
    }
    expect(parts.filter((p) => p.part.premium).length / parts.length).toBeCloseTo(0.25, 1);
  });
});

describe('BoM shop actions', () => {
  it('reroll costs $3 then +$1 each time, resetting next visit', () => {
    const run = toShop({ startingCash: 30 });
    const before = run.wallet.cash;
    run.reroll();
    run.reroll();
    expect(run.wallet.cash).toBe(before - 3 - 4);
    expect(run.shop.rerollCost).toBe(5);
    run.leaveShop();
    clearRound(run);
    expect(run.shop.rerollCost).toBe(3);
  });

  it('buys Facilities, Blueprints and Counter parts', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = toShop({ startingCash: 100 }, seed);
      run.shop.offers.forEach((offer, slot) => {
        if (offer === null || offer.kind === 'rnd' || run.whyCannotBuy(slot) !== null) return;
        const deckSize = run.deck.allCards.length;
        run.buy(slot);
        if (offer.kind === 'facility') expect(run.facilities).toContain(offer.facility);
        if (offer.kind === 'blueprint') expect(run.blueprint(offer.blueprint.id)).toBeDefined();
        if (offer.kind === 'part') expect(run.deck.allCards).toHaveLength(deckSize + 1);
      });
    }
  });

  it('R&D Grants need a target and, for Products, a choice', () => {
    for (let seed = 1; seed < 300; seed++) {
      const run = toShop({ startingCash: 100 }, seed);
      const slot = run.shop.offers.findIndex((o) => o?.kind === 'rnd');
      if (slot < 0) continue;
      expect(run.whyCannotBuy(slot)).toMatch(/needs a blueprint/);
      expect(run.whyCannotBuy(slot, { blueprintId: 'gizmo' })).toMatch(/scale or premium/);
      expect(run.whyCannotBuy(slot, { blueprintId: 'motor', choice: 'scale' })).toMatch(/is a Sub/);
      run.buy(slot, { blueprintId: 'gizmo', choice: 'premium' });
      expect(run.blueprint('gizmo')?.premiumLevels).toBe(1);
      return;
    }
    throw new Error('no R&D offer found');
  });

  it('enforces slot limits', () => {
    const run = toShop({ startingCash: 100, startingFacilities: ['lean-line', 'paint-shop', 'stockroom', 'flagship-store', 'outlet-mall'] });
    const facilitySlot = run.shop.offers.findIndex((o) => o?.kind === 'facility');
    if (facilitySlot >= 0) expect(run.whyCannotBuy(facilitySlot)).toMatch(/Facility slots full/);
  });

  it('sells for half cost; starters sell for $0; the last Product cannot be sold', () => {
    const run = toShop({ startingFacilities: ['patent-office'] });
    const cash = run.wallet.cash;
    expect(run.sell('patent-office')).toBe(4);
    expect(run.sell('gizmo')).toBe(0);
    run.sell('flatpack');
    expect(run.whyCannotSell('desk-fan')).toBe("You can't sell your last Product");
    expect(run.wallet.cash).toBe(cash + 4);
  });

  it('Shred destroys one deck part for $2, once per visit', () => {
    const run = toShop({ startingCash: 10 });
    const size = run.deck.allCards.length;
    const part = run.shred('chip', 1);
    expect(part).toMatchObject({ category: 'chip', grade: 1 });
    expect(run.deck.allCards).toHaveLength(size - 1);
    expect(run.whyCannotShred('chip', 1)).toMatch(/once per shop visit/);
    expect(run.wallet.cash).toBe(10 + 3 + 3 + 2 - 2); // payout: reward 3, unused Builds 3, interest 2
  });
});
