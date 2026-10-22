import { useCallback, useRef, useState } from 'react';
import { ToastStack } from '../../../ui/components';
import type { BrowserGameProps } from '../../../ui/games';
import type { ToastKind, ToastView } from '../../../ui/types';
import { defaultBomConfig } from '../content';
import { categoryName } from '../model';
import type { Part, RndChoice } from '../model';
import { BomRun } from '../rules';
import type { RoundEnd, ShipQuote } from '../rules';
import { buildBomView, sortedHand } from '../text';
import { BomHud } from './BomHud';
import { ProductBoard } from './ProductBoard';
import { FacilitiesRow } from './FacilitiesRow';
import { roundLabel } from './present';
import { rulesSections } from './rules-text';
import { ShipReceipt } from './ShipReceipt';
import { NextRoundMemo, PayoutSlip, Shelf, ShredPanel } from './ShopParts';
import { BenchTray, PartsHand } from './Workbench';
import './bom.css';

/** What a tap means right now, beyond selecting parts. */
type Mode =
  | { readonly kind: 'idle' }
  /** A Fabricate waits for the Bench part to trash. */
  | { readonly kind: 'trash' }
  /** An R&D Grant (shop slot) waits for its blueprint. */
  | { readonly kind: 'rnd'; readonly slot: number };

const IDLE: Mode = { kind: 'idle' };

type ShipRecord = { readonly quote: ShipQuote; readonly heading: string; readonly revenueBefore: number; readonly target: number };

