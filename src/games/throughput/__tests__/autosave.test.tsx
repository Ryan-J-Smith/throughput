import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../engine/rng';
import { MemoryStore } from '../../../ui/storage';
import { RunAutosave, ThroughputBrowserGame, ThroughputScreen, handNumber } from '../browser';
import type { ThroughputAction } from '../cli';
import { ThroughputRun } from '../rules';
import { GreedyBot } from '../sim';

/** Everything a player can see that replay has to rebuild. */
function snapshot(run: ThroughputRun) {
  return {
    phase: run.phase,
    round: run.round,
    shift: run.shift,
    sales: run.sales,
    cash: run.wallet.cash,
    hand: run.handSlots.map((c) => c?.uid ?? null),
    line: run.line.map((s) => `${s.fixture?.def.id ?? '-'}:${s.card?.card.uid ?? '-'}`),
    deck: run.deck.map((c) => c.uid),
    draw: run.drawPile.map((c) => c.uid),
    offers: run.offers.map((o) => o?.def.id ?? null),
  };
}

/**
 * Plays `steps` bot decisions on a run from `seed`, applying each the way the browser screen does
 * (dense hand indexes on the run, stable hand numbers in the autosave).
 */
function playAndRecord(seed: number, steps: number, store: MemoryStore): ThroughputRun {
  const run = new ThroughputRun(seed);
  const autosave = RunAutosave.start(store, seed);
  const bot = new GreedyBot();
  bot.beginRun(run, new Rng(seed).fork('bot'));
  for (let i = 0; i < steps && (run.phase === 'shift' || run.phase === 'shop'); i++) {
    let entry: ThroughputAction;
    if (run.phase === 'shift') {
      const d = bot.shiftTurn(run);
      if (d.kind === 'load') {
        entry = { verb: 'load', placements: d.placements.map((p) => ({ hand: handNumber(run, p.hand), slot: p.slot })) };
        run.load(d.placements);
      } else if (d.kind === 'retool') {
        entry = { verb: 'retool', hand: d.hand.map((h) => handNumber(run, h)) };
        run.retool(d.hand);
      } else if (d.kind === 'scrap') {
        entry = { verb: 'scrap', slots: d.slots };
        run.scrap(d.slots);
      } else {
        entry = { verb: 'run' };
        run.runShift();
      }
    } else {
      const d = bot.shopTurn(run);
      if (d.kind === 'buy') {
        const { slot, deckCard, category, option } = d.target;
        entry =
          category !== undefined && option !== undefined
            ? { verb: 'buy', offer: d.offer, target: null, grant: { category, option } }
            : { verb: 'buy', offer: d.offer, target: slot ?? deckCard ?? null };
        run.buy(d.offer, d.target);
      } else if (d.kind === 'sellFixture') {
        entry = { verb: 'sell', what: 'fixture', index: d.slot };
        run.sellFixture(d.slot);
      } else if (d.kind === 'sellCard') {
        entry = { verb: 'sell', what: 'card', index: d.deckCard };
        run.sellCard(d.deckCard);
      } else if (d.kind === 'move') {
        entry = { verb: 'move', from: d.from, to: d.to };
        run.moveFixture(d.from, d.to);
      } else if (d.kind === 'reroll') {
        entry = { verb: 'reroll' };
        run.reroll();
      } else {
        entry = { verb: 'continue' };
        run.continueToNextRound();
      }
    }
    autosave.record(entry);
  }
  return run;
}

describe('THROUGHPUT browser autosave', () => {
  it('rebuilds a run mid-round, mid-shop and late in the run exactly by replay', () => {
    for (const [seed, steps] of [
      [3, 7],
      [11, 40],
      [29, 400],
    ] as const) {
      const store = new MemoryStore();
      const played = playAndRecord(seed, steps, store);
      const restored = RunAutosave.restore(store);
      if (restored?.ok !== true) throw new Error(`seed ${seed} did not restore`);
      expect(snapshot(restored.run)).toEqual(snapshot(played));
      expect(restored.autosave.save.seed).toBe(seed);
    }
  });

  it('records loads by stable hand number, so unloads and later loads still replay', () => {
    const store = new MemoryStore();
    const run = new ThroughputRun(5);
    const autosave = RunAutosave.start(store, 5);
    const load = (index: number, slot: number) => {
      autosave.record({ verb: 'load', placements: [{ hand: handNumber(run, index), slot }] });
      run.load([{ hand: index, slot }]);
    };
    load(2, 0);
    load(0, 1);
    autosave.record({ verb: 'unload', slots: [0] });
    run.unload([0]);
    load(run.hand.length - 1, 2);
    const restored = RunAutosave.restore(store);
    expect(restored?.ok === true && snapshot(restored.run)).toEqual(snapshot(run));
  });

  it('has nothing to restore at first, and clears a save that no longer replays', () => {
    const store = new MemoryStore();
    expect(RunAutosave.restore(store)).toBeNull();
    store.set('throughput.run', JSON.stringify({ version: 1, game: 'throughput', seed: 1, actions: ['buy 9'] }));
    const restored = RunAutosave.restore(store);
    expect(restored?.ok).toBe(false);
    expect(store.get('throughput.run')).toBeNull();
    store.set('throughput.run', 'not json');
    expect(RunAutosave.restore(store)?.ok).toBe(false);
  });

  it('describes the saved run for Continue, and the screen resumes it', () => {
    const game = new ThroughputBrowserGame();
    const store = new MemoryStore();
    expect(game.savedRun(store)).toBeNull();
    const played = playAndRecord(3, 40, store);
    expect(['shift', 'shop']).toContain(played.phase);
    const label = game.savedRun(store);
    expect(label).toMatch(/^Year \d (Q\d|Board), (in the shop|Shift \d: \$\d+ of \$\d+)$/);

    const html = renderToStaticMarkup(<ThroughputScreen seed={999} onQuit={() => {}} store={store} resume={true} />);
    expect(html).toContain(played.phase === 'shop' ? 'Next quarter' : `Run Shift ${played.shift}:`);
    // A fresh launch replaces the save with a new run from its own seed.
    renderToStaticMarkup(<ThroughputScreen seed={999} onQuit={() => {}} store={store} resume={false} />);
    const fresh = RunAutosave.restore(store);
    expect(fresh?.ok === true && fresh.autosave.save).toMatchObject({ seed: 999, actions: [] });
  });

  it('starts a new run with a notice when the save cannot be restored', () => {
    const store = new MemoryStore();
    store.set('throughput.run', JSON.stringify({ version: 1, game: 'throughput', seed: 1, actions: ['buy 9'] }));
    const html = renderToStaticMarkup(<ThroughputScreen seed={4} onQuit={() => {}} store={store} resume={true} />);
    expect(html).toContain('saved run couldn&#x27;t be restored');
    expect(html).toContain('Run Shift 1:');
  });

  it('offers no Continue for a run that already ended', () => {
    const store = new MemoryStore();
    const played = playAndRecord(29, 400, store);
    expect(played.phase).toBe('lost');
    expect(new ThroughputBrowserGame().savedRun(store)).toBeNull();
  });
});
