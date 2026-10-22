# THROUGHPUT + Trends: design notes

Implementation of `docs/ai_docs/delphi/v3/seed-03.md` plus the trend-conveyor spec in `docs/ai_docs/bakeoff.md`.
These notes record where the docs were silent or ambiguous, and what was chosen. Tunables live in
`content/config.ts` (`DEFAULT_CONFIG`).

## Architecture

- **Game-specific state machine, not engine `Run`.** A round here means loading cards into Line slots and
  then running a Batch. Designs persist across Shifts and Fixtures sit in slots, so `Run.play(cards)`
  doesn't fit. Generalizing `Run` would have been invasive.
  - `rules/ThroughputRun` owns the round and shop flow.
  - `rules/scoreLine` is a pure function returning a per-slot trace. It drives the preview, the run
    and the tests.
- **Engine pieces reused:**
  - `Rng` forks: `deck`, `market`, `bosses`, `shop/{fixtures,cards,contracts}`.
  - `Registry` + `Shop`: three instances give the fixed 2 Fixtures / 2 Cards / 1 Contract mix, with a
    shared reroll cost.
  - `Wallet`, `Payout`, `computeInterest`.
- **Engine `Deck` not reused.** Cards move hand → Line → hand (unload) or → discard, and `Deck`'s
  one-way exhaust can't express that. The run keeps its own draw/hand/discard piles.
- **Behavioural contracts are abstract classes:**
  - `FixtureEffect` has hooks `onSlot`, `resolveCount`, `saleMultiplier`, `afterResolve` and
    `keepsOnLine`.
  - `BoardBoss` has `isWelded`, `designsStay`, `overstockValue`, `warehouseOpen` and `shiftFixtures`.
  - Cards and Contracts are plain data records.

## Rules decisions

| Topic | Decision | Why |
|---|---|---|
| Starting Capital | 4C | Doc is silent; Balatro's $4. |
| Expediter | Cut (doc allows it as "next cut"). | Its flip from the deck would make the exact preview leak the hidden top card. |
| Scrap vs Unload | `unload` returns cards loaded this Shift to hand; `scrap` discards only cards parked from earlier Shifts. | Scrapping fresh cards and then drawing back to 7 would be a free, unlimited Retool. |
| Handoff, Showroom | Change the Batch's Margin, which carries on. | Matches the worked example's Margin column ($30 → $33). |
| Equity | +$1 per point on that Category's *sale only*, before multipliers. | Spec says "on that Category's Ship cards"; a persistent bump would leak into other Categories. |
| Sale price | `(Margin + Equity) × card ×(Boutique/Wholesale) × Hot ×2 × Flagship`, revenue floored per sale. | Multipliers are sale-only like Boutique; flooring once per sale keeps traces exact. |
| Buzz pips | 2 per round. A Shift that sells ≥1 Unit of the Hot Category spends one pip, and every Hot sale that Shift gets ×2. | "first 2 Shifts of the round that ship it." |
| Emerging Equity | +1 per Category per Shift that sells ≥1 of its Units. | Spec wording. |
| Saturated | That Category's Ship caps ×0.5 (stacks with Gun), unless Loyal (Equity ≥ 3). | Spec. |
| Wholesale Club | "Ships all Units" ignores cap cuts (Gun, Saturation). | "All" has no cap to halve; keeps it the volume dump it is meant to be. |
| Ending a round | The round clears as soon as Sales ≥ target after a Shift; unused Shifts pay 2C each. | Doc's "+2C per unused Shift". |
| Interest | +1C per 5C held *before* the round's income, max 5C. | Balatro convention. |
| Selling | Fixtures and *bought* cards sell for half (floored). Starter cards can't be sold. | Selling starters for 0 would make Downsizing pointless. "Sell its pieces in Year 2" (Mass Market) needs bought cards to be sellable. |
| Fixture placement | Buying needs a slot with no Fixture; moving costs 1C, shop only, and swaps if the target has one. | Doc: "placed free; moving costs 1C". |
| Stations | Take no card. A parked Design that a Station drifts onto (Line Shift) sits idle until it moves off. | "A Station fills the slot itself." |
| Warehouse fee | Charged automatically on entering the shop: ⌈stored/10⌉C. If unaffordable, the stored Units are lost. Selling the last Warehouse loses them too. Overflow above 40 clears at $1. | Keeps the shop free of a forced extra step; a player who doesn't want the fee just doesn't store. |
| Flagship | ×(1.2 + 0.2 × rounds cleared since bought); the first round on it is ×1.2. | Doc. |
| R&D Lab | Growth is recorded per resolve and applied after the Shift, so it doesn't boost its own resolve. | Worked example: "+$5 (R&D: becomes +$6)". |
| Tooling Upgrade on Influencer | +$1 is added before its ×1.5. | Same as any Design's additive part. |
| Downsizing | Can't remove your last card. | Sanity. |
| Fractional Margin | Kept exact internally, shown to 2 decimals. | ×1.5 effects. |
| Shop cards | Each of the 4 shop cards comes in a random Category (16 offer ids); no duplicates within a stock. | Cards have Categories; this also lets the shop feed trend plays. |
| Fixture rarity | 70/25/5 by tier, split evenly within each tier. | Doc's odds are per tier, not per item. |
| Floor Expansion | Not offered once the Line has 7 slots. | Max 7. |

