import { useEffect, useLayoutEffect } from 'react';
import type { RefObject } from 'react';

// Layout effects only mean something in a browser; on the server (renderToStaticMarkup) use the
// plain effect, which never runs there, so no warning is printed.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Fits text into a box whose size the CSS fixes: tries `data-fit="0"`, `"1"`, … up to `steps - 1`
 * (CSS sets a smaller type for each step) until nothing overflows, and failing that sets
 * `data-fit="clamp"` (CSS clamps or ellipsizes) and puts the full text in the box's title. In a
 * box with no fixed size nothing ever overflows, so it stays at "0". Re-fits when the text
 * changes, when the box resizes, and once web fonts have loaded.
 */
export function useFitText(ref: RefObject<HTMLElement | null>, text: string, steps: number): void {
  useBrowserLayoutEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const fit = () => {
      box.removeAttribute('title');
      for (let step = 0; step < steps; step++) {
        box.dataset.fit = String(step);
        if (box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1) return;
      }
      box.dataset.fit = 'clamp';
      box.title = text;
    };
    fit();
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    if (typeof ResizeObserver === 'undefined') return () => void (live = false);
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [ref, text, steps]);
}
