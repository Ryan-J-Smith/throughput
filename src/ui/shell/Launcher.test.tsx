import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrowserGame } from '../games';
import type { BrowserGameProps } from '../games';
import { GamePicker } from '../screens';
import { MemoryStore } from '../storage';
import { Launcher } from './Launcher';

class FakeGame extends BrowserGame {
  readonly id: string;
  readonly title: string;
  readonly tagline = 'A test game.';
  override readonly accent = 'blue';
  readonly Screen = ({ seed }: BrowserGameProps) => <p>playing {seed}</p>;

  constructor(id: string) {
    super();
    this.id = id;
    this.title = `Game ${id}`;
  }
}

describe('game picker', () => {
  it('lists every registered game with its tagline and accent', () => {
    const html = renderToStaticMarkup(<GamePicker games={[new FakeGame('a'), new FakeGame('b')]} onPick={() => {}} />);
    expect(html).toContain('Game a');
    expect(html).toContain('Game b');
    expect(html).toContain('A test game.');
    expect(html).toContain('data-accent="blue"');
  });

  it('the launcher opens on the picker', () => {
    const html = renderToStaticMarkup(<Launcher games={[new FakeGame('a')]} nextSeed={() => 7} store={new MemoryStore()} />);
    expect(html).toContain('Pick a business to run');
    expect(html).not.toContain('playing');
  });
});
