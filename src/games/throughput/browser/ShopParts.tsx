import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { computeInterest, interestCeiling } from '../../../engine/economy';
import { Card } from '../../../ui/components';
import { Icon } from '../../../ui/icons';
import { interestTrade, offerName, rulesText } from '../cli';
import { CATEGORIES, cardName, formatAmount } from '../model';
import type { Category, GrantOption } from '../model';
import type { Offer, ThroughputRun } from '../rules';
import { bossArt } from './art';
import { CATEGORY_ACCENT, cardView, nextBoardNotice, offerView } from './present';
import './demand.css';

/** The payout for the round just cleared, as a remittance slip, and a heads-up if a Board Review is next. */
export function PayoutSlip({ run }: { run: ThroughputRun }) {
  const q = run.quarter;
  const lines = run.lastPayout ?? [];
  const next = nextBoardNotice(run);
  const art = next === null ? undefined : bossArt(next.boss.id);
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
      {next !== null && (
        <p className="tp-payout__next" data-boss={next.boss.id} title={next.help}>
          {art !== undefined && <img className="tp-payout__next-art" src={art} alt="" loading="lazy" />}
          <span className="tp-payout__next-label">Next round:</span> {next.text}
        </p>
      )}
    </section>
  );
}

export type ShelfProps = {
  run: ThroughputRun;
  /** Offer index waiting for a bay or deck card, if any. */
  pending: number | null;
  /** The slot of a picked Line Fixture, which a bought Fixture replaces; null if none is picked. */
  replacing: number | null;
  onBuy: (offer: number) => void;
  /** Locks an offer through rerolls this visit, or unlocks it if it is the locked one. */
  onLock: (offer: number) => void;
  onReroll: () => void;
  onContinue: () => void;
};

/** Five offers on the shop shelf: 2 Fixtures, 2 Cards, 1 Contract. */
export function Shelf({ run, pending, replacing, onBuy, onLock, onReroll, onContinue }: ShelfProps) {
  const next = run.round + 1;
  const locked = run.lockedOffer;
  const lockedOffer = locked === null ? null : run.offers[locked];
  // An offer bought from its focused Buy button turns into a Sold plate, which takes the focus so
  // a keyboard player's next Tab carries on along the shelf instead of starting over at the top.
  const refocus = useRef<number | null>(null);
  const buy = (index: number, button: HTMLButtonElement) => {
    refocus.current = document.activeElement === button ? index : null;
    onBuy(index);
  };
  const soldRef = (index: number) => (plate: HTMLDivElement | null) => {
    if (plate === null || refocus.current !== index || document.activeElement !== document.body) return;
    refocus.current = null;
    plate.focus();
  };
  return (
    <section className="shop tp-shop" aria-label="Shop">
      <div className="shop__header">
        <span className="section-label">Shop</span>
        <div className="shop__actions">
          <span
            className="tp-shop__interest"
            title={`Interest is paid when the next round clears; spending lowers it. It tops out at +${run.interestRule.cap}C: Capital above ${interestCeiling(run.interestRule)}C earns nothing.`}
          >
            Holding {run.wallet.cash}C → +{computeInterest(run.wallet.cash, run.interestRule)}C interest{run.wallet.cash >= interestCeiling(run.interestRule) && ' (max)'}
          </span>
          <button
            type="button"
            className={`btn btn--reroll ${run.whyCannotReroll() === null ? '' : 'btn--unaffordable'}`}
            title={`Reroll for ${run.rerollCost}C: ${interestTrade(run, run.rerollCost)}${lockedOffer == null ? '' : `. ${offerName(lockedOffer)} stays (locked)`}`}
            onClick={onReroll}
          >
            Reroll {run.rerollCost}C
          </button>
          <button type="button" className="btn btn--play" onClick={onContinue}>
            Start round {next}
          </button>
        </div>
      </div>
      <div className="shop__shelf">
        {run.offers.map((offer, i) => (
          <ShelfItem key={i} run={run} offer={offer} index={i} pending={pending === i} locked={locked === i} replacing={replacing} onBuy={buy} onLock={onLock} soldRef={soldRef(i)} />
        ))}
      </div>
    </section>
  );
}

