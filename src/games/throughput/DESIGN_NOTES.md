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


## Content wave 1 (completion plan)

Orchestrator-approved, including three new BoardBoss hooks: `demandMul`, `designMultipliers`,
`shiftsPerRound`. All modifier text is ≤ 20 words, which `content.test.ts` enforces.

| Kind | Added |
|---|---|
| Shop cards (4 → 12) | Prototype (+$3, 3C) · Rebrand (−$2 then ×2, 6C) · 3D Printer (+4 Units +$2, 3C) · Contract Manufacturer (+20 Units −$1, 5C) · Pop-Up Shop (5 at ×3, 4C) · Marketplace (up to Demand at ×1.25, 5C) · Subscription Box (12 at ×1.5, 4C) · Export Deal (all at ×0.75, ignores Demand, 6C) |
| Fixtures (11 → 24) | Commons: Design Studio, Packaging Line, Conveyor Belt, Signature Line, Cross-Dock · Uncommons: Logistics Hub, Luxury Counter, Express Lane, Lean Cell (Station), Megafactory (Station) · Rares: Patent Office, Superstore, Robotics Cell |
| Contracts (4 → 8) | Clone (copy a deck card with upgrades and growth, 5C) · Ad Campaign (+1 Hot pip a round, 5C) · Training Program (+1 Retool a round, 4C) · Treasury Bond (+2C interest cap, 4C). Floor Expansion has shop weight 2. |
| Bosses (4 → 8) | Bottleneck (slot 3 welded) · Recession (Demand ×0.5) · Ethics Review (Design ×s off) · Short Week (3 Shifts) |

**Design intent**

- **Every archetype gets a multiplicative path.**
  - Volume:
    - Logistics Hub turns Units into Margin (+$1 per 10).
    - Superstore gives ×(1 + Units/50) on a Ship.
    - Megafactory and Robotics Cell feed both of them.
  - Skimmer: Luxury Counter ×2 on Ships capped at 8 or less (Pop-Up ×3 · Luxury ×2 · Hot ×2 = ×12).
  - R&D: Patent Office ×(1 + 0.1 per growth). It competes with the R&D Lab for the grown Design, so you choose between growing it and cashing it.
  - Hot / trend: Ad Campaign pips and Pop-Up/Boutique.
- **Positional pieces read the 2 cards before:** Design Studio, Conveyor Belt, Signature Line, Cross-Dock.
- **Bosses pressure one archetype each, with a generic counterplay:**
  - Ethics Review: the Influencer tower. Counter with additive Designs or volume.
  - Recession: volume. Counter with Wholesale or Export.
  - Short Week: slow setups. Counter with burst Shifts.
  - Bottleneck: chains and Gun→Ship runs. Counter by re-laying the Line in the shop.
- **Treasury Bond gives holding cash a reason** (playtest N4).

**Tuning during the wave**

- **Sell-out growth now scales:** +50% of Demand, at least +10 (`demand.sellOutRate`). Volume's
  linear +10 couldn't keep up with ×-scaled Margin.

  | Sell-out growth | mass-market win (500 seeds) |
  |---|---|
  | linear +10 | 3.6% |
  | +25% | 3.6% |
  | +50% | 6.2% |

  The other bots are unchanged.
- **Contract Manufacturer:** −$3 → −$1. It drove the Batch Margin negative.
- **Megafactory:** Margin ×0.5 → −$2.
- **Logistics Hub:** ×1.5 at 30+ Units → +$1 per 10 Units.
- **Superstore:** ÷100 → ÷50.

**1000 seeds, before the target re-fit** (default curve):

| Bot | Win % |
|---|---|
| trend-surfer | 21.8 |
| rnd-compounder | 19.4 |
| greedy | 7.3 |
| mass-market | 6.0 |

Content dilution (Flagship, Robot Arm and Influencer are rarer) and the harder Board pool lower every bot.

**By build:**

| Build | Win % |
|---|---|
| design-stack | 26.4 |
| mass-market | 15.5 |
| skimmer | 14.8 |
| rnd-compounder | 13.2 |
| mixed | 0.6 |
| stockpile | 1.1 |

**Board clear rates** (300 seeds × 4 bots):

| Boss | Clears |
|---|---|
| Supply Shock | 56% |
| Bottleneck | 57% |
| Short Week | 70% |
| Recession | 73% |
| Line Shift | 80% |
| Ethics Review | 82% |
| Turnover | 82% |
| JIT Auditor | 87% |

