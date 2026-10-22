import { PAINT, makePart } from '../model';
import type { Part } from '../model';

export const SHELL = 'shell';
export const CHIP = 'chip';
export const BOLT = 'bolt';
export { PAINT };

/** Categories the Parts Counter sells (Sub outputs are only made by Fabricate). */
export const BASE_CATEGORIES = [SHELL, CHIP, BOLT, PAINT] as const;

/** The 32-part starting deck: Shell, Chip and Bolt 1,1,2,2,3,3,4,4 each; Paint 1 ×6 and 2 ×2. */
export function startingDeck(): Part[] {
  const deck: Part[] = [];
  for (const category of [SHELL, CHIP, BOLT]) {
    for (const grade of [1, 1, 2, 2, 3, 3, 4, 4]) deck.push(makePart(category, grade));
  }
  for (const grade of [1, 1, 1, 1, 1, 1, 2, 2]) deck.push(makePart(PAINT, grade));
  return deck;
}
