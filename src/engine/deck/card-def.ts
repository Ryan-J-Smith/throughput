import type { ContentDef } from '../registry';

/** Registry entry for a card that can be offered in the shop and added to the deck. */
export type CardDef<C> = ContentDef & {
  readonly kind: 'card';
  /** Creates a fresh card instance for the deck. */
  create(): C;
};
