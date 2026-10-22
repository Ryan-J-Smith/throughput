import { Suspense, lazy } from 'react';
import { BrowserGame } from '../games';
import type { BrowserGameProps } from '../games';

// Loaded on demand so the gallery, its CSS and every review image stay out of the game's bundle.
const ArtGallery = /* @__PURE__ */ lazy(() => import('./ArtGallery').then((m) => ({ default: m.ArtGallery })));

function ArtGalleryScreen(props: BrowserGameProps) {
  return (
    <Suspense fallback={<p className="section-label">Loading the gallery…</p>}>
      <ArtGallery {...props} />
    </Suspense>
  );
}

/** Dev-only picker entry for reviewing generated art; registered behind import.meta.env.DEV. */
export class ArtGalleryBrowserGame extends BrowserGame {
  readonly id = 'art-gallery';
  readonly title = 'Art gallery (dev)';
  readonly tagline = 'Every generated illustration and icon, for review between batches. Not in production builds.';
  override readonly accent = 'teal';
  override readonly listing = 'dev';
  readonly Screen = ArtGalleryScreen;
}
