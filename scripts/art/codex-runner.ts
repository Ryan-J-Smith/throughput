import { spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { artPrompt, artReferences } from '../../src/assets/art';
import type { ArtAsset, ArtDirection } from '../../src/assets/art';
import { GENERATION_LOG, JOB_DIR, LOG_DIR, REFERENCE_DIR, takePng } from './paths';

const TIMEOUT_MS = 10 * 60 * 1000;

/** One Codex generation, as appended to raw/generations.jsonl. */
export type GenerationRecord = {
  readonly id: string;
  readonly direction: string;
  readonly take: number;
  readonly startedAt: string;
  readonly seconds: number;
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly width?: number;
  readonly height?: number;
  readonly channels?: number;
  readonly hasAlpha?: boolean;
  /** The `usage` object from Codex's turn.completed event. */
  readonly usage?: unknown;
  /** Errors, failed turns and any stderr line mentioning limits, quota or usage. */
  readonly problems: readonly string[];
};

/** Reference files that exist, as absolute paths (a direction's style sheet only exists once generated). */
export function existingReferences(asset: ArtAsset, direction: ArtDirection): string[] {
  return artReferences(asset, direction)
    .map((file) => join(REFERENCE_DIR, file))
    .filter((path) => existsSync(path));
}

/** The whole prompt Codex receives: the asset's image prompt plus where to save the result. */
export function codexPrompt(asset: ArtAsset, direction: ArtDirection, references: readonly string[]): string {
  const refNote = references.length > 0 ? ', using the attached images as style references only (match their rendering, materials and lighting quality, but use the accent colours given above and do not copy their subjects or layout)' : '';
  return [
    artPrompt(asset, direction),
    '',
    `Use your built-in image generation tool to create exactly one image for the prompt above${refNote}.`,
    `Save it in the current working directory as "${asset.id}.png", exactly as generated (keep any alpha channel; do not resize, crop or edit it).`,
    'Do not create any other files and do not ask questions.',
  ].join('\n');
}

export function codexArgs(jobDir: string, references: readonly string[]): string[] {
  // No PROMPT argument: Codex reads it from stdin, so `-i` can't swallow it as another image.
  return [
    'exec', '-C', jobDir, '--skip-git-repo-check', '-s', 'workspace-write', '--ephemeral', '--json',
    '-o', join(jobDir, 'last-message.txt'),
    ...references.flatMap((path) => ['-i', path]),
  ];
}

/** Runs one Codex generation of `asset` in `direction`, saves it as take `take` and logs the run. */
export async function generate(asset: ArtAsset, direction: ArtDirection, take: number): Promise<GenerationRecord> {
  const jobDir = join(JOB_DIR, direction.id, `${asset.id}.${take}`);
  rmSync(jobDir, { recursive: true, force: true });
  mkdirSync(jobDir, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const references = existingReferences(asset, direction);

  const run = await runCodex(codexArgs(jobDir, references), codexPrompt(asset, direction, references));
  const seconds = Math.round((Date.now() - startedAt.getTime()) / 100) / 10;
  const logName = `${direction.id}-${asset.id}.${take}-${stamp}`;
  writeFileSync(join(LOG_DIR, `${logName}.jsonl`), run.stdout);
  writeFileSync(join(LOG_DIR, `${logName}.stderr.txt`), run.stderr);

  const events = parseEvents(run.stdout);
  const problems = [...eventProblems(events), ...stderrProblems(run.stderr)];
  if (run.timedOut) problems.push(`timed out after ${TIMEOUT_MS / 1000}s`);
  const usage = events.find((e) => e.type === 'turn.completed')?.usage;
  const threadId = events.find((e) => e.type === 'thread.started')?.thread_id;
  const base = { id: asset.id, direction: direction.id, take, startedAt: startedAt.toISOString(), seconds, exitCode: run.code, signal: run.signal, usage };

  const found = findPng(jobDir, asset.id, typeof threadId === 'string' ? threadId : undefined);
  let record: GenerationRecord;
  if (found === undefined) {
    problems.push('no PNG was saved');
    record = { ...base, ok: false, problems };
  } else {
    const target = takePng(asset, direction, take);
    mkdirSync(join(target, '..'), { recursive: true });
    copyFileSync(found, target);
    const meta = await sharp(target).metadata();
    record = {
      ...base,
      ok: true,
      ...(meta.width !== undefined ? { width: meta.width } : {}),
      ...(meta.height !== undefined ? { height: meta.height } : {}),
      ...(meta.channels !== undefined ? { channels: meta.channels } : {}),
      hasAlpha: meta.hasAlpha === true,
      problems,
    };
  }
  appendFileSync(GENERATION_LOG, `${JSON.stringify(record)}\n`);
  rmSync(jobDir, { recursive: true, force: true });
  return record;
}

type RunResult = { readonly code: number | null; readonly signal: string | null; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean };

function runCodex(args: readonly string[], prompt: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, TIMEOUT_MS);
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

type CodexEvent = { readonly type?: unknown; readonly [key: string]: unknown };

function parseEvents(stdout: string): CodexEvent[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as CodexEvent];
      } catch {
        return [];
      }
    });
}

function eventProblems(events: readonly CodexEvent[]): string[] {
  return events
    .filter((e) => e.type === 'error' || e.type === 'turn.failed' || (isRecord(e.item) && e.item.type === 'error'))
    .map((e) => JSON.stringify(e).slice(0, 500));
}

function stderrProblems(stderr: string): string[] {
  return stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /limit|quota|usage|rate|exceed|error/i.test(line));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The saved PNG: the requested name, else any PNG in the job dir, else the newest one Codex kept for this thread. */
function findPng(jobDir: string, id: string, threadId: string | undefined): string | undefined {
  const named = join(jobDir, `${id}.png`);
  if (existsSync(named)) return named;
  const local = newestPng(jobDir);
  if (local !== undefined) return local;
  const home = process.env.HOME;
  if (home === undefined || threadId === undefined) return undefined;
  const kept = join(home, '.codex/generated_images', threadId);
  return existsSync(kept) ? newestPng(kept) : undefined;
}

function newestPng(dir: string): string | undefined {
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
