import { useState } from 'react';
import { Card, useTickingNumber } from '../../../ui/components';
import { prefersReducedMotion, speedScale } from '../../../ui/motion';
import type { ThroughputRun } from '../rules';
import { bossArt } from './art';
import { money, runSummary } from './present';
import './summary.css';

/** Puts text on the clipboard; rejects if the browser won't. */
export type CopyText = (text: string) => Promise<void>;

const clipboardCopy: CopyText = async (text) => {
  if (globalThis.navigator?.clipboard === undefined) throw new Error('No clipboard');
  await globalThis.navigator.clipboard.writeText(text);
};

export type RunSummaryViewProps = {
  run: ThroughputRun;
  onNewRun: () => void;
  onQuit: () => void;
  /** After a win: play on past the last planned round (endless). Omitted when the run can't. */
  onKeepGoing?: () => void;
  /** Defaults to the browser clipboard. */
  copy?: CopyText;
};

/** The end of a run: total sales as the headline, the best Shift, the build it ended with, and the seed. */
export function RunSummaryView({ run, onNewRun, onQuit, onKeepGoing, copy = clipboardCopy }: RunSummaryViewProps) {
  const summary = runSummary(run);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [countFrom] = useState(() => (prefersReducedMotion() ? summary.totalSales : 0));
  const [countMs] = useState(() => 1200 * speedScale());
  const total = useTickingNumber(summary.totalSales, countMs, countFrom);
  const fixtures = summary.line.filter((f) => f !== null).length;

  const copySeed = () => {
    copy(String(summary.seed)).then(
      () => setCopied('copied'),
      () => setCopied('failed'),
    );
  };

  return (
    <main className="screen tp-summary" data-screen="run-summary" data-outcome={summary.won ? 'won' : 'lost'} data-year={run.quarter.year} data-endless={summary.endless || undefined}>
      <div className="tp-summary__art" data-art={summary.won ? 'end-win' : 'end-loss'} aria-hidden="true" />
      <header className="tp-summary__header">
        <h1 className="tp-summary__title">{summary.won ? 'Victory' : 'Run over'}</h1>
        <p className="tp-summary__outcome">{summary.outcome}</p>
        {summary.finalBoss !== null && (
          <p className="tp-summary__boss" data-boss={summary.finalBoss.id}>
            {bossArt(summary.finalBoss.id) !== undefined && <img className="tp-summary__boss-art" src={bossArt(summary.finalBoss.id)} alt="" loading="lazy" />}
            <span>
              {summary.won ? 'Final Board: ' : 'Stopped by the Board: '}
              <strong>{summary.finalBoss.name}</strong>
            </span>
          </p>
        )}
      </header>

      <p className="tp-summary__hero" aria-label={`Total sales ${money(summary.totalSales)}`}>
        <span className="tp-summary__total" aria-hidden="true">
          {money(total)}
        </span>
        <span className="tp-summary__total-label">total sales</span>
      </p>

      <dl className="tp-summary__stats">
        {summary.bestShift !== null && (
          <div className="tp-summary__stat" data-stat="best-shift">
            <dt>Best Shift</dt>
            <dd>
              <span className="tp-summary__stat-value">{money(summary.bestShift.total)}</span>
              <span className="tp-summary__stat-note">{summary.bestShift.where}</span>
            </dd>
          </div>
        )}
        <div className="tp-summary__stat" data-stat="rounds">
          <dt>Rounds cleared</dt>
          <dd>
            <span className="tp-summary__stat-value">{summary.endless ? summary.roundsCleared : `${summary.roundsCleared} of ${summary.rounds}`}</span>
            {summary.endless && summary.wonAtRound !== null && <span className="tp-summary__stat-note">won at round {summary.wonAtRound}</span>}
          </dd>
        </div>
        <div className="tp-summary__stat" data-stat="capital">
          <dt>Capital left</dt>
          <dd>
            <span className="tp-summary__stat-value">{run.wallet.cash}C</span>
          </dd>
        </div>
      </dl>

      <section className="tp-summary__build" aria-labelledby="tp-summary-line">
        <h2 id="tp-summary-line" className="tp-summary__heading">
          Your Line{fixtures === 0 ? ': no Fixtures' : ''}
        </h2>
        {fixtures > 0 && (
          <ol className="tp-summary__line">
            {summary.line.map((view, slot) => (
              <li key={slot} className="tp-summary__bay" data-slot={slot + 1} data-empty={view === null || undefined}>
                {view === null ? <span className="tp-summary__empty">Bay {slot + 1}</span> : <Card card={view} />}
              </li>
            ))}
          </ol>
        )}
        {summary.grants.length > 0 && (
          <p className="tp-summary__grants">
            <span className="tp-summary__grants-label">R&amp;D Grants</span> {summary.grants.join(' · ')}
          </p>
        )}
        <h2 className="tp-summary__heading">Your deck ({summary.deckSize} cards)</h2>
        <ul className="tp-summary__cards">
          {summary.deck.map(({ view, count }) => (
            <li key={view.id} data-count={count}>
              <Card card={view} compact />
              {count > 1 && <span className="tp-summary__count">×{count}</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="tp-summary__seed">
        <span className="tp-summary__seed-label">Seed</span>
        <code className="tp-summary__seed-value">{summary.seed}</code>
        <button type="button" className="btn tp-summary__copy" onClick={copySeed}>
          {copied === 'copied' ? 'Copied' : 'Copy seed'}
        </button>
        <span className="tp-summary__seed-note" role="status">
          {copied === 'failed' ? 'Copying is blocked here; select the seed to copy it.' : 'Enter it under Custom seed to play this run again.'}
        </span>
      </div>

      <div className="tp-summary__actions">
        <button type="button" className="btn btn--play btn--large" onClick={onNewRun}>
          New run
        </button>
        {onKeepGoing !== undefined && (
          <button type="button" className="btn btn--large" data-action="keep-going" onClick={onKeepGoing}>
            Keep going
          </button>
        )}
        <button type="button" className="btn btn--large" onClick={onQuit}>
          Menu
        </button>
      </div>
    </main>
  );
}
