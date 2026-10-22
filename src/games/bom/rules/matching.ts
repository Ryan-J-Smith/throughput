import type { Part, PartCategory } from '../model';

function counts(categories: readonly PartCategory[]): Map<PartCategory, number> {
  const map = new Map<PartCategory, number>();
  for (const c of categories) map.set(c, (map.get(c) ?? 0) + 1);
  return map;
}

/** Fabricate rule: the parts are exactly the recipe (same categories, same counts). */
export function matchesExactly(recipe: readonly PartCategory[], parts: readonly Part[]): boolean {
  if (recipe.length !== parts.length) return false;
  return containsRecipe(recipe, parts);
}

/** Ship rule: the recipe is a sub-multiset of the parts' categories (the rest is filler). */
export function containsRecipe(recipe: readonly PartCategory[], parts: readonly Part[]): boolean {
  const have = counts(parts.map((p) => p.category));
  for (const [category, needed] of counts(recipe)) {
    if ((have.get(category) ?? 0) < needed) return false;
  }
  return true;
}

/** Some parts from `available` that satisfy `recipe`, in `available` order, or null. */
export function findRecipeParts(recipe: readonly PartCategory[], available: readonly Part[]): Part[] | null {
  const remaining = [...available];
  const picked: Part[] = [];
  for (const category of recipe) {
    const i = remaining.findIndex((p) => p.category === category);
    if (i < 0) return null;
    picked.push(remaining.splice(i, 1)[0] as Part);
  }
  return picked;
}
