import { DEFAULT_CONFIG } from '../content';
import type { ThroughputConfig } from '../content';
import { KEYS_HINT } from './input';

export type HowToPlayProps = { config?: ThroughputConfig };

/** The short version of the rules for the title; the full rules are in the game's How to play. */
export function HowToPlay({ config = DEFAULT_CONFIG }: HowToPlayProps) {
  const c = config;
  const years = Math.ceil(c.targets.length / c.roundsPerYear);
  return (
    <div className="tp-howto">
      <h2 className="tp-howto__heading">How to play</h2>
      <ol className="tp-howto__steps">
        <li data-step="target">
          <strong>Hit the target.</strong> Every quarter sets a Sales target, and you get up to {c.shiftsPerRound} Shifts to reach it. Miss it and the run ends. Clear the Board Review that closes Year{' '}
          {years} to win.
        </li>
        <li data-step="load">
          <strong>Load the Line.</strong> Tap a card in your hand, then a bay; or drag it onto a bay, or double-click it to fill the first empty bay. Each Shift a Batch moves through the bays from left to right: Designs raise the Margin, Makes add Units, and
          Ships sell the Units so far. So put Designs and Makes before the Ship that sells them.
        </li>
        <li data-step="run">
          <strong>Run the Shift.</strong> The receipt next to your hand shows what running now would make. Makes and Ships are used up, Designs stay on the Line for the rest of the round, and
          you draw back up to {c.handSize}.
        </li>
        <li data-step="retool">
          <strong>Fix a bad hand.</strong> Retool ({c.retoolsPerRound} per round) swaps up to {c.retoolMax} cards for new ones.
          {c.restocksPerRound > 0 && ' Once a round, an empty draw pile is refilled from your discards.'}
        </li>
        <li data-step="shop">
          <strong>Build between rounds.</strong> Spend Capital on Fixtures that power up a bay, new cards, and Contracts that improve your deck. Watch the Market: a Hot Category sells for
          ×{c.hotMultiplier}.
        </li>
        <li data-step="board">
          <strong>Beat the Board.</strong> The last round of each Year is a Board Review with a twist on the rules, shown in advance.
        </li>
        <li data-step="keys">
          <strong>Keys.</strong> {KEYS_HINT}
        </li>
      </ol>
    </div>
  );
}
