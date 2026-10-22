import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Card, ToastStack } from '../../../ui/components';
import type { BrowserGameProps } from '../../../ui/games';
import { durationToken } from '../../../ui/motion';
import { SilentPlayer } from '../../../ui/sound';
import type { KeyValueStore } from '../../../ui/storage';
import type { CardView, ToastKind, ToastView } from '../../../ui/types';
import { noShipNote, shipsToDraw } from '../cli';
import type { ThroughputAction } from '../cli';
import { cardName } from '../model';
import { ThroughputRun } from '../rules';
import type { ShiftResult } from '../rules';
import { IDLE, KEYS_HINT, dropKind, firstOpenBay, keyPressesControl, shiftKey } from './input';
import type { Mode, ShiftIntent } from './input';
import { LineView } from './LineView';
import type { BayState } from './LineView';
import { MarketBoard } from './MarketBoard';
import { PileStack } from './PileStack';
import { cardView, lineFaces, overkillHelp } from './present';
import { RunAutosave, handNumber } from './run-autosave';
import { RunSummaryView } from './RunSummary';
import { beatReveal, hitStopMs, salesBefore } from './replay-hud';
import { playBeat, playFinale, playShiftAtOnce, shiftOutcome } from './shift-sound';
import type { ShiftOutcome } from './shift-sound';
import { Tip } from './Tip';
import { TipMemory, currentTip, tipText } from './tips';
import type { TipId } from './tips';
import { DeckDrawer, GrantPicker, PayoutSlip, RulesSheet, Shelf } from './ShopParts';
import { TpHud } from './TpHud';
import type { SalesReveal } from './TpHud';
import { TraceReceipt } from './TraceReceipt';
import { ShiftReplay, replayTiming, shiftBeats } from '../spectacle';
import type { ReplayTiming, ShiftBeats } from '../spectacle';
import './throughput.css';

const SILENT = new SilentPlayer();

type ShiftRecord = { readonly result: ShiftResult; readonly heading: string; readonly salesBefore: number; readonly target: number };

