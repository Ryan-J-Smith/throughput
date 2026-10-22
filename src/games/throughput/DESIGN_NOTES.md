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
  - `BoardBoss` has `isWelded`, `designsStay`, `overstockValue`, `warehouseOpen`, `shiftFixtures(fixtures, shift)`,
    `movesFixtures` (for notices) and `recallsParked`.
  - Cards and Contracts are plain data records.

## Rules decisions

| Topic | Decision | Why |
|---|---|---|
| Starting Capital | 4C | Doc is silent; Balatro's $4. |
| Expediter | Cut (doc allows it as "next cut"). | Its flip from the deck would make the exact preview leak the hidden top card. |
| Scrap vs Unload | `unload` returns cards loaded this Shift to hand; `scrap` discards only cards parked from earlier Shifts. In a round whose boss `recallsParked` (Line Shift), `unload` also takes parked cards back to hand. | Scrapping fresh cards and then drawing back to 7 would be a free, unlimited Retool. A recalled card goes to hand, not the discards, so recall is no free Retool either. |
| Handoff, Showroom | Change the Batch's Margin, which carries on. | Matches the worked example's Margin column ($30 → $33). |
| Demand (replaces Equity) | Each Category buys up to its Demand in Units per round, shared by all its Ship cards (start 20). Selling the last of it grows it +10 for good. Equity and Loyal are gone. | BoM graft b. See "BoM grafts" below. |
| Sale price | `Margin × card ×(Boutique/Wholesale) × Hot ×2 × Flagship × R&D Premium`, revenue floored per sale. | Multipliers are sale-only like Boutique; flooring once per sale keeps traces exact. |
| Buzz pips | 2 per round. A Shift that sells ≥1 Unit of the Hot Category spends one pip, and every Hot sale that Shift gets ×2. | "first 2 Shifts of the round that ship it." |
| Emerging | +10 Demand for good per Shift that sells ≥1 Unit of it (from next round). | Replaces +1 Equity: Emerging now prepares a Category for its Hot round. |
| Saturated | That Category has ×0.5 of its Demand that round. | Replaces caps ×0.5 and Loyal. |
| Wholesale Club | "Ships all Units" ignores cap cuts (Gun) and Demand, and doesn't use any up. | "All" has no cap to halve; keeps it the volume dump, now the overflow outlet once Demand runs out. |
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
| Restock | `restocksPerRound` (1): the first draw of a round that finds the draw pile empty first shuffles the discard pile (dispatched, scrapped and retooled cards, including those just retooled) into a new draw pile. After that an empty pile stays empty. | Approved 2026-10-22 (`docs/ai_docs/throughput-mechanics-writeups.md` §1). Testers: 31 of 110 Shift-2+ starts had ≤3 cards left, and 2 of 5 losses ended on an empty pile. Sims: lost rounds that end on an empty pile −60%, wins +0.5pp. "Every time" sims the same as "once". |
| Opening hand | `openingHandTypes` (Make, Ship): after the round's first draw, each missing type swaps in the next card of that type from the draw pile for the last hand card of the hand's most common other type, which takes its place in the pile. Skipped if the pile has none. | Same write-up §1: 4 of 7 tester dead starts were Shift-1 openers; sims −20% dead starts at no measurable balance cost. A third Retool and a full mulligan were simmed and rejected. |
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
| Line Shift | R&D Compounder, Skimmer (Designs drift off their Mods) | Shift 1 runs on the player's layout; from Shift 2 on, Fixtures move one slot right before each Shift. Parked cards may be unloaded back to hand that round. The layout is restored after the round. Approved rework (write-up §2): it was the only boss that ended tester runs; bot clears 76.6% → 88.7%, level with Turnover and JIT. General recall of parked cards was rejected (§3: +4pp wins, and it removes the parked-Design stack's one cost). |
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
  - the Market strip (this round and the next 3, with Demand left / Demand, and what spends a buzz pip);
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
| `trend-surfer` | Buys cards in next round's Hot/Emerging Categories; values shipping Emerging goods for Equity. (Reworked with the Demand graft; see below.) |

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

### Per-Category Demand (graft b)

**Rule (orchestrator-approved, variant F):**
- Each Category has **Demand**: the Units it buys per round. It is shared by all of that Category's
  Ship cards, refills each round, and starts at 20.
- A **Truck** sells up to its Category's Demand left. It has no flat cap any more; 20 was the old one.
- A **Boutique** sells up to 8 *and* up to Demand left.
- **Wholesale Club** sells every Unit, ignores Demand and uses none of it. It is the overflow outlet.
- **Price Gun** halves what later Ships may take. For a Truck that is half the Demand left.
- **Sell-out:** a Shift that sells the last of a Category's Demand grows it +10 for good, from the next round.
- **Trends merge Equity into Demand.**
  - Emerging: +10 Demand per Shift that sells the Category, so a Category grows deep before its Hot round.
  - Saturated: ×0.5 Demand that round.
  - Hot is unchanged.
  - Equity, Loyal and their +$1 are removed. Playtest N13 found them to be noise.
- **Tooling Upgrade** can't target Trucks or Wholesale Clubs, since they have no cap to raise. A Boutique
  still gets +5 cap.
- **Hooks:**
  - `ShiftContext.demandLeft` and `ShiftContext.grants`.
  - `ShiftResult.demandSold`, `soldOut`, `emergingSold` and `demandGrowth`.
  - `ThroughputRun.demand`, `demandLeft` and `grants`.

