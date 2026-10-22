import { GenericRenderer } from '../play/render';
import { PlayableGame } from '../play/session';
import type { Game } from '../play/session';
import { demoRun } from '../sim/demo';
import type { DemoCard } from '../sim/demo';

/** Games the CLI can play; the first is the default for `new`. Register the real design here. */
export const ALL_GAMES: readonly Game[] = [
  new PlayableGame<DemoCard>({ name: 'demo', createRun: demoRun, renderer: new GenericRenderer() }),
];
