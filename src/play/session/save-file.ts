/**
 * A saved run is just its seed and the canonical text of every accepted action; the engine is
 * deterministic, so replaying the actions rebuilds the exact state.
 */
export type SaveFile = {
  readonly version: 1;
  readonly game: string;
  readonly seed: number;
  readonly actions: readonly string[];
};

/** Raised for unreadable save files and for logs that no longer replay. */
export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

export function serializeSave(save: SaveFile): string {
  return `${JSON.stringify(save, null, 2)}\n`;
}

export function parseSave(text: string): SaveFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('Save file is not valid JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new SaveError('Save file must be a JSON object');
  const { version, game, seed, actions } = data as Record<string, unknown>;
  if (version !== 1) throw new SaveError(`Unsupported save version ${String(version)}`);
  if (typeof game !== 'string') throw new SaveError('Save file is missing "game"');
  if (typeof seed !== 'number' || !Number.isInteger(seed)) throw new SaveError('Save file "seed" must be an integer');
  if (!Array.isArray(actions) || !actions.every((a) => typeof a === 'string')) {
    throw new SaveError('Save file "actions" must be a list of strings');
  }
  return { version, game, seed, actions: actions as string[] };
}
