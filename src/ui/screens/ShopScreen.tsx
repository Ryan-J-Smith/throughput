import { Card, Hud, ModifierRow } from '../components';
import type { HudView, ModifierRowView, ShopOfferView } from '../types';

export type ShopScreenProps = {
  hud: HudView;
  modifierRow: ModifierRowView;
  offers: readonly ShopOfferView[];
  rerollCost: number;
  canReroll: boolean;
  onBuy: (offerId: string) => void;
  onReroll: () => void;
  onContinue: () => void;
};

export function ShopScreen({ hud, modifierRow, offers, rerollCost, canReroll, onBuy, onReroll, onContinue }: ShopScreenProps) {
  return (
    <main className="screen screen--shop">
      <Hud hud={hud} />
      <ModifierRow row={modifierRow} />
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
        <div className="shop__grid">
          {offers.map((offer) => (
            <Card
              key={offer.id}
              card={offer.card}
              rarity={offer.rarity}
              disabled={offer.sold}
              footer={
                <button
                  type="button"
                  className={`btn btn--buy ${offer.canBuy || offer.sold ? '' : 'btn--unaffordable'}`}
                  disabled={offer.sold}
                  onClick={() => onBuy(offer.id)}
                >
                  {offer.sold ? 'Sold' : `Buy $${offer.price}`}
                </button>
              }
            />
          ))}
        </div>
      </section>
    </main>
  );
}