/** A Run playing on the belt. The run itself is untouched until the replay finishes or the player moves on. */
type Replay = {
  readonly key: number;
  readonly result: ShiftResult;
  readonly beats: ShiftBeats;
  readonly shift: number;
  readonly outcome: ShiftOutcome;
  readonly timing: ReplayTiming;
  /** The card or Station in each bay as the Run starts, drawn on the belt. */
  readonly faces: readonly (CardView | null)[];
};

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
  /** The HUD counting Sales up as the replay banks each sale, then its total, until the Run is applied. */
  const [reveal, setReveal] = useState<SalesReveal | null>(null);
  const toastId = useRef(0);
  const replayKey = useRef(0);
  /** A Run is replaying and not yet applied; guards against applying it twice. */
  const replaying = useRef(false);
  /** The hand card being dragged onto the Line, if any. */
  const [dragging, setDragging] = useState<number | null>(null);
  /** This render's key handler; the window listener below always calls the latest. */
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {});
  /** Focus last moved with Tab, not a click: Space and Enter then press the focused control. */
  const focusFromTab = useRef(false);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Tab') focusFromTab.current = true;
      onKey.current(event);
    };
    const pointer = () => {
      focusFromTab.current = false;
    };
    window.addEventListener('keydown', listener);
    window.addEventListener('pointerdown', pointer, true);
    return () => {
      window.removeEventListener('keydown', listener);
      window.removeEventListener('pointerdown', pointer, true);
    };
  }, []);

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

  onKey.current = () => {};
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

  /** Retools the marked hand cards. */
  const confirmRetool = (uids: readonly number[]) => {
    const hand = uids.map(handIndex);
    const restocked = run.restocked;
    attempt(run.whyCannotRetool(hand), { verb: 'retool', hand: hand.map((h) => handNumber(run, h)) }, () => {
      run.retool(hand);
      announceRestock(restocked);
    });
  };

  /** Loads the hand card `uid` into bay `slot`, however the player asked (tap, drag, double-click or keys). */
  const loadInto = (uid: number, slot: number) => {
    const placement = [{ hand: handIndex(uid), slot }];
    const entry: ThroughputAction = { verb: 'load', placements: [{ hand: handNumber(run, handIndex(uid)), slot }] };
    attempt(run.whyCannotLoad(placement), entry, () => run.load(placement));
  };

  /** Double-click (or Enter): the leftmost empty bay that can take the card. */
  const quickLoad = (uid: number) => {
    const slot = firstOpenBay(run, uid);
    if (slot < 0) return notify('info', 'No empty bay can take that card');
    loadInto(uid, slot);
  };

  /** A dragged hand card dropped on a bay: load it, or swap it for the card loaded there this Shift (which goes back to the hand). */
  const dropOnBay = (slot: number) => {
    const uid = dragging;
    setDragging(null);
    if (uid === null) return;
    const kind = dropKind(run, uid, slot);
    if (kind === 'swap') attempt(run.whyCannotUnload([slot]), { verb: 'unload', slots: [slot] }, () => run.unload([slot]));
    if (kind !== null) loadInto(uid, slot);
  };

  const tapBayInShift = (slot: number) => {
    const held = run.line[slot]?.card;
    if (mode.kind === 'place') {
      loadInto(mode.uid, slot);
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
    // Sales stays put until the first sale banks; the reveal keeps the HUD from offering "+$N if you run" meanwhile.
    setReveal({ from: run.sales, to: run.sales });
    setReplay({ key: replayKey.current++, result, beats: shiftBeats(result, run.config.baseMargin), shift: run.shift, outcome, timing, faces: lineFaces(run) });
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

  /** Carries out what a key asked for. */
  const doIntent = (intent: ShiftIntent) => {
    switch (intent.kind) {
      case 'mode':
        return pick(intent.mode);
      case 'load':
        return loadInto(intent.uid, intent.slot);
      case 'retool':
        return mode.kind === 'retool' ? confirmRetool(mode.uids) : undefined;
      case 'run':
        return runShift();
      case 'notice':
        return notify('info', intent.text);
    }
  };

  onKey.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    // Not while a dialog (Settings) is open or the player is typing.
    if (document.querySelector('[aria-modal="true"]') !== null) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    // Space and Enter on a control reached with Tab keep their usual meaning: pressing it. (Not
    // :focus-visible, which Chrome also turns on for a clicked control once any key is pressed.)
    if (keyPressesControl(event.key, target instanceof HTMLElement && target !== document.body, focusFromTab.current)) return;
    if (replaying.current) {
      if (event.key === ' ' || event.key === 'Escape') {
        event.preventDefault();
        finishReplay();
      }
      return;
    }
    if (run.phase !== 'shift') return;
    const intent = shiftKey(run, mode, event.key);
    if (intent === null) return;
    event.preventDefault();
    doIntent(intent);
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
    if (item.kind === 'fixture') {
      // With a Line Fixture picked, the new one replaces it (the old one sells for half as part of the buy).
      if (mode.kind === 'fixture') return attempt(run.whyCannotBuy(offer, { slot: mode.slot }), { verb: 'buy', offer, target: mode.slot }, () => run.buy(offer, { slot: mode.slot }));
      const slots = run.line.map((_, slot) => slot);
      if (!slots.some((slot) => run.whyCannotBuy(offer, { slot }) === null)) {
        const best = slots.reduce((a, b) => (run.fixtureRefund(b) > run.fixtureRefund(a) ? b : a), 0);
        return notify('error', run.whyCannotBuy(offer, { slot: best }) ?? `Not enough Capital (${item.price}C)`);
      }
      return pick(mode.kind === 'install' && mode.offer === offer ? IDLE : { kind: 'install', offer });
    }
    if (!run.wallet.canAfford(item.price)) return notify('error', `Not enough Capital (${item.price}C)`);
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
    // A dragged card can also swap with a card loaded this Shift.
    if (inShift && dragging !== null) return dropKind(run, dragging, slot) !== null ? 'target' : 'idle';
    if (inShift) return mode.kind === 'place' && run.whyCannotLoad([{ hand: Math.max(0, handIndex(mode.uid)), slot }]) === null ? 'target' : 'idle';
    if (mode.kind === 'install') return run.whyCannotBuy(mode.offer, { slot }) === null ? 'target' : 'idle';
    if (mode.kind === 'fixture') return slot === mode.slot ? 'selected' : 'target';
    return 'idle';
  };
  const bayLabel = (slot: number) => {
    const state = run.line[slot];
    const card = state?.card?.card;
    const replace = mode.kind === 'install' && state?.fixture ? `; buying here sells ${state.fixture.def.name} for ${run.fixtureRefund(slot)}C` : '';
    return `Bay ${slot + 1}${state?.fixture ? `, ${state.fixture.def.name}` : ''}${card ? `, ${cardName(card)}` : ', empty'}${replace}`;
  };

  const preview = inShift ? run.preview() : null;
  const restockNote = run.config.restocksPerRound === 0 ? null : run.restocksLeft > 0 ? 'Restock ready' : 'Restock used';
  const restockHelp =
    run.restocksLeft > 0
      ? 'Restock: once a round, when the draw pile runs out, your discards are shuffled into a new draw pile.'
      : "This round's Restock is used: an empty draw pile stays empty until next round.";
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
      data-year={run.quarter.year}
      data-board={run.quarter.isBoard || undefined}
      data-replay={replay !== null || undefined}
      onClickCapture={replay !== null ? tapDuringReplay : undefined}
    >
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <TpHud
        run={run}
        reveal={reveal}
        pending={replay === null ? (preview?.total ?? null) : replay.result.total - ((reveal?.to ?? run.sales) - run.sales)}
      />
      {!inShift && <PayoutSlip run={run} />}
      <MarketBoard run={run} preview={preview} />
      <LineView
        run={run}
        bayState={bayState}
        onBay={inShift ? tapBayInShift : tapBayInShop}
        onScrap={inShift ? (s) => attempt(run.whyCannotScrap([s]), { verb: 'scrap', slots: [s] }, () => run.scrap([s])) : undefined}
        bayLabel={bayLabel}
        {...(inShift && dragging !== null ? { canDrop: (slot: number) => dropKind(run, dragging, slot) !== null, onDropCard: dropOnBay } : {})}
      />
      {replay !== null && (
        <ShiftReplay
          key={replay.key}
          result={replay.result}
          shift={replay.shift}
          baseMargin={run.config.baseMargin}
          faces={replay.faces}
          onBeat={(beat, i) => {
            playBeat(sound, beat, replay.timing.stepMs, salesBefore(replay.beats, i));
            const banked = beatReveal(run, beat, i, replay.timing.stepMs);
            if (banked !== null) setReveal(banked);
          }}
          holdAfter={(beat) => hitStopMs(run, beat)}
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
            {/* The load tip says what the idle hint would, at more length; a picked card's hint still shows. */}
            {!(tip === 'load' && mode.kind === 'idle') && <p className="tp-hint">{shiftHint(run, mode)}</p>}
            {tipFor('load')}
            <div className="hand__cards">
              {run.hand.map((card, i) => {
                const selected = (mode.kind === 'place' && mode.uid === card.uid) || (mode.kind === 'retool' && mode.uids.includes(card.uid));
                return (
                  <Card
                    key={card.uid}
                    card={cardView(card, undefined, run.demandLeft)}
                    index={i}
                    selected={selected}
                    onClick={() => tapHand(i)}
                    onDoubleClick={() => quickLoad(card.uid)}
                    drag={{
                      onStart: () => {
                        setDragging(card.uid);
                        pick({ kind: 'place', uid: card.uid });
                      },
                      // Dropped anywhere but an accepting bay: nothing happens, and the card is put down.
                      onEnd: () => {
                        setDragging(null);
                        setMode(IDLE);
                      },
                    }}
                  />
                );
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
                    onClick={() => confirmRetool(mode.uids)}
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
              <PileStack draw={run.drawPile.length} discard={run.discardPile.length} ships={shipsToDraw(run)} {...(restockNote === null ? {} : { note: restockNote, noteHelp: restockHelp })} />
              <button
                type="button"
                className="btn btn--play"
                onClick={runShift}
                title={`${preview.capped ? `Sales stop at the $${preview.total} Shift cap; Units past it don't sell. ` : ''}Keys: ${KEYS_HINT}`}
              >
                Run Shift {run.shift}: ${preview.total}
                {preview.capped && ' (capped)'}
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
              overkillHelp={overkillHelp(run.config)}
              note={noShipNote(run)}
              baseMargin={run.config.baseMargin}
            />
          </aside>
        </div>
      )}

      {!inShift && (
        <>
          {pendingFixture != null && mode.kind === 'fixture' && (
            <div className="tp-fixture-bar">
              <span>
                {pendingFixture.def.name}: tap another bay to move it ({run.config.moveCost}C), buy a shop Fixture to replace it, or
              </span>
              <button type="button" className="btn btn--discard" onClick={() => attempt(run.whyCannotSellFixture(mode.slot), { verb: 'sell', what: 'fixture', index: mode.slot }, () => run.sellFixture(mode.slot))}>
                Sell {Math.floor(pendingFixture.paid * run.config.sellRate)}C
              </button>
              <button type="button" className="btn" onClick={() => setMode(IDLE)}>
                Cancel
              </button>
            </div>
          )}
          {mode.kind === 'install' && <p className="tp-hint tp-hint--shop">Tap an empty bay to install it, or a bay with a Fixture to replace that one (sold for half).</p>}
          {tipFor('shop')}
          <Shelf
            run={run}
            pending={mode.kind === 'install' || mode.kind === 'contract' || mode.kind === 'grant' ? mode.offer : null}
            replacing={mode.kind === 'fixture' ? mode.slot : null}
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
          <TraceReceipt result={lastShift.result} heading={lastShift.heading} salesBefore={lastShift.salesBefore} target={lastShift.target} baseMargin={run.config.baseMargin} />
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
