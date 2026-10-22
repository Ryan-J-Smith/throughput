import type { Wallet } from '../../../engine/economy';
import { Registry } from '../../../engine/registry';
import type { Rng } from '../../../engine/rng';
import { Shop } from '../../../engine/shop';
import { CONTRACTS, FIXTURES, SHOP_CARDS } from '../content';
import type { ThroughputConfig } from '../content';
import { CATEGORIES, CATEGORY_CODE } from '../model';
import type { CardDef, Category, ContractDef, FixtureDef, Rarity } from '../model';

export type Offer =
  | { readonly kind: 'fixture'; readonly def: FixtureDef; readonly price: number }
  | { readonly kind: 'card'; readonly def: CardDef; readonly category: Category; readonly price: number }
  | { readonly kind: 'contract'; readonly def: ContractDef; readonly price: number };

type CardOfferDef = { readonly id: string; readonly rarity: 'common'; readonly price: number; readonly card: CardDef; readonly category: Category };
type ContractOfferDef = { readonly id: string; readonly rarity: 'common'; readonly price: number; readonly weight?: number; readonly contract: ContractDef };

/** Chance of each Fixture rarity per offer; split evenly among the Fixtures of that rarity. */
// Playtest 2: rares were near-unseen (Flagship 0 offers in 8 runs), so 70/25/5 became 60/30/10.
const FIXTURE_ODDS: Readonly<Record<Rarity, number>> = { common: 60, uncommon: 30, rare: 10 };

/**
 * Each visit offers 2 Fixtures, 2 Cards and 1 Contract. Built on three engine Shops (one per
 * kind) so the mix is fixed; the reroll cost is shared and tracked here.
 */
export class ThroughputShop {
  private readonly fixtures: Shop<FixtureDef>;
  private readonly cards: Shop<CardOfferDef>;
  private readonly contracts: Shop<ContractOfferDef>;
  private readonly config: ThroughputConfig;
  private rerollCost_: number;

  constructor(config: ThroughputConfig, rng: Rng) {
    this.config = config;
    this.rerollCost_ = config.rerollBaseCost;
    const fixtureRegistry = new Registry<FixtureDef>(fixtureWeights());
    FIXTURES.forEach((def) => fixtureRegistry.register(def));
    const cardRegistry = new Registry<CardOfferDef>({ common: 1 });
    for (const card of SHOP_CARDS) {
      for (const category of CATEGORIES) {
        cardRegistry.register({ id: `${card.id}-${CATEGORY_CODE[category]}`, rarity: 'common', price: card.price, card, category });
      }
    }
    const contractRegistry = new Registry<ContractOfferDef>({ common: 1 });
    CONTRACTS.forEach((contract) =>
      contractRegistry.register({ id: contract.id, rarity: 'common', price: contract.price, ...(contract.weight === undefined ? {} : { weight: contract.weight }), contract }),
    );

    const shopConfig = { rerollBaseCost: 0, rerollCostIncrement: 0, sellRate: config.sellRate };
    this.fixtures = new Shop({ ...shopConfig, slots: 2, pools: [{ id: 'fixture', registry: fixtureRegistry, weight: 1 }] }, rng.fork('fixtures'));
    this.cards = new Shop({ ...shopConfig, slots: 2, pools: [{ id: 'card', registry: cardRegistry, weight: 1 }] }, rng.fork('cards'));
    this.contracts = new Shop({ ...shopConfig, slots: 1, pools: [{ id: 'contract', registry: contractRegistry, weight: 1 }] }, rng.fork('contracts'));
  }

  get rerollCost(): number {
    return this.rerollCost_;
  }

  /** Offers 1–2 are Fixtures, 3–4 Cards, 5 a Contract; null once bought. */
  get offers(): readonly (Offer | null)[] {
    return [
      ...this.fixtures.offers.map((o): Offer | null => (o === null ? null : { kind: 'fixture', def: o.def, price: o.price })),
      ...this.cards.offers.map((o): Offer | null => (o === null ? null : { kind: 'card', def: o.def.card, category: o.def.category, price: o.price })),
      ...this.contracts.offers.map((o): Offer | null => (o === null ? null : { kind: 'contract', def: o.def.contract, price: o.price })),
    ];
  }

  /** Fresh stock for a shop visit; Contracts the run can't take (`allowed` false) are left out. */
  restock(allowed: (contract: ContractDef) => boolean): void {
    this.rerollCost_ = this.config.rerollBaseCost;
    this.stock(allowed);
  }

  whyCannotReroll(wallet: Wallet): string | null {
    return wallet.canAfford(this.rerollCost_) ? null : `Not enough Capital to reroll (${this.rerollCost_}C)`;
  }

  reroll(wallet: Wallet, allowed: (contract: ContractDef) => boolean): void {
    const reason = this.whyCannotReroll(wallet);
    if (reason !== null) throw new Error(reason);
    wallet.spend(this.rerollCost_);
    this.rerollCost_ += this.config.rerollCostIncrement;
    this.stock(allowed);
  }

  whyCannotBuy(index: number, wallet: Wallet): string | null {
    const offer = this.offers[index];
    if (offer == null) return 'Nothing for sale in that slot';
    return wallet.canAfford(offer.price) ? null : `Not enough Capital (${offer.price}C)`;
  }

  /** Pays for and removes the offer at `index` (0-based over all five). */
  buy(index: number, wallet: Wallet): Offer {
    const offer = this.offers[index];
    const reason = this.whyCannotBuy(index, wallet);
    if (offer == null || reason !== null) throw new Error(reason ?? 'Nothing for sale in that slot');
    if (index < 2) this.fixtures.buy(index, wallet);
    else if (index < 4) this.cards.buy(index - 2, wallet);
    else this.contracts.buy(index - 4, wallet);
    return offer;
  }

  private stock(allowed: (contract: ContractDef) => boolean): void {
    this.fixtures.restock();
    this.cards.restock();
    this.contracts.restock((def) => allowed(def.contract));
  }
}

function fixtureWeights(): Record<Rarity, number> {
  const count = (rarity: Rarity) => FIXTURES.filter((f) => f.rarity === rarity).length;
  return {
    common: FIXTURE_ODDS.common / count('common'),
    uncommon: FIXTURE_ODDS.uncommon / count('uncommon'),
    rare: FIXTURE_ODDS.rare / count('rare'),
  };
}
