import { artUrlFor } from '../../../assets/art';
import type { IconName } from '../../../ui/icons';
import type { Category, Stage } from '../model';

// Illustrations follow the manifest's naming convention (src/assets/art/manifest.ts): a card's own
// `card-<def id>` art, else its Category and stage (`card-apparel-design`); `fixture-<id>`,
// `contract-<id>` and `boss-<id>` likewise. Anything not generated yet falls back to an icon.

export const CATEGORY_ICON: Readonly<Record<Category, IconName>> = { Apparel: 'apparel', Gadgets: 'gadgets', Home: 'home', Food: 'food' };

export const STAGE_ICON: Readonly<Record<Stage, IconName>> = { design: 'design', make: 'make', ship: 'ship' };

export function cardArt(defId: string, category: Category, stage: Stage): string | undefined {
  return artUrlFor(`card-${defId}`) ?? artUrlFor(`card-${category.toLowerCase()}-${stage}`);
}

export function fixtureArt(fixtureId: string): string | undefined {
  return artUrlFor(`fixture-${fixtureId}`);
}

export function contractArt(contractId: string): string | undefined {
  return artUrlFor(`contract-${contractId}`);
}

export function bossArt(bossId: string): string | undefined {
  return artUrlFor(`boss-${bossId}`);
}
