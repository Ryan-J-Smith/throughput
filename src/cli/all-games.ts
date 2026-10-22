import { defaultBomConfig } from '../games/bom/content';
import { BomTextGame } from '../games/bom/text';
import { GenericRenderer } from '../play/render';
import { PlayableGame } from '../play/session';
import type { TextGame } from '../play/session';
import { demoRun } from '../sim/demo';
import type { DemoCard } from '../sim/demo';

/** Games the CLI can play; the first is the default for `new`. Register the real design here. */
export const ALL_GAMES: readonly TextGame[] = [
  new PlayableGame<DemoCard>({ name: 'demo', createRun: demoRun, renderer: new GenericRenderer() }),
  new BomTextGame('bom', defaultBomConfig),
];
