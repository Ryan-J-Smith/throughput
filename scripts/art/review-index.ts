import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { ART_DIR, RAW_DIR, readPicks } from './paths';

const PREVIEW_EDGE = 320;
/** Raw folders that aren't a direction or the icon sheets. */
const NOT_ART = new Set(['jobs', 'logs']);

/**
 * Rewrites the indexes the dev Art gallery reads. The gallery loads images by dev-server URL
 * from these lists instead of importing them, so no review image is ever emitted into a build.
 * - src/assets/art/review-index.json (committed): processed variants and experiment files.
 * - scripts/art/raw/index.json (gitignored): every take per folder and id, with the pick, and a
 *   small WebP preview of each take under <folder>/previews/.
 */
export async function writeReviewIndexes(): Promise<void> {
  const variants: Record<string, string[]> = {};
  for (const variant of ['plain', 'remap']) {
    for (const file of filesIn(join(ART_DIR, variant), '.webp')) (variants[file.replace(/\.webp$/, '')] ??= []).push(variant);
  }
  const experiments: Record<string, string[]> = {};
  const experimentDir = join(ART_DIR, 'experiments');
  if (existsSync(experimentDir)) {
    for (const name of readdirSync(experimentDir).sort()) experiments[name] = filesUnder(join(experimentDir, name));
  }
  writeFileSync(join(ART_DIR, 'review-index.json'), `${JSON.stringify({ variants, experiments }, null, 2)}\n`);

  if (!existsSync(RAW_DIR)) return;
  const raw: Record<string, Record<string, { takes: number[]; pick: number | null }>> = {};
  for (const folder of readdirSync(RAW_DIR).sort()) {
    const takesDir = join(RAW_DIR, folder, 'takes');
    if (NOT_ART.has(folder) || !existsSync(takesDir)) continue;
    const picks = readPicks(join(RAW_DIR, folder, 'picks.json'));
    const previews = join(RAW_DIR, folder, 'previews');
    mkdirSync(previews, { recursive: true });
    const entries: Record<string, { takes: number[]; pick: number | null }> = {};
    for (const file of filesIn(takesDir, '.png')) {
      const match = /^(.+)\.(\d+)\.png$/.exec(file);
      if (match === null) continue;
      const [, id = '', take = '0'] = match;
      const preview = join(previews, file.replace(/\.png$/, '.webp'));
      if (!existsSync(preview)) await sharp(join(takesDir, file)).resize(PREVIEW_EDGE).webp({ quality: 75 }).toFile(preview);
      const entry = (entries[id] ??= { takes: [], pick: picks[id] ?? null });
      entry.takes.push(Number(take));
    }
    for (const entry of Object.values(entries)) entry.takes.sort((a, b) => a - b);
    raw[folder] = entries;
  }
  writeFileSync(join(RAW_DIR, 'index.json'), `${JSON.stringify(raw, null, 2)}\n`);
}

function filesIn(dir: string, extension: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(extension)).sort() : [];
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(webp|png|svg)$/.test(entry)) out.push(relative(dir, path));
    }
  };
  walk(dir);
  return out;
}
