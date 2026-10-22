import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ART_INKS, ART_PAPER } from '../../src/assets/art';
import type { ArtAsset, ArtDirection, ArtVariant } from '../../src/assets/art';
import { REFERENCE_DIR, outputWebp, rawPng, writesToSrc } from './paths';

const QUALITY: Readonly<Record<ArtVariant, number>> = { plain: 78, remap: 82 };
/** Edge of the style references attached to prompts (style-sheet.jpg is written from the generated sheet). */
const REFERENCE_EDGE = 768;

/** The picked take of `asset` in `direction`, if there is one. */
export function sourceImage(asset: ArtAsset, direction: ArtDirection): string | undefined {
  const path = rawPng(asset, direction);
  return existsSync(path) ? path : undefined;
}

export type Processed = { readonly variant: ArtVariant; readonly path: string; readonly bytes: number };

/**
 * Writes every variant of `asset` as WebP into src/ (active direction only): as generated, plus the
 * ink remap when the direction asks for it. A style sheet also becomes its direction's reference.
 */
export async function processAsset(asset: ArtAsset, direction: ArtDirection, input: string): Promise<Processed[]> {
  if (!writesToSrc(asset, direction)) return [];
  const variants: ArtVariant[] = asset.kind !== 'sprite' && direction.remap === true ? ['plain', 'remap'] : ['plain'];
  const results: Processed[] = [];
  for (const variant of variants) {
    const out = outputWebp(asset, variant);
    mkdirSync(join(out, '..'), { recursive: true });
    const resized = sharp(input).resize(asset.size, outputHeight(asset), { fit: 'cover' });
    const info =
      variant === 'plain'
        ? await resized.webp({ quality: QUALITY.plain, effort: 6 }).toFile(out)
        : await remapToInks(resized).then((img) => img.webp({ quality: QUALITY.remap, effort: 6 }).toFile(out));
    results.push({ variant, path: out, bytes: info.size });
  }
  if (asset.kind === 'style') {
    mkdirSync(join(REFERENCE_DIR, direction.id), { recursive: true });
    await sharp(input).resize(REFERENCE_EDGE, REFERENCE_EDGE).jpeg({ quality: 86, mozjpeg: true }).toFile(join(REFERENCE_DIR, direction.id, `${asset.id}.jpg`));
  }
  return results;
}

export function outputHeight(asset: ArtAsset): number {
  return asset.aspect === 'landscape' ? Math.round((asset.size * 2) / 3) : asset.size;
}

type Rgb = readonly [number, number, number];
type Lab = readonly [number, number, number];

/** Paper, each ink, and each ink as a 50% halftone tint over paper. */
export function remapPalette(): readonly Rgb[] {
  const paper = hexRgb(ART_PAPER.hex);
  const inks = ART_INKS.map((ink) => hexRgb(ink.hex));
  const half = (a: number, b: number) => Math.round((a + b) / 2);
  const tints = inks.map(([r, g, b]): Rgb => [half(r, paper[0]), half(g, paper[1]), half(b, paper[2])]);
  return [paper, ...inks, ...tints];
}

/** Snaps every pixel to the nearest palette colour in OKLab, with no dithering (flat spot colours). */
async function remapToInks(image: sharp.Sharp): Promise<sharp.Sharp> {
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const palette = remapPalette();
  const labs = palette.map(([r, g, b]) => oklab(r, g, b));
  const pixels = new Uint8Array(data);
  const cache = new Map<number, number>();
  for (let p = 0; p < pixels.length; p += 3) {
    const r = pixels[p] ?? 0;
    const g = pixels[p + 1] ?? 0;
    const b = pixels[p + 2] ?? 0;
    const key = (r << 16) | (g << 8) | b;
    let best = cache.get(key);
    if (best === undefined) {
      best = nearest(oklab(r, g, b), labs);
      cache.set(key, best);
    }
    const [pr, pg, pb] = palette[best] ?? [0, 0, 0];
    pixels[p] = pr;
    pixels[p + 1] = pg;
    pixels[p + 2] = pb;
  }
  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 3 } });
}

function nearest(lab: Lab, labs: readonly Lab[]): number {
  let best = 0;
  let bestDistance = Infinity;
  labs.forEach((candidate, i) => {
    const d = (lab[0] - candidate[0]) ** 2 + (lab[1] - candidate[1]) ** 2 + (lab[2] - candidate[2]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB (0–255) to OKLab. */
function oklab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