## Trend conveyor

- Quarter 1 puts one seeded-random Category in each of Emerging, Hot, Saturated and Neutral.
- Each quarter after that, stages advance (Emerging → Hot → Saturated → Neutral). Then a seeded pick
  among the Neutral Categories becomes Emerging, and that **may be the one just leaving Saturated**, so a
  trend can come straight back.
  - Orchestrator decision, 2026-10-22. The spec's "not the one just leaving" restriction left exactly one
    candidate with 4 Categories, which made the conveyor a fixed 4-cycle with zero surprise.
- The strip still shows this round and the next 3. The full schedule is computed at run start from
  per-round Rng forks, so the forecast is exact.

## Bosses

- Each Year's Board (rounds 3, 6, 9, 12) gets one boss. The seeded order uses each boss once over the 4
  Years.
- The next two Board bosses are always shown, which satisfies "telegraphed a Year ahead".

| Boss | Pressures | Notes |
|---|---|---|
| Line Shift | R&D Compounder, Skimmer (Designs drift off their Mods) | Fires at the start of every Shift, including Shift 1. The player's layout is restored after the round. |
| Turnover | Design-heavy builds (Skimmer, R&D Compounder) | Dispatches Designs only; Automation still keeps Make cards. |
| Supply Shock | Brand Chain, long layouts | Slot 1's card *and* Fixture are inactive; loading there is refused. |
| JIT Auditor | Mass Market, Stockpile (overproduction) | Leftover Units cost $2 each; Warehouse closed (stored Units stay stored). A Shift can lower round Sales, floored at 0. |

## CLI

- `npm run -s cli -- new --game throughput --seed N --save FILE`.
- Commands:
  - `load 3:1 5:4` places several cards in one action (`<hand>:<slot>`; hand numbers refer to the hand
    before the command).
  - Also `unload`, `scrap`, `retool`, `run`, `buy <offer> [<slot>|<deck card>]`,
    `sell fixture|card N`, `move A B`, `reroll` and `continue`.
- `rules` and `deck` are free queries and are not recorded in the save.
- The state always shows:
  - the exact "If you run now" trace;
  - the Market strip (this round and the next 3, with Equity);
  - the next two Board bosses;
  - legal actions with their valid slots.

## Sim tuning (Phase B, first pass)

`npm run sim -- --scenario throughput --runs 500 --report all`

### Bots

All four bots share one tactical planner (`sim/planner.ts`):

