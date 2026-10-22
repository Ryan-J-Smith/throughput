// Entry point for `npm run art -- …`: generates illustrations offline with the Codex CLI and
// post-processes them into src/assets/art. See scripts/art/README.md.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACTIVE_DIRECTION, ART_ASSETS, ART_PROBES, artDirection } from '../../src/assets/art';
import type { ArtAsset, ArtDirection } from '../../src/assets/art';
import { codexArgs, codexPrompt, existingReferences, generate } from './codex-runner';
import type { GenerationRecord } from './codex-runner';
import { GENERATION_LOG, JOB_DIR, ROOT, STOP_FILE, picksFile, rawPng, readPicks, takePng, takes } from './paths';
import { processAsset, sourceImage } from './post-process';
import { writeReviewIndexes } from './review-index';

const HELP = `npm run art -- [ids…] [options]

Selects every asset (or only the ids / --batch / --probe given), generates the missing ones with
Codex and writes WebPs for the active direction into src/assets/art. Every generation is kept as a
numbered take under scripts/art/raw/<direction>/takes/; the newest take is picked automatically.

  --direction ID   art direction (default: ${ACTIVE_DIRECTION})
  --batch N        only assets in review batch N
  --probe          only the style-comparison probe subjects
  --takes N        generate N takes of each selected asset (default 1)
  --force          generate even if the asset already has a pick (needs explicit ids or --probe)
  --pick ID=N      make take N the asset's pick and reprocess it; no generation
  --dry-run        print each prompt and Codex command; generate and write nothing
  --limit N        start at most N generations this run
  --max-total N    never let the shared generation log pass N (default 500)
  --process-only   never call Codex; just (re)write WebPs from picks and the gallery indexes
  --concurrency N  parallel Codex runs (default 2; drops a lane on rate limits)

Touch scripts/art/raw/STOP to stop starting new runs; runs in flight finish.`;

type Options = {
  readonly ids: readonly string[];
  readonly direction: ArtDirection;
  readonly batch: number | undefined;
  readonly probe: boolean;
  readonly takes: number;
  readonly force: boolean;
  readonly picks: readonly (readonly [string, number])[];
  readonly dryRun: boolean;
  readonly limit: number;
  readonly maxTotal: number;
  readonly processOnly: boolean;
  readonly concurrency: number;
};

function parseArgs(argv: readonly string[]): Options | string {
  const ids: string[] = [];
  const picks: [string, number][] = [];
  let direction = artDirection(ACTIVE_DIRECTION);
  let batch: number | undefined;
  let probe = false;
  let takeCount = 1;
  let force = false;
  let dryRun = false;
  let limit = Infinity;
  let maxTotal = 500;
  let processOnly = false;
  let concurrency = 2;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    const value = () => argv[++i] ?? '';
    const number = () => {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 0) throw new Error(`${arg} needs a whole number`);
      return n;
    };
    if (arg === '--help' || arg === '-h') return HELP;
    else if (arg === '--direction') direction = artDirection(value());
    else if (arg === '--batch') batch = number();
    else if (arg === '--probe') probe = true;
    else if (arg === '--takes') takeCount = Math.max(1, number());
    else if (arg === '--force') force = true;
    else if (arg === '--pick') {
      const [id = '', take = ''] = value().split('=');
      if (!/^\d+$/.test(take)) return `--pick needs ID=N, got "${id}=${take}"`;
      picks.push([id, Number(take)]);
    } else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--limit') limit = number();
    else if (arg === '--max-total') maxTotal = number();
    else if (arg === '--process-only') processOnly = true;
    else if (arg === '--concurrency') concurrency = Math.max(1, number());
    else if (arg.startsWith('--')) return `Unknown option ${arg}\n\n${HELP}`;
    else ids.push(arg);
  }
  if (force && ids.length === 0 && !probe) return '--force makes new paid takes; name the ids (or --probe).';
  return { ids, direction, batch, probe, takes: takeCount, force, picks, dryRun, limit, maxTotal, processOnly, concurrency };
}

function select(options: Options): ArtAsset[] | string {
  const known = new Set<string>(ART_ASSETS.map((a) => a.id));
  const wanted = [...options.ids, ...options.picks.map(([id]) => id)];
  const unknown = wanted.filter((id) => !known.has(id));
  if (unknown.length > 0) return `Unknown art ids: ${unknown.join(', ')}`;
  return ART_ASSETS.filter(
    (a) =>
      (wanted.length === 0 || wanted.includes(a.id)) &&
      (options.batch === undefined || a.batch === options.batch) &&
      (!options.probe || (ART_PROBES as readonly string[]).includes(a.id)),
  );
}

function generationsSoFar(): number {
  return existsSync(GENERATION_LOG) ? readFileSync(GENERATION_LOG, 'utf8').split('\n').filter((l) => l.trim() !== '').length : 0;
}