**Pick rates** are 10.6% (Lean Cell) to 66.5% (Flagship): no auto-pick over 80%, nothing under 10%.

**Aware Δ:**
- Leaders: Flagship +34%, Quality Lab +20%, Robot Arm +17%.
- Still negative: Megafactory −16%, Warehouse −15%, Assembly Line −14%, Lean Cell −13%. These are follow-up tuning targets.

## Target re-fit (after the grafts and wave 1)

- **New default:** 130, 200, 270 | 360, 470, 600 | 760, 950, 1200 | 1550, 2000, 2600.
  - Up to round 8 it is gentler than before, because bots died at the Boards in rounds 6 and 9.
  - From round 9 it climbs ×1.26–1.30 a round (the old curve was ×1.15–1.17), so strong players are
    pressed late.
- **Upper bound is seed-03.** Its late curve is 3600 / 5000 / 7000 / 10000. LLM testers reached it (Sonnet won
  2 of 4), but bots can't (0%). Even this tail drops the best bot to the bottom of the 30–60% band.

Curves tried (500 seeds, except the chosen one; win %):

| Curve (r1…r12) | greedy | mass-market | rnd-compounder | trend-surfer |
|---|---|---|---|---|
| old default (…1500, 1750, 2050, 2350), 1000 seeds | 7.3 | 6.0 | 19.4 | 21.8 |
| 130…950, 1150, 1450, 1800, 2200 | 17.0 | 16.4 | 45.4 | 36.6 |
| 130…950, 1200, 1600, 2150, 2900 | 10.2 | 8.0 | 31.2 | 21.4 |
| 130…950, 1250, 1750, 2400, 3300 | 7.6 | 6.0 | 24.4 | 15.6 |
| **130…950, 1200, 1550, 2000, 2600 (chosen), 1000 seeds** | **13.6** | **11.1** | **36.7** | **30.1** |

- **By build** (1000 seeds):

  | Build | Win % |
  |---|---|
  | design-stack | 39.3 |
  | rnd-compounder | 24.3 |
  | skimmer | 22.7 |
  | mass-market | 21.4 |

  That is four families within 2× of each other.
- **Tempo versus slow burn.** mass-market and trend-surfer clear round 3 at 96–98%, against 93–95% for
  greedy and rnd-compounder. rnd-compounder overtakes from Year 2 (r6 84%, r9 69%).
- **Boards** (300 seeds × 4 bots):

  | Boss | Clears |
  |---|---|
  | JIT Auditor | 92% |
  | Turnover | 89% |
  | Line Shift | 87% |
  | Recession | 87% |
  | Ethics Review | 85% |
  | Short Week | 85% |
  | Bottleneck | 72% |
  | Supply Shock | 72% |

  The two weld bosses are telegraphed and can be countered by moving Fixtures or with a Floor Expansion,
  but they cost a fifth of the Line.

## Item rescue pass (volume family)

- **Finding: Margin, not Demand, is the volume build's bottleneck.**
  - In mass-market Shifts, 66% end with no leftover Units at all. The rest average about 12.
  - A volume Batch ends a Shift at only $1–3 Margin, so a sale-side outlet for leftovers adds almost nothing.
  - What lifts volume is Margin that scales with Units.
- **Factory Outlet (tried, cut).** It was a Station: leftover Units sell at half the final Margin.
  - At $1–3 Margin, half Margin is about the $1 clearance every leftover already gets.
  - As a Station it also costs a card slot and breaks a handoff.
  - It also duplicated Wholesale Club ("all Units at half Margin").
  - Result: impact −21%, and 4% win when picked against 25% when skipped.
  - Variants that also lost to having no Outlet: a flat $2 or $3 per leftover, and a Mod version.
- **Kept (Margin side):**
  - Megafactory: −$1 Margin (was −$2), 5C.
  - Cross-Dock: +$2 per Make (was +$1).
  - Assembly Line and Automation: 5C. Packaging Line: 3C. Lean Cell: 4C.
  - Flagship: +0.15 a round (was +0.2). That cost under 1 point.
- **Units → Margin path at common/uncommon:**
  - Logistics Hub: common 4C (was uncommon 6C).
  - Superstore: uncommon 6C (was rare 8C).
  - Volume now has a multiplicative engine without needing rares.
- **Express Lane stays uncommon 6C.** At common 4C (500 seeds), greedy fell 14.6 → 8.6 and trend-surfer
  27.0 → 22.0.
