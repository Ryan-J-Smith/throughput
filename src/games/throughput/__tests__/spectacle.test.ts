import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, SKETCH, TRUCK, WORKSHOP } from '../content';
import { scoreLine } from '../rules';
import { shiftBeats } from '../spectacle';
import { boss, card, context, fixture, slot, trends } from './fixtures';

describe('THROUGHPUT belt spectacle beats', () => {
  it('gives each slot its changes and flourishes, then the leftover finale', () => {
    const result = scoreLine(
      [
        slot(null, card(SKETCH, 'Home')),
        slot(fixture('robot-arm'), card(WORKSHOP, 'Home')),
        slot(null, card(TRUCK, 'Home')),
        slot(fixture('quality-lab'), card(TRUCK, 'Home')),
        slot(null, null),
      ],
      context({ trends: trends({ Home: 'hot' }) }),
    );
    const { beats, leftover, total } = shiftBeats(result);

    expect(beats.map((b) => b.kind)).toEqual(['card', 'card', 'card', 'card', 'empty']);
    // A Design in slot 1 shows its Margin gain over the Batch's starting Margin.
    expect(beats[0]?.marginDelta).toBeGreaterThan(0);
    expect(beats[0]?.flourishes).toContain('design');
    // Robot Arm resolves the Workshop twice.
    expect(beats[1]?.fixture).toBe('Robot Arm');
    expect(beats[1]?.flourishes).toEqual(expect.arrayContaining(['make', 'retrigger']));
    expect(beats[1]?.unitsDelta).toBe(2 * ('units' in WORKSHOP ? WORKSHOP.units : 0));
    // The first Truck sells into a Hot Category.
    expect(beats[2]?.earned).toBeGreaterThan(0);
    expect(beats[2]?.flourishes).toEqual(expect.arrayContaining(['sale', 'hot']));
    // Quality Lab does nothing for a Truck.
    expect(beats[3]?.idle).toBe(true);
    expect(beats[3]?.flourishes).not.toContain('retrigger');
    // Running totals line up with the result.
    expect(beats.at(-1)?.sales).toBe(result.shipSales);
    expect(beats.reduce((sum, b) => sum + b.earned, 0)).toBe(result.shipSales);
    expect([leftover, total]).toEqual([result.leftover, result.total]);
  });

  it('carries sales past a Quota Cap to the finale', () => {
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))];
    const made = scoreLine(line, context()).total;
    const { total, overCap } = shiftBeats(scoreLine(line, context({ boss: boss('quota-cap'), shiftCap: 5 })));
    expect([total, overCap]).toEqual([5, made - 5]);
    expect(shiftBeats(scoreLine(line, context())).overCap).toBe(0);
  });

  it('marks a welded slot', () => {
    const result = scoreLine([slot(fixture('quality-lab'), card(SKETCH, 'Food')), slot(null, card(WORKSHOP, 'Food'))], context({ boss: boss('supply-shock') }));
    const [welded] = shiftBeats(result, DEFAULT_CONFIG.baseMargin).beats;
    expect(welded?.kind).toBe('welded');
    expect(welded?.flourishes).toEqual(['welded']);
  });
});