function ShelfItem({
  run,
  offer,
  index,
  pending,
  locked,
  replacing,
  onBuy,
  onLock,
  soldRef,
}: {
  run: ThroughputRun;
  offer: Offer | null;
  index: number;
  pending: boolean;
  locked: boolean;
  replacing: number | null;
  onBuy: (offer: number, button: HTMLButtonElement) => void;
  onLock: (offer: number) => void;
  soldRef: (plate: HTMLDivElement | null) => void;
}) {
  if (offer === null) {
    return (
      <div className="shop__item tp-shop__sold" ref={soldRef} tabIndex={-1} title="Bought. A reroll or the next shop refills this spot." style={{ '--i': index } as CSSProperties}>
        <span className="stamp stamp--sold">Sold</span>
      </div>
    );
  }
  // A Fixture bought over another sells that one as part of the buy, so its refund counts toward the price.
  const replaced = offer.kind === 'fixture' && replacing !== null ? (run.line[replacing]?.fixture ?? null) : null;
  const affordable =
    offer.kind !== 'fixture'
      ? run.wallet.canAfford(offer.price)
      : replacing !== null
        ? run.whyCannotBuy(index, { slot: replacing }) === null
        : run.line.some((_, slot) => run.whyCannotBuy(index, { slot }) === null);
  const rarity = offer.kind === 'fixture' ? offer.def.rarity : undefined;
  return (
    <div
      className={`shop__item ${pending ? 'tp-shop__pending' : ''}`}
      data-kind={offer.kind}
      data-afford={affordable ? 'yes' : 'no'}
      data-locked={locked || undefined}
      style={{ '--i': index } as CSSProperties}
    >
      <Card card={offerView(offer, `offer-${index}`)} rarity={rarity} />
      <span className="price-tag" aria-label={`Price ${offer.price}C`}>
        <span className="price-tag__now">{offer.price}C</span>
      </span>
      <div className="shop__ledge" aria-hidden="true" />
      {replaced !== null && replacing !== null && (
        <p className="shop__note">
          Replaces {replaced.def.name} (+{run.fixtureRefund(replacing)}C)
        </p>
      )}
      <button type="button" className={`btn btn--buy ${affordable ? '' : 'btn--unaffordable'}`} onClick={(event) => onBuy(index, event.currentTarget)}>
        {pending ? pendingLabel(offer) : `Buy ${offer.price}C`}
      </button>
      <button
        type="button"
        className="shop__lock"
        aria-pressed={locked}
        title={locked ? 'Locked: rerolls this visit keep this offer. Buying it or leaving the shop releases it. Click to unlock.' : 'Lock (free): rerolls this visit keep this offer'}
        onClick={() => onLock(index)}
      >
        <Icon name={locked ? 'lock' : 'unlock'} size="sm" />
        {locked ? 'Locked' : 'Lock'}
      </button>
    </div>
  );
}

/** What a bought-but-unplaced offer waits for. */
function pendingLabel(offer: Offer): string {
  if (offer.kind !== 'contract') return 'Pick a bay';
  return offer.def.targetsCategory ? 'Pick a Category' : 'Pick a card';
}

export type GrantPickerProps = {
  run: ThroughputRun;
  onPick: (category: Category, option: GrantOption) => void;
  onCancel: () => void;
};

/** The R&D Grant's choice: a Category, then Scale or Premium, each showing what it would change. */
export function GrantPicker({ run, onPick, onCancel }: GrantPickerProps) {
  const g = run.config.grant;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.scrollIntoView?.({ block: 'nearest' }), []);
  return (
    <section ref={ref} className="tp-grant" aria-labelledby="tp-grant-title">
      <div className="tp-grant__header">
        <h2 id="tp-grant-title" className="tp-grant__title">
          R&amp;D Grant: pick a Category, then Scale or Premium
        </h2>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ul className="tp-grant__list">
        {CATEGORIES.map((c) => {
          const { scale, premium } = run.grants[c];
          const premiumNow = 1 + g.premiumStep * premium;
          const now = [`Demand ${run.demand[c]}`, scale > 0 ? `Scale ${scale}` : '', premium > 0 ? `Premium ×${formatAmount(premiumNow)}` : ''].filter(Boolean).join(' · ');
          return (
            <li key={c} className="tp-grant__category" data-category={c} data-accent={CATEGORY_ACCENT[c]}>
              <span className="tp-grant__name">{c}</span>
              <span className="tp-grant__now">{now}</span>
              <button type="button" className="btn tp-grant__option" data-option="scale" onClick={() => onPick(c, 'scale')}>
                <span className="tp-grant__option-name">Scale</span>
                <span className="tp-grant__option-effect">
                  Demand {run.demand[c]} → {run.demand[c] + g.scaleDemand} for good, and each {c} Ship card adds +{g.scaleUnits * (scale + 1)} Units just before it sells
                </span>
              </button>
              <button type="button" className="btn tp-grant__option" data-option="premium" onClick={() => onPick(c, 'premium')}>
                <span className="tp-grant__option-name">Premium</span>
                <span className="tp-grant__option-effect">
                  {c} sells at +{Math.round(100 * (premiumNow - 1))}% → +{Math.round(100 * (premiumNow - 1 + g.premiumStep))}% price
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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