- **Bots.**
  - mass-market keeps its original wants. Chasing Outlet, Express Lane and Export Deal cost it 6 points.
  - rnd-compounder and trend-surfer now take a Lean Cell. trend-surfer also takes a Packaging Line.

Steps, on the same 500 seeds (win %):

| Step | greedy | mass-market | rnd-compounder | trend-surfer |
|---|---|---|---|---|
| Before the pass (5b35212) | 12.8 | 12.0 | 36.6 | 27.0 |
| Pass with Factory Outlet (as specified) | 10.0 | 11.2 | 30.8 | 28.6 |
| Outlet cut, original mass-market wants | 14.6 | 17.0 | 35.4 | 27.0 |
| + Express Lane common 4C (rejected) | 8.6 | 19.0 | 32.6 | 22.0 |
| + Superstore uncommon 6C only | 15.2 | 16.4 | 31.6 | 29.8 |
| + Logistics Hub common 4C only | 10.6 | 24.8 | 33.8 | 28.2 |
| **+ both (chosen)** | **13.2** | **26.4** | **32.8** | **32.2** |

- **Result** (1000 seeds): greedy 13.8, mass-market 27.2, rnd-compounder 31.4, trend-surfer 31.8.
  - By build: design-stack 36.0, mass-market 29.8, rnd-compounder 24.1, skimmer 21.4.
  - The top build is 1.2× the next, with no runaway.
- **Items below −10% (aware Δ):**
  - Before: 9 (Warehouse, Automation, Assembly Line, Cross-Dock, Export Deal, Conveyor Belt, Marketplace,
    Superstore, Wholesale Club).
  - Now: 4 — Warehouse −25 (pick 9.5%), Express Lane −15, Automation −13, Luxury Counter −10.
  - Every pick rate except Warehouse's is within 10–80%.
- **Still weak.** The "stays on the Line" pair (Automation, Express Lane) holds a slot for good.
  - The Warehouse stockpile build wins 4%.
  - These need a design change, not a price.
- **Spike to watch.** Two Megafactories (Units ×9), then stacked Logistics Hubs, then an Export Deal.
  - Margin grows with Units, so the payout grows with Units².
  - The best bot Shift was $84,199 in round 12, 32× its target.
  - It doesn't raise win rate (mass-market wins less often than design-stack); playtests should judge the feel.

## Item redesigns: Automation, Express Lane, Warehouse

The orchestrator handed item-level redesigns to asst-b. The bar: one effect plus an optional condition, at
most 20 words, and each one simmed.

- **Why the old versions failed.**
  - Automation and Express Lane: "Stays on the Line" was worth about nothing, and often less.
    - The hand refills each Shift anyway, so keeping a card saves no draw.
    - It locks the slot to one card for the round.
  - Warehouse: leftovers are rare. A Warehouse stored about 2 Units a Shift, and paid a fee for the privilege.
- **Automation** (uncommon 5C): "A Make card here stays on the Line and gains +3 Units for good each Shift."
  - It is R&D Lab for Makes. Growth lives in `Card.growth`, which now means +1 Unit per point on a Make
    (+$1 on a Design). Clone copies it.
  - It gives volume a slow-burn compounding piece.
  - Impact went from −13% to about +5%.
- **Express Lane** (uncommon 6C): "A Ship card here sells at Margin ×3 in the first Shift of each round."
  - An opening-rush tempo piece. It pays off with unused-Shift and overkill pay.
  - Rejected variants:
    - "Stays and ignores Demand" made mass-market worse (30.8 → 26.6). Demand rarely binds.
    - ×2 was too small: trend-surfer did better without it.
  - At ×3, trend-surfer rises 34.0 → 36.4, and impact goes from −15% to about −1%.
  - `FixtureEffect.saleMultiplier` gains an optional `batch`, so a sale can see the Shift number.
- **Warehouse** (uncommon 5C, now a Mod): "A Make card here also copies its Units into stock. Board Reviews:
  the stock sells here at Margin ×2."
  - This is the stockpile payoff. Stock builds all Year, then sells at the Board, ignoring Demand, at the
    Batch's Margin where the Warehouse sits.
  - So placing it is a choice: later in the Line means a higher Margin.
  - Gone: leftover storage, the storage fee, and `warehouseCap`. JIT Auditor still closes it, and the stock
    waits for the next Board.
  - Rejected variants:
    - Diverting the Make's Units into stock: 31% of the Board target, but it cost more than it paid.
    - Copying at ×1: −1% impact.
  - Chosen: copy at ×2. The stock sale averages 47% of the Board target for mass-market, with impact about 0%
    (was −25%) and pick 21%.
  - `ShiftResult.storedUnits` is now `stockedUnits` (Units copied into stock this Shift). Leftovers always clear.

