# Bill of Materials — implementation notes

Source design: `docs/ai_docs/delphi/v3/seed-01.md` (local planning doc). This file records where the
doc was ambiguous and what the code does, plus deliberate deviations. Keep it current.

## Architecture

- BoM is a game-specific state machine (`rules/BomRun`), not the engine's `Run`. Fabricate vs Ship,
  the product choice on Ship, a Bench that persists between rounds, Overtime after the target, and a
  three-part shop don't fit `Run.play(cards)` without invasive changes.
- Reused from the engine: `Rng` forks (`deck`, `shop`, `disruptions`), `Deck<Part>`, `Wallet`,
  `computeInterest`, `Payout`, and `ScoreContext` with a BoM `ScoreFormula`
  (`floor(min(Units, Demand) × Price × Markup)`), so every Ship's contribution log doubles as its receipt.
  `Registry` is not used: its `price` field would collide with a Product's Price stat.
- Facilities and Disruptions share the `BomRule` hook surface (`adjust`, `onShipAdd`, `shipMultiplier`,
  `onFabricate`, `onRoundStart`). They are abstract classes per project convention, rather than the doc's
  plain objects with optional functions.
- The CLI plugs in through `ReplayTextGame` (`text/`), and the sim through `Scenario` + `RunRecorder`.

## Rules decisions

### Round
- **Overtime.** Once revenue reaches the target, Ship locks and the phase becomes Overtime (if any
  Builds remain). Overtime allows Fabricate and Scrap. `collect` ends it and pays $1 per unused Build.
  If the last Build is spent fabricating, the round clears automatically.
- **Payout** on a clear is the market reward (doc: Small $3 / Big $4 / Boss $5; tuned to $5/$6/$8, see
  Tuning), plus $1 per unused Build, plus interest. Interest ($1 per $5, max $5) is computed on the
  cash held *before* this payout.
- **Losing.** The run is lost when Builds reach 0 below target, including when the last Build was a
  Fabricate. It is also lost when no owned recipe (Product or Sub) can be formed from hand + Bench and
  no Scraps remain ("stuck").
- **Selections.** 1–5 parts, each at most once. Ship and Fabricate may use hand and Bench parts. Scrap
  takes hand parts only. Hand parts used in a Build go to the discard pile (back next round). Bench parts
  are used up.

### Ship scoring
- **Step 1, base.** Demand is the base (blueprint + Scale levels + sell-out growth) halved per earlier
  Ship this round: `floor(D / 2^k)`.
- **Steps 2–3, parts and additive rules.** Additive Demand effects (Market Research +15) apply after
  that halving, because they belong to the doc's step 3.
- **Price floor.** Price has a floor of $1, applied after all additive effects (Outlet Mall) and before
  multipliers.
- **Markup** is the product of all multipliers. Multipliers of exactly 1 are not logged.
- **Float error.** Revenue uses `floor(x + 1e-9)` to absorb error from factors such as 1.1 × 1.6.
- **Sell-out** compares final Units against final Demand on that Product's first Ship of the round.
  Growth is added to base Demand permanently (+5, or +15 with Viral Marketing).
- **Premium tags.** These do **not** carry through Fabricate: fabricated parts are never Premium.

### Fabricate and the Bench
- **Inputs** must be exactly an owned Sub's recipe (multiset).
- **Grade** = `2 × sum of input grades + 3 × Sub R&D levels + bonuses` (Precision Tooling +4).
- **Bench inputs** free their slot before capacity is checked.
- **Full Bench.** If the Bench is still full, the Build must name a Bench part (not an input) to trash.
  Trashing is refused when there is room.
- **Kitting Station** copies are `floor(final grade / 2)` and are benched only if there is room. They
  never force a trash.
- **Selling Stockroom** is refused if the Bench would then be over capacity.

### R&D
- **Scale** adds `ceil(base/2)` Units and Demand per level.
- **Premium** adds `ceil(base/3)` Price per level, always from the blueprint's original base, so levels
  are linear. The doc's "second Premium level ($8)" on Desk Fan confirms this.
