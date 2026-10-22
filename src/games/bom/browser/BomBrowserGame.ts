import { BrowserGame } from '../../../ui/games';
import { BomScreen } from './BomScreen';

export class BomBrowserGame extends BrowserGame {
  readonly id = 'bom';
  readonly title = 'Bill of Materials';
  readonly tagline = 'Your hand is a bin of parts. Ship them as Products, or fabricate sub-assemblies onto the Bench for something bigger.';
  override readonly accent = 'orange';
  override readonly listing = 'prototype';
  readonly Screen = BomScreen;
}
