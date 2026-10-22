import { describe, expect, it } from 'vitest';
import { runCli, CliIo, EXIT_ILLEGAL, EXIT_OK } from '../../../cli';
import type { GameView, SaveFile } from '../../../play/session';
import { defaultBomConfig } from '../content';
import { BomTextGame, parseBomAction } from '../text';
import type { BomView } from '../text';
import { flatTargets } from './helpers';

const game = new BomTextGame('bom', defaultBomConfig);
const state = (view: GameView): BomView => view.state as BomView;

/** Plays from the legal-actions list: ship (or fab) the suggested example, buy what it can, else continue. */
function scriptedAction(view: GameView): string {
  const v = state(view);
  const example = (prefix: string): string | undefined =>
    view.legalActions.filter((a) => a.startsWith(prefix)).map((a) => /\(e\.g\. (.+)\)$/.exec(a)?.[1])[0];
  if (v.phase === 'round') return example('ship') ?? example('fab') ?? (v.scraps > 0 ? 'scrap 1 2 3' : 'collect');
  if (v.phase === 'overtime') return 'collect';
  const buy = view.legalActions.find((a) => /^buy \d+ — /.test(a));
  return buy !== undefined ? (buy.split(' — ')[0] as string) : 'continue';
}

function playThrough(g: BomTextGame, seed: number, limit = 400): { saves: SaveFile[]; last: GameView } {
  let save = g.newSave(seed);
  let view = g.show(save);
  const saves = [save];
  for (let i = 0; i < limit && view.legalActions.length > 0; i++) {
    const result = g.take(save, scriptedAction(view));
    if (!result.ok) throw new Error(`scripted action refused: ${result.reason}`);
    ({ save, view } = result);
    saves.push(save);
  }
  return { saves, last: view };
}

