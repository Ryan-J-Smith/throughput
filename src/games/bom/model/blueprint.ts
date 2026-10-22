import { EngineError } from '../../../engine/errors';
import type { PartCategory } from './part';

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare';

type BlueprintBase = {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  /** Shop cost; 0 for starting blueprints. */
  readonly cost: number;
  readonly recipe: readonly PartCategory[];
};

/** A Product is shipped for revenue. */
export type ProductDef = BlueprintBase & {
  readonly kind: 'product';
  readonly units: number;
  readonly price: number;
  readonly demand: number;
};

/** A Sub is fabricated onto the Bench as a part of category `output`. */
export type SubDef = BlueprintBase & {
  readonly kind: 'sub';
  readonly output: PartCategory;
};

export type BlueprintDef = ProductDef | SubDef;

/** R&D choice for a Product level. */
export type RndChoice = 'scale' | 'premium';

/** Extra output grade per R&D level on a Sub. */
export const SUB_RND_GRADE = 3;

/** A blueprint the player owns, with its R&D levels, sell-out growth and ship counters. */
export class OwnedBlueprint {
  readonly def: BlueprintDef;
  scaleLevels = 0;
  premiumLevels = 0;
  subLevels = 0;
  /** Permanent Demand gained from sell-outs. */
  growth = 0;
  shipsThisRound = 0;
  shipsThisRun = 0;

  constructor(def: BlueprintDef) {
    this.def = def;
  }

  get id(): string {
    return this.def.id;
  }

  get rndLevels(): number {
    return this.scaleLevels + this.premiumLevels + this.subLevels;
  }

  /** Base Units including Scale levels (+½ base each, rounded up). */
  get units(): number {
    return this.def.kind === 'product' ? this.def.units + this.scaleLevels * Math.ceil(this.def.units / 2) : 0;
  }

  /** Base Price including Premium levels (+⅓ base each, rounded up). */
  get price(): number {
    return this.def.kind === 'product' ? this.def.price + this.premiumLevels * Math.ceil(this.def.price / 3) : 0;
  }

  /** Base Demand including Scale levels and sell-out growth. */
  get demand(): number {
    return this.def.kind === 'product' ? this.def.demand + this.scaleLevels * Math.ceil(this.def.demand / 2) + this.growth : 0;
  }

  /** Applies one R&D Grant. Products need a choice; Subs ignore it. */
  addLevel(choice?: RndChoice): void {
    if (this.def.kind === 'sub') this.subLevels++;
    else if (choice === 'scale') this.scaleLevels++;
    else if (choice === 'premium') this.premiumLevels++;
    else throw new EngineError(`R&D on ${this.def.name} needs a choice: scale or premium`);
  }
}
