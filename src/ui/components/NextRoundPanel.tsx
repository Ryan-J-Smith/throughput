import type { NextRoundView } from '../types';
import { quarterOf } from '../format';

export type NextRoundPanelProps = {
  next: NextRoundView;
};

/** The upcoming round as a forecast memo: quarter, target, any board directive and rule changes. */
export function NextRoundPanel({ next }: NextRoundPanelProps) {
  const { quarter, year } = quarterOf(next.round);
  return (
    <section className={`next-round ${next.boss ? 'next-round--boss' : ''}`} aria-label={`Next round: round ${next.round}`}>
      <div className="next-round__header">
        <span className="section-label">Forecast</span>
        <span className="next-round__number">
          {quarter}, {year}
        </span>
        <span className="next-round__target">
          Target <strong>{next.target}</strong>
        </span>
      </div>
      {next.boss && (
        <div className="next-round__boss">
          <span className="next-round__boss-label">Board memo</span>
          <span className="next-round__boss-name">{next.boss.name}</span>
          <span className="next-round__boss-desc">{next.boss.description}</span>
        </div>
      )}
      {next.ruleChanges.length > 0 && (
        <ul className="next-round__changes">
          {next.ruleChanges.map((change) => (
            <li key={change.label} className={change.to < change.from ? 'is-worse' : 'is-better'}>
              {change.label} {change.from} → {change.to}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
