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
- **Payout** on a clear is the market reward (Small $3 / Big $4 / Boss $5), plus $1 per unused Build,
  plus interest. Interest ($1 per $5, max $5) is computed on the cash held *before* this payout.
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
- **Price floor.** Price has a floor of $1, applied after all additive effects (Outlet Mall, Price War)
  and before multipliers.
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
  - **Building.** Ship if the best Ship clears the target. Otherwise fabricate a Sub part that an owned
    Product needs. Then stock preferred Subs while ≥3 Builds remain (never trashing). Scrap when far
    behind pace, else Ship the best.
  - **Ship planning.** Recipe slots take the highest grades; filler is greedy and hand-only (Bench
    parts are used up).
  - **Overtime.** Chain and Market Maker stock the Bench, except before a revealed Warehouse Fire.
  - **Shop.** Buy by priority lists: Rack, then R&D, then Parts Counter, then Shred, then a reroll.
- **Archetype labels** come from owned key Facilities (≥2 of a set), not from the bot. Runs with fewer
  are labelled "unbuilt".
- **Scenario.** `npm run sim -- --scenario bom` (registered in `src/sim/cli/all-scenarios.ts`).

## Tuning (Phase B, first pass)
- **Doc targets are out of reach.** With `DOC_TARGETS`, no bot wins a run, and most die in Q2 (best
  mean reach 6.3 of 12). Income is about $5 per round against $4–$8 items, so engines grow roughly
  linearly. The doc's targets grow ×42 from round 1 to 12.
- **`TUNED_TARGETS`** (the default; `DOC_TARGETS` is kept):

  | Quarter | Small | Big | Boss |
  | ------- | ----: | --: | ---: |
  | Q1      | 120   | 180 | 240  |
  | Q2      | 300   | 380 | 460  |
  | Q3      | 560   | 680 | 800  |
  | Q4      | 900   | 1050| 1200 |

  Q1 is unchanged.

  Results over 1000 seeds:

  | Bot            | Win % | Mean reach |
  | -------------- | ----: | ---------: |
  | bargain-bin    | 47.2  | 10.8       |
  | greedy         | 19.2  | 9.4        |
  | market-maker   | 0.1   | 6.1        |
  | assembly-chain | 0.0   | 5.5        |

- **Open: the tempo and slow-burn curves do not cross.** Tempo leads at every round. Findings:
  - **Kitted runs.** Each archetype starts owning its three key Facilities plus its key Blueprints
    (500 seeds):
    - Kitted Assembly Chain posts higher margins than kitted Bargain Bin in rounds 3–11 (for example
      +95% vs +27% in round 6), but wins only 25% vs 91%.
    - Kitted Market Maker wins 1%.

    So the Chain engine has a high ceiling but is rarely assembled (Drone and E-Bike are Rare). It is
    also fragile at Bosses.
  - **Boss losses.** Price War and Recall cause most slow-burn losses (unkitted chain: 167 and 105 of
    500).
    - Price War's flat −$3 removes most of the Price on $3–$4 Products. Tempo Prices of $10 or more
      lose only a fraction.
    - Recall punishes single-Product engines.
  - **Market Maker.** Revenue is `min(U, D) × P`, so Demand growth from sell-outs only pays when Units
    keep up, and Units grow only additively from parts. Price, which tempo stacks, is the stronger lever.
  - **A rarity lever alone doesn't help.** Moving rarity to 55/30/15 left Chain at 0%, because it dies
    in Q2 (round 6 Boss) before Rare parts matter.
  - **Impact caveat.** The impact table pools all bots, so Chain and Market Maker items read negative
    partly because weak bots buy them.
