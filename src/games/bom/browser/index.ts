// Browser screen for Bill of Materials. Not re-exported from the bom barrel, to keep React and CSS
// out of the CLI and sim.
export { BomBrowserGame } from './BomBrowserGame';
export { BomScreen } from './BomScreen';
export { BomHud } from './BomHud';
export { FacilitiesRow } from './FacilitiesRow';
export { ProductBoard } from './ProductBoard';
export type { ProductBoardProps, RoundActions, ShopActions } from './ProductBoard';
export { ShipReceipt } from './ShipReceipt';
export type { ShipReceiptProps } from './ShipReceipt';
export { NextRoundMemo, PayoutSlip, Shelf, ShredPanel } from './ShopParts';
export type { ShelfProps, ShredPanelProps } from './ShopParts';
export { BenchTray, PartsHand } from './Workbench';
export { rulesSections } from './rules-text';
export type { RulesSection } from './rules-text';
export { MARKET_NAME, offerView, partKey, partView, roundLabel } from './present';