- It hill-climbs over slot assignments: add, remove, move, swap, replace.
- Each candidate is scored with the exact preview, plus a bonus for Designs that will stay (capped so
  the Line keeps 3 slots for Makes and Ships).
- Two starts: empty, and the best canonical Designs → Makes → Ships fill. One-move climbs from empty
  stall under JIT Auditor, where a lone Make loses money.
- Bots scrap a weak parked Design when fewer than 2 slots are open.
- Bots retool when the hand can't sell.
- Before a Board whose boss welds a slot, bots move any Fixture out of it (bosses are telegraphed).
- Bots replace a Fixture when a much more wanted one is on offer.

The bots differ only in shopping:

| Bot | Plan |
|---|---|
| `greedy` | Buys the priciest affordable item. Baseline. |
| `mass-market` (tempo) | Overtime Crews, Assembly Line, Factory Floors, Wholesale Club; spends everything. |
| `rnd-compounder` (slow burn) | Banks 15C for interest in Year 1, except for R&D Lab / Flagship / Robot Arm. Parks the most-grown Sketch on the R&D Lab, then buys multiplicative scaling. |
| `trend-surfer` | Buys cards in next round's Hot/Emerging Categories; values shipping Emerging goods for Equity. |

### Targets

- seed-03's curve (150 … 10,000, kept as `SEED_03_TARGETS`) gave **0% wins for every bot**. The bots
  plateau around 1,000–2,500 per round because they don't build the doc's Year 4 engine (~7,000 per
  Shift).
- New default: **150, 250, 350 | 450, 600, 800 | 1000, 1250, 1500 | 1750, 2050, 2350**.

Results over 500 seeds per bot:

| Bot | Win | Clears r3 | Clears r6 | Clears r9 | Clears r12 |
|---|---|---|---|---|---|
| rnd-compounder | **30.2%** | 84% | 76% | 55% | 30% |
| greedy | 20.4% | 92% | 68% | 38% | 20% |
| mass-market | 4.0% | 98% | 81% | 33% | 4% |
| trend-surfer | 1.8% | 98% | 69% | 16% | 2% |

- **Tempo and slow burn cross.** Mass Market clears more rounds through Y2 Q2 (round 5). The
  Compounder, which pays for its Year 1 banking, overtakes at the Y2 Board and widens the gap through
  Year 4.
- **Caveat: the late curve is now far flatter than the doc's.** Skilled human or LLM play should scale
  well past the bots (Influencer on a Robot Arm, Gun skim lines). If playtests find Years 3–4 easy,
  steepen from round 9 on first.

### Item impact (pooled, aware Δ win vs skippers)

- **Winners:** Robot Arm +29%, R&D Lab +27%, Flagship +24%, Floor Expansion +17%, Influencer +11%,
  Quality Lab +10%.
- **Losers:** Wholesale Club −18%, Factory Floor −16%, Assembly Line −16%, Tooling Upgrade −12%,
  Warehouse −8%, Automation −8%.
  - The volume items losing is the doc's "Mass Market stalls by Year 3".
  - None of the bots *pivots* (sells volume pieces in Year 2), so this overstates it.
- **No auto-pick:** the highest pick rate is 51% (Flagship).
- **No item is dead.** Brand Manager (12%) and Warehouse (12%) are the least picked; the bots never
  pursue Brand Chain or Stockpile deliberately.

### Findings for the evaluation

1. **Compounders are rare.** The slow-burn plan hinges on the R&D Lab, one of 6 uncommons (about 4% per
   Fixture offer), and on Robot Arm and Flagship (rares, about 2.5% each).
2. **Trend chasing through the shop is weak** (trend-surfer 1.8%). Trends matter tactically (Hot ×2 on
   the right Truck) more than as a build direction.
   - Equity +$1/point is small next to Margin multipliers.
   - Consider a bigger Emerging payoff if trends should drive builds.
3. **Supply Shock is the hardest Board** (about 40% clears at r9/r12 versus 50–80% for the others).
   Losing a fifth of the Line is steep even when the bot dodges the weld.
