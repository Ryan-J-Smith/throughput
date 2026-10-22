import { useCallback, useRef, useState } from 'react';
import { Card, ToastStack } from '../../../ui/components';
import type { BrowserGameProps } from '../../../ui/games';
import type { ToastKind, ToastView } from '../../../ui/types';
import { cardName } from '../model';
import { ThroughputRun } from '../rules';
import type { ShiftResult } from '../rules';
import { LineView } from './LineView';
import type { BayState } from './LineView';
import { MarketBoard } from './MarketBoard';
import { cardView } from './present';
import { DeckDrawer, PayoutSlip, RulesSheet, Shelf } from './ShopParts';
import { TpHud } from './TpHud';
import { TraceReceipt } from './TraceReceipt';
import './throughput.css';

/** What a tap means right now. Cards are tracked by uid because hand positions shift. */
type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'place'; readonly uid: number }
  | { readonly kind: 'retool'; readonly uids: readonly number[] }
  | { readonly kind: 'install'; readonly offer: number }
  | { readonly kind: 'contract'; readonly offer: number }
  | { readonly kind: 'fixture'; readonly slot: number };

const IDLE: Mode = { kind: 'idle' };

type ShiftRecord = { readonly result: ShiftResult; readonly heading: string; readonly salesBefore: number; readonly target: number };

