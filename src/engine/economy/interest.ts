/** Interest paid at round end: `amount` per full `per` cash held, capped at `cap`. */
export type InterestConfig = {
  readonly per: number;
  readonly amount: number;
  readonly cap: number;
};

export function computeInterest(cash: number, config: InterestConfig): number {
  if (cash <= 0 || config.per <= 0) return 0;
  return Math.min(config.cap, Math.floor(cash / config.per) * config.amount);
}

/** The least cash that earns the most interest: holding more than this earns nothing more. */
export function interestCeiling(config: InterestConfig): number {
  return Math.ceil(config.cap / config.amount) * config.per;
}
