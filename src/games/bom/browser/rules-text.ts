import { PREMIUM_PRICE, SUB_RND_GRADE } from '../model';
import type { BomConfig } from '../rules';

export type RulesSection = { readonly heading: string; readonly lines: readonly string[] };

/** The rules for a new player, with the numbers taken from the config so tuning can't make them stale. */
export function rulesSections(config: BomConfig): RulesSection[] {
  const { rewards, interest, shop } = config;
  const targets = config.targets;
  return [
    {
      heading: 'Goal',
      lines: [
        `${targets.length} quarters, each a Small, Big and Boss market: ${targets.length * 3} rounds. Each round has a revenue target.`,
        `You get ${config.builds} Builds and ${config.scraps} Scraps per round. Miss a target and the run is over. Clear the Q${targets.length} Boss to win.`,
      ],
    },
    {
      heading: 'Parts',
      lines: [
        `You hold ${config.handSize} parts and draw back to ${config.handSize} after every Build or Scrap. The deck reshuffles every round.`,
        `Shell, Chip and Bolt add their grade to Units. Paint adds its grade to Price. A Premium tag adds $${PREMIUM_PRICE} Price.`,
      ],
    },
    {
      heading: 'A Build is one of two things',
      lines: [
        `Ship: select up to ${config.maxSelection} parts from your hand and Bench that contain a Product's recipe, then tap that Product. Extra parts are filler and still add their grade.`,
        'Fabricate: select exactly a Sub-assembly recipe. Its part (a Motor, say) goes to the Bench with grade 2 × the sum of the input grades. It earns nothing now.',
      ],
    },
    {
      heading: 'Ship revenue',
      lines: [
        'Revenue = min(Units, Demand) × Price × Markup, rounded down. Units beyond Demand earn nothing.',
        'Each repeat Ship of the same Product this round halves its Demand. Shipping different Products avoids that.',
        `Sell-out: when a Product's first Ship of the round has Units ≥ Demand, its Demand grows +${config.sellOutGrowth} for good.`,
        'Facilities first add to Units, Price or Demand, then multiply (Markup). Order never matters.',
      ],
    },
    {
      heading: 'Bench, Scrap and Overtime',
      lines: [
        `The Bench holds ${config.benchSlots} fabricated parts and keeps them between rounds. If it is full, a Fabricate must trash a Bench part.`,
        `Scrap discards up to ${config.maxSelection} hand parts and redraws. It does not cost a Build.`,
        'Once revenue reaches the target, Ship locks: Overtime. Each Build left can Fabricate onto the Bench for next round, or be collected as $1.',
        'Revenue over the target is not paid.',
      ],
    },
    {
      heading: 'Payout and shop',
      lines: [
        `A clear pays $${rewards.small} / $${rewards.big} / $${rewards.boss} (Small / Big / Boss), $1 per unused Build, and $${interest.amount} interest per $${interest.per} you hold (max $${interest.cap}).`,
        `The Rack sells Facilities (permanent rules, up to ${shop.maxFacilities}), Blueprints (new Products and Sub-assemblies, up to ${shop.maxBlueprints}) and R&D Grants.`,
        `R&D: Scale adds half the Product's base Units and Demand; Premium adds a third of its base Price; on a Sub it adds +${SUB_RND_GRADE} output grade.`,
        `The Parts Counter sells parts for your deck. Shred removes one deck part ($${shop.shredCost}, once per visit). Reroll refreshes the Rack and Counter.`,
        'Sell Facilities and Blueprints for half their cost. Selling a Blueprint loses its R&D and growth.',
      ],
    },
    {
      heading: 'Market disruptions',
      lines: ["Each quarter's Boss round has a disruption. It is revealed when that quarter's first shop opens."],
    },
  ];
}
