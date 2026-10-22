import type { CardDef } from '../model';

export const SKETCH: CardDef = { id: 'sketch', name: 'Sketch', stage: 'design', price: 0, marginAdd: 2, marginMul: 1, text: '+$2 Margin' };
export const WORKSHOP: CardDef = { id: 'workshop', name: 'Workshop', stage: 'make', price: 0, units: 6, marginAdd: 0, text: '+6 Units' };
export const TRUCK: CardDef = { id: 'truck', name: 'Truck', stage: 'ship', price: 0, cap: 'demand', marginMul: 1, text: 'Ship up to Demand' };

export const INFLUENCER: CardDef = {
  id: 'influencer',
  name: 'Influencer',
  stage: 'design',
  price: 5,
  marginAdd: 0,
  marginMul: 1.5,
  text: 'Margin ×1.5',
};
export const FACTORY_FLOOR: CardDef = {
  id: 'factory-floor',
  name: 'Factory Floor',
  stage: 'make',
  price: 3,
  units: 14,
  marginAdd: -1,
  text: '+14 Units, -$1 Margin',
};
export const BOUTIQUE: CardDef = {
  id: 'boutique',
  name: 'Boutique',
  stage: 'ship',
  price: 4,
  cap: 8,
  marginMul: 2,
  text: 'Ship 8 at Margin ×2 (this sale only)',
};
export const WHOLESALE_CLUB: CardDef = {
  id: 'wholesale-club',
  name: 'Wholesale Club',
  stage: 'ship',
  price: 4,
  cap: 'all',
  marginMul: 0.5,
  text: 'Ship all Units at half Margin (ignores Demand and cap cuts)',
};

/** Per Category: 1 Sketch, 2 Workshops, 2 Trucks (20 cards over 4 Categories). */
export const STARTER_CARDS: readonly CardDef[] = [SKETCH, WORKSHOP, WORKSHOP, TRUCK, TRUCK];

/** Cards the shop sells, each in any Category. Expediter is cut for the MVP (see DESIGN_NOTES). */
export const SHOP_CARDS: readonly CardDef[] = [INFLUENCER, FACTORY_FLOOR, BOUTIQUE, WHOLESALE_CLUB];
