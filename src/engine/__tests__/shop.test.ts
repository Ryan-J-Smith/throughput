import { describe, expect, it } from 'vitest';
import { Wallet } from '../economy';
import { EngineError } from '../errors';
import { Registry } from '../registry';
import type { ContentDef } from '../registry';
import { Rng } from '../rng';
import { Shop } from '../shop';
import type { ShopConfig } from '../shop';

type Item = ContentDef & { readonly pool: string };
const item = (id: string, pool: string, price = 3): Item => ({ id, pool, rarity: 'common', price });

function registry(pool: string, ids: string[]): Registry<Item> {
  const r = new Registry<Item>({ common: 1 });
  for (const id of ids) r.register(item(id, pool, 3));
  return r;
}

function config(overrides: Partial<ShopConfig<Item>> = {}): ShopConfig<Item> {
  return {
    slots: 3,
    pools: [
      { id: 'cards', registry: registry('cards', ['c1', 'c2', 'c3', 'c4']), weight: 1 },
      { id: 'mods', registry: registry('mods', ['m1', 'm2', 'm3', 'm4']), weight: 1 },
    ],
    rerollBaseCost: 5,
    rerollCostIncrement: 2,
    sellRate: 0.5,
    ...overrides,
  };
}

const ids = (shop: Shop<Item>): (string | undefined)[] => shop.offers.map((o) => o?.def.id);

describe('Shop', () => {
  it('fills every slot with distinct offers drawn from the pools', () => {
    const shop = new Shop(config(), new Rng(1));
    shop.restock();
    expect(shop.offers).toHaveLength(3);
    const offered = ids(shop);
    expect(new Set(offered).size).toBe(3);
    shop.offers.forEach((offer, slot) => {
      expect(offer?.slot).toBe(slot);
      expect(offer?.pool).toBe(offer?.def.pool);
      expect(offer?.price).toBe(3);
    });
  });

  it('is deterministic for a seed', () => {
    const a = new Shop(config(), new Rng(8));
    const b = new Shop(config(), new Rng(8));
    a.restock();
    b.restock();
    expect(ids(a)).toEqual(ids(b));
  });

  it('respects pool weights and filters', () => {
    const onlyMods = new Shop(config({ pools: [...config().pools.map((p) => ({ ...p, weight: p.id === 'mods' ? 1 : 0 }))] }), new Rng(2));
    onlyMods.restock((def) => def.id !== 'm1');
    for (const offer of onlyMods.offers) {
      expect(offer?.pool).toBe('mods');
      expect(offer?.def.id).not.toBe('m1');
    }
  });

  it('leaves slots empty when pools run out', () => {
    const shop = new Shop(config({ slots: 3, pools: [{ id: 'mods', registry: registry('mods', ['m1']), weight: 1 }] }), new Rng(3));
    shop.restock();
    expect(ids(shop)).toEqual(['m1', undefined, undefined]);
  });

  it('reroll() charges an escalating cost that resets on restock', () => {
    const shop = new Shop(config(), new Rng(4));
    const wallet = new Wallet(20);
    shop.restock();
    shop.reroll(wallet);
    expect(wallet.cash).toBe(15);
    expect(shop.rerollCost).toBe(7);
    shop.reroll(wallet);
    expect(wallet.cash).toBe(8);
    expect(shop.rerollCost).toBe(9);
    expect(shop.whyCannotReroll(wallet)).not.toBeNull();
    expect(() => shop.reroll(wallet)).toThrow(EngineError);
    shop.restock();
    expect(shop.rerollCost).toBe(5);
  });

  it('restock() keeps the offers in `keep` slots, and the new offers never repeat them', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const shop = new Shop(config(), new Rng(seed));
      shop.restock();
      const held = shop.offers[1];
      for (let i = 0; i < 10; i++) {
        shop.restock(undefined, [1]);
        expect(shop.offers[1]).toBe(held);
        expect(ids(shop).filter((id) => id === held?.def.id)).toHaveLength(1);
      }
    }
    // A kept slot that was bought out is filled as usual.
    const shop = new Shop(config(), new Rng(1));
    shop.restock();
    shop.buy(1, new Wallet(10));
    shop.restock(undefined, [1]);
    expect(shop.offers[1]).not.toBeNull();
  });

  it('buy() charges the price and empties the slot', () => {
    const shop = new Shop(config(), new Rng(5));
    const wallet = new Wallet(4);
    shop.restock();
    const offer = shop.buy(0, wallet);
    expect(offer.slot).toBe(0);
    expect(wallet.cash).toBe(1);
    expect(shop.offers[0]).toBeNull();
    expect(shop.whyCannotBuy(0, wallet)).not.toBeNull();
    expect(shop.whyCannotBuy(1, wallet)).toBe('Not enough cash');
    expect(() => shop.buy(1, wallet)).toThrow(EngineError);
  });

  it('sellValue() applies the sell rate, floored', () => {
    const shop = new Shop(config(), new Rng(6));
    expect(shop.sellValue(5)).toBe(2);
    expect(shop.sellValue(6)).toBe(3);
  });

  it('rejects invalid slot counts', () => {
    expect(() => new Shop(config({ slots: -1 }), new Rng(1))).toThrow(EngineError);
  });
});
