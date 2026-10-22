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

export const PROTOTYPE: CardDef = { id: 'prototype', name: 'Prototype', stage: 'design', price: 3, marginAdd: 3, marginMul: 1, text: '+$3 Margin' };
export const REBRAND: CardDef = {
  id: 'rebrand',
  name: 'Rebrand',
  stage: 'design',
  price: 6,
  marginAdd: -2,
  marginMul: 2,
  repeatMul: 1.5,
  text: '-$2 Margin, then Margin ×2 (×1.5 if a Rebrand already ran this Shift)',
};
export const PRINTER_3D: CardDef = { id: '3d-printer', name: '3D Printer', stage: 'make', price: 3, units: 4, marginAdd: 2, text: '+4 Units, +$2 Margin' };
export const CONTRACT_MANUFACTURER: CardDef = {
  id: 'contract-manufacturer',
  name: 'Contract Manufacturer',
  stage: 'make',
  price: 6,
  units: 20,
  marginAdd: -1,
  text: '+20 Units, -$1 Margin',
};
export const POP_UP_SHOP: CardDef = {
  id: 'pop-up-shop',
  name: 'Pop-Up Shop',
  stage: 'ship',
  price: 4,
  cap: 5,
  marginMul: 3,
  text: 'Ship 5 at Margin ×3 (this sale only)',
};
export const MARKETPLACE: CardDef = {
  id: 'marketplace',
  name: 'Marketplace',
  stage: 'ship',
  price: 5,
  cap: 'demand',
  marginMul: 1.5,
  text: 'Ship up to Demand at Margin ×1.5 (this sale only)',
};
export const SUBSCRIPTION_BOX: CardDef = {
  id: 'subscription-box',
  name: 'Subscription Box',
  stage: 'ship',
  price: 4,
  cap: 12,
  marginMul: 1.5,
  text: 'Ship 12 at Margin ×1.5 (this sale only)',
};
export const EXPORT_DEAL: CardDef = {
  id: 'export-deal',
  name: 'Export Deal',
  stage: 'ship',
  price: 5,
  cap: 'all',
  marginMul: 0.75,
  text: 'Ship all Units at Margin ×0.75 (ignores Demand and cap cuts)',
};

/** Per Category: 1 Sketch, 2 Workshops, 2 Trucks (20 cards over 4 Categories). */
// Playtest 2: one Truck per Category (was two), so fewer hands are Ships the Line can't use.
export const STARTER_CARDS: readonly CardDef[] = [SKETCH, WORKSHOP, WORKSHOP, TRUCK];

/** Cards the shop sells, each in any Category. Expediter is cut for the MVP (see DESIGN_NOTES). */
export const SHOP_CARDS: readonly CardDef[] = [
  INFLUENCER,
  PROTOTYPE,
  REBRAND,
  FACTORY_FLOOR,
  PRINTER_3D,
  CONTRACT_MANUFACTURER,
  BOUTIQUE,
  WHOLESALE_CLUB,
  POP_UP_SHOP,
  MARKETPLACE,
  SUBSCRIPTION_BOX,
  EXPORT_DEAL,
];
