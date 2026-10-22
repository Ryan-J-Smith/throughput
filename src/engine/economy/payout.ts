export type PayoutLine = {
  readonly source: string;
  readonly amount: number;
};

/** Itemized cash reward for a round; modifiers may append lines before it is paid. */
export class Payout {
  private readonly lines_: PayoutLine[] = [];

  get lines(): readonly PayoutLine[] {
    return this.lines_;
  }

  add(source: string, amount: number): void {
    this.lines_.push({ source, amount });
  }

  /** Sum of all lines, never below zero. */
  total(): number {
    return Math.max(0, this.lines_.reduce((sum, line) => sum + line.amount, 0));
  }
}
