// TEMPORARY: presentation for the sim harness's numeric demo cards. Delete with DemoGame once
// the real design has its own content and presenter.
import { ContentPresenter } from '../../app';
import type { CardFace, ModifierFace, SortKeys } from '../../app';
import type { Modifier } from '../../engine/modifiers';
import type { RunShopDef } from '../../engine/run';
import type { DemoCard } from '../../sim/demo';
import type { GlossaryEntryView } from '../../ui/types';

const GLOSSARY: readonly (GlossaryEntryView & { pattern: RegExp })[] = [
  { term: 'Base', definition: 'Sum of the played cards’ values, plus bonuses.', pattern: /\bbase\b/i },
  { term: 'Multiplier', definition: 'Starts at the number of cards played; the score is base × multiplier.', pattern: /\bmultiplier\b/i },
  { term: 'High', definition: 'A card worth 7 or more.', pattern: /7\+/ },
];

function glossaryFor(text: string): GlossaryEntryView[] {
  return GLOSSARY.filter((g) => g.pattern.test(text)).map(({ term, definition }) => ({ term, definition }));
}

export class DemoPresenter extends ContentPresenter<DemoCard> {
  override presentCard(card: DemoCard): CardFace {
    const high = card.value >= 7;
    const body = `Adds ${card.value} to base when played.${high ? ' Counts as a 7+ card.' : ''}`;
    return {
      title: `Card ${card.value}`,
      description: `+${card.value} base`,
      tags: high ? ['High'] : [],
      value: card.value,
      tooltip: { body, glossary: glossaryFor(`${body} multiplier`) },
    };
  }

  /** Demo cards have no suits, so "group" splits them into High (7+) and Low. */
  override sortKeys(card: DemoCard): SortKeys {
    return { value: card.value, group: card.value >= 7 ? 'High' : 'Low' };
  }

  override presentModifier(modifier: Modifier<DemoCard>): ModifierFace {
    return { ...super.presentModifier(modifier), tooltip: { body: modifier.description, glossary: glossaryFor(modifier.description) } };
  }

  override presentOffer(def: RunShopDef<DemoCard>): CardFace {
    const face = super.presentOffer(def);
    if (def.kind === 'card') return face;
    return { ...face, tooltip: { body: def.description, glossary: glossaryFor(def.description) } };
  }

  override statLabel(stat: string): string {
    return stat === 'multiplier' ? 'Mult' : super.statLabel(stat);
  }

  /** The demo evaluator logs sources like "card 7"; capitalise them. */
  override sourceLabel(source: string): string {
    return source.charAt(0).toUpperCase() + source.slice(1);
  }
}
