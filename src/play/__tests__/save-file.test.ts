import { describe, expect, it } from 'vitest';
import { SaveError, parseSave, serializeSave } from '../session';
import type { SaveFile } from '../session';

describe('save files', () => {
  const save: SaveFile = { version: 1, game: 'demo', seed: 42, actions: ['continue', 'play 1 2'] };

  it('round-trips through text', () => {
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it.each([
    ['not json', /not valid JSON/],
    ['[1]', /must be a JSON object/],
    ['{"version":1,"seed":1,"actions":[]}', /missing "game"/],
    ['null', /must be a JSON object/],
    ['{"version":2,"game":"demo","seed":1,"actions":[]}', /Unsupported save version 2/],
    ['{"version":1,"game":"demo","seed":1.5,"actions":[]}', /"seed" must be an integer/],
    ['{"version":1,"game":"demo","seed":1,"actions":[3]}', /"actions" must be a list of strings/],
  ])('rejects %s', (text, message) => {
    expect(() => parseSave(text)).toThrow(SaveError);
    expect(() => parseSave(text)).toThrow(message);
  });
});