Steps, on the same 500 seeds (win %):

| Variant | greedy | mass-market | rnd-compounder | trend-surfer |
|---|---|---|---|---|
| Before (e218f66) | 13.2 | 26.4 | 32.8 | 32.2 |
| Automation grows; Express Lane stays and ignores Demand; Warehouse stores leftovers for the Board | 18.4 | 30.8 | 32.8 | 32.2 |
| … mass-market wants that Express Lane | 18.4 | 26.6 | 32.8 | 32.2 |
| Express Lane ×2 in Shift 1; Warehouse diverts its Make (mass-market uses it) | 18.6 | 28.4 | 32.8 | 33.2 |
| **Express Lane ×3; Warehouse copies at ×2 (chosen)** | **22.4** | **30.0** | **32.8** | **36.4** |

- **Result** (1000 seeds, win %): greedy 22.8, mass-market 30.1, rnd-compounder 31.4, trend-surfer 36.9.

  | Build | Win % |
  |---|---|
  | design-stack | 36.3 |
  | mass-market | 34.0 |
  | stockpile | 30.3 (was 3.8) |
  | rnd-compounder | 30.1 |
  | skimmer | 25.5 |

  - That is five viable builds within 1.5× of each other.
  - New impact: Express Lane +4%, Automation +3%, Warehouse +1%.
  - No item is below −10% any more. The lowest are Patent Office, Luxury Counter and Assembly Line at −7%.
  - Every pick rate is within 10–80%.
- **Greedy rose from 13.8 to 22.8.** Buying the priciest thing now rarely buys a trap. The best bot is still
  inside the 30–60% band, so the targets stand.

## Playtest-2 balance pass (harder for skilled play)

Playtest round 2 (8 LLM runs on 65c5785, before the re-fit and rescue): 7 of 8 won. Sonnet averaged 1.77× the target
in R7–R12 and cleared 79% of rounds in Shift 1; Haiku averaged 1.40×. The bots badly under-rate skilled play: their
Shift-1 output is about a fifth of Sonnet's. So this pass is calibrated to the LLM data. The bots are kept only for
item health and relative strength.

Numbers below are 500 seeds unless marked (win % for greedy / mass-market / rnd-compounder / trend-surfer).

1. **Tempo premium** (rec 2). A Shift-1 clear paid 11–17C.
   - Change: unused-Shift pay is now by Year, `unusedShiftBonus: [2, 2, 1]` (the last entry holds). Board Reviews
     pay none. Overkill cap 5 → 3.
   - Win rates 22.4 / 30.0 / 32.8 / 36.4 → 16.8 / 23.8 / 25.8 / 24.4.
   - mass-market's late Capital halves (R12 54C → 26C). Years 1–2 are unchanged except on Boards.
   - Rejected: +1C everywhere. It cut every bot 10–16 points, the weak ones included.
2. **Runaways** (rec 3).
   - The bots already pair Megafactory with Logistics Hub. The R12 32× Shift came from that.
   - Measured with a runaway probe (biggest R10–12 Shift ÷ target, per build).
   - **Logistics Hub at most +$5:** mass-market max 32× → 6.3×, p90 1.71 → 1.56. A +$10 cap still allowed 8.8×.
   - **Sell-out growth 50% → 25%** (the +10 floor stays). Bots barely notice, since Demand rarely binds for them. It
     targets skilled volume that grew Demand past Recession.
   - **Rebrand ×1.5 once a Rebrand already ran this Shift** (`DesignDef.repeatMul`; Robot Arm's second resolve
     counts): design-stack p90 1.31 → 1.18, max 2.4 → 1.8.
   - Design Studio "+$4 only after a non-× Design" had no measurable effect, so it was not applied.
3. **Late Capital** (rec 6). Done through the tempo cut plus a living Treasury Bond, not Year-scaled prices.
   - Treasury Bond (4C): "+1C every round you clear, for the rest of the run". It was an interest-cap raise nobody
     could reach. `Perks.interestCap` became `coupon`.
   - Bond impact is now +4% (pick 27%).
   - End-of-run Capital is 5–26C (R12 mean, by bot).
   - Revisit Year-scaled prices only if round 3 shows Capital piling up again.
