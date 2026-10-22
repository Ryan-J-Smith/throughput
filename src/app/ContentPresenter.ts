import type { BossRule } from '../engine/bosses';
import type { Modifier } from '../engine/modifiers';
import type { RunShopDef } from '../engine/run';
import type { BossView, CardView, ModifierView, Rarity } from '../ui/types';

/** How a card looks; the controller adds the id and interaction state. */
export type CardFace = Omit<CardView, 'id' | 'disabled'>;

/** How an owned modifier looks; the controller adds the id and sell state. */
export type ModifierFace = Omit<ModifierView, 'id' | 'sellValue' | 'canSell'>;

/**
 * Keys for sorting the hand's display. `value` sorts high to low; `group` sorts numbers
 * ascending, then strings alphabetically, with value breaking ties inside a group.
 */
export type SortKeys = {
  readonly value: number;
  readonly group: number | string;
};

const UI_RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/**
 * Turns engine objects and log strings into what the UI shows. Each design supplies one
 * subclass. Only `presentCard` is required, because the engine knows nothing about what a card
 * is; everything else defaults to the names and descriptions the engine already carries.
 */
export abstract class ContentPresenter<TCard> {
  abstract presentCard(card: TCard): CardFace;

  /** Hand sort keys. Default: the face's value badge and its first tag. */
  sortKeys(card: TCard): SortKeys {
    const face = this.presentCard(card);
    return { value: face.value ?? 0, group: face.tags[0] ?? '' };
  }

  presentModifier(modifier: Modifier<TCard>): ModifierFace {
    return { title: modifier.name, description: modifier.description, tags: [] };
  }

  /** Shop offer face. Card offers default to presenting a fresh instance from the def. */
  presentOffer(def: RunShopDef<TCard>): CardFace {
    if (def.kind === 'card') return this.presentCard(def.create());
    return { title: def.name, description: def.description, tags: [] };
  }

  presentBoss(boss: BossRule<TCard>): BossView {
    return { name: boss.name, description: boss.description };
  }

  /** Display name for a score stat (the formula's keys, e.g. "base"). */
  statLabel(stat: string): string {
    return stat.charAt(0).toUpperCase() + stat.slice(1);
  }

  /** Display name for a score log `source` (set by the evaluator and modifiers). */
  sourceLabel(source: string): string {
    return source;
  }

  /** Display name for a payout line `source`. */
  payoutLabel(source: string): string {
    return source;
  }

  /** Maps a content rarity key onto the UI's rarity styles; unknown keys get no styling. */
  rarity(rarity: string): Rarity | undefined {
    return UI_RARITIES.find((r) => r === rarity);
  }
}
