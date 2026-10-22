/** Part category: base parts (shell, chip, bolt, paint) and Sub outputs (motor, board, frame, …). */
export type PartCategory = string;

/** Paint adds its grade to Price; every other category adds its grade to Units. */
export const PAINT: PartCategory = 'paint';

/** Price bonus of a Premium-tagged part. */
export const PREMIUM_PRICE = 2;

/** One physical part. Identity matters: hand, deck and Bench track part objects. */
export type Part = {
  readonly category: PartCategory;
  readonly grade: number;
  readonly premium: boolean;
  /** Made by Fabricate; lives on the Bench, never in the deck. */
  readonly fabricated: boolean;
};

export function makePart(category: PartCategory, grade: number, options: { premium?: boolean; fabricated?: boolean } = {}): Part {
  return { category, grade, premium: options.premium ?? false, fabricated: options.fabricated ?? false };
}

export function categoryName(category: PartCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** e.g. "Chip 4", "Paint 2 premium". */
export function partLabel(part: Part): string {
  return `${categoryName(part.category)} ${part.grade}${part.premium ? ' premium' : ''}`;
}
