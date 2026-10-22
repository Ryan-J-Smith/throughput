import { BOSSES, BOUTIQUE, CONTRACTS } from '../content';
import type { ThroughputConfig } from '../content';

/** Line Shift needs more than its one-line text to play well, so the rules spell it out. */
const LINE_SHIFT_RULES = `Line Shift: Shift 1 runs on your layout. From Shift 2 on, all Fixtures move one slot right before
    each Shift (the last wraps to slot 1). Cards on the Line do NOT move, so parked Designs end up
    over other Fixtures, and one that lands on a Station sits idle; but this round you may unload
    parked cards back to your hand and load them again. The state lists each move. Your shop
    layout comes back after the round.`;

/** `text` wrapped to about 100 columns, continuation lines indented by `indent`. */
function wrap(text: string, indent: string): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + word.length + 1 > 98) {
      lines.push(line);
      line = indent + word;
    } else line = line === '' ? word : `${line} ${word}`;
  }
  return [...lines, line].join('\n');
}

/**
 * Full rules, shown by the free `rules` command and the browser's How to play. Written so a new
 * player needs nothing else; tunable numbers come from `config`.
 */
export function rulesText(config: ThroughputConfig): string {
  const c = config;
  const boutiqueCap = BOUTIQUE.stage === 'ship' ? String(BOUTIQUE.cap) : '?';
  const sellOutShare = c.demand.sellOutRate === 0.5 ? 'half' : `${Math.round(c.demand.sellOutRate * 100)}%`;
  const contracts = CONTRACTS.map((k) => `  - ${wrap(`${k.name}${k.targetsCard ? ' (pick a deck card)' : ''}: ${k.text}`, '    ')}`).join('\n');
  const bosses = BOSSES.map((b) => `  ${b.id === 'line-shift' ? LINE_SHIFT_RULES : wrap(`${b.name}: ${b.text}`, '    ')}`).join('\n');
  const rounds = c.targets.length;
  const years = Math.ceil(rounds / c.roundsPerYear);
  const quarters = Array.from({ length: c.roundsPerYear - 1 }, (_, i) => `Q${i + 1}`).join(', ');
  const targets = Array.from({ length: years }, (_, y) => `Y${y + 1} ${c.targets.slice(y * c.roundsPerYear, (y + 1) * c.roundsPerYear).join('/')}`).join(' · ');
  const income = c.income.map((amount, i) => `${amount}C (${i === c.income.length - 1 ? 'Board Review' : `Q${i + 1}`})`).join(', ');
  const interestFull = Math.ceil(c.interest.cap / c.interest.amount) * c.interest.per;
  const pips = `${c.hotPips} buzz pip${c.hotPips === 1 ? '' : 's'}`;
  const typeName = { design: 'Design', make: 'Make', ship: 'Ship' } as const;
  const opener = c.openingHandTypes.map((t) => `one ${typeName[t]}`).join(' and ');
  const restockTimes = c.restocksPerRound === 1 ? 'Once per round' : `${c.restocksPerRound} times per round`;
  const draws =
    c.restocksPerRound > 0
      ? `  Restock: ${restockTimes}, when you would draw from an empty draw pile, your discards are shuffled
  into a new draw pile. After that an empty pile stays empty for the round.`
      : `  The deck does NOT reshuffle during a round: once the draw pile is empty you draw nothing more.`;

  return `THROUGHPUT — rules

GOAL
  ${rounds} rounds: ${years} Years × ${c.roundsPerYear} quarters (${quarters}, then a Board Review). Each round has a Sales target.
  You have up to ${c.shiftsPerRound} Shifts to reach it. Miss it after Shift ${c.shiftsPerRound} and the run is over; clear the
  last Board Review to win.
  Targets: ${targets}.

CARDS
  Every card has a type (Design, Make or Ship) and a Category (Apparel A, Gadgets G, Home H,
  Food F), shown as a suffix: "Sketch-G" is a Gadgets Sketch.
  - Design: changes Margin. Designs STAY on the Line after a Shift ("parked") and fire again every
    Shift until the round ends, unless you scrap them. They hold their slot all round.
  - Make: adds Units. Dispatched (discarded) after the Shift, unless its Fixture keeps it.
  - Ship: sells Units at the current Margin. Dispatched after the Shift, even if it sold nothing.
  Starter deck (20): per Category 1 Sketch (Design +$2), 2 Workshops (Make +6 Units),
  2 Trucks (Ship up to the Category's Demand).
  Each round starts with an empty Line, the whole deck shuffled and a hand of ${c.handSize}.${opener === '' ? '' : `
  The opening hand always holds at least ${opener} (if your deck has them).`}
${draws}
  Tip: "deck" shows exactly what is left to draw this round.

A SHIFT
  1. Load: put hand cards into empty Line slots (${c.startSlots} slots to start, up to ${c.maxSlots}).
  2. Run: a Batch starts at 0 Units and Margin $${c.baseMargin} and moves left to right through the
     slots (see HOW A SALE IS PRICED).
  3. Leftover Units clear at $${c.overstockValue} each.
  4. Dispatch: Make and Ship cards are discarded. Designs stay in their slots.
  5. If Sales have reached the target, the round clears now. Otherwise draw back up to ${c.handSize}.
  Retool (${c.retoolsPerRound} per round): discard 1–${c.retoolMax} hand cards and draw as many into their places.
  Unload takes back a card you loaded this Shift. Scrap discards a card parked from an earlier
  Shift to free its slot. A parked card can't move to another slot (except in a Line Shift round).
  The state shows the exact result of running the current Line ("If you run now") and, for each
  card on the Line, whether it stays or is dispatched after the run.

HOW A SALE IS PRICED
  At each slot, in this order:
    a. Handoff: +$1 Margin if the previous slot holds a card of the same Category (any type:
       Design, Make or Ship, with or without a Fixture).
       Empty slots and Stations break the chain.
    b. The slot's Fixture applies.
    c. The card resolves. A Design adds its +$ and then applies its ×. A Make adds Units.
       A Ship sells min(Units, its cap, its Category's Demand left); sold Units leave the Batch.
  Every change to Margin (Handoffs, Fixtures, Designs, Factory Floor's -$1) carries on to all later
  slots. So order matters: Quality Lab's +$4 under an Influencer lands before the Influencer's ×1.5,
  and a Tooling Upgrade's +$1 on an Influencer is added before its ×1.5.
  A Ship sells each Unit at:
    Margin × the Ship card's own × (Boutique ×2, Wholesale Club ×0.5, Export Deal ×0.75)
      × Hot ×${c.hotMultiplier} (while a buzz pip is left) × Flagship Store × Luxury Counter × R&D Premium
  These sale bonuses apply to that one sale only and do not carry on. Fixtures that change Margin
  itself (Logistics Hub, Superstore, Price Gun, Quality Lab and the like) carry on to later slots.
  Caps: a Truck sells up to its Category's Demand left; Boutique sells up to ${boutiqueCap} (and Demand left).
  Price Gun: every later Ship card sells at most half its cap (a Truck: half the Demand left).
  Wholesale Club and Export Deal sell every Unit and ignore Demand.
  Revenue is rounded down once per sale. Margin itself is kept exact and shown to 2 decimals.

DEMAND
  Each Category has Demand: how many Units its Ship cards can sell in a round, all of them
  together (${c.demand.start} to start). It refills at the start of each round; a Saturated Category gets
  ×${c.demand.saturatedMul} of it that round. The Market shows what is left.
  Demand grows for good, counting from the next round:
  - by ${sellOutShare} of its full Demand (before Saturated or Recession halving; at least +${c.demand.sellOutGrowth})
    when a Shift sells the last of it (sells out);
  - +${c.demand.emergingGrowth} for each Shift that sells it while it is Emerging;
  - +${c.grant.scaleDemand} for each R&D Grant Scale, which also makes each of that Category's Ship cards add
    +${c.grant.scaleUnits} Units to the Batch just before it sells.
  An R&D Grant Premium instead raises that Category's sale price +${Math.round(c.grant.premiumStep * 100)}% per level.
  Wholesale Club and Export Deal ignore Demand and don't use it up.

MARKET (trends)
  Each round every Category has a trend stage. Each new round the conveyor moves
  Emerging → Hot → Saturated → Neutral, and a Neutral Category becomes Emerging (it may be the one
  that just left Saturated). The Market shows this round and the next 3.
  - Hot: the Hot Category has ${pips} per round. A Shift in which a Hot Ship card sells at least
    1 Unit spends 1 pip, and every sale that Shift by a Ship card of the Hot Category (Wholesale Club
    and Export Deal included) gets Margin ×${c.hotMultiplier}. A Shift with no Hot sale
    keeps the pips, so you can save them for your best Shift. Pips don't carry over to the next round.
  - Emerging: each Shift in which a Ship card of that Category sells at least 1 Unit grows its
    Demand +${c.demand.emergingGrowth} for good. Units have no Category; the Ship card's Category counts.
  - Saturated: that Category has ×${c.demand.saturatedMul} of its Demand this round (rounded down).

CAPITAL AND THE SHOP
  Capital (C) is separate from Sales. When a round clears you earn ${income},
  plus ${c.unusedShiftBonus}C per unused Shift, plus interest: ${c.interest.amount}C per full ${c.interest.per}C you hold when the round
  clears, counted before that round's payout (at most +${c.interest.cap}C, reached at ${interestFull}C).
  Overkill: when a round clears, each full ${Math.round(c.overkill.step * 100)}% of the target you sold beyond it pays +1C
  (at most +${c.overkill.cap}C a round).
  Each shop offers 2 Fixtures, 2 Cards and 1 Contract. Reroll: ${c.rerollBaseCost}C, +${c.rerollCostIncrement}C each time per visit.
  Sell a Fixture, or a card you bought, for half its price (rounded down). Starter cards can't be sold.
  Contracts:
${contracts}
  Perks from Contracts (extra Hot pips, Retools, interest cap) last for the rest of the run; the
  state lists them.

FIXTURES
  Each slot holds one Fixture. A new Fixture goes free into the slot you choose; moving one later
  costs ${c.moveCost}C, in the shop only, and swaps it with any Fixture there.
  - A Mod sits under a card and acts on that card. Most act on one card type (Quality Lab: Designs;
    Overtime Crew and Automation: Makes; Showroom and Flagship Store: Ships). The trace marks a Mod
    "idle" when its card is the wrong type.
  - A Station fills the slot itself: no card goes there, and it breaks Handoffs.
  - Warehouse (Mod): a Make card on it also copies its Units into stock, which builds up across
    rounds. In a Board Review, when the Batch reaches it, the whole stock sells at the Batch's Margin
    there ×2, ignoring Demand.

BOARD REVIEWS (bosses)
  The last round of each Year has a boss rule. A run meets ${Math.min(years, BOSSES.length)} of these ${BOSSES.length}, drawn at random; the next
  two Board bosses are always shown.
${bosses}

COMMANDS
  Numbers are as listed in the state: hand cards, slots, shop offers, deck cards.
  Hand numbers stay put: a card keeps its number until it leaves the hand, and new cards fill the gaps.
  load <hand>:<slot> …   e.g. "load 3:1 5:4" puts hand card 3 in slot 1 and hand card 5 in slot 4
  unload <slot> …        take back cards loaded this Shift (in a Line Shift round, parked ones too)
  scrap <slot> …         discard parked cards
  retool <hand> …        discard 1–${c.retoolMax} hand cards and draw as many
  run                    run the Shift
  buy <offer> [<slot> | <deck card> | <category> scale|premium]
                         Fixtures need a slot; Tooling Upgrade/Downsizing a deck card; R&D Grant a
                         Category and Scale or Premium, e.g. "buy 5 home scale"
  sell fixture <slot> | sell card <deck card>
  move <from slot> <to slot>
  reroll | continue
  deck                   list every card you own and what is left to draw (free, not recorded)
  rules                  this text (free); also "npm run -s cli -- rules --game throughput"`;
}
