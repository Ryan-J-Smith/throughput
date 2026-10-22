import type { CSSProperties, MouseEvent } from 'react';
import { Card, Hud, ModifierRow, NextRoundPanel } from '../components';
import { flyGhost } from '../motion';
import type { HudView, ModifierRowView, NextRoundView, ShopOfferView } from '../types';

export type ShopScreenProps = {
  hud: HudView;
  modifierRow: ModifierRowView;
  offers: readonly ShopOfferView[];
  nextRound?: NextRoundView;
  rerollCost: number;
  canReroll: boolean;
  onBuy: (offerId: string) => void;
  onReroll: () => void;
  onContinue: () => void;
  onSellModifier: (modifierId: string) => void;
  onMoveModifier: (modifierId: string, toIndex: number) => void;
};

/** Where a bought item flies: the first open staff slot, or off the bottom of the screen into the deck. */
function landingBox(offer: ShopOfferView) {
  const slot = offer.destination === 'modifiers' ? document.querySelector('.modifier-row__empty') : null;
  if (slot) return slot.getBoundingClientRect();
  return { left: window.innerWidth / 2 - 40, top: window.innerHeight + 20, width: 80, height: 110 };
}

export function ShopScreen({
  hud,
  modifierRow,
  offers,
  nextRound,
  rerollCost,
  canReroll,
  onBuy,
  onReroll,
  onContinue,
  onSellModifier,
  onMoveModifier,
}: ShopScreenProps) {
  const buy = (offer: ShopOfferView, e: MouseEvent<HTMLButtonElement>) => {
    // Only animate purchases the owner says will go through; refusals just toast.
    const card = e.currentTarget.closest('.shop__item')?.querySelector('.card');
    if (offer.canBuy && card) void flyGhost(card, landingBox(offer), { rotate: -6, fadeOut: offer.destination !== 'modifiers' });
    onBuy(offer.id);
  };

  return (
    <main className="screen screen--shop">
      <Hud hud={hud} />
      <ModifierRow row={modifierRow} onSell={onSellModifier} onMove={onMoveModifier} />
      {nextRound && <NextRoundPanel next={nextRound} />}
      <section className="shop" aria-label="Shop">
        <div className="shop__header">
          <span className="section-label">Shop</span>
          <div className="shop__actions">
            <button
              type="button"
              className={`btn btn--reroll ${canReroll ? '' : 'btn--unaffordable'}`}
              onClick={onReroll}
            >
              Reroll ${rerollCost}
            </button>
            <button type="button" className="btn btn--play" onClick={onContinue}>
              Continue
            </button>
          </div>
        </div>
        <div className="shop__shelf">
          {offers.map((offer, i) => (
            <div key={offer.id} className="shop__item" style={{ '--i': i } as CSSProperties}>
              <Card card={offer.card} rarity={offer.rarity} disabled={offer.sold} />
              <span className="price-tag" aria-label={`Price $${offer.price}`}>
                {offer.listPrice !== undefined && <s className="price-tag__was">${offer.listPrice}</s>}
                <span className="price-tag__now">${offer.price}</span>
              </span>
              {offer.listPrice !== undefined && !offer.sold && <span className="stamp stamp--sale">Sale</span>}
              {offer.sold && <span className="stamp stamp--sold">Sold</span>}
              <div className="shop__ledge" aria-hidden="true" />
              <button
                type="button"
                className={`btn btn--buy ${offer.canBuy || offer.sold ? '' : 'btn--unaffordable'}`}
                disabled={offer.sold}
                onClick={(e) => buy(offer, e)}
              >
                {offer.sold ? 'Sold' : `Buy $${offer.price}`}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
