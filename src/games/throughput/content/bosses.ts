import { BoardBoss } from '../model';

class LineShift extends BoardBoss {
  readonly id = 'line-shift';
  readonly name = 'Line Shift';
  readonly text = 'Before every Shift, including Shift 1, all Fixtures move one slot right (the last wraps to slot 1). Cards stay put. Your layout comes back after the round.';
  readonly pressures = 'R&D Compounder and Skimmer: parked Designs drift off their Mods';

  override shiftFixtures<T>(fixtures: readonly T[]): T[] {
    if (fixtures.length === 0) return [];
    return [fixtures[fixtures.length - 1] as T, ...fixtures.slice(0, -1)];
  }
}

class Turnover extends BoardBoss {
  readonly id = 'turnover';
  readonly name = 'Turnover';
  readonly text = 'Designs are dispatched after each Shift like every other card.';
  readonly pressures = 'Design-heavy builds (Skimmer, R&D Compounder): no standing Line';

  override designsStay(): boolean {
    return false;
  }
}

class SupplyShock extends BoardBoss {
  readonly id = 'supply-shock';
  readonly name = 'Supply Shock';
  readonly text = 'Slot 1 is welded shut: no card, and its Fixture does nothing.';
  readonly pressures = 'Brand Chain and long layouts: one fewer slot, and slot 1 Fixtures go idle';

  override isWelded(slot: number): boolean {
    return slot === 0;
  }
}

class JitAuditor extends BoardBoss {
  readonly id = 'jit-auditor';
  readonly name = 'JIT Auditor';
  readonly text = 'Leftover Units cost $2 each instead of selling for $1, and the Warehouse is closed.';
  readonly pressures = 'Mass Market and Stockpile: overproduction is punished';

  override overstockValue(): number {
    return -2;
  }

  override warehouseOpen(): boolean {
    return false;
  }
}

export const BOSSES: readonly BoardBoss[] = [new LineShift(), new Turnover(), new SupplyShock(), new JitAuditor()];
