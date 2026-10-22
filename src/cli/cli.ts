import { SaveError, parseSave, serializeSave } from '../play/session';
import type { GameView, SaveFile, TextGame } from '../play/session';

/** File and console access for the CLI; injected so the CLI logic runs without Node in tests. */
export abstract class CliIo {
  abstract exists(path: string): boolean;
  abstract read(path: string): string;
  abstract write(path: string, text: string): void;
  abstract out(text: string): void;
  abstract err(text: string): void;
}

export const EXIT_OK = 0;
/** The requested action was refused by the rules; the save file was not changed. */
export const EXIT_ILLEGAL = 1;
/** Bad command line, missing/corrupt save file, or a log that no longer replays. */
export const EXIT_USAGE = 2;

const USAGE = `usage:
  npm run -s cli -- new   --seed N --save FILE [--game NAME] [--force] [--json]
  npm run -s cli -- state --save FILE [--json]
  npm run -s cli -- act   --save FILE "<action>" [--json]
actions are game-specific; every state printout ends with the legal ones (--game picks the game for new)
exit codes: 0 ok, 1 illegal action (save unchanged), 2 usage or save-file error`;

type Parsed = {
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
};

const VALUE_OPTIONS = new Set(['save', 'seed', 'game']);

class UsageError extends Error {}

/** Runs one CLI invocation and returns its exit code. */
export function runCli(args: readonly string[], io: CliIo, games: readonly TextGame[]): number {
  let json = args.includes('--json');
  try {
    const parsed = parseArgs(args);
    json = parsed.flags.has('json');
    switch (parsed.command) {
      case 'new':
        return commandNew(parsed, io, games);
      case 'state':
        return commandState(parsed, io, games);
      case 'act':
        return commandAct(parsed, io, games);
      case 'help':
        io.out(USAGE);
        return EXIT_OK;
      default:
        throw new UsageError(parsed.command === undefined ? 'missing command' : `unknown command "${parsed.command}"`);
    }
  } catch (error) {
    if (!(error instanceof UsageError || error instanceof SaveError)) throw error;
    if (json) io.out(JSON.stringify({ ok: false, error: error.message }));
    else io.err(error instanceof UsageError ? `error: ${error.message}\n${USAGE}` : `error: ${error.message}`);
    return EXIT_USAGE;
  }
}

function commandNew(parsed: Parsed, io: CliIo, games: readonly TextGame[]): number {
  const path = required(parsed, 'save');
  const seed = Number(required(parsed, 'seed'));
  if (!Number.isInteger(seed)) throw new UsageError('--seed must be an integer');
  if (io.exists(path) && !parsed.flags.has('force')) {
    throw new UsageError(`${path} already exists; pass --force to overwrite it`);
  }
  const name = parsed.options.get('game') ?? games[0]?.name;
  const game = findGame(games, name);
  const save = game.newSave(seed);
  const view = game.show(save);
  io.write(path, serializeSave(save));
  printState(io, parsed, view);
  return EXIT_OK;
}

function commandState(parsed: Parsed, io: CliIo, games: readonly TextGame[]): number {
  const save = loadSave(parsed, io);
  printState(io, parsed, findGame(games, save.game).show(save));
  return EXIT_OK;
}

function commandAct(parsed: Parsed, io: CliIo, games: readonly TextGame[]): number {
  const path = required(parsed, 'save');
  const text = parsed.positionals.join(' ').trim();
  if (text === '') throw new UsageError('act needs an action, e.g. act --save run.json "play 1 2 3"');
  const save = loadSave(parsed, io);
  const result = findGame(games, save.game).take(save, text);
  if (!result.ok) {
    if (parsed.flags.has('json')) {
      io.out(JSON.stringify({ ok: false, action: text, error: result.reason, state: result.view.state }));
    } else {
      io.err(`illegal action "${text}": ${result.reason}`);
      io.out(['Legal actions:', ...result.view.legalActions.map((a) => `  ${a}`)].join('\n'));
    }
    return EXIT_ILLEGAL;
  }
  // Read-only queries (e.g. previews) leave the action log as it was.
  const recorded = result.save.actions.length > save.actions.length;
  if (recorded) io.write(path, serializeSave(result.save));
  const action = recorded ? (result.save.actions.at(-1) ?? text) : text;
  if (parsed.flags.has('json')) {
    io.out(JSON.stringify({ ok: true, action, recorded, log: result.log, state: result.view.state }));
  } else if (recorded) {
    io.out([`> ${action}`, ...result.log, '', result.view.text].join('\n'));
  } else {
    // The state can't have changed, so don't reprint it.
    io.out([`> ${action}`, ...result.log, '(state unchanged; use "state" to reprint it)'].join('\n'));
  }
  return EXIT_OK;
}

function printState(io: CliIo, parsed: Parsed, view: GameView): void {
  io.out(parsed.flags.has('json') ? JSON.stringify({ ok: true, state: view.state }) : view.text);
}

function loadSave(parsed: Parsed, io: CliIo): SaveFile {
  const path = required(parsed, 'save');
  if (!io.exists(path)) throw new SaveError(`no save file at ${path}; start one with "new"`);
  return parseSave(io.read(path));
}

function findGame(games: readonly TextGame[], name: string | undefined): TextGame {
  const game = games.find((g) => g.name === name);
  if (game === undefined) throw new UsageError(`unknown game "${name ?? ''}"; known: ${games.map((g) => g.name).join(', ')}`);
  return game;
}

function required(parsed: Parsed, option: string): string {
  const value = parsed.options.get(option);
  if (value === undefined) throw new UsageError(`--${option} is required`);
  return value;
}

function parseArgs(args: readonly string[]): Parsed {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--') continue;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (VALUE_OPTIONS.has(name)) {
      const value = args[++i];
      if (value === undefined) throw new UsageError(`--${name} needs a value`);
      options.set(name, value);
    } else if (name === 'json' || name === 'force') {
      flags.add(name);
    } else {
      throw new UsageError(`unknown option --${name}`);
    }
  }
  const [command, ...rest] = positionals;
  return { command, positionals: rest, options, flags };
}
