import type { RoundSummaryView } from '../types';

export type RoundSummaryProps = {
  summary: RoundSummaryView;
  onCashOut: () => void;
};

export function RoundSummary({ summary, onCashOut }: RoundSummaryProps) {
  return (
    <section className="summary" aria-label="Round summary">
      <h2 className="summary__heading">{summary.heading}</h2>
      <ul className="summary__lines">
        {summary.lines.map((line) => (
          <li key={line.label} className="summary__line">
            <span>{line.label}</span>
            <span className="summary__amount">${line.amount}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--cash btn--large" onClick={onCashOut}>
        Cash out ${summary.total}
      </button>
    </section>
  );
}