- **Subs** get +3 output grade per level.
- **Patent Office** counts all R&D levels across owned blueprints.

### Disruptions
- **Draw.** At run start the 4 disruptions are shuffled without replacement, so each run sees all 4 in
  random quarter order.
- **Reveal.** Each is revealed when its quarter's first shop opens (after the Small round) and is active
  only in that quarter's Boss round.
- **Strike** is −1 Build (3 normally; composes with Outlet Mall to 4), not "set to 3".
- **Recall.** "Most-shipped" means the highest Ship count this run, evaluated live before each Ship.
  Ties all get ×0.5.
- **Warehouse Fire** empties the Bench as the Boss round starts.
- **Price War** is tuned from the doc's −$3 Price to ×0.75 (applied as Markup; see Tuning).

### Shop
- **Rack slots.** Each Rack slot rolls a kind (Facility 55 / Blueprint 30 / R&D 15), then for
  Facility/Blueprint a rarity (C 70 / U 25 / R 5), then a uniform item of that rarity.
  - Kinds or rarities with no eligible item are dropped from the roll.
  - Owned Facilities and Blueprints never roll, and nothing repeats within one visit.
  - Several slots may each offer an R&D Grant.
- **Boss guarantee.** After a Boss clear, Rack slot 1 is a Facility or Blueprint of Uncommon or Rare.
  It applies to that visit's first stock only, not to rerolls.
- **Reroll** refreshes the Rack and the Parts Counter (not Shred). It costs $3, +$1 each time, and the
  cost resets each visit.
- **Parts Counter** picks a category uniformly from Shell/Chip/Bolt/Paint.
- **R&D Grant** purchases name the target: `buy N <blueprint> [scale|premium]`.
- **Selling** happens only in the shop: Facilities and Blueprints for `floor(cost / 2)`.
  - Starting blueprints sell for $0, which frees a slot.
  - Your last Product can't be sold.
  - Selling a blueprint loses its R&D and growth.
- **Shred** targets a deck part by category and grade (non-Premium preferred). The deck can't drop
  below the hand size (8).

## CLI
- **Selections.** Hand positions are `1..8` in the displayed order: sorted by category (Shell, Chip, Bolt,
  Paint, then fabricated parts), grade high to low, Premium first. They stay predictable after draws.
  Bench parts are `b1, b2, …`.
- **Ship without a product.** `ship` without a product ships the only fitting Product. If several fit,
  it is refused with each option's projected revenue (the "product buttons").
- **Preview.** `preview <parts>` shows the same options without spending a Build and is not recorded
  in the save.
- **Logs.** Each Ship prints a receipt: base, each part, each rule, then the formula line. Sell-outs,
  Overtime entry, draws and round results are also logged.
- **`continue`.** In Overtime, `continue` means `collect` and is recorded as `collect`.

## Sim (Phase B)
- **Bots.** `sim/StrategyBot` is one heuristic player driven by a `Strategy` preset. The four presets
  in `sim/bots.ts` are `greedy` (baseline: buys anything affordable), `bargain-bin` (tempo),
  `assembly-chain` (slow-burn) and `market-maker` (slow-burn).
- **Round play.**
  - **Plans.** The bot plans a Ship for every owned Product (`planner.planProduct`). A plan may
    Fabricate missing Sub parts first; those parts are projected with `BomRun.projectShip`.
  - **Choosing.** Overshooting the target earns nothing, so the bot takes the cheapest plan that
    clears it: fewest Builds, then least Bench WIP spent. Otherwise it takes the best revenue per
    Build. It Scraps when even that pace falls short.
  - **Ship parts.** Recipe slots take the highest grades. Filler is greedy and hand-only.
- **Overtime.** The bot stocks the Bench toward its Products' recipes, in Strategy order, never
  trashing. It skips stocking in the Big round before a revealed Warehouse Fire, and there it spends
  WIP first when clearing.
