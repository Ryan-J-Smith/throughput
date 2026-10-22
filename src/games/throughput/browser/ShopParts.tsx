import type { CSSProperties } from 'react';
import { Card } from '../../../ui/components';
import { rulesText } from '../cli';
import { cardName } from '../model';
import type { Offer, ThroughputRun } from '../rules';
import { cardView, offerView } from './present';

/** The payout for the round just cleared, as a remittance slip. */
export function PayoutSlip({ run }: { run: ThroughputRun }) {
  const q = run.quarter;
  const lines = run.lastPayout ?? [];
  return (
    <section className="summary tp-payout" aria-label="Payout">
      <h2 className="summary__heading">{q.isBoard ? `Year ${q.year} Board Review passed` : `Y${q.year} Q${q.quarter} closed`}</h2>
      <ul className="summary__lines">
        {lines.map((line, i) => (
          <li key={`${i}-${line.source}`} className="summary__line">
            <span>{line.source}</span>
            <span className="summary__amount">{line.amount}C</span>
          </li>
        ))}
      </ul>
      {run.storageNotice !== null && <p className="tp-payout__notice">{run.storageNotice}</p>}
    </section>
  );
}

export type ShelfProps = {
  run: ThroughputRun;
  /** Offer index waiting for a bay or deck card, if any. */
  pending: number | null;
  onBuy: (offer: number) => void;
  onReroll: () => void;
  onContinue: () => void;
};

/** Five offers on the shop shelf: 2 Fixtures, 2 Cards, 1 Contract. */
export function Shelf({ run, pending, onBuy, onReroll, onContinue }: ShelfProps) {
  const next = run.round + 1;
  return (
    <section className="shop tp-shop" aria-label="Shop">
      <div className="shop__header">
        <span className="section-label">Shop</span>
        <div className="shop__actions">
          <button type="button" className={`btn btn--reroll ${run.whyCannotReroll() === null ? '' : 'btn--unaffordable'}`} onClick={onReroll}>
            Reroll {run.rerollCost}C
          </button>
          <button type="button" className="btn btn--play" onClick={onContinue}>
            Start round {next}
          </button>
        </div>
      </div>
      <div className="shop__shelf">
        {run.offers.map((offer, i) => (
          <ShelfItem key={i} run={run} offer={offer} index={i} pending={pending === i} onBuy={onBuy} />
        ))}
      </div>
    </section>
  );
}

function ShelfItem({ run, offer, index, pending, onBuy }: { run: ThroughputRun; offer: Offer | null; index: number; pending: boolean; onBuy: (offer: number) => void }) {
  if (offer === null) {
    return (
      <div className="shop__item tp-shop__sold" style={{ '--i': index } as CSSProperties}>
        <span className="stamp stamp--sold">Sold</span>
      </div>
    );
  }
  const affordable = run.wallet.canAfford(offer.price);
  const rarity = offer.kind === 'fixture' ? offer.def.rarity : undefined;
  return (
    <div className={`shop__item ${pending ? 'tp-shop__pending' : ''}`} style={{ '--i': index } as CSSProperties}>
      <Card card={offerView(offer, `offer-${index}`)} rarity={rarity} />
      <span className="price-tag" aria-label={`Price ${offer.price}C`}>
        <span className="price-tag__now">{offer.price}C</span>
      </span>
      <div className="shop__ledge" aria-hidden="true" />
      <button type="button" className={`btn btn--buy ${affordable ? '' : 'btn--unaffordable'}`} onClick={() => onBuy(index)}>
        {pending ? (offer.kind === 'contract' ? 'Pick a card' : 'Pick a bay') : `Buy ${offer.price}C`}
      </button>
    </div>
  );
}

export type DeckDrawerProps = {
  run: ThroughputRun;
  /** Set while a Contract waits for its target card. */
  picking: string | null;
  onPick: (deckCard: number) => void;
  onSell: (deckCard: number) => void;
};

/** Every owned card. Contracts pick a target here; bought cards can be sold for half. */
export function DeckDrawer({ run, picking, onPick, onSell }: DeckDrawerProps) {
  return (
    <details className="tp-deck" open={picking !== null}>
      <summary>
        Deck ({run.deck.length} cards){picking !== null ? `: pick a card for ${picking}` : ''}
      </summary>
      <ul className="tp-deck__list">
        {run.deck.map((card, i) => (
          <li key={card.uid} className="tp-deck__item">
            <button type="button" className="tp-deck__card" data-accent={cardView(card).accent} disabled={picking === null} onClick={() => onPick(i)}>
              <span className="tp-deck__name">{cardName(card)}</span>
              <span className="tp-deck__effect">{cardView(card).description}</span>
            </button>
            {picking === null && card.paid > 0 && (
              <button type="button" className="tp-deck__sell" onClick={() => onSell(i)}>
                Sell {Math.floor(card.paid * run.config.sellRate)}C
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The full rules (without the CLI commands), folded away. */
export function RulesSheet({ run }: { run: ThroughputRun }) {
  return (
    <details className="tp-rules">
      <summary>How to play</summary>
      <pre className="tp-rules__text">{rulesText(run.config).split('\nCOMMANDS')[0]}</pre>
    </details>
  );
}
