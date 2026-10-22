import type { Wallet } from '../economy';
import { EngineError } from '../errors';
import type { ContentDef, Registry } from '../registry';
import type { Rng } from '../rng';

/** A source of shop offers; each slot first picks a pool by `weight`, then a definition by rarity. */
export type ShopPool<D extends ContentDef> = {
  readonly id: string;
  readonly registry: Registry<D>;
  readonly weight: number;
};

export type ShopConfig<D extends ContentDef> = {
  /** Number of offer slots per stock. */
  readonly slots: number;
  readonly pools: readonly ShopPool<D>[];
  /** Reroll cost right after a restock. */
  readonly rerollBaseCost: number;
  /** Added to the reroll cost after each reroll. */
  readonly rerollCostIncrement: number;
  /** Fraction of an item's price refunded when sold (floored). */
  readonly sellRate: number;
};

export type ShopOffer<D extends ContentDef> = {
  readonly slot: number;
  readonly pool: string;
  readonly def: D;
  readonly price: number;
};

/** Filter applied when stocking, e.g. to hide modifiers the player already owns. */
export type OfferFilter<D extends ContentDef> = (def: D) => boolean;

/** Randomized shop: weighted offer slots, escalating rerolls, buy and sell pricing. */
export class Shop<D extends ContentDef> {
  private readonly config: ShopConfig<D>;
  private readonly rng: Rng;
  private offers_: (ShopOffer<D> | null)[] = [];
  private rerollCost_: number;

  constructor(config: ShopConfig<D>, rng: Rng) {
    if (!Number.isInteger(config.slots) || config.slots < 0) {
      throw new EngineError(`Shop: invalid slot count ${config.slots}`);
    }
    this.config = config;
    this.rng = rng;
    this.rerollCost_ = config.rerollBaseCost;
  }

  /** Offers by slot; null means the slot is sold out or could not be filled. */
  get offers(): readonly (ShopOffer<D> | null)[] {
    return this.offers_;
  }

  get rerollCost(): number {
    return this.rerollCost_;
  }

  /**
   * Fresh stock for a new shop visit; resets the reroll cost. Slots in `keep` hold their offer (one
   * the player locked, say) and the new offers don't repeat it.
   */
  restock(filter: OfferFilter<D> = () => true, keep: readonly number[] = []): void {
    this.rerollCost_ = this.config.rerollBaseCost;
    this.generate(filter, keep);
  }

  whyCannotReroll(wallet: Wallet): string | null {
    return wallet.canAfford(this.rerollCost_) ? null : 'Not enough cash to reroll';
  }

  /** Pays the reroll cost, replaces every slot, and escalates the next reroll cost. */
  reroll(wallet: Wallet, filter: OfferFilter<D> = () => true): void {
    const reason = this.whyCannotReroll(wallet);
    if (reason !== null) throw new EngineError(reason);
    wallet.spend(this.rerollCost_);
    this.rerollCost_ += this.config.rerollCostIncrement;
    this.generate(filter, []);
  }

  whyCannotBuy(slot: number, wallet: Wallet): string | null {
    const offer = this.offers_[slot];
    if (offer == null) return 'Nothing for sale in that slot';
    if (!wallet.canAfford(offer.price)) return 'Not enough cash';
    return null;
  }

  /** Pays for the offer in `slot`, empties the slot, and returns what was bought. */
  buy(slot: number, wallet: Wallet): ShopOffer<D> {
    const reason = this.whyCannotBuy(slot, wallet);
    if (reason !== null) throw new EngineError(reason);
    const offer = this.offers_[slot] as ShopOffer<D>;
    wallet.spend(offer.price);
    this.offers_[slot] = null;
    return offer;
  }

  /** Cash refunded when selling an item bought at `price`. */
  sellValue(price: number): number {
    return Math.floor(price * this.config.sellRate);
  }

  private generate(filter: OfferFilter<D>, keep: readonly number[]): void {
    const kept = this.offers_.map((offer, slot) => (keep.includes(slot) ? offer : null));
    const taken = new Set<string>(kept.flatMap((offer) => (offer == null ? [] : [offer.def.id])));
    const accept = (def: D): boolean => !taken.has(def.id) && filter(def);
    this.offers_ = [];
    for (let slot = 0; slot < this.config.slots; slot++) {
      const held = kept[slot];
      if (held != null) {
        this.offers_.push(held);
        continue;
      }
      const pools = this.config.pools.filter(
        (pool) => pool.weight > 0 && pool.registry.all().some((def) => accept(def) && pool.registry.weightOf(def) > 0),
      );
      if (pools.length === 0) {
        this.offers_.push(null);
        continue;
      }
      const pool = this.rng.weightedPick(pools, (p) => p.weight);
      const def = pool.registry.pick(this.rng, accept) as D;
      taken.add(def.id);
      this.offers_.push({ slot, pool: pool.id, def, price: def.price });
    }
  }
}
