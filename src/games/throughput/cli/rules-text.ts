/** Full rules, shown by the free `rules` command. Written so a new player needs nothing else. */
export const RULES_TEXT = `THROUGHPUT — rules

GOAL
  12 rounds: 4 Years × 3 quarters (Q1, Q2, then a Board Review). Each round has a Sales target.
  You have up to 4 Shifts to reach it. Miss it after Shift 4 and the run is over; clear the
  Year 4 Board Review to win.

CARDS
  Every card has a Stage and a Category (Apparel A, Gadgets G, Home H, Food F), shown as a suffix:
  "Sketch-G" is a Gadgets Sketch.
  - Design: changes Margin. Designs STAY on the Line after a Shift, so they fire every Shift
    until the round ends (or you scrap them). They also occupy that slot all round.
  - Make: adds Units. Used up (dispatched) after the Shift.
  - Ship: sells Units at the current Margin. Used up after the Shift.
  Starter deck (20): per Category 1 Sketch (Design +$2), 2 Workshops (Make +6 Units),
  2 Trucks (Ship up to 20 Units).
  The deck does NOT reshuffle during a round: once the draw pile is empty you draw nothing more.
  Each round starts with the whole deck shuffled and a hand of 7.

A SHIFT
  1. Load: put hand cards into empty Line slots (5 slots to start, up to 7).
  2. Run: a Batch starts at 0 Units and Margin $2 and moves left to right. At each slot:
     a. Handoff: +$1 Margin if the previous slot holds a card of the same Category.
        Empty slots and Stations break the chain.
     b. The slot's Fixture applies (see SHOP).
     c. The card resolves. A Ship card sells min(Units, its cap) at the current Margin;
        sold Units leave the Batch, Margin carries on to later slots.
  3. Leftover Units clear at $1 each.
  4. Dispatch: Make and Ship cards are discarded. Designs stay in their slots.
  5. Draw back up to 7 cards.
  Retool (2 per round): discard 1–3 hand cards and draw as many.
  Unload takes back a card you loaded this Shift; Scrap discards a card parked from an earlier
  Shift to free its slot.
  The game shows the exact result of running the current Line before you commit ("If you run now").

MARKET (trends)
  Each round every Category has a trend stage. Each new round the conveyor moves
  Emerging → Hot → Saturated → Neutral, and a Neutral Category becomes Emerging.
  The Market shows this round and the next 3.
  - Hot: that Category's Ship cards sell at Margin ×2 during the first 2 Shifts of the round in
    which they ship ("buzz pips").
  - Emerging: each Shift that ships at least 1 Unit of it gives that Category +1 Equity.
  - Equity is permanent: +$1 Margin per point on that Category's Ship sales.
  - Saturated: that Category's Ship caps are halved, unless it is Loyal (Equity 3+).

CAPITAL AND THE SHOP
  Capital (C) is separate from Sales. After a cleared round you earn 4C (Q1), 5C (Q2) or
  6C (Board Review), +2C per unused Shift, and +1C interest per 5C you held (max 5C).
  Each shop offers 2 Fixtures, 2 Cards and 1 Contract. Reroll: 2C, +1C each time per visit.
  Sell a Fixture, or a card you bought, for half its price. Starter cards can't be sold.
  Fixtures: each slot holds one. A Mod sits under a card and affects only that card.
  A Station fills the slot itself (no card) and breaks handoffs. New Fixtures are placed free
  in the slot you choose; moving one later costs 1C (it swaps with what is there).
  Contracts: Tooling Upgrade (a deck card gets Design +$1 / Make +3 Units / Ship +5 cap),
  Downsizing (remove a deck card), Floor Expansion (+1 slot).

BOARD REVIEWS (bosses)
  Q3 of each Year has a boss rule. The next two Board bosses are always shown.
  Line Shift: Fixtures move one slot right at the start of every Shift (wrapping around).
  Turnover: Designs are dispatched like every other card.
  Supply Shock: slot 1 is welded shut.
  JIT Auditor: leftover Units cost $2 each, and the Warehouse is closed.

COMMANDS
  Numbers are as listed in the state: hand cards, slots, shop offers, deck cards.
  load <hand>:<slot> …   e.g. "load 3:1 5:4" puts hand card 3 in slot 1 and hand card 5 in slot 4
  unload <slot> …        take back cards loaded this Shift
  scrap <slot> …         discard parked cards
  retool <hand> …        discard 1–3 hand cards and draw as many
  run                    run the Shift
  buy <offer> [<slot> | <deck card>]   Fixtures need a slot; Tooling Upgrade/Downsizing a deck card
  sell fixture <slot> | sell card <deck card>
  move <from slot> <to slot>
  reroll | continue
  deck                   list every card you own and what is left to draw (free)
  rules                  this text (free)`;
