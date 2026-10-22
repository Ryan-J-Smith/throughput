import { formatAmount } from '../model';
import type { ShiftResult } from '../rules';

export type TraceReceiptProps = {
  result: ShiftResult;
  heading: string;
  /** Round Sales before this Shift, to show where it lands against the target. */
  salesBefore: number;
  target: number;
  /** Overkill pay if this Shift clears the round (preview only). */
  overkillPay?: number;
};

/** A Shift's Batch printed as a register receipt: one line per slot, then leftovers and the total. */
export function TraceReceipt({ result, heading, salesBefore, target, overkillPay }: TraceReceiptProps) {
  const after = Math.max(0, salesBefore + result.total);
  const cleared = result.leftover - result.storedUnits;
  return (
    <section className="tp-receipt" aria-label={heading}>
      <div className="receipt">
        <header className="receipt__head">
          <span className="receipt__store">Shelf Life Co.</span>
          <span className="receipt__kind">{heading}</span>
        </header>
        <ol className="tp-receipt__lines">
          {result.steps.map((step, i) => {
            const earned = step.sales - (result.steps[i - 1]?.sales ?? 0);
            return (
              <li key={step.slot} className={`tp-receipt__line ${step.label === '(empty)' ? 'is-empty' : ''}`}>
                <span className="tp-receipt__slot">{step.slot}</span>
                <span className="tp-receipt__what">
                  {step.label}
                  {step.events.length > 0 && <small>{step.events.join('; ')}</small>}
                </span>
                <span className="tp-receipt__batch">
                  {step.units}u ${formatAmount(step.margin)}
                </span>
                <span className="tp-receipt__amount">{earned > 0 ? `$${earned}` : ''}</span>
              </li>
            );
          })}
          {(cleared > 0 || result.storedUnits > 0) && (
            <li className="tp-receipt__line tp-receipt__line--leftover">
              <span className="tp-receipt__slot" />
              <span className="tp-receipt__what">
                Leftover {result.leftover} Units
                <small>
                  {[result.storedUnits > 0 ? `${result.storedUnits} stored` : '', cleared > 0 ? `${cleared} cleared` : ''].filter(Boolean).join(', ')}
                </small>
              </span>
              <span className="tp-receipt__batch" />
              <span className="tp-receipt__amount">{result.overstockSales !== 0 ? `${result.overstockSales < 0 ? '-' : ''}$${Math.abs(result.overstockSales)}` : ''}</span>
            </li>
          )}
        </ol>
        <div className="receipt__total">
          <span className="receipt__total-label">Shift</span>
          <span className="tally__total">${result.total}</span>
        </div>
        <p className={`tp-receipt__round ${after >= target ? 'is-cleared' : ''}`}>
          Round ${after} of ${target}
          {after >= target ? `: target hit${overkillPay !== undefined && overkillPay > 0 ? `, +${overkillPay}C overkill` : ''}` : `: $${target - after} to go`}
        </p>
      </div>
    </section>
  );
}
