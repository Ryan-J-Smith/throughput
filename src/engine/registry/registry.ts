import { EngineError } from '../errors';
import type { Rng } from '../rng';

/** Minimum shape of any registrable content definition. */
export type ContentDef = {
  readonly id: string;
  /** Rarity key; looked up in the registry's rarity weight table. */
  readonly rarity: string;
  /** Shop price. */
  readonly price: number;
  /** Overrides the rarity weight for this definition when set. */
  readonly weight?: number;
};

/** Id-keyed store of content definitions with rarity-weighted random selection. */
export class Registry<D extends ContentDef> {
  private readonly defs = new Map<string, D>();
  private readonly rarityWeights: Readonly<Record<string, number>>;

  constructor(rarityWeights: Readonly<Record<string, number>>) {
    this.rarityWeights = rarityWeights;
  }

  register(def: D): void {
    if (this.defs.has(def.id)) throw new EngineError(`Registry: duplicate id "${def.id}"`);
    this.weightOf(def); // validates the rarity up front
    this.defs.set(def.id, def);
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  get(id: string): D {
    const def = this.defs.get(id);
    if (def === undefined) throw new EngineError(`Registry: unknown id "${id}"`);
    return def;
  }

  /** All definitions in registration order. */
  all(): readonly D[] {
    return [...this.defs.values()];
  }

  weightOf(def: D): number {
    if (def.weight !== undefined) return def.weight;
    const weight = this.rarityWeights[def.rarity];
    if (weight === undefined) throw new EngineError(`Registry: unknown rarity "${def.rarity}"`);
    return weight;
  }

  /**
   * Weighted random definition among those passing `filter`, or undefined if none has
   * positive weight.
   */
  pick(rng: Rng, filter: (def: D) => boolean = () => true): D | undefined {
    const candidates = this.all().filter((def) => filter(def) && this.weightOf(def) > 0);
    if (candidates.length === 0) return undefined;
    return rng.weightedPick(candidates, (def) => this.weightOf(def));
  }
}