/** BILL OF MATERIALS in the browser: select parts, then Ship them as a Product or Fabricate a Sub. */
export function BomScreen({ seed, onQuit }: BrowserGameProps) {
  const [run, setRun] = useState(() => new BomRun(defaultBomConfig(), seed));
  const [, setVersion] = useState(0);
  const [selection, setSelection] = useState<readonly Part[]>([]);
  const [mode, setMode] = useState<Mode>(IDLE);
  const [toasts, setToasts] = useState<readonly ToastView[]>([]);
  const [lastShip, setLastShip] = useState<ShipRecord | null>(null);
  const toastId = useRef(0);

  const notify = (kind: ToastKind, message: string) => setToasts((t) => [...t, { id: `bom-${toastId.current++}`, kind, message }]);
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  /** Applies `action` if `reason` is null (then clears the selection and re-renders), else explains why not. */
  const attempt = (reason: string | null, action: () => void): void => {
    if (reason !== null) {
      notify('error', reason);
      return;
    }
    action();
    setSelection([]);
    setMode(IDLE);
    setVersion((v) => v + 1);
  };
  const newRun = () => {
    setRun(new BomRun(defaultBomConfig(), Date.now()));
    setSelection([]);
    setMode(IDLE);
    setLastShip(null);
    setToasts([]);
  };

  if (run.phase === 'won' || run.phase === 'lost') return <EndView run={run} onNewRun={newRun} onQuit={onQuit} />;

  const view = buildBomView(run, { game: 'bom', seed, actionsTaken: 0 });
  const inRound = run.phase === 'round' || run.phase === 'overtime';
  const label = roundLabel(run.round);
  // Parts leave the hand and Bench when used; never act on a stale selection.
  const live = selection.filter((p) => run.hand.includes(p) || run.bench.includes(p));

  /** Toasts for the end of a Build: Overtime, a clear, or a loss (the end screen follows). */
  const announce = (wasOvertime: boolean, roundEnd: RoundEnd | null) => {
    if (roundEnd?.cleared) notify('success', `${label} cleared! Revenue $${roundEnd.revenue} of $${roundEnd.target}`);
    else if (run.phase === 'overtime' && !wasOvertime) notify('success', `Target reached: Overtime. Fabricate for next round, or collect $${run.buildsLeft}.`);
  };

  // ---- Round ----
  const tapPart = (part: Part) => {
    if (mode.kind === 'trash') {
      attempt(run.whyCannotFabricate(live, part), () => {
        const result = run.fabricate(live, part);
        notify('info', `Trashed ${categoryName(part.category)} ${part.grade}; ${categoryName(result.output.category)} ${result.output.grade} is on the Bench`);
        announce(false, result.roundEnd);
      });
      return;
    }
    if (live.includes(part)) return setSelection(live.filter((p) => p !== part));
    if (live.length >= run.config.maxSelection) return notify('info', `A Build or Scrap uses at most ${run.config.maxSelection} parts`);
    setSelection([...live, part]);
  };

  const ship = (productId: string) => {
    const record = { revenueBefore: run.revenue, target: run.round.target };
    const wasOvertime = run.phase === 'overtime';
    attempt(run.whyCannotShip(live, productId), () => {
      const result = run.ship(live, productId);
      const name = result.quote.blueprint.def.name;
      setLastShip({ quote: result.quote, heading: `${name}, ${label}`, ...record });
      notify('success', `Shipped ${name}: $${result.quote.revenue}`);
      if (result.growth > 0) notify('info', `Sold out: ${name} Demand +${result.growth} for good`);
      announce(wasOvertime, result.roundEnd);
    });
  };

  const fabricate = () => {
    const sub = run.subFor(live);
    const benchAfter = run.bench.filter((p) => !live.includes(p)).length;
    if (sub !== undefined && run.buildsLeft > 0 && benchAfter >= run.mods.benchSlots) {
      setMode(mode.kind === 'trash' ? IDLE : { kind: 'trash' });
      if (mode.kind !== 'trash') notify('info', 'The Bench is full: tap a Bench part to trash it (no refund)');
      return;
    }
    const wasOvertime = run.phase === 'overtime';
    attempt(run.whyCannotFabricate(live), () => {
      const result = run.fabricate(live);
      notify('success', `Fabricated ${categoryName(result.output.category)} ${result.output.grade} → Bench`);
      if (result.copiesBenched.length > 0) notify('info', `Kitting Station: a ${result.copiesBenched.map((p) => `${categoryName(p.category)} ${p.grade}`).join(', ')} copy → Bench`);
      if (result.copiesLost > 0) notify('info', 'Kitting Station copy lost: the Bench is full');
      announce(wasOvertime, result.roundEnd);
    });
  };

  const scrap = () =>
    attempt(run.whyCannotScrap(live), () => {
      const result = run.scrap(live);
      notify('info', `Scrapped ${live.length} part${live.length === 1 ? '' : 's'}; drew ${result.drawn.length}`);
    });

  const collect = () =>
    attempt(run.whyCannotCollect(), () => {
      const end = run.collect();
      notify('success', `${label} cleared! Revenue $${end.revenue} of $${end.target}`);
    });

  // ---- Shop ----
  const buy = (slot: number) => {
    const offer = run.shop.offers[slot];
    if (offer == null) return;
    if (offer.kind === 'rnd') {
      const problem = run.offerProblem(slot);
      if (problem !== null) return notify('error', problem);
      return setMode(mode.kind === 'rnd' && mode.slot === slot ? IDLE : { kind: 'rnd', slot });
    }
    attempt(run.whyCannotBuy(slot), () => run.buy(slot));
  };

  const pickRnd = (blueprintId: string, choice?: RndChoice) => {
    if (mode.kind !== 'rnd') return;
    const target = choice === undefined ? { blueprintId } : { blueprintId, choice };
    attempt(run.whyCannotBuy(mode.slot, target), () => {
      run.buy(mode.slot, target);
      notify('success', `R&D on ${run.blueprint(blueprintId)?.def.name ?? blueprintId}${choice ? ` (${choice === 'scale' ? 'Scale' : 'Premium'})` : ''}`);
    });
  };

  const trashable = mode.kind === 'trash' ? new Set(run.bench.filter((p) => !live.includes(p))) : null;
  const quotes = run.phase === 'round' && live.length > 0 ? run.quoteOptions(live) : [];
  const best = quotes.reduce<ShipQuote | null>((top, q) => (top === null || q.revenue > top.revenue ? q : top), null);
  const allHand = live.length > 0 && live.every((p) => run.hand.includes(p));

  return (
    <main className={`screen screen--bom ${inRound ? 'screen--bom-round' : 'screen--bom-shop'}`}>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <BomHud run={run} interestNext={view.interestNext} />

      {inRound && (
        <>
          {run.phase === 'overtime' && (
            <div className="bom-overtime" role="status">
              <p>
                <strong>Overtime.</strong> Target reached, so Ship is locked. Fabricate to stock the Bench for next round, or collect ${run.buildsLeft} for your
                unused Builds.
              </p>
              <button type="button" className="btn btn--play" onClick={collect}>
                Collect ${run.buildsLeft}
              </button>
            </div>
          )}
          <div className="bom-floor">
            <ProductBoard run={run} products={view.products} round={{ selection: live, onShip: ship, onFabricate: fabricate }} />
            <BenchTray run={run} selection={live} trashable={trashable} onTap={tapPart} />
            <aside className="bom-floor__receipt">
              {best !== null ? (
                <ShipReceipt quote={best} heading={`If shipped as ${best.blueprint.def.name}`} revenueBefore={run.revenue} target={run.round.target} sellOutGrowth={run.mods.sellOutGrowth} />
              ) : lastShip !== null ? (
                <ShipReceipt quote={lastShip.quote} heading={`Last Ship: ${lastShip.heading}`} revenueBefore={lastShip.revenueBefore} target={lastShip.target} sellOutGrowth={run.mods.sellOutGrowth} />
              ) : (
                <p className="bom-floor__empty">Select parts and every Product they fit shows what that Ship would earn. The best one is itemised here.</p>
              )}
            </aside>
            <section className="hand bom-hand" aria-label="Hand">
              <p className="bom-hint">{hint(run, live.length, mode)}</p>
              <PartsHand hand={sortedHand(run)} selection={live} onTap={tapPart} disabled={mode.kind === 'trash'} />
              <div className="hand__controls bom-controls">
                <button type="button" className="btn btn--discard" disabled={!allHand || run.scrapsLeft <= 0 || mode.kind === 'trash'} onClick={scrap}>
                  Scrap {live.length > 0 ? live.length : ''} ({run.scrapsLeft} left)
                </button>
                <span className="hand__count">
                  Draw {view.piles.draw} · Used {view.piles.discard}
                </span>
                <button type="button" className="btn" disabled={live.length === 0 && mode.kind === 'idle'} onClick={() => (setSelection([]), setMode(IDLE))}>
                  {mode.kind === 'trash' ? 'Cancel' : 'Clear'}
                </button>
              </div>
            </section>
          </div>
        </>
      )}

      {run.phase === 'shop' && (
        <>
          <div className="bom-shop-top">
            <PayoutSlip run={run} />
            <NextRoundMemo run={run} />
          </div>
          {mode.kind === 'rnd' && <p className="bom-hint bom-hint--shop">Pick the blueprint for the R&D Grant below: Scale or Premium on a Product, or a Sub.</p>}
          <Shelf
            run={run}
            pending={mode.kind === 'rnd' ? mode.slot : null}
            onBuy={buy}
            onReroll={() => attempt(run.whyCannotReroll(), () => run.reroll())}
            onContinue={() =>
              attempt(run.whyCannotLeaveShop(), () => {
                run.leaveShop();
                setLastShip(null);
              })
            }
          />
          <ProductBoard
            run={run}
            products={view.products}
            shop={{ onSell: (id) => attempt(run.whyCannotSell(id), () => run.sell(id)), onRnd: mode.kind === 'rnd' ? pickRnd : null }}
          />
          <BenchTray run={run} selection={[]} trashable={null} />
          <ShredPanel run={run} onShred={(category, grade) => attempt(run.whyCannotShred(category, grade), () => run.shred(category, grade))} />
        </>
      )}

      <FacilitiesRow run={run} onSell={run.phase === 'shop' ? (id) => attempt(run.whyCannotSell(id), () => run.sell(id)) : undefined} />
      <RulesSheet run={run} />
    </main>
  );
}