/** THROUGHPUT in the browser: tap a card, then a bay; run the Shift; shop for Fixtures between rounds. */
export function ThroughputScreen({ seed, onQuit }: BrowserGameProps) {
  const [run, setRun] = useState(() => new ThroughputRun(seed));
  const [, setVersion] = useState(0);
  const [mode, setMode] = useState<Mode>(IDLE);
  const [toasts, setToasts] = useState<readonly ToastView[]>([]);
  const [lastShift, setLastShift] = useState<ShiftRecord | null>(null);
  const toastId = useRef(0);

  const notify = (kind: ToastKind, message: string) => setToasts((t) => [...t, { id: `tp-${toastId.current++}`, kind, message }]);
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  /** Applies `action` if `reason` is null (then re-renders), else explains why not. */
  const attempt = (reason: string | null, action: () => void): void => {
    if (reason !== null) {
      notify('error', reason);
      return;
    }
    action();
    setMode(IDLE);
    setVersion((v) => v + 1);
  };
  const newRun = () => {
    setRun(new ThroughputRun(Date.now()));
    setMode(IDLE);
    setLastShift(null);
    setToasts([]);
  };

  if (run.phase === 'won' || run.phase === 'lost') return <EndView run={run} onNewRun={newRun} onQuit={onQuit} />;

  const handIndex = (uid: number) => run.hand.findIndex((c) => c.uid === uid);

  // ---- Shift ----
  const tapHand = (i: number) => {
    const uid = run.hand[i]?.uid;
    if (uid === undefined) return;
    if (mode.kind === 'retool') {
      const marked = mode.uids.includes(uid) ? mode.uids.filter((u) => u !== uid) : [...mode.uids, uid];
      if (marked.length > run.config.retoolMax) return notify('info', `A Retool discards at most ${run.config.retoolMax} cards`);
      setMode({ kind: 'retool', uids: marked });
      return;
    }
    setMode(mode.kind === 'place' && mode.uid === uid ? IDLE : { kind: 'place', uid });
  };

  const tapBayInShift = (slot: number) => {
    const held = run.line[slot]?.card;
    if (mode.kind === 'place') {
      const placement = [{ hand: handIndex(mode.uid), slot }];
      attempt(run.whyCannotLoad(placement), () => run.load(placement));
    } else if (held != null && run.whyCannotUnload([slot]) === null) {
      attempt(run.whyCannotUnload([slot]), () => run.unload([slot]));
    } else if (held == null) {
      notify('info', 'Tap a card in your hand first, then a bay');
    }
  };

  /** Toast when a draw just Restocked the empty pile from the discards. */
  const announceRestock = (before: number) => {
    if (run.restocked > before) notify('info', `Restock: ${run.restocked - before} discards shuffled into a new draw pile`);
  };

  const runShift = () => {
    const before = { salesBefore: run.sales, target: run.target, heading: `Round ${run.round}, Shift ${run.shift}` };
    const restocked = run.restocked;
    attempt(run.whyCannotRun(), () => {
      const result = run.runShift();
      setLastShift({ result, ...before });
      if (run.phase === 'shop') notify('success', `Target hit! Shift made $${result.total}`);
      else if (run.phase === 'shift') notify('info', `Shift made $${result.total}`);
      if (run.phase === 'shift') announceRestock(restocked);
    });
  };

  // ---- Shop ----
  const buy = (offer: number) => {
    const item = run.offers[offer];
    if (item == null) return;
    if (!run.wallet.canAfford(item.price)) return notify('error', `Not enough Capital (${item.price}C)`);
    if (item.kind === 'fixture') return setMode(mode.kind === 'install' && mode.offer === offer ? IDLE : { kind: 'install', offer });
    if (item.kind === 'contract' && item.def.targetsCard) return setMode(mode.kind === 'contract' && mode.offer === offer ? IDLE : { kind: 'contract', offer });
    attempt(run.whyCannotBuy(offer), () => run.buy(offer));
  };

  const tapBayInShop = (slot: number) => {
    if (mode.kind === 'install') return attempt(run.whyCannotBuy(mode.offer, { slot }), () => run.buy(mode.offer, { slot }));
    if (mode.kind === 'fixture' && mode.slot !== slot) return attempt(run.whyCannotMove(mode.slot, slot), () => run.moveFixture(mode.slot, slot));
    if (run.line[slot]?.fixture != null) return setMode(mode.kind === 'fixture' ? IDLE : { kind: 'fixture', slot });
    notify('info', 'Buy a Fixture, then choose its bay');
  };

  const inShift = run.phase === 'shift';
  const bayState = (slot: number): BayState => {
    const state = run.line[slot];
    if (state === undefined) return 'idle';
    if (inShift) return mode.kind === 'place' && run.whyCannotLoad([{ hand: Math.max(0, handIndex(mode.uid)), slot }]) === null ? 'target' : 'idle';
    if (mode.kind === 'install') return state.fixture === null ? 'target' : 'idle';
    if (mode.kind === 'fixture') return slot === mode.slot ? 'selected' : 'target';
    return 'idle';
  };
  const bayLabel = (slot: number) => {
    const state = run.line[slot];
    const card = state?.card?.card;
    return `Bay ${slot + 1}${state?.fixture ? `, ${state.fixture.def.name}` : ''}${card ? `, ${cardName(card)}` : ', empty'}`;
  };

  const preview = inShift ? run.preview() : null;
  const pendingFixture = mode.kind === 'fixture' ? run.line[mode.slot]?.fixture : null;

  return (
    <main className={`screen screen--tp ${inShift ? 'screen--tp-shift' : 'screen--tp-shop'}`}>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <TpHud run={run} />
      {!inShift && <PayoutSlip run={run} />}
      <MarketBoard run={run} />
      <LineView run={run} bayState={bayState} onBay={inShift ? tapBayInShift : tapBayInShop} onScrap={inShift ? (s) => attempt(run.whyCannotScrap([s]), () => run.scrap([s])) : undefined} bayLabel={bayLabel} />

      {inShift && preview !== null && (
        <div className="tp-desk">
          <section className="hand tp-hand" aria-label="Hand">
            <p className="tp-hint">{shiftHint(run, mode)}</p>
            <div className="hand__cards">
              {run.hand.map((card, i) => {
                const selected = (mode.kind === 'place' && mode.uid === card.uid) || (mode.kind === 'retool' && mode.uids.includes(card.uid));
                return <Card key={card.uid} card={cardView(card)} index={i} selected={selected} onClick={() => tapHand(i)} />;
              })}
            </div>
            <div className="hand__controls tp-controls">
              {mode.kind === 'retool' ? (
                <>
                  <button
                    type="button"
                    className="btn btn--discard"
                    disabled={mode.uids.length === 0}
                    onClick={() => {
                      const hand = mode.uids.map(handIndex);
                      const restocked = run.restocked;
                      attempt(run.whyCannotRetool(hand), () => {
                        run.retool(hand);
                        announceRestock(restocked);
                      });
                    }}
                  >
                    Retool {mode.uids.length}
                  </button>
                  <button type="button" className="btn" onClick={() => setMode(IDLE)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn--discard" disabled={run.whyCannotRetool([0]) !== null} onClick={() => setMode({ kind: 'retool', uids: [] })}>
                  Retool ({run.retoolsLeft} left)
                </button>
              )}
              <span className="hand__count">
                Draw pile {run.drawPile.length}
                {run.config.restocksPerRound > 0 && (run.restocksLeft > 0 ? ', Restock ready' : ', Restocked')}
              </span>
              <button type="button" className="btn btn--play" onClick={runShift}>
                Run Shift {run.shift}: ${preview.total}
              </button>
            </div>
          </section>
          <aside className="tp-desk__receipt">
            <TraceReceipt
              result={preview}
              heading="If you run now"
              salesBefore={run.sales}
              target={run.target}
              overkillPay={run.overkillPayFor(Math.max(0, run.sales + preview.total))}
            />
          </aside>
        </div>
      )}

      {!inShift && (
        <>
          {pendingFixture != null && mode.kind === 'fixture' && (
            <div className="tp-fixture-bar">
              <span>
                {pendingFixture.def.name}: tap another bay to move it ({run.config.moveCost}C), or
              </span>
              <button type="button" className="btn btn--discard" onClick={() => attempt(run.whyCannotSellFixture(mode.slot), () => run.sellFixture(mode.slot))}>
                Sell {Math.floor(pendingFixture.paid * run.config.sellRate)}C
              </button>
              <button type="button" className="btn" onClick={() => setMode(IDLE)}>
                Cancel
              </button>
            </div>
          )}
          {mode.kind === 'install' && <p className="tp-hint tp-hint--shop">Tap a bay without a Fixture to install it.</p>}
          <Shelf
            run={run}
            pending={mode.kind === 'install' || mode.kind === 'contract' ? mode.offer : null}
            onBuy={buy}
            onReroll={() => attempt(run.whyCannotReroll(), () => run.reroll())}
            onContinue={() =>
              attempt(run.whyCannotContinue(), () => {
                run.continueToNextRound();
                setLastShift(null);
              })
            }
          />
          <DeckDrawer
            run={run}
            picking={mode.kind === 'contract' ? (run.offers[mode.offer]?.def.name ?? null) : null}
            onPick={(deckCard) => mode.kind === 'contract' && attempt(run.whyCannotBuy(mode.offer, { deckCard }), () => run.buy(mode.offer, { deckCard }))}
            onSell={(deckCard) => attempt(run.whyCannotSellCard(deckCard), () => run.sellCard(deckCard))}
          />
        </>
      )}

      {lastShift !== null && (
        <details className="tp-last">
          <summary>Last Shift receipt (${lastShift.result.total})</summary>
          <TraceReceipt result={lastShift.result} heading={lastShift.heading} salesBefore={lastShift.salesBefore} target={lastShift.target} />
        </details>
      )}
      <RulesSheet run={run} />
    </main>
  );
}

function shiftHint(run: ThroughputRun, mode: Mode): string {
  if (mode.kind === 'retool') return `Tap up to ${run.config.retoolMax} cards to discard; you draw as many.`;
  if (mode.kind === 'place') {
    const card = run.hand.find((c) => c.uid === mode.uid);
    return card === undefined ? 'Tap a bay.' : `Tap an empty bay for ${cardName(card)}.`;
  }
  return 'Tap a card, then a bay. Tap a card you loaded to take it back.';
}

function EndView({ run, onNewRun, onQuit }: { run: ThroughputRun; onNewRun: () => void; onQuit: () => void }) {
  const won = run.phase === 'won';
  const q = run.quarter;
  return (
    <main className={`screen screen--end ${won ? 'screen--victory' : 'screen--game-over'}`}>
      <h1 className="end-title">{won ? 'Victory' : 'Run over'}</h1>
      <dl className="end-stats">
        <dt>Reached</dt>
        <dd>
          Year {q.year} {q.isBoard ? 'Board' : `Q${q.quarter}`}
        </dd>
        <dt>Sales</dt>
        <dd>
          ${run.sales} / ${run.target}
        </dd>
        <dt>Capital</dt>
        <dd>{run.wallet.cash}C</dd>
      </dl>
      <div className="tp-end-actions">
        <button type="button" className="btn btn--play btn--large" onClick={onNewRun}>
          New run
        </button>
        <button type="button" className="btn btn--large" onClick={onQuit}>
          All games
        </button>
      </div>
    </main>
  );
}
