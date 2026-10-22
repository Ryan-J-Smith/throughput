import { useMemo, useState } from 'react';
import { Card } from '../../../ui/components';
import type { BrowserGameProps } from '../../../ui/games';
import { LineView, TraceReceipt, bossArt, cardView, offerView } from '../browser';
import { BOSSES, CONTRACTS, FIXTURES, SHOP_CARDS } from '../content';
import { CATEGORIES } from '../model';
import type { Offer } from '../rules';
import { ShiftReplay } from '../spectacle';
import { buildQaScene } from './scene';
import './qa.css';

const BOARDS = ['supply-shock', 'line-shift', 'bottleneck', 'short-week'] as const;

/**
 * Dev-only visual QA: the real Line, hand and receipt for a scripted Board round (every bay state
 * at once), then every shop item and Board with its art. Nothing here is interactive.
 */
export function ThroughputQa(_props: BrowserGameProps) {
  const [boss, setBoss] = useState<string>(BOARDS[0]);
  const [replay, setReplay] = useState(0);
  const { run, notes } = useMemo(() => buildQaScene(boss), [boss]);
  const preview = run.phase === 'shift' ? run.preview() : null;
  const shelf: Offer[] = [
    ...SHOP_CARDS.map((def, i) => ({ kind: 'card', def, category: CATEGORIES[i % CATEGORIES.length] ?? 'Gadgets', price: def.price }) as const),
    ...FIXTURES.map((def) => ({ kind: 'fixture', def, price: def.price }) as const),
    ...CONTRACTS.map((def) => ({ kind: 'contract', def, price: def.price }) as const),
  ];

  return (
    <>
      <p className="qa__notes">
        QA (dev): {notes.join(' · ')}.{' '}
        {BOARDS.map((b) => (
          <button key={b} type="button" className="tally__speed" aria-pressed={b === boss} onClick={() => setBoss(b)}>
            {b}
          </button>
        ))}
        <button type="button" className="btn btn--play qa__replay" disabled={preview === null} onClick={() => setReplay((r) => Math.abs(r) + 1)}>
          Play the Shift replay
        </button>
      </p>
      <main className="screen screen--tp screen--tp-shift" data-qa="line">
        <LineView run={run} bayState={() => 'idle'} onBay={() => {}} onScrap={() => {}} bayLabel={(slot) => `Bay ${slot + 1}`} />
        {preview !== null && replay > 0 && <ShiftReplay key={replay} result={preview} shift={run.shift} baseMargin={run.config.baseMargin} onDone={() => setReplay((r) => -r)} />}
        <div className="tp-desk">
          <section className="hand tp-hand" aria-label="Hand">
            <p className="tp-hint">The hand as dealt for this Shift.</p>
            <div className="hand__cards">
              {run.hand.map((card, i) => (
                <Card key={card.uid} card={cardView(card, undefined, run.demandLeft)} index={i} onClick={() => {}} />
              ))}
            </div>
            <div className="hand__controls tp-controls">
              <button type="button" className="btn btn--discard">
                Retool
              </button>
              <button type="button" className="btn btn--play">
                Run Shift {run.shift}: ${preview?.total ?? 0}
              </button>
            </div>
          </section>
          {preview !== null && (
            <aside className="tp-desk__receipt">
              <TraceReceipt result={preview} heading="If you run now" salesBefore={run.sales} target={run.target} />
            </aside>
          )}
        </div>
      </main>
      <section className="shop qa__shelf" data-qa="shelf" aria-label="Every shop item">
        <div className="shop__shelf">
          {shelf.map((offer, i) => (
            <div key={`${offer.kind}-${offer.def.id}`} className="shop__item">
              <Card card={offerView(offer, `qa-${i}`)} rarity={offer.kind === 'fixture' ? offer.def.rarity : undefined} />
            </div>
          ))}
        </div>
      </section>
      <ul className="qa__bosses" data-qa="bosses">
        {BOSSES.map((b) => (
          <li key={b.id} className="hud__boss">
            <span className="hud__boss-art">{bossArt(b.id) !== undefined && <img src={bossArt(b.id)} alt="" />}</span>
            <span className="hud__boss-name">{b.name}</span>
            <span className="hud__boss-desc">{b.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
