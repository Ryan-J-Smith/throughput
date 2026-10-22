import type { CardView, Rarity as UiRarity } from '../../../ui/types';
import { PAINT, PREMIUM_PRICE, SUB_RND_GRADE, categoryName } from '../model';
import type { BlueprintDef, Facility, OwnedBlueprint, Part, PartCategory, Rarity } from '../model';
import { recipeText } from '../rules';
import type { BomOffer, BomRoundInfo, BomRun, MarketKind } from '../rules';

/** Department colour per base part category (keys from ui/theme/tokens.css); Sub outputs share one. */
const PART_ACCENT: Readonly<Record<string, string>> = { shell: 'blue', chip: 'green', bolt: 'red', paint: 'violet' };
const FABRICATED_ACCENT = 'orange';

export const MARKET_NAME: Readonly<Record<MarketKind, string>> = { small: 'Small', big: 'Big', boss: 'Boss' };

const partIds = new WeakMap<Part, number>();
let nextPartId = 0;

/** A stable React key for a part. Parts are plain objects whose identity is what the rules track. */
export function partKey(part: Part): string {
  let id = partIds.get(part);
  if (id === undefined) {
    id = nextPartId++;
    partIds.set(part, id);
  }
  return `part-${id}`;
}

export function partAccent(category: PartCategory): string {
  return PART_ACCENT[category] ?? FABRICATED_ACCENT;
}

/** e.g. "Q2 Boss". */
export function roundLabel(round: BomRoundInfo): string {
  return `Q${round.quarter} ${MARKET_NAME[round.market]}`;
}

/** What a part adds to a Ship, in words. */
export function partEffect(part: Part): string {
  const base = part.category === PAINT ? `+$${part.grade} Price` : `+${part.grade} Units`;
  return part.premium ? `${base}, +$${PREMIUM_PRICE} Price (Premium)` : base;
}

/** A part as a card: category on the band, its grade as the big number, and what it adds to. */
export function partView(part: Part, id: string): CardView {
  const stamps = [part.premium ? `Premium +$${PREMIUM_PRICE}` : '', part.fabricated ? 'Fabricated' : ''].filter(Boolean);
  return {
    id,
    title: '',
    description: part.category === PAINT ? 'Price' : 'Units',
    tags: [categoryName(part.category), ...stamps],
    accent: partAccent(part.category),
    valueLabel: part.category === PAINT ? `+$${part.grade}` : `+${part.grade}`,
  };
}

/** "Product: Shell+Chip" or "Sub: Chip+Bolt → Motor". */
export function blueprintSummary(def: BlueprintDef): string {
  return def.kind === 'product'
    ? `${def.units} Units, $${def.price}, Demand ${def.demand}. Needs ${recipeText(def.recipe)}.`
    : `${recipeText(def.recipe)} → ${categoryName(def.output)}, grade 2× inputs.`;
}

/** Names of the Subs a Product blueprint needs that the player doesn't own. */
export function missingSubs(run: BomRun, def: BlueprintDef): string[] {
  if (def.kind !== 'product') return [];
  const needed = run.config.blueprints.filter((b) => b.kind === 'sub' && def.recipe.includes(b.output));
  return needed.filter((sub) => run.blueprint(sub.id) === undefined).map((sub) => sub.name);
}

function rarityOf(rarity: Rarity): UiRarity | undefined {
  return rarity === 'starter' || rarity === 'common' ? undefined : rarity;
}

export function offerRarity(offer: BomOffer): UiRarity | undefined {
  if (offer.kind === 'facility') return rarityOf(offer.facility.rarity);
  if (offer.kind === 'blueprint') return rarityOf(offer.blueprint.rarity);
  return undefined;
}

export function offerView(offer: BomOffer, id: string): CardView {
  switch (offer.kind) {
    case 'facility':
      return { id, title: offer.facility.name, description: offer.facility.text, tags: ['Facility'], accent: 'teal' };
    case 'blueprint': {
      const b = offer.blueprint;
      return b.kind === 'product'
        ? { id, title: b.name, description: blueprintSummary(b), tags: ['Product'], accent: 'neutral', valueLabel: `$${b.price}` }
        : { id, title: b.name, description: blueprintSummary(b), tags: ['Sub'], accent: FABRICATED_ACCENT };
    }
    case 'rnd':
      return {
        id,
        title: 'R&D Grant',
        description: `+1 level on a blueprint you own: Scale or Premium on a Product, +${SUB_RND_GRADE} grade on a Sub.`,
        tags: ['R&D'],
        accent: 'mustard',
      };
    case 'part':
      return { ...partView(offer.part, id), description: `${partEffect(offer.part)}. Joins your deck.` };
  }
}

export function facilityView(facility: Facility): CardView {
  return { id: facility.id, title: facility.name, description: facility.text, tags: ['Facility'], accent: 'teal' };
}

/** What each R&D choice would add to this Product, from its blueprint's base stats. */
export function rndGains(blueprint: OwnedBlueprint): { scale: string; premium: string } | null {
  const def = blueprint.def;
  if (def.kind !== 'product') return null;
  return {
    scale: `+${Math.ceil(def.units / 2)} Units, +${Math.ceil(def.demand / 2)} Demand`,
    premium: `+$${Math.ceil(def.price / 3)} Price`,
  };
}
