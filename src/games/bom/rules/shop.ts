import { EngineError } from '../../../engine/errors';
import type { Rng } from '../../../engine/rng';
import { makePart } from '../model';
import type { BlueprintDef, Facility, Part, Rarity } from '../model';
import type { BomShopConfig } from './config';

export type RackOffer =
  | { readonly kind: 'facility'; readonly facility: Facility; readonly cost: number }
  | { readonly kind: 'blueprint'; readonly blueprint: BlueprintDef; readonly cost: number }
  | { readonly kind: 'rnd'; readonly cost: number };

/** A Parts Counter offer; the part joins the deck when bought. */
export type CounterOffer = { readonly kind: 'part'; readonly part: Part; readonly cost: number };

export type BomOffer = RackOffer | CounterOffer;

/** What the shop must know about the player to stock it. */
export type StockContext = {
  readonly ownedBlueprints: ReadonlySet<string>;
  readonly ownedFacilities: ReadonlySet<string>;
  /** After a Boss clear the first Rack slot is an Uncommon-or-better Facility or Blueprint. */
  readonly guaranteeUncommon: boolean;
};

type ShopRarity = Exclude<Rarity, 'starter'>;
const RARITIES: readonly ShopRarity[] = ['common', 'uncommon', 'rare'];

/** One shop visit's stock: Rack slots first, then Parts Counter slots, plus Shred and rerolls. */
export class BomShop {
  private readonly config: BomShopConfig;
  private readonly blueprints: readonly BlueprintDef[];
  private readonly facilities: readonly Facility[];
  private readonly rng: Rng;
  private offers_: (BomOffer | null)[] = [];
  private rerollCost_: number;
  private shredUsed_ = false;

  constructor(config: BomShopConfig, blueprints: readonly BlueprintDef[], facilities: readonly Facility[], rng: Rng) {
    this.config = config;
    this.blueprints = blueprints;
    this.facilities = facilities;
    this.rng = rng;
    this.rerollCost_ = config.rerollCost;
  }

  /** Rack slots (1..rackSlots) then Counter slots; null = bought or empty. */
  get offers(): readonly (BomOffer | null)[] {
    return this.offers_;
  }

  get rerollCost(): number {
    return this.rerollCost_;
  }

  get shredUsed(): boolean {
    return this.shredUsed_;
  }

  /** Fresh stock for a new visit; resets the reroll cost and Shred. */
  restock(context: StockContext): void {
    this.rerollCost_ = this.config.rerollCost;
    this.shredUsed_ = false;
    this.generate(context);
  }

  /** New Rack and Counter stock; the next reroll costs more. The Boss guarantee does not repeat. */
  reroll(context: StockContext): void {
    this.rerollCost_ += this.config.rerollStep;
    this.generate({ ...context, guaranteeUncommon: false });
  }

  /** Removes and returns the offer in `slot` (0-based). */
  take(slot: number): BomOffer {
    const offer = this.offers_[slot];
    if (offer == null) throw new EngineError(`No offer in slot ${slot + 1}`);
    this.offers_[slot] = null;
    return offer;
  }

  markShredUsed(): void {
    this.shredUsed_ = true;
  }

  private generate(context: StockContext): void {
    this.offers_ = [];
    const inRack = new Set<string>();
    for (let slot = 0; slot < this.config.rackSlots; slot++) {
      this.offers_.push(this.rollRack(context, inRack, context.guaranteeUncommon && slot === 0));
    }
    for (let slot = 0; slot < this.config.counterSlots; slot++) this.offers_.push(this.rollCounter());
  }

  private rollRack(context: StockContext, inRack: Set<string>, guaranteed: boolean): RackOffer | null {
    const rarities = guaranteed ? RARITIES.filter((r) => r !== 'common') : RARITIES;
    const facilities = this.facilities.filter((f) => !context.ownedFacilities.has(f.id) && !inRack.has(f.id));
    const blueprints = this.blueprints.filter(
      (b) => b.rarity !== 'starter' && !context.ownedBlueprints.has(b.id) && !inRack.has(b.id),
    );
    const has = (items: readonly { rarity: Rarity }[]): boolean => items.some((i) => rarities.includes(i.rarity as ShopRarity));
    const weights = this.config.rackWeights;
    const kinds = [
      ...(has(facilities) ? [{ kind: 'facility' as const, weight: weights.facility }] : []),
      ...(has(blueprints) ? [{ kind: 'blueprint' as const, weight: weights.blueprint }] : []),
      ...(guaranteed ? [] : [{ kind: 'rnd' as const, weight: weights.rnd }]),
    ].filter((k) => k.weight > 0);
    if (kinds.length === 0) return null;
    const { kind } = this.rng.weightedPick(kinds, (k) => k.weight);
    if (kind === 'rnd') return { kind, cost: this.config.rndCost };
    if (kind === 'facility') {
      const facility = this.pickByRarity(facilities, rarities);
      inRack.add(facility.id);
      return { kind, facility, cost: facility.cost };
    }
    const blueprint = this.pickByRarity(blueprints, rarities);
    inRack.add(blueprint.id);
    return { kind, blueprint, cost: blueprint.cost };
  }

  /** Rolls a rarity (among those with candidates), then a uniform item of that rarity. */
  private pickByRarity<T extends { readonly rarity: Rarity }>(items: readonly T[], allowed: readonly ShopRarity[]): T {
    const available = allowed.filter((r) => items.some((i) => i.rarity === r) && this.config.rarityWeights[r] > 0);
    const rarity = this.rng.weightedPick(available, (r) => this.config.rarityWeights[r]);
    return this.rng.pick(items.filter((i) => i.rarity === rarity));
  }

  private rollCounter(): CounterOffer {
    const category = this.rng.pick(this.config.counterCategories);
    const [low, high] = this.config.counterGrades[category] ?? this.config.counterGrades.default;
    const grade = this.rng.int(low, high);
    const premium = this.rng.next() < this.config.premiumChance;
    const cost = this.config.counterCost + (premium ? this.config.premiumSurcharge : 0);
    return { kind: 'part', part: makePart(category, grade, { premium }), cost };
  }
}
