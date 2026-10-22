import type { CSSProperties } from 'react';
import { Card } from '../../../ui/components';
import { categoryName } from '../model';
import type { PartCategory } from '../model';
import type { BomOffer, BomRun } from '../rules';
import { MARKET_NAME, missingSubs, offerRarity, offerView, partAccent, roundLabel } from './present';

/** The payout for the round just cleared, as a remittance slip. */
export function PayoutSlip({ run }: { run: BomRun }) {
  const end = run.lastRoundEnd;
  const lines = end?.payout?.lines ?? [];
  return (
    <section className="summary bom-payout" aria-label="Payout">
      <h2 className="summary__heading">{roundLabel(run.round)} cleared</h2>
      {end !== null && (
        <p className="bom-payout__revenue">
          Revenue ${end.revenue} of ${end.target}
        </p>
      )}
      <ul className="summary__lines">
        {lines.map((line, i) => (
          <li key={`${i}-${line.source}`} className="summary__line">
            <span>{line.source}</span>
            <span className="summary__amount">${line.amount}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The round after the shop, and its quarter's Boss disruption once revealed. */
export function NextRoundMemo({ run }: { run: BomRun }) {
  const next = run.nextRound;
  if (next === null) return null;
  const disruption = run.revealedDisruption(next.quarter);
  const isBoss = next.market === 'boss';
  return (
    <section className={`next-round bom-next ${isBoss ? 'next-round--boss' : ''}`} aria-label="Next round">
      <div className="next-round__header">
        <span className="section-label">Next</span>
        <span className="next-round__number">
          Q{next.quarter} {MARKET_NAME[next.market]}
        </span>
        <span className="next-round__target">
          Target <strong>${next.target}</strong>
        </span>
      </div>
      {disruption !== null && (
        <div className="next-round__boss">
          <span className="next-round__boss-label">{isBoss ? 'Market disruption, next round' : `Q${next.quarter} Boss disruption`}</span>
          <span className="next-round__boss-name">{disruption.name}</span>
          <span className="next-round__boss-desc">{disruption.text}</span>
        </div>
      )}
    </section>
  );
}

export type ShelfProps = {
  run: BomRun;
  /** Offer slot of an R&D Grant waiting for its blueprint, if any. */
  pending: number | null;
  onBuy: (slot: number) => void;
  onReroll: () => void;
  onContinue: () => void;
};

/** The Rack (Facilities, Blueprints, R&D Grants) and the Parts Counter. */
export function Shelf({ run, pending, onBuy, onReroll, onContinue }: ShelfProps) {
  const rackSlots = run.config.shop.rackSlots;
  const offers = run.shop.offers;
  const next = run.nextRound;
  const item = (offer: BomOffer | null, slot: number) => <ShelfItem key={slot} run={run} offer={offer} slot={slot} pending={pending === slot} onBuy={onBuy} />;
  return (
    <section className="shop bom-shop" aria-label="Shop">
      <div className="shop__header">
        <span className="section-label">Shop</span>
        <div className="shop__actions">
          <button type="button" className={`btn btn--reroll ${run.whyCannotReroll() === null ? '' : 'btn--unaffordable'}`} onClick={onReroll}>
            Reroll ${run.shop.rerollCost}
          </button>
          {next !== null && (
            <button type="button" className="btn btn--play" onClick={onContinue}>
              Start Q{next.quarter} {MARKET_NAME[next.market]}
            </button>
          )}
        </div>
      </div>
      <h3 className="bom-shop__group">Rack</h3>
      <div className="shop__shelf bom-shop__rack">{offers.slice(0, rackSlots).map((offer, i) => item(offer, i))}</div>
      <h3 className="bom-shop__group">Parts Counter</h3>
      <div className="shop__shelf bom-shop__counter">{offers.slice(rackSlots).map((offer, i) => item(offer, rackSlots + i))}</div>
    </section>
  );
}

function ShelfItem({ run, offer, slot, pending, onBuy }: { run: BomRun; offer: BomOffer | null; slot: number; pending: boolean; onBuy: (slot: number) => void }) {
  if (offer === null) {
    return (
      <div className="shop__item bom-shop__sold" style={{ '--i': slot } as CSSProperties}>
        <span className="stamp stamp--sold">Sold</span>
      </div>
    );
  }
  const problem = run.offerProblem(slot);
  const missing = offer.kind === 'blueprint' ? missingSubs(run, offer.blueprint) : [];
  return (
    <div className={`shop__item ${pending ? 'bom-shop__pending' : ''}`} style={{ '--i': slot } as CSSProperties}>
      <Card card={offerView(offer, `offer-${slot}`)} rarity={offerRarity(offer)} />
      <span className="price-tag" aria-label={`Price $${offer.cost}`}>
        <span className="price-tag__now">${offer.cost}</span>
      </span>
      <div className="shop__ledge" aria-hidden="true" />
      {missing.length > 0 && <p className="bom-shop__warn">Needs the {missing.join(' and ')} Sub, which you don't own</p>}
      <button type="button" className={`btn btn--buy ${problem === null ? '' : 'btn--unaffordable'}`} onClick={() => onBuy(slot)}>
        {pending ? 'Pick a blueprint' : `Buy $${offer.cost}`}
      </button>
    </div>
  );
}

export type ShredPanelProps = {
  run: BomRun;
  onShred: (category: PartCategory, grade: number) => void;
};

/** Every part in the deck by category and grade; Shred removes one for good. */
export function ShredPanel({ run, onShred }: ShredPanelProps) {
  const groups = new Map<string, { category: PartCategory; grade: number; count: number; premium: number }>();
  for (const part of run.deck.allCards) {
    const key = `${part.category}-${part.grade}`;
    const group = groups.get(key) ?? { category: part.category, grade: part.grade, count: 0, premium: 0 };
    group.count++;
    if (part.premium) group.premium++;
    groups.set(key, group);
  }
  const sorted = [...groups.values()].sort((a, b) => a.category.localeCompare(b.category) || a.grade - b.grade);
  const cost = run.config.shop.shredCost;
  const used = run.shop.shredUsed;
  return (
    <details className="bom-deck">
      <summary>
        Deck ({run.deck.allCards.length} parts){used ? ': shredded this visit' : `: Shred one for $${cost}`}
      </summary>
      <p className="bom-deck__hint">Pay ${cost} to remove one part from your deck for good, once per shop visit. A plain part goes before a Premium one.</p>
      <ul className="bom-deck__list">
        {sorted.map((g) => (
          <li key={`${g.category}-${g.grade}`}>
            <button
              type="button"
              className={`bom-deck__part ${run.whyCannotShred(g.category, g.grade) === null ? '' : 'is-blocked'}`}
              onClick={() => onShred(g.category, g.grade)}
            >
              <span className="bom-chip" data-accent={partAccent(g.category)}>
                {categoryName(g.category)} {g.grade}
              </span>
              <span className="bom-deck__count">
                ×{g.count}
                {g.premium > 0 ? ` (${g.premium} Premium)` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
