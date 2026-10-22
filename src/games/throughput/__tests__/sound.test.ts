import { describe, expect, it } from 'vitest';
import { Rng } from '../../../engine/rng';
import { SoundPlayer } from '../../../ui/sound';
import type { CueOptions, SoundCue } from '../../../ui/sound';
import { playBeat, playFinale, playShiftAtOnce, saleIntensity, shiftOutcome } from '../browser';
import type { ShiftOutcome } from '../browser';
import { TRUCK, WORKSHOP } from '../content';
import { ThroughputRun, scoreLine } from '../rules';
import { GreedyBot } from '../sim';
import { shiftBeats } from '../spectacle';
import { card, context, slot } from './fixtures';

class RecordingPlayer extends SoundPlayer {
  readonly played: [SoundCue, CueOptions | undefined][] = [];
  play(cue: SoundCue, options?: CueOptions): void {
    this.played.push([cue, options]);
  }
  configure(): void {}
  unlock(): void {}
}

/** What a Run just did, read from the phase it left the run in. */
const ranTo = (run: ThroughputRun): ShiftOutcome => (run.phase === 'lost' ? 'miss' : run.phase === 'shift' ? 'none' : 'hit');

/** Make, Ship, then an empty slot. */
const shift = () => scoreLine([slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home')), slot(null, null)], context());

describe('THROUGHPUT Shift sound', () => {
  it('each beat rolls (softer past an empty slot) and a sale dings as its pop peaks, higher for more', () => {
    const result = shift();
    const sale = result.steps[1]?.sales ?? 0;
    expect(sale).toBeGreaterThan(0);
    const player = new RecordingPlayer();
    for (const beat of shiftBeats(result).beats) playBeat(player, beat, 500);
    expect(player.played).toEqual([
      ['slot', { intensity: 1 }],
      ['slot', { intensity: 1 }],
      ['sale', { delayMs: 200, intensity: saleIntensity(sale) }],
      ['slot', { intensity: 0.4 }],
    ]);
  });

  it('the finale sounds a chord on a hit and a thud on a miss, as the total lands', () => {
    const player = new RecordingPlayer();
    playFinale(player, 'none', 240);
    playFinale(player, 'hit', 240);
    playFinale(player, 'miss', 120);
    expect(player.played).toEqual([
      ['hit', { delayMs: 240 }],
      ['miss', { delayMs: 120 }],
    ]);
  });

  it('with no replay (reduced motion) a Shift dings once for its sales, then sounds the outcome', () => {
    const result = shift();
    const player = new RecordingPlayer();
    playShiftAtOnce(player, result, 'hit');
    expect(player.played).toEqual([
      ['sale', { intensity: saleIntensity(result.shipSales) }],
      ['hit', { delayMs: 120 }],
    ]);
  });

  it('bigger sales ding higher, from $1 up to $512', () => {
    expect(saleIntensity(1)).toBe(0);
    expect(saleIntensity(18)).toBeGreaterThan(saleIntensity(6));
    expect(saleIntensity(300)).toBeGreaterThan(saleIntensity(18));
    expect(saleIntensity(512)).toBe(1);
    expect(saleIntensity(5000)).toBe(1);
  });

  it('the outcome read before a Run, and the preview it replays, match what the Run then does', () => {
    const seen = new Set<ShiftOutcome>();
    for (let seed = 1; seed <= 12; seed++) {
      const run = new ThroughputRun(seed);
      const bot = new GreedyBot();
      bot.beginRun(run, new Rng(seed).fork('bot'));
      while (run.phase === 'shift' || run.phase === 'shop') {
        if (run.phase === 'shop') {
          run.continueToNextRound();
          continue;
        }
        const d = bot.shiftTurn(run);
        if (d.kind === 'load') run.load(d.placements);
        else if (d.kind === 'retool') run.retool(d.hand);
        else if (d.kind === 'scrap') run.scrap(d.slots);
        else {
          const preview = run.preview();
          const predicted = shiftOutcome(run, preview);
          expect(run.runShift()).toEqual(preview);
          const actual = ranTo(run);
          expect(predicted).toBe(actual);
          seen.add(actual);
        }
      }
    }
    expect([...seen].sort()).toEqual(['hit', 'miss', 'none']);
  });
});