/** Makes `take` the asset's pick: copies it to raw/<direction>/<id>.png and records it. */
function pick(asset: ArtAsset, direction: ArtDirection, take: number): void {
  const file = picksFile(asset, direction);
  const picks = readPicks(file);
  picks[asset.id] = take;
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(picks, null, 2)}\n`);
  copyFileSync(takePng(asset, direction, take), rawPng(asset, direction));
}

async function processOne(asset: ArtAsset, direction: ArtDirection): Promise<void> {
  const input = sourceImage(asset, direction);
  if (input === undefined) return;
  for (const o of await processAsset(asset, direction, input)) console.log(`  ${asset.id} → ${relative(ROOT, o.path)} (${Math.round(o.bytes / 1024)} KB)`);
}

type Job = { readonly asset: ArtAsset; readonly take: number };

const RATE_LIMITED = /rate.?limit|429|quota|usage limit|too many requests|try again later/i;
const BACKOFF_MS = 60_000;
const MAX_ATTEMPTS = 2;

/**
 * Runs `jobs` with up to `concurrency` Codex runs at once, never starting one while the STOP file
 * exists or once the shared log reaches `maxTotal`. A failed job is retried once; a failure that
 * looks like a rate limit also drops a lane and pauses that lane for a minute.
 */
async function runJobs(jobs: readonly Job[], options: Options, onDone: (job: Job, record: GenerationRecord) => Promise<void>): Promise<string | null> {
  const queue = [...jobs];
  const attempts = new Map<Job, number>();
  let lanes = options.concurrency;
  let halted: string | null = null;
  const lane = async (index: number) => {
    while (index < lanes && halted === null) {
      if (existsSync(STOP_FILE)) halted = `stopped by ${relative(ROOT, STOP_FILE)}`;
      else if (generationsSoFar() >= options.maxTotal) halted = `generation log reached --max-total ${options.maxTotal}`;
      const job = halted === null ? queue.shift() : undefined;
      if (job === undefined) return;
      console.log(`  … ${job.asset.id} take ${job.take}`);
      let record: GenerationRecord;
      try {
        record = await generate(job.asset, options.direction, job.take);
      } catch (error) {
        console.log(`  ✗ ${job.asset.id} take ${job.take}: ${String(error)}`);
        continue;
      }
      await onDone(job, record);
      if (record.ok) continue;
      const tries = (attempts.get(job) ?? 0) + 1;
      attempts.set(job, tries);
      if (tries < MAX_ATTEMPTS) queue.push(job);
      if (RATE_LIMITED.test(record.problems.join('\n'))) {
        lanes = Math.max(1, lanes - 1);
        console.log(`  rate limited: down to ${lanes} lane(s), pausing ${BACKOFF_MS / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, jobs.length) }, (_, i) => lane(i)));
  return halted;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (typeof options === 'string') {
    console.log(options);
    process.exitCode = options === HELP ? 0 : 2;
    return;
  }
  const assets = select(options);
  if (typeof assets === 'string') {
    console.error(assets);
    process.exitCode = 2;
    return;
  }
  const direction = options.direction;

  for (const [id, take] of options.picks) {
    const asset = assets.find((a) => a.id === id);
    if (asset === undefined || !existsSync(takePng(asset, direction, take))) {
      console.error(`No take ${take} of ${id} in ${direction.id}`);
      process.exitCode = 2;
      return;
    }
    pick(asset, direction, take);
    await processOne(asset, direction);
  }
  if (options.picks.length > 0) {
    await writeReviewIndexes();
    return;
  }

  const wanted = options.processOnly ? [] : assets.filter((a) => options.force || !existsSync(rawPng(a, direction)));
  const jobs: Job[] = wanted.flatMap((asset) => {
    const first = (takes(asset, direction).at(-1) ?? 0) + 1;
    return Array.from({ length: options.takes }, (_, i) => ({ asset, take: first + i }));
  });
  const room = Math.max(0, options.maxTotal - generationsSoFar());
  const toRun = jobs.slice(0, Math.min(options.limit, room));

  if (options.dryRun) {
    for (const { asset, take } of toRun) {
      const refs = existingReferences(asset, direction);
      console.log(`=== ${asset.id} take ${take} (${asset.kind}, batch ${asset.batch}, ${direction.id})`);
      console.log(`$ codex ${codexArgs(`${relative(ROOT, JOB_DIR)}/${direction.id}/${asset.id}.${take}`, refs.map((r) => relative(ROOT, r))).join(' ')}  < prompt`);
      console.log(codexPrompt(asset, direction, refs));
      console.log();
    }
    console.log(`Would run ${toRun.length} of ${jobs.length} generations; ${generationsSoFar()} logged so far (max ${options.maxTotal}).`);
    return;
  }

  console.log(`${direction.id}: ${toRun.length} generations (${options.concurrency} at a time); ${generationsSoFar()} logged before this run.`);
  const failed = new Set<string>();
  const halted = await runJobs(toRun, options, async ({ asset, take }, record) => {
    const shape = record.ok ? `${record.width}×${record.height}, ${record.channels} channels` : 'FAILED';
    console.log(`  ${record.ok ? '✓' : '✗'} ${asset.id} take ${take} in ${record.seconds}s (${shape})${record.problems.length > 0 ? `\n    ${record.problems.join('\n    ')}` : ''}`);
    if (!record.ok) {
      failed.add(`${asset.id}.${take}`);
      return;
    }
    failed.delete(`${asset.id}.${take}`);
    pick(asset, direction, take);
    await processOne(asset, direction);
  });
  if (halted !== null) console.log(`Halted: ${halted}.`);

  // Assets not generated this run are reprocessed so WebPs follow manifest and pipeline changes.
  const generated = new Set(toRun.map((j) => j.asset));
  for (const asset of assets.filter((a) => !generated.has(a))) await processOne(asset, direction);

  await writeReviewIndexes();
  const missing = assets.filter((a) => sourceImage(a, direction) === undefined).map((a) => a.id);
  if (missing.length > 0) console.log(`No pick yet in ${direction.id}: ${missing.join(', ')}`);
  console.log(`${generationsSoFar()} generations logged in ${relative(ROOT, GENERATION_LOG)}.`);
  if (failed.size > 0) {
    console.log(`Failed: ${[...failed].join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
