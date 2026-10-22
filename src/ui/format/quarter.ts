/** Rounds read as fiscal quarters: round 1 is Q1 of year 1, round 5 is Q1 of year 2. */
export function quarterOf(round: number): { quarter: string; year: string } {
  const n = Math.max(1, round);
  return { quarter: `Q${((n - 1) % 4) + 1}`, year: `Year ${Math.ceil(n / 4)}` };
}
