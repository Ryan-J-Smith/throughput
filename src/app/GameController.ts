import type { Run, RunShopDef } from '../engine/run';
import type { ShopOffer } from '../engine/shop';
import { ShellModel } from '../ui/model';
import type { Modifier } from '../engine/modifiers';
import type {
  HandSort,
  HudView,
  ModifierRowView,
  NextRoundView,
  ScoreTallyView,
  ShellActions,
  ShellView,
  ShopOfferView,
  ToastKind,
  ToastView,
} from '../ui/types';
import type { GameDefinition } from './GameDefinition';
import { sortHand } from './handSort';
import { toggleSelection } from './selection';
import { toNextRound, toRoundSummary, toScoreTally } from './viewMapping';

type Offer<TCard> = ShopOffer<RunShopDef<TCard>>;

/** A play's tally while it animates, plus the round score to show until it finishes. */
type PendingTally = {
  readonly view: ScoreTallyView;
  readonly scoreBefore: number;
};

const OFFER_ID = /^offer-(\d+)-(\d+)$/;

/**
 * Adapter between an engine Run and the UI shell. Owns the run plus UI-only state the engine
 * does not model: card selection, the animating tally, the cash-out step and toasts.
 *
 * The engine resolves a play at once (score, round result, payout). The controller presents
 * that result in steps — tally, then score applied, then summary, then cash out — so until
 * each step is acknowledged the HUD shows the earlier score and cash.
 *
 * Cards are identified by object identity, hence `TCard extends object`.
 */
export class GameController<TCard extends object> extends ShellModel implements ShellActions {
  readonly actions: ShellActions = this;

  private readonly game: GameDefinition<TCard>;
  private readonly nextSeed: () => number;
  private run_: Run<TCard> | null = null;
  private selectedIds: readonly string[] = [];
  /** Display-only hand order; kept across rounds and runs. */
  private handSort: HandSort = 'dealt';
  private tally: PendingTally | null = null;
  private awaitingCashOut = false;
  /** Offers as last stocked, so sold slots can still show what was bought. */
  private stock: readonly (Offer<TCard> | null)[] = [];
  private stockVersion = 0;
  /** Hand size when the shop opened, which is what the engine planned the next round against. */
  private plannedHandSize = 0;
  private toasts: readonly ToastView[] = [];
  private readonly ids = new WeakMap<object, string>();
  private idCounter = 0;
  private playCounter = 0;
  private toastCounter = 0;
  private view: ShellView | null = null;

  constructor(game: GameDefinition<TCard>, nextSeed: () => number) {
    super();
    this.game = game;
    this.nextSeed = nextSeed;
  }

  /** The active run, or null before the first start. */
  get run(): Run<TCard> | null {
    return this.run_;
  }

  getView(): ShellView {
    this.view ??= this.buildView();
    return this.view;
  }

  getToasts(): readonly ToastView[] {
    return this.toasts;
  }

  // ---- ShellActions (arrow properties so they can be passed as callbacks) ----

  readonly onStart = (): void => this.newRun();

  readonly onRestart = (): void => this.newRun();

  readonly onToggleSelect = (cardId: string): void => {
    const run = this.run_;
    if (run === null || this.locked(run)) return;
    this.selectedIds = toggleSelection(this.selectedIds, cardId, run.config.maxSelection);
    this.changed();
  };

  readonly onPlay = (): void => {
    const run = this.run_;
    if (run === null || this.locked(run)) return;
    const cards = this.selectedCards(run);
    const reason = run.whyCannotPlay(cards);
    if (reason !== null) return this.refuse(reason);
    const scoreBefore = run.roundScore;
    const result = run.play(cards);
    const view = toScoreTally(`play-${this.playCounter++}`, result, this.game.formula, this.game.presenter);
    this.tally = { view, scoreBefore };
    this.selectedIds = [];
    this.changed();
  };

  readonly onDiscard = (): void => {
    const run = this.run_;
    if (run === null || this.locked(run)) return;
    const cards = this.selectedCards(run);
    const reason = run.whyCannotDiscard(cards);
    if (reason !== null) return this.refuse(reason);
    run.discard(cards);
    this.selectedIds = [];
    this.changed();
  };

  readonly onTallyComplete = (): void => {
    const run = this.run_;
    if (run === null || this.tally === null) return;
    this.tally = null;
    if (roundWon(run)) {
      this.awaitingCashOut = true;
      this.pushToast('success', 'Target hit!');
    }
    this.changed();
  };

