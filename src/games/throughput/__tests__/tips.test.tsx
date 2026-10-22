import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../../ui/storage';
import { ThroughputBrowserGame, ThroughputScreen, TipMemory, currentTip, tipText } from '../browser';
import { ThroughputRun } from '../rules';
import { easyConfig } from './fixtures';

const index = (run: ThroughputRun, stage: string) => run.hand.findIndex((c) => c.def.stage === stage);

describe('THROUGHPUT first-run tips', () => {
  it('walks a new player through load, run and the shop', () => {
    const run = new ThroughputRun(1, easyConfig());
    const none = new Set<never>();
    expect(currentTip(run, run.preview(), none)).toBe('load');

    run.load([{ hand: index(run, 'make'), slot: 0 }]);
    expect(currentTip(run, run.preview(), none)).toBeNull();
    run.load([{ hand: index(run, 'ship'), slot: 1 }]);
    expect(run.preview().shipSales).toBeGreaterThan(0);
    expect(currentTip(run, run.preview(), none)).toBe('run');
    expect(tipText('run', run)).toContain(`you have ${run.shiftsThisRound} Shifts to reach $${run.target}`);

    run.runShift();
    expect(run.phase).toBe('shop');
    expect(currentTip(run, null, none)).toBe('shop');
    expect(currentTip(run, null, new Set(['shop'] as const))).toBeNull();

    run.continueToNextRound();
    expect(currentTip(run, run.preview(), none)).toBeNull();
  });

  it('remembers finished tips in the store, ignores a corrupt entry, and can start over', () => {
    const store = new MemoryStore();
    const tips = new TipMemory(store);
    expect(tips.finish('load')).toBe(true);
    expect(tips.finish('load')).toBe(false);
    expect([...new TipMemory(store).done]).toEqual(['load']);
    expect(new TipMemory(store).allDone).toBe(false);

    tips.finishAll();
    expect(new TipMemory(store).allDone).toBe(true);
    tips.reset();
    expect(new TipMemory(store).done.size).toBe(0);

    store.set('throughput.tips', '{not json');
    expect(new TipMemory(store).done.size).toBe(0);
  });

  it('a reset from Settings reaches a TipMemory already in use, and the game can do it', () => {
    const store = new MemoryStore();
    const onScreen = new TipMemory(store);
    onScreen.finishAll();
    expect(new ThroughputBrowserGame().hasTips).toBe(true);
    new ThroughputBrowserGame().resetTips(store);
    expect(onScreen.done.size).toBe(0);
  });

  it('the screen shows the load tip on a first run and nothing once tips are off', () => {
    const fresh = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(fresh).toContain('data-tip="load"');
    expect(fresh).toContain('Turn off tips');

    const store = new MemoryStore();
    new TipMemory(store).finishAll();
    const off = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={store} resume={false} />);
    expect(off).not.toContain('tp-tip');
  });
});
