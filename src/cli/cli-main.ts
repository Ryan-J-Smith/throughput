// Entry point for `npm run -s cli -- …`: a stateless, replay-log text interface for agents.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_GAMES } from './all-games';
import { CliIo, runCli } from './cli';

declare const process: {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  cwd(): string;
  exitCode?: number;
};

/** Real filesystem/console IO. Relative paths resolve against the directory npm was invoked from. */
class NodeIo extends CliIo {
  private readonly base = process.env.INIT_CWD ?? process.cwd();

  override exists(path: string): boolean {
    return existsSync(resolve(this.base, path));
  }

  override read(path: string): string {
    return readFileSync(resolve(this.base, path), 'utf8');
  }

  override write(path: string, text: string): void {
    writeFileSync(resolve(this.base, path), text);
  }

  override out(text: string): void {
    console.log(text);
  }

  override err(text: string): void {
    console.error(text);
  }
}

process.exitCode = runCli(process.argv.slice(2), new NodeIo(), ALL_GAMES);
