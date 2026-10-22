import type { ContentDef } from '../registry';
import type { BossRule } from './boss-rule';

/** Registry entry for a boss rule. `price` is unused for bosses; set it to 0. */
export type BossDef<TCard> = ContentDef & {
  readonly kind: 'boss';
  readonly name: string;
  readonly description: string;
  /** Creates a fresh rule instance for one boss round. */
  create(): BossRule<TCard>;
};
