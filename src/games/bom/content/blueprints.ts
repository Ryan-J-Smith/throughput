import type { BlueprintDef } from '../model';
import { BOLT, CHIP, PAINT, SHELL } from './parts';

export const MOTOR = 'motor';
export const BOARD = 'board';
export const FRAME = 'frame';

/** The 12 blueprints from the design doc (§3). */
export const BLUEPRINTS: readonly BlueprintDef[] = [
  { id: 'gizmo', name: 'Gizmo', kind: 'product', rarity: 'starter', cost: 0, recipe: [SHELL, CHIP], units: 8, price: 2, demand: 30 },
  { id: 'flatpack', name: 'Flatpack', kind: 'product', rarity: 'starter', cost: 0, recipe: [SHELL, BOLT, BOLT], units: 12, price: 2, demand: 40 },
  { id: 'motor', name: 'Motor', kind: 'sub', rarity: 'starter', cost: 0, recipe: [CHIP, BOLT], output: MOTOR },
  { id: 'desk-fan', name: 'Desk Fan', kind: 'product', rarity: 'starter', cost: 0, recipe: [MOTOR, SHELL], units: 15, price: 4, demand: 50 },
  { id: 'frame', name: 'Frame', kind: 'sub', rarity: 'common', cost: 3, recipe: [BOLT, BOLT], output: FRAME },
  { id: 'board', name: 'Board', kind: 'sub', rarity: 'uncommon', cost: 4, recipe: [CHIP, CHIP], output: BOARD },
  { id: 'desk-lamp', name: 'Desk Lamp', kind: 'product', rarity: 'common', cost: 4, recipe: [SHELL, CHIP, PAINT], units: 14, price: 4, demand: 40 },
  { id: 'kettle', name: 'Kettle', kind: 'product', rarity: 'common', cost: 4, recipe: [SHELL, PAINT, PAINT], units: 10, price: 6, demand: 25 },
  { id: 'bookshelf', name: 'Bookshelf', kind: 'product', rarity: 'common', cost: 4, recipe: [FRAME, SHELL], units: 20, price: 3, demand: 60 },
  { id: 'smartwatch', name: 'Smartwatch', kind: 'product', rarity: 'uncommon', cost: 6, recipe: [BOARD, SHELL, PAINT], units: 20, price: 7, demand: 40 },
  { id: 'e-bike', name: 'E-Bike', kind: 'product', rarity: 'rare', cost: 8, recipe: [FRAME, MOTOR, SHELL], units: 35, price: 9, demand: 80 },
  { id: 'drone', name: 'Drone', kind: 'product', rarity: 'rare', cost: 8, recipe: [MOTOR, MOTOR, BOARD], units: 40, price: 10, demand: 120 },
];

export const STARTING_BLUEPRINTS: readonly string[] = ['gizmo', 'flatpack', 'motor', 'desk-fan'];
