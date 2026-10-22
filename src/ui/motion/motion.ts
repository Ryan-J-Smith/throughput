// Imperative motion helpers for moments CSS alone can't express (moving between containers).
// All of them do nothing when the player prefers reduced motion or the DOM lacks the Web
// Animations API, so callers never need to check.

export type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

export function prefersReducedMotion(): boolean {
  return typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** A motion duration token from theme/tokens.css (e.g. "--dur-slow"), in milliseconds. */
export function durationToken(name: string, fallbackMs: number): number {
  if (typeof document === 'undefined') return fallbackMs;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ms = raw.endsWith('ms') ? parseFloat(raw) : raw.endsWith('s') ? parseFloat(raw) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : fallbackMs;
}

function canAnimate(): boolean {
  return !prefersReducedMotion() && typeof document !== 'undefined' && typeof document.body.animate === 'function';
}

export type FlyOptions = {
  durationMs?: number;
  delayMs?: number;
  /** Peak height of the arc above the straight line, in px. */
  arc?: number;
  rotate?: number;
  /** Fade out on arrival (e.g. into a pile that has no element). */
  fadeOut?: boolean;
};

/**
 * Flies a snapshot of `source` from where it is now to `target`, then removes the snapshot.
 * The real element is untouched, so the app's state can update underneath immediately.
 */
export function flyGhost(source: Element, target: Box, options: FlyOptions = {}): Promise<void> {
  if (!canAnimate()) return Promise.resolve();
  const { durationMs = durationToken('--dur-slow', 480), delayMs = 0, arc = 70, rotate = 0, fadeOut = false } = options;
  const from = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('motion-ghost');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '300',
    pointerEvents: 'none',
    transformOrigin: 'top left',
  });
  document.body.appendChild(ghost);

  const dx = target.left - from.left;
  const dy = target.top - from.top;
  const scale = from.width > 0 ? Math.min(target.width / from.width, target.height / Math.max(1, from.height)) : 1;
  const animation = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      {
        transform: `translate(${dx / 2}px, ${dy / 2 - arc}px) scale(${(1 + scale) / 2}) rotate(${rotate / 2}deg)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${rotate}deg)`, opacity: fadeOut ? 0 : 1 },
    ],
    { duration: durationMs, delay: delayMs, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'forwards' },
  );
  const done = () => ghost.remove();
  return animation.finished.then(done, done);
}

/** A short shake of `element`, for big moments. */
export function shake(element: Element | null, strengthPx = 5): void {
  if (element === null || !canAnimate()) return;
  const s = strengthPx;
  element.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-s}px, ${s / 2}px)` },
      { transform: `translate(${s}px, ${-s / 2}px)` },
      { transform: `translate(${-s / 2}px, ${-s / 3}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: durationToken('--dur-med', 240) * 1.25, easing: 'ease-out' },
  );
}
