import type { NextRoundView } from '../types';

export type NextRoundPanelProps = {
  next: NextRoundView;
};

export function NextRoundPanel({ next }: NextRoundPanelProps) {
  return (
    <section className={`next-round ${next.boss ? 'next-round--boss' : ''}`} aria-label="Next round">
      <div className="next-round__header">
        <span className="section-label">Next round</span>
        <span className="next-round__number">Round {next.round}</span>
        <span className="next-round__target">
          Target <strong>{next.target}</strong>
        </span>
      </div>
      {next.boss && (
        <div className="next-round__boss">
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
