import { useCallback, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Card, ToastStack } from '../../../ui/components';
import type { BrowserGameProps } from '../../../ui/games';
import { durationToken } from '../../../ui/motion';
import { SilentPlayer } from '../../../ui/sound';
import type { KeyValueStore } from '../../../ui/storage';
import type { ToastKind, ToastView } from '../../../ui/types';
import type { ThroughputAction } from '../cli';
import { cardName } from '../model';
import { ThroughputRun } from '../rules';
import type { ShiftResult } from '../rules';
import { LineView } from './LineView';
import type { BayState } from './LineView';
import { MarketBoard } from './MarketBoard';
import { cardView } from './present';
import { RunAutosave, handNumber } from './run-autosave';
import { RunSummaryView } from './RunSummary';
import { playBeat, playFinale, playShiftAtOnce, shiftOutcome } from './shift-sound';
import type { ShiftOutcome } from './shift-sound';
import { Tip } from './Tip';
import { TipMemory, currentTip, tipText } from './tips';
import type { TipId } from './tips';
import { DeckDrawer, GrantPicker, PayoutSlip, RulesSheet, Shelf } from './ShopParts';
import { TpHud } from './TpHud';
import type { SalesReveal } from './TpHud';
import { TraceReceipt } from './TraceReceipt';
import { ShiftReplay, replayTiming } from '../spectacle';
import type { ReplayTiming } from '../spectacle';
import './throughput.css';

/** What a tap means right now. Cards are tracked by uid because hand positions shift. */
type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'place'; readonly uid: number }
  | { readonly kind: 'retool'; readonly uids: readonly number[] }
  | { readonly kind: 'install'; readonly offer: number }
  | { readonly kind: 'contract'; readonly offer: number }
  | { readonly kind: 'grant'; readonly offer: number }
  | { readonly kind: 'fixture'; readonly slot: number };

const IDLE: Mode = { kind: 'idle' };

const SILENT = new SilentPlayer();

type ShiftRecord = { readonly result: ShiftResult; readonly heading: string; readonly salesBefore: number; readonly target: number };

/** A Run playing on the belt. The run itself is untouched until the replay finishes or the player moves on. */
type Replay = { readonly key: number; readonly result: ShiftResult; readonly shift: number; readonly outcome: ShiftOutcome; readonly timing: ReplayTiming };

type Session = { readonly run: ThroughputRun; readonly autosave: RunAutosave };

/** The autosaved run if `resume` and it still replays, else a fresh autosaved run from `seed`. */
function openSession(store: KeyValueStore, seed: number, resume: boolean): Session & { readonly notice: string | null } {
  const restored = resume ? RunAutosave.restore(store) : null;
  if (restored?.ok === true) return { run: restored.run, autosave: restored.autosave, notice: null };
  const notice = restored === null ? null : `Your saved run couldn't be restored (${restored.reason}), so a new run has started.`;
  return { run: new ThroughputRun(seed), autosave: RunAutosave.start(store, seed), notice };
}

