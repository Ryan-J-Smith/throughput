import { EngineError } from '../errors';

/** Holds the run's cash. */
export class Wallet {
  private cash_: number;

  constructor(cash: number) {
    this.cash_ = cash;
  }

  get cash(): number {
    return this.cash_;
  }

  canAfford(amount: number): boolean {
    return amount <= this.cash_;
  }

  earn(amount: number): void {
    if (amount < 0) throw new EngineError(`Wallet.earn: negative amount ${amount}`);
    this.cash_ += amount;
  }

  spend(amount: number): void {
    if (amount < 0) throw new EngineError(`Wallet.spend: negative amount ${amount}`);
    if (!this.canAfford(amount)) throw new EngineError(`Wallet.spend: cannot afford ${amount}`);
    this.cash_ -= amount;
  }
}