- **Shop.** The bot buys the best-ranked wanted Rack item. When slots are full it sells an idle Sub,
  else the lowest-value unwanted Product or Facility, to make room. Then it buys R&D, then Parts
  Counter, then Shreds, then rerolls.
- **Archetype labels** come from owned key Facilities (≥2 of a set), not from the bot. Runs with fewer
  are labelled "unbuilt".
- **Scenario.** `npm run sim -- --scenario bom` (registered in `src/sim/cli/all-scenarios.ts`).

## Tuning
Goals (stratgame-24):
- tempo comfortably clears Q1–Q2 and stalls in Q3–Q4; slow-burn is shaky early and pulls ahead late;
- targets grow at least 20× from Q1 Small to the Q4 Boss;
- the best tempo and best slow-burn bots are within ~10pp win rate;
- tempo leads on margin in rounds 1–5 and slow-burn in rounds 8–12;
- the best bot wins 30–60%.

Every step was measured over 1000 seeds.

### First pass (Phase B)
- **Doc targets are out of reach.** With `DOC_TARGETS`, no bot wins and most die in Q2. Income is about
  $5 per round against $4–$8 items, so engines grow roughly linearly; the doc's targets grow ×42.
- **Flat targets.** A ×10 table (120 → 1,200) gave bargain-bin 47%. The tempo and slow-burn curves
  never crossed, and a curve that flat gives no reason to build a snowball.

### Phase B2: one lever at a time
Steps 0–2b are measured on the flat Phase B table (Q1 120/180/240 … Q4 900/1050/1200).

Win % (mean round reached, of 12):

| Step | greedy | bargain-bin | assembly-chain | market-maker |
|---|---|---|---|---|
| 0. Bot fixes (planner, Overtime stocking, WIP, make-room selling) | 32.5 (10.3) | 63.9 (11.5) | 0.0 (6.0) | 0.5 (7.3) |
| 1. Price War ×0.75 Price (was −$3, min $1) | 34.1 (10.7) | 63.8 (11.6) | 0.0 (6.4) | 0.8 (8.0) |
| 3a. Precision Tooling: also ×(1 + 0.01 per fabricated grade) | 36.9 (10.8) | 63.8 (11.6) | 0.4 (6.7) | 0.8 (8.0) |
| 3b. Viral Marketing: also +Units = Demand grown, ×(1 + 0.01 per Demand grown) | 40.9 (10.9) | 63.8 (11.6) | 0.4 (6.7) | 6.6 (8.3) |
| 2. Drone and E-Bike Rare → Uncommon (still $8) | 38.3 (10.8) | 70.6 (11.7) | 1.1 (6.5) | 6.7 (8.2) |
| 2b. Precision Tooling and Viral Marketing Uncommon → Common | 45.5 (10.8) | 59.3 (11.5) | 2.4 (6.8) | 13.3 (8.5) |
| 3c. Lever 3 multipliers 0.01 → 0.02 | 47.9 (10.9) | 59.3 (11.5) | 3.3 (7.2) | 17.6 (8.6) |

- **After step 3c, the curves cross on the flat table.** Mean margin in rounds 10, 11 and 12:
  - assembly-chain +43%, +34%, +12%;
  - market-maker +30%, +33%, +27%;
  - bargain-bin +14%, +12%, +5%.
- **Kitted ceilings.** Each archetype starts owning its key Facilities and Blueprints (500 seeds,
  measured after step 3b):
  - assembly-chain wins 77.8% (24.8% before lever 3);
  - market-maker wins 82.2% (1.0% before);
  - bargain-bin wins 97.4%.

  Lever 3 gave each slow-burn archetype a real late game. The remaining problem was getting the
  pieces together, which is what levers 2 and 2b address.