function hint(run: BomRun, selected: number, mode: Mode): string {
  if (mode.kind === 'trash') return 'Tap the Bench part to trash for this Fabricate, or Cancel.';
  if (run.phase === 'overtime') return 'Overtime: select exactly a Sub-assembly recipe to Fabricate, or collect your unused Builds.';
  if (selected === 0) return `Tap up to ${run.config.maxSelection} parts from your hand and Bench, then a Product to Ship them or a Sub-assembly to Fabricate.`;
  return `${selected} selected. Each Product shows what this Ship would earn.`;
}

function RulesSheet({ run }: { run: BomRun }) {
  return (
    <details className="bom-rules">
      <summary>How to play</summary>
      {rulesSections(run.config).map((section) => (
        <section key={section.heading} className="bom-rules__section">
          <h3>{section.heading}</h3>
          {section.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ))}
    </details>
  );
}

function EndView({ run, onNewRun, onQuit }: { run: BomRun; onNewRun: () => void; onQuit: () => void }) {
  const won = run.phase === 'won';
  const end = run.lastRoundEnd;
  return (
    <main className={`screen screen--end ${won ? 'screen--victory' : 'screen--game-over'}`}>
      <h1 className="end-title">{won ? 'Victory' : 'Run over'}</h1>
      <dl className="end-stats">
        <dt>Reached</dt>
        <dd>
          {roundLabel(run.round)} (round {run.round.index + 1} of {run.totalRounds})
        </dd>
        <dt>Revenue</dt>
        <dd>
          ${end?.revenue ?? run.revenue} / ${end?.target ?? run.round.target}
        </dd>
        <dt>Cash</dt>
        <dd>${run.wallet.cash}</dd>
      </dl>
      <div className="bom-end-actions">
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
