import type { ContentDef } from '../registry';
import type { Modifier } from './modifier';

/** Registry entry for a modifier that can be offered in the shop. */
export type ModifierDef<TCard> = ContentDef & {
  readonly kind: 'modifier';
  readonly name: string;
  readonly description: string;
  /** Creates a fresh modifier instance for the player's slots. */
  create(): Modifier<TCard>;
};