- **Why lever 3b adds Units.** With only the multiplier, Market Maker's Units fell behind the Demand
  its sell-outs grow. The sell-outs then stopped, and so did the multiplier (kitted: 9.4% → 82.2% with
  the Units).

### Re-steepened targets, economy, and lever 4
- **Re-steepening alone fails.** Tables growing 20× or more (Q4 Boss 2,000–2,600) at the doc's $3/$4/$5
  rewards left the best bot at 4–17%. Committed archetype bots rarely assemble on about $5 a round.
- **Rewards $3/$4/$5 → $5/$6/$8.**
  - This helps every bot, but the high-ceiling slow-burn engines gain the most where it matters: they
    survive to their payoff.
  - With the same 20× table: assembly-chain 2.8% → 13.5%, bargain-bin 8.7% → 38.3%.
- **Gentler Q3.** Assembly-chain's deaths moved from Q3 (round 8 Big, round 9 Boss) to Q4. Bargain-bin
  mostly dies at the Q4 Boss, as intended.
- **Lever 4: Q2 Boss 340 → 320.** assembly-chain 15.9% → 17.4%; bargain-bin unchanged.
- **The Q4 Boss sets the trade-off.** At 2,200 the gap is 8.9pp, but the best bot wins only 26.3%. At
  2,100 the best bot wins 34.4%, but the gap is 15.7pp. The table uses 2,150.

### Current tuning (default config)
- **Targets.** `TUNED_TARGETS` grow 21.5× (100 → 2,150):

  | Quarter | Small | Big | Boss |
  | ------- | ----: | --: | ---: |
  | Q1      | 100   | 140 | 180  |
  | Q2      | 220   | 280 | 320  |
  | Q3      | 360   | 480 | 620  |
  | Q4      | 1000  | 1450| 2150 |

- **Rewards** are $5/$6/$8.
- **Price War** is ×0.75.
- **Precision Tooling** is Common, and Ships get ×(1 + 0.02 per fabricated grade).
- **Viral Marketing** is Common. Ships get +Units equal to Demand grown, and ×(1 + 0.02 per Demand
  grown).
- **Drone and E-Bike** are Uncommon.
- **Worked example.** The doc's worked example still runs on doc content, with the doc's Precision
  Tooling and rewards injected through the config (`__tests__/worked-example.test.ts`).

Results over 1000 seeds (`npm run sim -- --scenario bom --runs 1000`):

| Bot | Win % | Mean reach |
|---|---:|---:|
| bargain-bin | 29.3 | 11.9 |
| greedy | 21.3 | 11.5 |
| assembly-chain | 17.8 | 10.2 |
| market-maker | 11.0 | 10.6 |

Mean margin by round:

| Bot | Round 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bargain-bin | 79 | 72 | 49 | 55 | 53 | 38 | 45 | 36 | 27 | 19 | 12 | −11 |
| assembly-chain | 79 | 55 | 35 | 37 | 32 | 31 | 40 | 48 | 40 | 47 | 37 | 9 |

Labelled by what the run actually built (all bots pooled):

| Archetype | Win % |
|---|---:|
| boutique | 29.5 |
| bargain-bin | 26.1 |
| catalog | 22.4 |
| assembly-chain | 21.1 |
| market-maker | 17.8 |
| unbuilt | 5.3 |

### Status against the goals
- **Met:**
  - Targets grow 21.5×.
  - Tempo leads on margin in rounds 2–5, and assembly-chain leads in rounds 8–12.
  - Tempo stalls at the Q4 Boss.
- **Borderline:**
  - The best bot wins 29.3% (goal 30–60%).
  - The best tempo and best slow-burn bots are 11.5pp apart (goal ~10pp). By archetype label the
    gap is 5pp.
- **Open:**
  - Market-maker trails assembly-chain. Bookshelf's $3 Price limits it.
  - The greedy baseline posts the highest mid-run margins because it buys whatever shows up. An
    adaptive bot would be a better "best player" reference.
  - The impact table pools all bots, so archetype items partly reflect which bots buy them.
