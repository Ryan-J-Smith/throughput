// Entry point for `npm run sim`: headless bot simulations printed as compact tables.
//   npm run sim -- --help
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_SCENARIOS } from './all-scenarios';
import { SimIo, runSimCli } from './sim-command';

// Only what this script needs from Node; the project does not ship @types/node.
declare const process: {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  cwd(): string;
  exitCode?: number;
};

/** Console output, and CSV files resolved against the directory npm was invoked from. */
class NodeSimIo extends SimIo {
  private readonly base = process.env.INIT_CWD ?? process.cwd();

  override out(text: string): void {
    console.log(text);
  }

  override err(text: string): void {
    console.error(text);
  }

  override write(path: string, text: string): void {
    writeFileSync(resolve(this.base, path), text);
  }
}

process.exitCode = runSimCli(process.argv.slice(2), new NodeSimIo(), ALL_SCENARIOS);
