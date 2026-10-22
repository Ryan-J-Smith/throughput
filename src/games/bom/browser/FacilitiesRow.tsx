import { Card } from '../../../ui/components';
import type { BomRun } from '../rules';
import { facilityView } from './present';

export type FacilitiesRowProps = {
  run: BomRun;
  /** Given in the shop only: Facilities sell for half their cost. */
  onSell?: (facilityId: string) => void;
};

/** Owned Facilities: permanent rules that apply to every Ship (or Fabricate, or round). */
export function FacilitiesRow({ run, onSell }: FacilitiesRowProps) {
  const slots = run.config.shop.maxFacilities;
  const empty = Math.max(0, slots - run.facilities.length);
  return (
    <section className="bom-facilities" aria-label="Facilities">
      <header className="bom-board__head">
        <h2 className="bom-board__title">Facilities</h2>
        <span className="bom-board__slots">
          {run.facilities.length}/{slots}
        </span>
        <span className="bom-facilities__note">Additive effects first, then multipliers. Order never matters.</span>
      </header>
      <div className="bom-facilities__slots">
        {run.facilities.map((facility) => {
          const sellable = run.whyCannotSell(facility.id) === null;
          const footer =
            onSell === undefined ? undefined : (
              <button type="button" className={`bom-facilities__sell ${sellable ? '' : 'btn--unaffordable'}`} onClick={() => onSell(facility.id)}>
                Sell ${run.sellValue(facility.cost)}
              </button>
            );
          return <Card key={facility.id} card={facilityView(facility)} compact footer={footer} />;
        })}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`empty-${i}`} className="bom-facilities__empty">
            Empty slot
          </div>
        ))}
      </div>
    </section>
  );
}
