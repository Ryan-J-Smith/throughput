import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BROWSER_GAMES } from '../../browser-games';
import { BrowserGame } from '../games';
import type { BrowserGameProps, GameListing } from '../games';
import { HomeScreen, parseSeed } from '../screens';
import { MemoryStore } from '../storage';
import type { KeyValueStore } from '../storage';
import { Launcher } from './Launcher';

class FakeGame extends BrowserGame {
  readonly id: string;
  readonly title: string;
  readonly tagline = 'A test game.';
  override readonly accent = 'blue';
  override readonly listing: GameListing;
  override readonly HowToPlay = () => <p>Fake rules</p>;
  readonly Screen = ({ seed }: BrowserGameProps) => <p>playing {seed}</p>;

  constructor(id: string, listing: GameListing = 'featured') {
    super();
    this.id = id;
    this.title = `Game ${id}`;
    this.listing = listing;
  }

  override savedRun(store: KeyValueStore): string | null {
    return store.get(`${this.id}.save`);
  }
}

const home = (props: Partial<Parameters<typeof HomeScreen>[0]> = {}) =>
  renderToStaticMarkup(
    <HomeScreen featured={new FakeGame('a')} others={[]} savedRun={null} onNewRun={() => {}} onContinue={() => {}} onPlay={() => {}} {...props} />,
  );

describe('title', () => {
  it('headlines the featured game with New run, Custom seed and How to play', () => {
    const html = home();
    expect(html).toContain('<h1 class="home__title">Game a</h1>');
    expect(html).toContain('A test game.');
    expect(html).toContain('New run');
    expect(html).toContain('Custom seed');
    expect(html).toContain('How to play');
    expect(html).not.toContain('Continue');
    expect(html).not.toContain('More games');
  });

  it('offers Continue with the saved run, and lists other games by listing', () => {
    const html = home({ savedRun: 'Year 2 Q1, Shift 3', others: [new FakeGame('b', 'prototype'), new FakeGame('c', 'dev')] });
    expect(html).toContain('Continue');
    expect(html).toContain('Year 2 Q1, Shift 3');
    expect(html).toContain('More games');
    expect(html).toContain('Prototype: Game b');
    expect(html).toContain('Dev: Game c');
    expect(html).toContain('data-listing="prototype"');
  });

  it('reads custom seeds as whole numbers', () => {
    expect(parseSeed(' 1234 ')).toBe(1234);
    expect(parseSeed('0')).toBe(0);
    expect(typeof parseSeed('12a')).toBe('string');
    expect(typeof parseSeed('-5')).toBe('string');
    expect(typeof parseSeed('')).toBe('string');
    expect(typeof parseSeed('1234567890123456')).toBe('string');
  });

  it('the launcher opens on the title; dev games only when asked', () => {
    const games = [new FakeGame('b', 'prototype'), new FakeGame('a'), new FakeGame('c', 'dev')];
    const store = new MemoryStore();
    store.set('a.save', 'Year 1 Q2, in the shop');
    const html = renderToStaticMarkup(<Launcher games={games} nextSeed={() => 7} store={store} />);
    expect(html).toContain('<h1 class="home__title">Game a</h1>');
    expect(html).toContain('Year 1 Q2, in the shop');
    expect(html).toContain('Prototype: Game b');
    expect(html).not.toContain('Game c');
    expect(html).not.toContain('playing');
    expect(renderToStaticMarkup(<Launcher games={games} nextSeed={() => 7} store={store} showDevGames />)).toContain('Dev: Game c');
  });

  it('registers THROUGHPUT as the headline, Bill of Materials as a prototype and the demo as dev-only', () => {
    expect(BROWSER_GAMES.map((g) => `${g.id}:${g.listing}`)).toEqual(['throughput:featured', 'bom:prototype', 'demo:dev']);
    const html = renderToStaticMarkup(<Launcher games={BROWSER_GAMES} nextSeed={() => 7} store={new MemoryStore()} />);
    expect(html).toContain('<h1 class="home__title">Throughput</h1>');
    expect(html).toContain('Prototype: Bill of Materials');
    expect(html).not.toContain('Card demo');
  });
});
