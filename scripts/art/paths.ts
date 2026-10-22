import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVE_DIRECTION, isGameArt } from '../../src/assets/art';
import type { ArtAsset, ArtDirection, ArtVariant } from '../../src/assets/art';

/** npm runs scripts from the package root. */
export const ROOT = process.cwd();
/** Committed style references, one folder per direction. */
export const REFERENCE_DIR = join(ROOT, 'scripts/art/reference');
/** Generated PNGs, takes, previews, logs and Codex scratch dirs; gitignored. */
export const RAW_DIR = join(ROOT, 'scripts/art/raw');
export const LOG_DIR = join(RAW_DIR, 'logs');
export const JOB_DIR = join(RAW_DIR, 'jobs');
/** While this file exists no new Codex run starts (runs in flight finish). */
export const STOP_FILE = join(RAW_DIR, 'STOP');
/** One JSON line per Codex generation, kept across runs: the single counter for the generation budget. */
export const GENERATION_LOG = join(RAW_DIR, 'generations.jsonl');
export const ART_DIR = join(ROOT, 'src/assets/art');

/** Raw files for `asset` in `direction`; silhouette sheets have no direction. */
export function rawDir(asset: ArtAsset, direction: ArtDirection): string {
  return join(RAW_DIR, asset.template === 'silhouettes' ? 'silhouettes' : direction.id);
}

/** The picked take, which is what gets processed. */
export function rawPng(asset: ArtAsset, direction: ArtDirection): string {
  return join(rawDir(asset, direction), `${asset.id}.png`);
}

/** Every generation is kept as a numbered take. */
export function takePng(asset: ArtAsset, direction: ArtDirection, take: number): string {
  return join(rawDir(asset, direction), 'takes', `${asset.id}.${take}.png`);
}

/** Take numbers already on disk for `asset`, ascending. */
export function takes(asset: ArtAsset, direction: ArtDirection): number[] {
  const dir = join(rawDir(asset, direction), 'takes');
  if (!existsSync(dir)) return [];
  const prefix = `${asset.id}.`;
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
    .map((f) => Number(f.slice(prefix.length, -'.png'.length)))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

export function picksFile(asset: ArtAsset, direction: ArtDirection): string {
  return join(rawDir(asset, direction), 'picks.json');
}

export function readPicks(file: string): Record<string, number> {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>) : {};
}

/** Only the active direction (and the direction-free icon sheets) write into src/; others stay in raw/. */
export function writesToSrc(asset: ArtAsset, direction: ArtDirection): boolean {
  return asset.template === 'silhouettes' || (direction.id === ACTIVE_DIRECTION && direction.archived !== true);
}

/** Where a processed variant goes: src/assets/art/<variant>/<id>.webp, or experiments/<id>/<variant>.webp. */
export function outputWebp(asset: ArtAsset, variant: ArtVariant): string {
  return isGameArt(asset) ? join(ART_DIR, variant, `${asset.id}.webp`) : join(ART_DIR, 'experiments', asset.id, `${variant}.webp`);
}
