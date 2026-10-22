import type { ScoreContribution } from '../../../engine/scoring';
import type { ShipQuote } from '../rules';

export type ShipReceiptProps = {
  quote: ShipQuote;
  heading: string;
  /** Round revenue before this Ship, to show where it lands against the target. */
  revenueBefore: number;
  target: number;
  /** Demand a sell-out adds for good. */
  sellOutGrowth: number;
  /** Cash this Ship pays in Overtime; undefined outside Overtime. */
  overtimePay?: number;
};

const STAT_NAME: Readonly<Record<string, string>> = { units: 'Units', price: 'Price', demand: 'Demand', markup: 'Markup' };

const num = (n: number): string => String(Math.round(n * 100) / 100);

function amountText(c: ScoreContribution): string {
  const stat = STAT_NAME[c.stat] ?? c.stat;
  if (c.op === 'multiply') return `×${num(c.amount)}`;
  if (c.op === 'set') return `${stat} ${c.stat === 'price' ? '$' : ''}${num(c.amount)}`;
  const sign = c.amount >= 0 ? '+' : '−';
  return `${sign}${c.stat === 'price' ? '$' : ''}${num(Math.abs(c.amount))} ${stat}`;
}

/**
 * A Ship's ScoreContext log printed as a register receipt: the Product's base, each part, each
 * Facility or disruption, then min(Units, Demand) × Price × Markup.
 */
export function ShipReceipt({ quote, heading, revenueBefore, target, sellOutGrowth, overtimePay }: ShipReceiptProps) {
  const name = quote.blueprint.def.name;
  const log = quote.score.log;
  // The first entries set the blueprint's base Units, Price and Demand; print them as one line.
  const base = log.slice(0, 3).filter((c) => c.source === name && c.op === 'set');
  const rest = log.slice(base.length);
  const v = quote.score.values();
  const units = v.units ?? 0;
  const demand = v.demand ?? 0;
  const after = revenueBefore + quote.revenue;
  const over = Math.max(0, after - target);

  return (
    <section className="bom-receipt" aria-label={heading}>
      <div className="receipt">
        <header className="receipt__head">
          <span className="receipt__store">Throughput Co.</span>
          <span className="receipt__kind">{heading}</span>
        </header>
        <ol className="bom-receipt__lines">
          <li className="bom-receipt__line bom-receipt__line--base">
            <span>{name} base</span>
            <span>{base.map((c) => (c.stat === 'price' ? `$${num(c.amount)}` : `${num(c.amount)} ${STAT_NAME[c.stat] ?? c.stat}`)).join(', ')}</span>
          </li>
          {rest.map((c, i) => (
            <li key={`${i}-${c.source}`} className={`bom-receipt__line bom-receipt__line--${c.op}`}>
              <span>{c.source}</span>
              <span>{amountText(c)}</span>
            </li>
          ))}
        </ol>
        <p className="bom-receipt__formula">
          min({units} Units, {demand} Demand) × ${num(v.price ?? 0)}
          {(v.markup ?? 1) !== 1 ? ` × ${num(v.markup ?? 1)}` : ''}
        </p>
        <div className="receipt__total">
          <span className="receipt__total-label">Ship</span>
          <span className="tally__total">${quote.revenue}</span>
        </div>
        {quote.sellsOut && <p className="bom-receipt__note is-good">Sold out: Demand +{sellOutGrowth} for good</p>}
        {!quote.sellsOut && units > demand && <p className="bom-receipt__note">{units - demand} Units over Demand earn nothing</p>}
        {overtimePay !== undefined ? (
          <p className="bom-receipt__round is-cleared">Overtime Ship: +${overtimePay} cash, paid with the round&rsquo;s payout</p>
        ) : (
          <p className={`bom-receipt__round ${after >= target ? 'is-cleared' : ''}`}>
            Round ${after} of ${target}
            {after >= target ? `: target hit${over > 0 ? ` ($${over} over is not paid)` : ''}` : `: $${target - after} to go`}
          </p>
        )}
      </div>
    </section>
  );
}
