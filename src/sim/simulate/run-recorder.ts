import type { OfferRecord, PurchaseRecord, RoundStats, RunStats } from './simulate';

/**
 * Collects one run's stats in the shape every sim report consumes. `simulate` uses it for
 * Run-based games; games with their own rules engine can drive it directly from their own loop.
 */
export class RunRecorder {
  private readonly seed: number;
  private readonly bot: string;
  private readonly rounds: RoundStats[] = [];
  private readonly offers: OfferRecord[] = [];
  private readonly purchases: PurchaseRecord[] = [];

  constructor(seed: number, bot: string) {
    this.seed = seed;
    this.bot = bot;
  }

  /** Records a finished round; margin is derived from score and target. */
  round(round: Omit<RoundStats, 'margin'>): void {
    const margin = round.target > 0 ? (round.score - round.target) / round.target : 0;
    this.rounds.push({ ...round, margin });
  }

  /** Records an item shown in the shop after clearing `round`. */
  offer(offer: OfferRecord): void {
    this.offers.push(offer);
  }

  /** Records an item bought in the shop after clearing `round`. */
  purchase(purchase: PurchaseRecord): void {
    this.purchases.push(purchase);
  }

  finish(result: { readonly won: boolean; readonly roundReached: number; readonly archetype: string }): RunStats {
    const { won, roundReached, archetype } = result;
    return {
      seed: this.seed,
      bot: this.bot,
      archetype,
      won,
      roundReached,
      roundsCleared: won ? roundReached : roundReached - 1,
      rounds: [...this.rounds],
      offers: [...this.offers],
      purchases: [...this.purchases],
    };
  }
}
