import type { ArtId } from './manifest';

/**
 * Each image is post-processed two ways: `plain` (as generated, resized) and `remap` (snapped to
 * the ink palette). The game ships one; the dev Art gallery compares both.
 */
export type ArtVariant = 'plain' | 'remap';

export const ART_VARIANTS: readonly ArtVariant[] = ['plain', 'remap'];

// URLs only: an image downloads when something renders it, not when this module loads. The game's
// variant is a literal because import.meta.glob patterns must be static. Art for retired content is
// excluded so the build doesn't ship it; the dev gallery still shows it by URL.
const GAME = import.meta.glob<string>(['./plain/*.webp', '!./plain/card-wholesale-club.webp'], { eager: true, query: '?url', import: 'default' });

/** The game's illustration for `id`, or undefined while it has not been generated yet. */
export function artUrl(id: ArtId): string | undefined {
  return GAME[`./plain/${id}.webp`];
}

/** Like artUrl, for ids built by naming convention (e.g. `fixture-${def.id}`); unknown ids give undefined. */
export function artUrlFor(id: string): string | undefined {
  return GAME[`./plain/${id}.webp`];
}
