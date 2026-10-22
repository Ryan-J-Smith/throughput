import { Fragment } from 'react';
import { Icon } from '../../../ui/icons';
import { formatAmount } from '../model';
import type { ShiftResult, SlotTrace } from '../rules';
import { eventHelp } from './present';

export type TraceReceiptProps = {
  result: ShiftResult;
  heading: string;
  /** Round Sales before this Shift, to show where it lands against the target. */
  salesBefore: number;
  target: number;
  /** Overkill pay if this Shift clears the round (preview only). */
  overkillPay?: number;
  /** A line under the slots explaining the total, e.g. what a Shift with no Ship still earns (preview only). */
  note?: string | null;
  /** The Margin every Shift's Batch starts at, for the Margin column's explanation. */
  baseMargin?: number;
};

/** A Shift's Batch printed as a register receipt: one line per slot, then leftovers and the total. */
export function TraceReceipt({ result, heading, salesBefore, target, overkillPay, note = null, baseMargin }: TraceReceiptProps) {
  const after = Math.max(0, salesBefore + result.total);
  const cleared = result.leftover;
  return (
    <section className="tp-receipt" aria-label={heading}>
      <div className="receipt">
        <header className="receipt__head">
          <span className="receipt__store">Shelf Life Co.</span>
          <span className="receipt__kind">{heading}</span>
        </header>
        <div className="tp-receipt__line tp-receipt__cols">
          <span className="tp-receipt__slot-head" title="Slot">#</span>
          <span>What ran</span>
          <span className="tp-receipt__batch">
            <abbr title="Units in the Batch after this slot: Makes add Units, and Ships sell them.">Units</abbr>{' '}
            <abbr
              title={`Margin: the $ each Unit sells for.${baseMargin === undefined ? '' : ` Every Shift's Batch starts at $${formatAmount(baseMargin)};`} Designs, Handoffs and Fixtures raise it.`}
            >
              Margin
            </abbr>
          </span>
          <span className="tp-receipt__amount">Sold</span>
        </div>
        <ol className="tp-receipt__lines">
          {result.steps.map((step, i) => {
            const earned = step.sales - (result.steps[i - 1]?.sales ?? 0);
            const empty = !step.welded && step.fixture === null && step.card === null;
            // A welded slot's only event is "Welded shut", which its line already says.
            const events = step.welded ? [] : step.events;
            return (
              <li key={step.slot} className={`tp-receipt__line ${empty ? 'is-empty' : ''} ${step.welded ? 'is-welded' : ''}`}>
                <span className="tp-receipt__slot">{step.slot}</span>
                <span className="tp-receipt__what">
                  <SlotParts step={step} />
                  {events.length > 0 && (
                    <small>
                      {events.map((event, e) => (
                        <Fragment key={e}>
                          {e > 0 && '; '}
                          {eventHelp(event) === undefined ? event : <abbr title={eventHelp(event)}>{event}</abbr>}
                        </Fragment>
                      ))}
                    </small>
                  )}
                </span>
                <span className="tp-receipt__batch">
                  {step.units}u ${formatAmount(step.margin)}
                </span>
                <span className="tp-receipt__amount">{earned > 0 ? `$${earned}` : ''}</span>
              </li>
            );
          })}
          {cleared > 0 && (
            <li className="tp-receipt__line tp-receipt__line--leftover">
              <span className="tp-receipt__slot" />
              <span className="tp-receipt__what">
                Leftover {result.leftover} Units
                <small>
                  {`${cleared} cleared`}
                </small>
              </span>
              <span className="tp-receipt__batch" />
              <span className="tp-receipt__amount">{result.overstockSales !== 0 ? `${result.overstockSales < 0 ? '-' : ''}$${Math.abs(result.overstockSales)}` : ''}</span>
            </li>
          )}
          {result.overCap > 0 && (
            <li className="tp-receipt__line tp-receipt__line--capped">
              <span className="tp-receipt__slot" />
              <span className="tp-receipt__what">
                Shift cap ${result.total}
                <small>{`$${result.overCap} over the cap doesn't count`}</small>
              </span>
              <span className="tp-receipt__batch" />
              <span className="tp-receipt__amount">-${result.overCap}</span>
            </li>
          )}
        </ol>
        {note !== null && <p className="tp-receipt__note">{note}</p>}
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

/** What ran in a slot: its Fixture as a chip (struck through when idle), then the card. */
function SlotParts({ step }: { step: SlotTrace }) {
  if (step.welded) return <span className="tp-receipt__card">Welded shut</span>;
  if (step.fixture === null && step.card === null) return <span className="tp-receipt__card">Empty</span>;
  return (
    <>
      {step.fixture !== null && (
        <span
          className="tp-receipt__fixture"
          data-kind={step.fixture.kind}
          data-idle={step.idle || undefined}
          title={step.idle ? `${step.fixture.name}: idle for this card` : step.fixture.name}
        >
          <Icon name={step.fixture.kind === 'station' ? 'station' : 'mod'} className="tp-receipt__fixture-icon" />
          {step.fixture.name}
        </span>
      )}
      {step.fixture !== null && step.card !== null && ' '}
      {step.card !== null && <span className="tp-receipt__card">{step.card}</span>}
    </>
  );
}