4. **Target re-fit from R7** (rec 1). R1–R6 are unchanged (130 / 200 / 270 / 360 / 470 / 600). R7–R12 are now
   950 / 1400 / 2050 / 3000 / 4300 / 5800 (were 760 / 950 / 1200 / 1550 / 2000 / 2600).
   - **Calibration.** Sonnet's median Shift-1 sales at 65c5785 were about 1,100 at R7, 1,700 at R8, 4,000 at R10 and
     4,300 at R11. The R9 and R12 Boards ran lower, and half of those needed Shift 2.
     - For "clears R10–R12 at 1.1–1.3×, needing Shift 2+ at least half the time", a target has to sit near Sonnet's
       Shift-1 output.
     - Curve A was 900 / 1300 / 1850 / 2700 / 3800 / 5000.
     - Then items 5–7 made play stronger: the bots' late Shift-1 output is now 1.17–1.34× 65c5785's on the same
       curve. The Hub cap and the Rebrand repeat damp exactly Sonnet's engines, so R7+ was scaled by about half that
       (×1.1–1.15).
   - **Haiku.** Its Shift-1 sales were 1,060–1,290 at R7–R8, so it should still reach the Year-3 Board.
   - **Bots** (1000 seeds): 5.1 / 4.8 / 9.1 / 2.5, with a median reach of round 9.
     - By build: rnd-compounder 7.9, design-stack 6.5, skimmer 5.0, mass-market 4.7, stockpile 3.7.
   - Round 3 playtests are the real check.
5. **Shop unchoke** (rec 8). Approved rule: buying a Fixture into an occupied slot sells the old one for half its
   price as part of the buy, and the refund counts toward the price (`fixtureRefund(slot)`).
   - Every Fixture offer is now buyable as a replacement.
   - So "weight Fixture offers by fill ratio" was not done. It would cut replacement choice, and it would break the
     fixed 2 / 2 / 1 offer layout the views rely on.
6. **Dead items, auto-picks, rare supply** (rec 9; the testers played the pre-rescue build):
   - **Rare supply:** Fixture odds 70 / 25 / 5 → 60 / 30 / 10. Each rare goes from 1.25% to 2.5% of Fixture offers;
     Flagship had 0 offers in 8 runs.
   - **Auto-picks:** Contract Manufacturer 5 → 6C (8 of 8 runs) and Clone 5 → 6C (75% buy rate).
   - **Price Gun and Lean Cell** are now Mods (as Stations they cost a card slot).
     - Price Gun plus Wholesale or Export (which ignore cap cuts) is now a real combo.
   - **Marketplace** ×1.25 → ×1.5. **Export Deal** 6 → 5C.
   - **Result** (1000 seeds): every item's aware Δ is within −6% … +10%, and every pick rate is within 10–80%.
7. **Starter deck and retools** (rec 10).
   - One Truck per Category (16 cards, was 20). On the same seeds, bots with one Truck beat two clearly: 7.8 / 8.8 /
     14.4 / 4.4 vs 4.6 / 3.8 / 9.0 / 2.6.
   - Training Program is once per run: the shop stops offering it once bought.

## Card-text budget (asst-c's fixed card template)

The template has fixed zones. A shop card holds about 75 characters in 3 rules lines, and a hand card about 40 in 2.
Past that, it steps the type down and then clamps, with the full text in a tooltip. Rules are unchanged; only words
moved. Every text still passes the 20-word test.

- **Titles:** Contract Manufacturer → **Outsourcer** (the title line holds about 16 characters). Subscription Box →
  **Subscriptions**, and Training Program → **Training**. Before, both fit only stepped down. Ids are unchanged, so
  saves and sims are unaffected.
- **Shop texts, from 79–116 characters to 63–73:**
  - Warehouse: "A Make here also stocks its Units, sold here on Boards at Margin ×2."
  - Tooling Upgrade: "Upgrade a deck card: Design +$1, Make +3 Units, or capped Ship +5 cap."
  - R&D Grant: "Category: Scale +10 Demand, +3 Units at its Ships; or Premium +25% price." The long form stays in the rules
    text.
  - Flagship Store: "… +0.15 per round since bought."
  - Patent Office: "… Margin ×(1 + 0.1 per $1 of its R&D growth)."
  - Price Gun: "Later Ship caps halve (a Truck: half the Demand left)."
- **Hand texts, now 32–40 characters:**
  - Wholesale Club: "Ship all Units at half Margin, no Demand".
  - Export Deal: "Ship all Units, Margin ×0.75, no Demand".
  - Marketplace: "Ship up to Demand at Margin ×1.5".
  - Rebrand: "-$2 Margin, ×2 (a 2nd Rebrand: ×1.5)".
  - "Ships all Units" already says that cap cuts can't bite, so "(ignores … cap cuts)" went.