**Variants simmed** (500 seeds; overkill on, before the Restock/Opener rules; win %):

| Variant | greedy | mass-market | rnd-compounder | trend-surfer |
|---|---|---|---|---|
| No Demand (overkill only, 1000 seeds) | 26.4 | 5.2 | 32.7 | 2.8 |
| A: Demand budget only, Truck keeps cap 20 (start 20, +5) | 20.2 | 0.0 | 23.2 | 1.2 |
| B: as A, start 30 | 21.2 | 0.2 | 28.4 | 1.8 |
| C: Trucks sell to Demand (start 20, sell-out +5, Emerging +5) | 24.4 | 3.2 | 24.8 | 1.0 |
| E: as C, sell-out +10 | 26.4 | 7.0 | 25.2 | 1.0 |
| **F: as E, Emerging +10 (chosen)** | 27.2 | 9.0 | 24.2 | 1.2 |
| I: as C, sell-out +15 | 27.2 | 8.6 | 25.4 | 1.0 |

- **Why not A or B.** A budget on top of the old caps only taxes volume: mass-market fell to 0%.
- **Why "Trucks sell to Demand".** Growing Demand then raises what one Truck can sell. That gives volume
  a persistent, compounding axis, the way R&D growth and Flagship give margin one.
- **Why F over E.** The two are within noise for the bots. F's Emerging +10 makes "ship it while Emerging,
  cash it while Hot" a visible plan. It also narrows the margin-versus-volume gap most:
  rnd-compounder 32.7 → 24.2, mass-market 5.2 → 9.0.
- **Items (variant E, 1000 seeds, aware Δ):**
  - Price Gun +11 → +19 (skimming conserves Demand).
  - Assembly Line −14 → −9.
  - Automation −12 → −6.
  - Robot Arm +33 → +24.
  - R&D Lab +30 → +25.
- **Where Demand binds.** Bot sell-outs run at about 0.2–0.6 a round for margin builds and 1.2–1.5 for
  mass-market. Mean Demand grows from 20 to about 45 (margin bots) or 77 (mass-market) by round 12.
  Bots spread Ships over Categories, so Demand mostly binds early and for volume. Players who
  concentrate on the Hot Category hit it whenever they ship it twice in a round.

### R&D Grant (graft c)

- **Rule:** a Contract (5C). Pick a Category and an option (`buy 5 <category> scale|premium`).
  - **Scale:** +10 Demand, and +3 Units added at each of that Category's Ship cards.
  - **Premium:** that Category's sales ×(1 + 0.25 per level). The bonus is additive per level
    (×1.25, ×1.5, …), not compounding, so it can't run away.
  - Both are permanent.
  - Sizes are in `config.grant`.
- **Why Scale adds Units.** With Demand alone (+10, +20 or +30), Scale was worth almost nothing to the
  bots, because Demand rarely binds after sell-out growth: all-Scale bots won 4–6 points less than
  all-Premium. +3 Units per Ship is a +25% sale on a 12-Unit Ship, which matches Premium there.
  - Scale wins on small, high-Margin Ships.
  - Premium wins on big ones.
  - So the choice depends on the build. It is not an auto-pick.
- **Option A/B** (500 seeds, F, win %):

| Grant choice | greedy | mass-market | rnd-compounder | trend-surfer |
|---|---|---|---|---|
| Scale +10 Demand only, all Scale | 17.2–19.8 | 2.8–4.8 | 21–22 | 0.6 |
| Premium ×0.25, all Premium | 23.4 | 9.4 | 26.2 | 1.8 |
| Scale +10 Demand +3 Units, all Scale | 25.2 | 8.4 | 33.6 | 2.0 |
| Scale +3 Units vs Premium, chosen by build (bots) | 24.2 | 9.6 | 28.6 | 2.2 |
| Scale +4 Units, all Scale (too strong) | 28.0 | 8.6 | 35.0 | 4.0 |

- **How the bots choose:**
  - They track Units sold per Category.
  - They grant their best seller.
  - They Scale when its Units per Ship are below `scaleUnits / premiumStep` (12), and take Premium otherwise.
  - Trend-surfer Scales next round's Emerging Category.

### Bots after the grafts

- **Trend-surfer's shopping was the reason it was weak, not trends.** It now buys:
  - Boutiques in the Categories turning Hot or Emerging, plus Influencers;
  - Flagship, Robot Arm, Floor Expansion, Quality Lab, Showroom and Overtime Crew;
  - R&D Grants that Scale next round's Emerging Category.
  It also values Emerging Ships at +15 for the Demand they grow.
- **Default Tooling Upgrade target:** a Boutique, then an Influencer, then a Design. Trucks can't be
  upgraded any more.

1000 seeds, all three grafts, on main's Restock/Opener and Line Shift rules (win %, mean round reached):

| Bot | Win | Reach |
|---|---|---|
| trend-surfer | 50.6% | 10.72 |
| rnd-compounder | 34.0% | 9.20 |
| greedy | 25.0% | 8.60 |
| mass-market | 11.3% | 8.93 |

- **The target re-fit and content expansion come next.**
- **Item impact now leans on what trend-surfer buys:**
  - Up: Quality Lab, Influencer and Boutique (+20–24%).
  - Down: volume Fixtures (Automation −25%, Assembly Line −26%), Warehouse −20% and Price Gun −7%.
  - The content pass has to give these a real niche.

