import type { BossRule } from '../../engine/bosses';
import type { CardDef } from '../../engine/deck';
import type { Modifier, ModifierDef } from '../../engine/modifiers';

/**
 * Turns game objects into short text for the CLI. Card text is design-specific, so each game
 * supplies a renderer; modifiers and bosses default to "name — description".
 */
export abstract class Renderer<TCard> {
  abstract card(card: TCard): string;

  /** A card offered in the shop. */
  abstract cardDef(def: CardDef<TCard>): string;

  modifier(modifier: Modifier<TCard>): string {
    return `${modifier.name} — ${modifier.description}`;
  }

  modifierDef(def: ModifierDef<TCard>): string {
    return `${def.name} — ${def.description}`;
  }

  boss(boss: BossRule<TCard>): string {
    return `${boss.name} — ${boss.description}`;
  }
}

/** Placeholder renderer: a card's own toString if it has one, otherwise its JSON. */
export class GenericRenderer<TCard> extends Renderer<TCard> {
  override card(card: TCard): string {
    return genericText(card);
  }

  override cardDef(def: CardDef<TCard>): string {
    return `card ${def.id}`;
  }
}

function genericText(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return value.toString === Object.prototype.toString ? JSON.stringify(value) : String(value);
  }
  return String(value);
}