/** THROUGHPUT in the browser: tap a card, then a bay; run the Shift; shop for Fixtures between rounds. */
export function ThroughputScreen({ seed, onQuit, store, resume, sound = SILENT }: BrowserGameProps) {
  const [opened] = useState(() => openSession(store, seed, resume));
  const [{ run, autosave }, setSession] = useState<Session>(opened);
  const [, setVersion] = useState(0);
  const [mode, setMode] = useState<Mode>(IDLE);
  const [toasts, setToasts] = useState<readonly ToastView[]>(() => (opened.notice === null ? [] : [{ id: 'tp-restore', kind: 'error', message: opened.notice }]));
  const [lastShift, setLastShift] = useState<ShiftRecord | null>(null);
  const [tips] = useState(() => new TipMemory(store));
  const [replay, setReplay] = useState<Replay | null>(null);
  /** The HUD counting Sales up from the replay's finale until the Run is applied. */
  const [reveal, setReveal] = useState<SalesReveal | null>(null);
  const toastId = useRef(0);
  const replayKey = useRef(0);
  /** A Run is replaying and not yet applied; guards against applying it twice. */
  const replaying = useRef(false);

  const notify = (kind: ToastKind, message: string) => setToasts((t) => [...t, { id: `tp-${toastId.current++}`, kind, message }]);
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  /**
   * Applies `action` if `reason` is null, autosaves it as `entry` (built before applying, while
   * hand numbers still name the cards) and re-renders; else explains why not.
   */
  const attempt = (reason: string | null, entry: ThroughputAction, action: () => void): void => {
    if (reason !== null) {
      notify('error', reason);
      return;
    }
    action();
    if (entry.verb === 'load') sound.play('load');
    if (entry.verb === 'buy') sound.play('buy');
    if (run.phase === 'won' || run.phase === 'lost') autosave.clear();
    else autosave.record(entry);
    // Doing what a tip explains retires it.
    if (entry.verb === 'load') tips.finish('load');
    if (entry.verb === 'run') tips.finish('load', 'run');
    if (entry.verb === 'continue') tips.finish('shop');
    setMode(IDLE);
    setVersion((v) => v + 1);
  };
  const newRun = () => {
    const next = Date.now();
    setSession({ run: new ThroughputRun(next), autosave: RunAutosave.start(store, next) });
    setMode(IDLE);
    setLastShift(null);
    setToasts([]);
    replaying.current = false;
    setReplay(null);
    setReveal(null);
  };

  if (run.phase === 'won' || run.phase === 'lost') return <RunSummaryView run={run} onNewRun={newRun} onQuit={onQuit} />;

  const handIndex = (uid: number) => run.hand.findIndex((c) => c.uid === uid);
  /** Picks up (or puts down) a card, offer or Fixture. */
  const pick = (next: Mode) => {
    sound.play('select');
    setMode(next);
  };

  // ---- Shift ----
  const tapHand = (i: number) => {
    const uid = run.hand[i]?.uid;
    if (uid === undefined) return;
    if (mode.kind === 'retool') {
      const marked = mode.uids.includes(uid) ? mode.uids.filter((u) => u !== uid) : [...mode.uids, uid];
      if (marked.length > run.config.retoolMax) return notify('info', `A Retool discards at most ${run.config.retoolMax} cards`);
      pick({ kind: 'retool', uids: marked });
      return;
    }
    pick(mode.kind === 'place' && mode.uid === uid ? IDLE : { kind: 'place', uid });
  };

  const tapBayInShift = (slot: number) => {
    const held = run.line[slot]?.card;
    if (mode.kind === 'place') {
      const placement = [{ hand: handIndex(mode.uid), slot }];
      const entry: ThroughputAction = { verb: 'load', placements: [{ hand: handNumber(run, handIndex(mode.uid)), slot }] };
      attempt(run.whyCannotLoad(placement), entry, () => run.load(placement));
    } else if (held != null && run.whyCannotUnload([slot]) === null) {
      attempt(run.whyCannotUnload([slot]), { verb: 'unload', slots: [slot] }, () => run.unload([slot]));
    } else if (held == null) {
      notify('info', 'Tap a card in your hand first, then a bay');
    }
  };

  /** Toast when a draw just Restocked the empty pile from the discards. */
  const announceRestock = (before: number) => {
    if (run.restocked > before) notify('info', `Restock: ${run.restocked - before} discards shuffled into a new draw pile`);
  };

  /**
   * Run plays the Shift on the belt first, from the preview (which is exactly what the Run will
   * make), and applies it when the replay ends. Under reduced motion it applies at once.
   */
  const runShift = () => {
    const reason = run.whyCannotRun();
    if (reason !== null) return notify('error', reason);
    const result = run.preview();
    const outcome = shiftOutcome(run, result);
    const timing = replayTiming();
    if (timing.instant) {
      playShiftAtOnce(sound, result, outcome);
      return applyRun();
    }
    replaying.current = true;
    setMode(IDLE);
    setReplay({ key: replayKey.current++, result, shift: run.shift, outcome, timing });
  };

  /** Applies the replayed Run: when the replay is done, or as soon as the player does anything else. */
  const finishReplay = () => {
    if (!replaying.current) return;
    replaying.current = false;
    setReplay(null);
    setReveal(null);
    applyRun();
  };

  /** Any tap outside the replay while it plays applies the Run instead, so the replay never holds the player up. */
  const tapDuringReplay = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('.tp-replay') !== null) return;
    event.preventDefault();
    event.stopPropagation();
    finishReplay();
  };

  const applyRun = () => {
    const before = { salesBefore: run.sales, target: run.target, heading: `Round ${run.round}, Shift ${run.shift}` };
    const restocked = run.restocked;
    attempt(run.whyCannotRun(), { verb: 'run' }, () => {
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
    if (item.kind === 'fixture') return pick(mode.kind === 'install' && mode.offer === offer ? IDLE : { kind: 'install', offer });
    if (item.kind === 'contract' && item.def.targetsCard) return pick(mode.kind === 'contract' && mode.offer === offer ? IDLE : { kind: 'contract', offer });
    if (item.kind === 'contract' && item.def.targetsCategory) return pick(mode.kind === 'grant' && mode.offer === offer ? IDLE : { kind: 'grant', offer });
    attempt(run.whyCannotBuy(offer), { verb: 'buy', offer, target: null }, () => run.buy(offer));
  };

  const tapBayInShop = (slot: number) => {
    if (mode.kind === 'install') return attempt(run.whyCannotBuy(mode.offer, { slot }), { verb: 'buy', offer: mode.offer, target: slot }, () => run.buy(mode.offer, { slot }));
    if (mode.kind === 'fixture' && mode.slot !== slot) {
      return attempt(run.whyCannotMove(mode.slot, slot), { verb: 'move', from: mode.slot, to: slot }, () => run.moveFixture(mode.slot, slot));
    }
    if (run.line[slot]?.fixture != null) return pick(mode.kind === 'fixture' ? IDLE : { kind: 'fixture', slot });
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
  const tip = currentTip(run, preview, tips.done);
  const tipFor = (id: TipId) =>
    tip === id && (
      <Tip
        id={id}
        text={tipText(id, run)}
        onDone={() => tips.finish(id) && setVersion((v) => v + 1)}
        onTurnOff={() => tips.finishAll() && setVersion((v) => v + 1)}
      />
    );
  const pendingFixture = mode.kind === 'fixture' ? run.line[mode.slot]?.fixture : null;

  return (
    <main
      className={`screen screen--tp ${inShift ? 'screen--tp-shift' : 'screen--tp-shop'}`}
      data-replay={replay !== null || undefined}
      onClickCapture={replay !== null ? tapDuringReplay : undefined}
    >
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <TpHud run={run} reveal={reveal} />
      {!inShift && <PayoutSlip run={run} />}
      <MarketBoard run={run} preview={preview} />
      <LineView run={run} bayState={bayState} onBay={inShift ? tapBayInShift : tapBayInShop} onScrap={inShift ? (s) => attempt(run.whyCannotScrap([s]), { verb: 'scrap', slots: [s] }, () => run.scrap([s])) : undefined} bayLabel={bayLabel} />
      {replay !== null && (
        <ShiftReplay
          key={replay.key}
          result={replay.result}
          shift={replay.shift}
          baseMargin={run.config.baseMargin}
          onBeat={(beat) => playBeat(sound, beat, replay.timing.stepMs)}
          onFinale={() => {
            playFinale(sound, replay.outcome, durationToken('--dur-med', 240));
            setReveal({ from: run.sales, to: Math.max(0, run.sales + replay.result.total) });
          }}
          onDone={finishReplay}
        />
      )}

      {inShift && preview !== null && (
        <div className="tp-desk">
          <section className="hand tp-hand" aria-label="Hand">
            <p className="tp-hint">{shiftHint(run, mode)}</p>
            {tipFor('load')}
            <div className="hand__cards">
              {run.hand.map((card, i) => {
                const selected = (mode.kind === 'place' && mode.uid === card.uid) || (mode.kind === 'retool' && mode.uids.includes(card.uid));
                return <Card key={card.uid} card={cardView(card, undefined, run.demandLeft)} index={i} selected={selected} onClick={() => tapHand(i)} />;
              })}
            </div>
            {tipFor('run')}
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
                      attempt(run.whyCannotRetool(hand), { verb: 'retool', hand: hand.map((h) => handNumber(run, h)) }, () => {
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
              <button type="button" className="btn btn--discard" onClick={() => attempt(run.whyCannotSellFixture(mode.slot), { verb: 'sell', what: 'fixture', index: mode.slot }, () => run.sellFixture(mode.slot))}>
                Sell {Math.floor(pendingFixture.paid * run.config.sellRate)}C
              </button>
              <button type="button" className="btn" onClick={() => setMode(IDLE)}>
                Cancel
              </button>
            </div>
          )}
          {mode.kind === 'install' && <p className="tp-hint tp-hint--shop">Tap a bay without a Fixture to install it.</p>}
          {tipFor('shop')}
          <Shelf
            run={run}
            pending={mode.kind === 'install' || mode.kind === 'contract' || mode.kind === 'grant' ? mode.offer : null}
            onBuy={buy}
            onReroll={() => attempt(run.whyCannotReroll(), { verb: 'reroll' }, () => run.reroll())}
            onContinue={() =>
              attempt(run.whyCannotContinue(), { verb: 'continue' }, () => {
                run.continueToNextRound();
                setLastShift(null);
              })
            }
          />
          {mode.kind === 'grant' && (
            <GrantPicker
              run={run}
              onPick={(category, option) =>
                attempt(run.whyCannotBuy(mode.offer, { category, option }), { verb: 'buy', offer: mode.offer, target: null, grant: { category, option } }, () => {
                  run.buy(mode.offer, { category, option });
                  notify('success', `R&D Grant: ${category} ${option === 'scale' ? `Scale ${run.grants[category].scale}` : `Premium ${run.grants[category].premium}`}`);
                })
              }
              onCancel={() => setMode(IDLE)}
            />
          )}
          <DeckDrawer
            run={run}
            picking={mode.kind === 'contract' ? (run.offers[mode.offer]?.def.name ?? null) : null}
            onPick={(deckCard) =>
              mode.kind === 'contract' && attempt(run.whyCannotBuy(mode.offer, { deckCard }), { verb: 'buy', offer: mode.offer, target: deckCard }, () => run.buy(mode.offer, { deckCard }))
            }
            onSell={(deckCard) => attempt(run.whyCannotSellCard(deckCard), { verb: 'sell', what: 'card', index: deckCard }, () => run.sellCard(deckCard))}
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