- **Left long, since they weren't flagged:** Superstore (100 characters), Cross-Dock (77) and Showroom (78).

## Boss Years (with Quota Cap) and dead refills

**Recession and Ethics Review now come from Year 3** (`earliestYear = 3`). They test volume and Design-× engines, which
don't exist in Years 1–2.

Board clears on 242fb77's 9-boss pool, before and after the change. Each cell is clear %, from 1000 seeds × 4 bots.

| Year | All bosses from Year 1 | Recession and Ethics from Year 3 |
|---|---|---|
| 1 | 99% | 99% |
| 2 | 94% | 94% |
| 3 | 57% | 57% |
| 4 | 37% | 39% |

- **Difficulty:** unchanged, and win % moves within noise (6.4 / 7.5 / 9.5 / 1.9). Both bosses sit near the Year-3
  average: Recession clears 59%, Ethics Review 56%.
- **Year-3 spread:** Bottleneck 32% and Supply Shock 34% are the hard Boards. Quota Cap 78% and Turnover 79% are the
  soft ones.
- **The draw concentrates.** `assignBosses` gives each Year the first unmet boss that may come. So a late boss skipped
  in Years 1–2 is still at the front at Year 3. Recession or Ethics Review is the Year-3 Board 60% of the time (about
  30% each, against about 5% for each other boss).

**Dead refills on the 16-card starter.** This counts Shift 2+ hands with no Ship while the draw pile still holds one,
over 500 seeds per bot.

| Starter | Per Shift 2+ | Runs that see one |
|---|---|---|
| 16 cards | 3.1–6.2% | 27–54% |
| 20 cards | 0.2–0.6% | 3–6% |

- A deal model of the orchestrator's case, Round 1 Shift 2 after a 5-card Shift 1, on the 16-card starter:
  - 2.8% when the player kept a spare Ship;
  - 9.8% when they played every Ship.
- That is under the ~15% per-Shift bar, but about one run in three meets it.

## Endless (draft)

Winning the Year-4 Board ends the run as a win, as before. The win screen can now offer **Keep going**.

**Rules** (in the rules layer; the CLI verb and the UI are asst-a's):
- `keepGoing()` works only when the run is won (`whyCannotKeepGoing`). It opens the shop before round 13. The run
  keeps everything: deck, Line, Capital, Demand, grants and perks. `wonAtRound` stays 12.
- **Targets** past the table grow ×`endlessGrowth` (1.3) a round, rounded to 10: 7540 / 9800 / 12740 (Board) /
  16570 / 21530 / 28000 (Board). That is about 2.2× a Year, a little gentler than R9 → R12 (2.8×). Every engine
  item is additive or slowly compounding, so the exponential wins in the end. Endless is a "how far" test with a
  wall, not a second run.
- **Years and Boards:** every 3rd round is still a Board. `bossOf` continues the same seeded `assignBosses` draw.
  It is prefix-stable, so Years 1–4 match `boardBosses`, and the pool starts over once every boss has come.
- **Market:** the trend schedule extends 3 rounds ahead of play. Each round forks its own stream, so rounds already
  scheduled never change, and seeds and saves replay the same.
- **Economy:** unchanged. Unused-Shift pay holds at the last Year's entry (1C), and Boards pay none.
- **Losing** a round ends the run as usual. The record is "won at 12, reached round N".
- **API:** `endless`, `wonAtRound`, `lastPlannedRound` (∞ in endless), `targetFor(round)`, `canKeepGoing`,
  `whyCannotKeepGoing`, `keepGoing()`. Views that gate on `round <= run.rounds` should use `lastPlannedRound`.

**Bot reach** after a win (1000 seeds per bot). Most bot wins finish R12 at 1.12–1.18× the target:

| Bot | Wins | Median rounds cleared | p90 | Max |
|---|---|---|---|---|
| greedy | 58 | 13 | 14 | 18 |
| mass-market | 75 | 14 | 17 | 20 |
| rnd-compounder | 94 | 13 | 14 | 17 |
| trend-surfer | 21 | 13 | 14 | 16 |

- The usual wall is the Year-5 Board (round 15).
- Skilled play ran 1.4–1.8× the target in R7–R12 (playtest 2), so it should last about a Year longer.
- Revisit `endlessGrowth` after LLM playtest round 3.

**Not included:** endless-only modifiers, a score multiplier, a leaderboard. None of them were requested.
