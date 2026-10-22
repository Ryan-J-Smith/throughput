// Review-only art lookups for the dev Art gallery. Images are referenced by dev-server URL from
// the indexes `npm run art` writes, never imported, so no review image is emitted into a build.
// Only the gallery uses this package, and the gallery is only registered on the dev server.
import { ACTIVE_DIRECTION, isGameArt } from '..';
import type { ArtAsset, ArtVariant } from '..';

type ReviewIndex = { readonly variants: Readonly<Record<string, readonly string[]>>; readonly experiments: Readonly<Record<string, readonly string[]>> };
type RawEntry = { readonly takes: readonly number[]; readonly pick: number | null };
type RawIndex = Readonly<Record<string, Readonly<Record<string, RawEntry>>>>;

// Globs rather than imports so a missing index (the raw one is gitignored) just reads as empty.
const INDEX: ReviewIndex = Object.values(import.meta.glob<ReviewIndex>('../review-index.json', { eager: true, import: 'default' }))[0] ?? {
  variants: {},
  experiments: {},
};
const RAW: RawIndex = Object.values(import.meta.glob<RawIndex>('/scripts/art/raw/index.json', { eager: true, import: 'default' }))[0] ?? {};

const ART = '/src/assets/art';
const RAW_URL = '/scripts/art/raw';

/** One processed variant of an asset (game art or a review-only sheet), or undefined if not generated. */
export function reviewUrl(asset: ArtAsset, variant: ArtVariant): string | undefined {
  if (isGameArt(asset)) return INDEX.variants[asset.id]?.includes(variant) === true ? `${ART}/${variant}/${asset.id}.webp` : undefined;
  return INDEX.experiments[asset.id]?.includes(`${variant}.webp`) === true ? `${ART}/experiments/${asset.id}/${variant}.webp` : undefined;
}

export type TakeView = { readonly take: number; readonly url: string; readonly picked: boolean };

/** The raw folder an asset's takes live in for `direction` (icon sheets have no direction). */
export function rawFolder(asset: ArtAsset, direction: string = ACTIVE_DIRECTION): string {
  return asset.template === 'silhouettes' ? 'silhouettes' : direction;
}

/** Previews of every take of `asset` in `direction` (raw folder, this machine only), the pick flagged. */
export function takeViews(asset: ArtAsset, direction: string = ACTIVE_DIRECTION): readonly TakeView[] {
  const folder = rawFolder(asset, direction);
  const entry = RAW[folder]?.[asset.id];
  if (entry === undefined) return [];
  return entry.takes.map((take) => ({ take, url: `${RAW_URL}/${folder}/previews/${asset.id}.${take}.webp`, picked: take === entry.pick }));
}

export type ExperimentFile = { readonly path: string; readonly url: string };

/** Files under src/assets/art/experiments/<name>/, sorted by path. */
export function experimentFiles(name: string): readonly ExperimentFile[] {
  return (INDEX.experiments[name] ?? []).map((path) => ({ path, url: `${ART}/experiments/${name}/${path}` }));
}