  readonly onCashOut = (): void => {
    const run = this.run_;
    if (run === null || !this.awaitingCashOut) return;
    this.awaitingCashOut = false;
    if (run.phase === 'roundEnd') {
      this.plannedHandSize = run.deck.handSize;
      run.enterShop();
      this.restocked(run);
    }
    this.changed();
  };

  readonly onBuy = (offerId: string): void => {
    const run = this.run_;
    const slot = this.slotOf(offerId);
    if (run === null || slot === null) return;
    const reason = run.whyCannotBuy(slot);
    if (reason !== null) return this.refuse(reason);
    run.buy(slot);
    this.changed();
  };

  readonly onReroll = (): void => {
    const run = this.run_;
    if (run === null) return;
    const reason = run.whyCannotReroll();
    if (reason !== null) return this.refuse(reason);
    run.reroll();
    this.restocked(run);
    this.changed();
  };

  readonly onContinue = (): void => {
    const run = this.run_;
    if (run === null || run.phase !== 'shop') return;
    run.leaveShop();
    run.startRound();
    this.selectedIds = [];
    this.stock = [];
    this.changed();
  };

  readonly onSortHand = (sort: HandSort): void => {
    this.handSort = sort;
    this.changed();
  };

  readonly onSellModifier = (modifierId: string): void => {
    const run = this.run_;
    if (run === null || this.modifiersLocked(run)) return;
    const modifier = this.findModifier(run, modifierId);
    if (modifier === undefined) return;
    const reason = run.whyCannotSell(modifier);
    if (reason !== null) return this.refuse(reason);
    const title = this.game.presenter.presentModifier(modifier).title;
    const value = run.sell(modifier);
    this.pushToast('info', `Sold ${title} for $${value}`);
    this.changed();
  };

  readonly onMoveModifier = (modifierId: string, toIndex: number): void => {
    const run = this.run_;
    if (run === null || this.modifiersLocked(run)) return;
    const slots = run.modifiers.modifiers;
    const from = slots.findIndex((m) => this.idOf(m, 'mod') === modifierId);
    const to = Math.max(0, Math.min(slots.length - 1, Math.trunc(toIndex)));
    if (from < 0 || from === to) return;
    run.modifiers.move(from, to);
    this.changed();
  };

  readonly onDismissToast = (toastId: string): void => {
    this.toasts = this.toasts.filter((t) => t.id !== toastId);
    this.changed();
  };

  // ---- state changes ----

  private newRun(): void {
    const run = this.game.createRun(this.nextSeed());
    run.start();
    run.startRound();
    this.run_ = run;
    this.selectedIds = [];
    this.tally = null;
    this.awaitingCashOut = false;
    this.stock = [];
    this.toasts = [];
    this.changed();
  }

  private restocked(run: Run<TCard>): void {
    this.stock = [...run.shop.offers];
    this.stockVersion++;
  }

  private refuse(reason: string): void {
    this.pushToast('error', reason);
    this.changed();
  }

  private pushToast(kind: ToastKind, message: string): void {
    this.toasts = [...this.toasts, { id: `toast-${this.toastCounter++}`, kind, message }];
  }

  private changed(): void {
    this.view = null;
    this.notify();
  }

  // ---- queries ----

  /** True while the hand must not change: a tally or summary is showing, or no round is live. */
  private locked(run: Run<TCard>): boolean {
    return this.tally !== null || this.awaitingCashOut || run.phase !== 'playing';
  }

  /** Modifiers can't be sold or moved mid-tally (the tally already reflects them) or after the run ends. */
  private modifiersLocked(run: Run<TCard>): boolean {
    return this.tally !== null || run.phase === 'won' || run.phase === 'lost';
  }

  private findModifier(run: Run<TCard>, modifierId: string): Modifier<TCard> | undefined {
    return run.modifiers.modifiers.find((m) => this.idOf(m, 'mod') === modifierId);
  }

  /** The hand as displayed. Only the display is sorted; the engine's hand keeps its order. */
  private displayedHand(run: Run<TCard>): TCard[] {
    const presenter = this.game.presenter;
    return sortHand(run.deck.hand, this.handSort, (card) => presenter.sortKeys(card));
  }

  /** Selected hand cards in display order, which is the order they are played and scored. */
  private selectedCards(run: Run<TCard>): TCard[] {
    return this.displayedHand(run).filter((card) => this.selectedIds.includes(this.idOf(card, 'card')));
  }

  private idOf(item: object, prefix: string): string {
    let id = this.ids.get(item);
    if (id === undefined) {
      id = `${prefix}-${this.idCounter++}`;
      this.ids.set(item, id);
    }
    return id;
  }