describe('parseBomAction', () => {
  it.each([
    ['ship desk-fan b1 3', { kind: 'ship', product: 'desk-fan', parts: [{ zone: 'bench', position: 1 }, { zone: 'hand', position: 3 }] }],
    ['SHIP 1 2', { kind: 'ship', product: null, parts: [{ zone: 'hand', position: 1 }, { zone: 'hand', position: 2 }] }],
    ['fab 1 2 trash b2', { kind: 'fab', parts: [{ zone: 'hand', position: 1 }, { zone: 'hand', position: 2 }], trash: { zone: 'bench', position: 2 } }],
    ['buy 3 desk-fan premium', { kind: 'buy', slot: 3, blueprint: 'desk-fan', choice: 'premium' }],
    ['shred paint 1', { kind: 'shred', category: 'paint', grade: 1 }],
    ['continue', { kind: 'continue' }],
  ])('parses "%s"', (text, command) => {
    expect(parseBomAction(text)).toEqual({ ok: true, command });
  });

  it.each([
    ['ship', /at least one part/],
    ['ship gizmo 1 1', /listed twice/],
    ['scrap b1', /Only hand parts/],
    ['fab 1 2 trash 3', /trash needs one Bench slot/],
    ['buy 2 gizmo fast', /scale or premium/],
    ['juggle', /Unknown action/],
  ])('rejects "%s"', (text, reason) => {
    const result = parseBomAction(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });
});

describe('BomTextGame', () => {
  it('starts in round 1 with a readable view', () => {
    const view = game.show(game.newSave(42));
    expect(view.text).toMatch(/^Bill of Materials · seed 42 · 0 actions · phase: round/);
    expect(view.text).toMatch(/Q1 Small \(round 1\/12\) · Target 105 · Revenue 0 · Builds 4 · Scraps 3 · Cash \$4/);
    expect(view.text).toMatch(/Hand \(8\) · draw pile 24 · discard 0 \(reshuffled next round\): 1 \w+ \d/);
    expect(view.text).toMatch(/desk-fan\s+Motor\+Shell\s+15 Units/);
    expect(state(view).hand).toHaveLength(8);
    expect(JSON.parse(JSON.stringify(view.state))).toEqual(view.state);
  });

  it('a full scripted run replays to exactly the live state', () => {
    const { saves, last } = playThrough(game, 7);
    expect(['won', 'lost']).toContain(state(last).phase);
    expect(game.show(saves.at(-1) as SaveFile)).toEqual(last);
    expect(playThrough(game, 7).saves).toEqual(saves);
  });

  it('can play all 12 rounds to a win with easy targets', () => {
    const easy = new BomTextGame('bom', () => ({ ...defaultBomConfig(), targets: flatTargets(1) }));
    const { last, saves } = playThrough(easy, 3);
    expect(state(last).phase).toBe('won');
    expect(last.text).toMatch(/none; the run is over/);
    expect(easy.show(saves.at(-1) as SaveFile)).toEqual(last);
  });

  it('preview is free and unrecorded; ambiguous ships list the options', () => {
    const easy = new BomTextGame('bom', () => ({ ...defaultBomConfig(), startingDeck: () => ['shell', 'chip', 'bolt', 'bolt', 'shell', 'chip', 'paint', 'paint'].map((c) => ({ category: c, grade: 2, premium: false, fabricated: false })) }));
    const save = easy.newSave(1);
    // Sorted hand: 1-2 Shell, 3-4 Chip, 5-6 Bolt, 7-8 Paint.
    const preview = easy.take(save, 'preview 1 3 5 6');
    expect(preview.ok && preview.save).toBe(save);
    expect(preview.ok && preview.log.join('\n')).toMatch(/ship gizmo 1 3 5 6 → \$\d+[\s\S]*ship flatpack 1 3 5 6 → \$\d+/);
    const ambiguous = easy.take(save, 'ship 1 3 5 6');
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) expect(ambiguous.reason).toMatch(/Several Products fit; pick one: ship (gizmo|flatpack) /);
    const shipped = easy.take(save, 'ship Flatpack 1 5 6');
    expect(shipped.ok && shipped.save.actions).toEqual(['ship flatpack 1 5 6']);
    expect(shipped.ok && shipped.log[0]).toMatch(/^Shipped Flatpack: \$\d+ \(revenue \d+\/105\)$/);
    expect(shipped.ok && shipped.log[1]).toMatch(/^ {2}Flatpack base: 18 Units, \$2, 50 Demand$/);
  });

  it('refusals carry the rules reason and leave the save alone', () => {
    const save = game.newSave(42);
    for (const [text, reason] of [
      ['ship drone 1 2', /You don't own drone/],
      ['ship gizmo 9', /No part at hand position 9/],
      ['fab b1 1', /No part in Bench slot b1/],
      ['collect', /only for Overtime/],
      ['buy 1', /shop is closed/],
    ] as const) {
      const result = game.take(save, text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(reason);
    }
    expect(save.actions).toEqual([]);
  });
});

class FakeIo extends CliIo {
  readonly files = new Map<string, string>();
  stdout: string[] = [];
  stderr: string[] = [];
  override exists(path: string): boolean {
    return this.files.has(path);
  }
  override read(path: string): string {
    return this.files.get(path) ?? '';
  }
  override write(path: string, text: string): void {
    this.files.set(path, text);
  }
  override out(text: string): void {
    this.stdout.push(text);
  }
  override err(text: string): void {
    this.stderr.push(text);
  }
}

describe('npm run cli -- --game bom', () => {
  it('starts, previews without recording, and refuses illegal actions with exit 1', async () => {
    const { ALL_GAMES } = await import('../../../cli');
    const io = new FakeIo();
    expect(runCli(['new', '--game', 'bom', '--seed', '42', '--save', 'b.json'], io, ALL_GAMES)).toBe(EXIT_OK);
    expect(io.stdout.join()).toMatch(/Bill of Materials/);
    const saved = io.read('b.json');
    expect(runCli(['act', '--save', 'b.json', 'preview', '1', '2'], io, ALL_GAMES)).toBe(EXIT_OK);
    expect(io.read('b.json')).toBe(saved);
    expect(runCli(['act', '--save', 'b.json', 'buy', '1'], io, ALL_GAMES)).toBe(EXIT_ILLEGAL);
    expect(io.stderr.at(-1)).toMatch(/illegal action "buy 1": The shop is closed/);
  });
});
