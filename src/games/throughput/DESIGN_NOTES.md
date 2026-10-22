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
  - `FixtureEffect` has hooks `onSlot`, `resolveCount`, `saleMultiplier`, `afterResolve`,
    `keepsOnLine` and `appliesTo`. `appliesTo` is for display only: traces and the Line tag a Mod "idle"
    under a card it never acts on (Quality Lab under a Truck).
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
| Overkill pay | When a round clears, +1C per full 25% of the target sold beyond it, at most 5C (`config.overkill`). Paid after unused Shifts, before Interest. | BoM graft (convergence plan): overshoot was wasted (playtest N6). See "BoM grafts" below. |
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
| Hand positions | A card keeps its hand position while it is in hand. The next Shift's draws fill the lowest gaps, a Retool's draws go into the retooled positions, and an unloaded card returns to its old position if it is free. `hand` stays dense (Placements, Retools and the bots index it); `handSlots` gives the positions for display. | Playtest round 1: renumbering after each load caused misloads (4/7). Presentation only: the draw order is unchanged. |

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
  - `load 3:1 5:4` places several cards in one action (`<hand>:<slot>`). Hand numbers are stable hand
    positions (see "Hand positions"); the CLI maps them to `hand` indexes.
    - Saves made before stable positions can fail to replay if they loaded twice in one Shift, since
      the same numbers now name different cards.
  - Also `unload`, `scrap`, `retool`, `run`, `buy <offer> [<slot>|<deck card>]`,
    `sell fixture|card N`, `move A B`, `reroll` and `continue`.
- `rules` and `deck` are free queries and are not recorded in the save. `npm run -s cli -- rules --game
  throughput` prints the rules without a save.
- The rules text is `rulesText(config)`, so targets, payouts and other tunables can't drift from it. The
  browser's How to play is the same text without COMMANDS.
- The state always shows:
  - the exact "If you run now" trace;
  - the Market strip (this round and the next 3, with Equity, and what spends a buzz pip);
  - the next two Board bosses;
  - for each card on the Line, whether it stays after the run;
  - the Fixtures a boss moved before this Shift (Line Shift), also logged after `run` and `continue`;
  - legal actions with their valid slots.
- The shop shows why an offer can't be bought, the interest the current Capital would earn, and (before a
  Line Shift Board) where the Fixtures will sit for Shift 1. The deck is listed only when a card-targeting
  Contract is on offer; otherwise `deck` lists it.

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

## BoM grafts (convergence plan)

The user chose THROUGHPUT and approved three Bill of Materials ideas to graft onto it
(`docs/ai_docs/throughput-plan.md`). Playtest round 1 is the yardstick:
- 6/7 testers converged on parked Designs over Quality Labs plus Influencers;
- holding cash never paid;
- R1–R5 were cleared with 1.5–3× overkill;
- Downsizing, Price Gun and Assembly Line were never bought.

### Overkill pay (tempo lever)

- **Rule:** when a round clears, +1C per full `step` × target of Sales beyond the target, capped at `cap`C.
  - Starting point is BoM's Overtime formula: step 0.25, cap 5.
  - Because the round ends at the target, the overshoot is the clearing Shift's surplus. Clearing in Shift 1 for the
    unused-Shift bonus now competes with a setup Shift followed by a bigger blow-out.
- **Bot overshoot on the default curve:** R1 averages +50–60% over target (p90 about +100%) and R2–R5 +30–45%,
  which pays about 1–2C a round early and 0–1C late. Testers on seed-03 overshot by 50–200% early, which pays 2–5C.

1000 seeds per bot (`npm run sim -- --scenario throughput --runs 1000`):

| Bot | Off: win | Off: clears r3/6/9/12 | step 0.25, cap 5: win | step 0.25, cap 5: clears r3/6/9/12 | step 0.1, cap 5: win |
|---|---|---|---|---|---|
| greedy | 20.7% | 92/68/38/21 | 26.4% | 95/74/50/26 | 28.6% |
| mass-market | 3.5% | 97/79/32/4 | 5.2% | 98/84/44/5 | 6.6% |
| rnd-compounder | 30.0% | 83/73/53/30 | 32.7% | 88/80/61/33 | 39.4% |
| trend-surfer | 2.1% | 97/69/16/2 | 2.8% | 97/72/17/3 | 2.6% |

- **It is a cash injection for everyone, not a tempo-only lever.** Every bot gains, and greedy gains most, because
  overshoot comes from whichever engine is ahead of the curve. Mass Market's mid and late overshoot is the smallest
  (+10–20%), so it gains little.
- **Kept at step 0.25 / cap 5.** The target re-fit absorbs the extra power, and step 0.1 mostly feeds the
  compounder.

