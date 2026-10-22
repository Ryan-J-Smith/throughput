import { BoardBoss } from '../model';

class LineShift extends BoardBoss {
  readonly id = 'line-shift';
  readonly name = 'Line Shift';
  readonly short = 'Fixtures drift right';
  readonly text =
    'From Shift 2 on, all Fixtures move one slot right before each Shift (the last wraps to slot 1). Cards stay put, but you may unload parked cards back to your hand. Your layout comes back after the round.';
  readonly pressures = 'R&D Compounder and Skimmer: parked Designs drift off their Mods';

  // Shift 1 runs on the player's layout; the drift starts at Shift 2 (approved rework, see DESIGN_NOTES).
  override shiftFixtures<T>(fixtures: readonly T[], shift: number): T[] {
    if (shift < 2 || fixtures.length === 0) return [...fixtures];
    return [fixtures[fixtures.length - 1] as T, ...fixtures.slice(0, -1)];
  }

  override movesFixtures(): boolean {
    return true;
  }

  override recallsParked(): boolean {
    return true;
  }
}

class Turnover extends BoardBoss {
  readonly id = 'turnover';
  readonly name = 'Turnover';
  readonly short = 'Designs dispatched';
  readonly text = 'Designs are dispatched after each Shift like every other card.';
  readonly pressures = 'Design-heavy builds (Skimmer, R&D Compounder): no standing Line';

  override designsStay(): boolean {
    return false;
  }
}

class SupplyShock extends BoardBoss {
  readonly id = 'supply-shock';
  readonly name = 'Supply Shock';
  readonly short = 'Slot 1 welded';
  readonly text = 'Slot 1 is welded shut: no card, and its Fixture does nothing.';
  readonly pressures = 'Brand Chain and long layouts: one fewer slot, and slot 1 Fixtures go idle';

  override isWelded(slot: number): boolean {
    return slot === 0;
  }
}

class JitAuditor extends BoardBoss {
  readonly id = 'jit-auditor';
  readonly name = 'JIT Auditor';
  readonly short = 'Leftovers cost $2';
  readonly text = 'Leftover Units cost $2 each instead of selling for $1, and the Warehouse is closed.';
  readonly pressures = 'Mass Market and Stockpile: overproduction is punished';

  override overstockValue(): number {
    return -2;
  }

  override warehouseOpen(): boolean {
    return false;
  }
}

class Bottleneck extends BoardBoss {
  readonly id = 'bottleneck';
  readonly name = 'Bottleneck';
  readonly short = 'Slot 3 welded';
  readonly text = 'Slot 3 is welded shut: no card, and its Fixture does nothing. It breaks Handoff chains.';
  readonly pressures = 'Brand Chain and Skimmer: chains and Gun-to-Ship runs are cut in the middle';

  override isWelded(slot: number): boolean {
    return slot === 2;
  }
}

class Recession extends BoardBoss {
  readonly id = 'recession';
  readonly name = 'Recession';
  readonly short = 'Demand halved';
  readonly text = "Every Category's Demand is halved this round. Export Deal still sells everything.";
  readonly pressures = 'Mass Market: volume runs out of buyers';
  override readonly earliestYear = 3;

  override demandMul(): number {
    return 0.5;
  }
}

class EthicsReview extends BoardBoss {
  readonly id = 'ethics-review';
  readonly name = 'Ethics Review';
  readonly short = 'No Design ×';
  readonly text = "Design cards' Margin × (Influencer, Rebrand) don't apply this round. Their +$ still do.";
  readonly pressures = 'Design stacks: the Influencer multiplier tower';
  override readonly earliestYear = 3;

  override designMultipliers(): boolean {
    return false;
  }
}

class ShortWeek extends BoardBoss {
  readonly id = 'short-week';
  readonly name = 'Short Week';
  readonly short = 'Only 3 Shifts';
  readonly text = 'This round has 3 Shifts instead of 4.';
  readonly pressures = 'Slow setups: parked-Design and setup-Shift plays get one fewer Shift';

  override shiftsPerRound(normal: number): number {
    return normal - 1;
  }
}

class QuotaCap extends BoardBoss {
  readonly id = 'quota-cap';
  readonly name = 'Quota Cap';
  readonly short = '60% cap per Shift';
  readonly text = 'No single Shift counts more than 60% of the target. Sales past that are lost.';
  readonly pressures = 'Shift-1 burst engines: one big Shift can no longer clear the round';

  override shiftQuota(): number {
    return 0.6;
  }
}

export const BOSSES: readonly BoardBoss[] = [
  new LineShift(),
  new Turnover(),
  new SupplyShock(),
  new JitAuditor(),
  new Bottleneck(),
  new Recession(),
  new EthicsReview(),
  new ShortWeek(),
  new QuotaCap(),
];