  /** Slot for an offer id from the current stock; stale ids from an earlier stock map to null. */
  private slotOf(offerId: string): number | null {
    const match = OFFER_ID.exec(offerId);
    if (match === null || Number(match[1]) !== this.stockVersion) return null;
    return Number(match[2]);
  }

  // ---- views ----

  private buildView(): ShellView {
    const run = this.run_;
    if (run === null) return { screen: 'title' };
    if (this.tally !== null || this.awaitingCashOut) return this.roundView(run);
    switch (run.phase) {
      case 'shop':
        return this.shopView(run);
      case 'won':
        return { screen: 'victory', hud: this.hud(run, false) };
      case 'lost':
        return { screen: 'gameOver', hud: this.hud(run, false) };
      case 'setup':
      case 'roundStart':
      case 'playing':
      case 'roundEnd':
        return this.roundView(run);
    }
  }

  private hud(run: Run<TCard>, showBoss: boolean): HudView {
    // The engine pays out the moment the round is won; hold it back until cash out.
    const unpaid = (this.tally !== null || this.awaitingCashOut) && roundWon(run) ? (run.payout?.total() ?? 0) : 0;
    return {
      round: run.round.number,
      targetScore: run.round.target,
      currentScore: this.tally?.scoreBefore ?? run.roundScore,
      playsLeft: run.playsLeft,
      discardsLeft: run.discardsLeft,
      cash: run.wallet.cash - unpaid,
      boss: showBoss && run.boss !== null ? this.game.presenter.presentBoss(run.boss) : undefined,
    };
  }

  private modifierRow(run: Run<TCard>): ModifierRowView {
    const locked = this.modifiersLocked(run);
    return {
      slots: run.modifiers.capacity,
      locked,
      modifiers: run.modifiers.modifiers.map((m) => ({
        id: this.idOf(m, 'mod'),
        ...this.game.presenter.presentModifier(m),
        sellValue: run.shop.sellValue(m.price),
        canSell: !locked && run.whyCannotSell(m) === null,
      })),
    };
  }

  private roundView(run: Run<TCard>): ShellView {
    const presenter = this.game.presenter;
    const locked = this.locked(run);
    const selected = this.selectedCards(run);
    return {
      screen: 'round',
      hud: this.hud(run, true),
      modifierRow: this.modifierRow(run),
      hand: this.displayedHand(run).map((card) => ({ id: this.idOf(card, 'card'), ...presenter.presentCard(card) })),
      handSort: this.handSort,
      selectedIds: this.selectedIds,
      maxSelected: run.config.maxSelection,
      canPlay: !locked && run.whyCannotPlay(selected) === null,
      canDiscard: !locked && run.whyCannotDiscard(selected) === null,
      handLocked: locked,
      tally: this.tally?.view,
      summary: this.awaitingCashOut && run.payout !== null ? toRoundSummary(run.round, run.payout, presenter) : undefined,
    };
  }

  private shopView(run: Run<TCard>): ShellView {
    const presenter = this.game.presenter;
    const offers: ShopOfferView[] = [];
    this.stock.forEach((offer, slot) => {
      if (offer === null) return;
      const id = `offer-${this.stockVersion}-${slot}`;
      const sold = run.shop.offers[slot] == null;
      offers.push({
        id,
        card: { id, ...presenter.presentOffer(offer.def) },
        price: offer.price,
        sold,
        canBuy: !sold && run.whyCannotBuy(slot) === null,
        rarity: presenter.rarity(offer.def.rarity),
      });
    });
    return {
      screen: 'shop',
      hud: this.hud(run, false),
      modifierRow: this.modifierRow(run),
      offers,
      nextRound: this.nextRound(run),
      rerollCost: run.shop.rerollCost,
      canReroll: run.whyCannotReroll() === null,
    };
  }

  private nextRound(run: Run<TCard>): NextRoundView | undefined {
    const preview = run.peekNextRound();
    if (preview === null) return undefined;
    const baseline = {
      plays: run.config.playsPerRound,
      discards: run.config.discardsPerRound,
      plannedHandSize: this.plannedHandSize,
      currentHandSize: run.deck.handSize,
    };
    return toNextRound(preview, baseline, this.game.presenter);
  }
}

/** The engine is past a won round (roundEnd, or won after the final one). */
function roundWon<TCard>(run: Run<TCard>): boolean {
  return run.phase === 'roundEnd' || run.phase === 'won';
}
