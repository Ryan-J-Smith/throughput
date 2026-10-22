import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TooltipView } from '../types';

export type TooltipProps = {
  tooltip: TooltipView;
  children: ReactNode;
};

/**
 * Shows `tooltip` while a mouse hovers or keyboard focus is inside, and pins it open via the
 * "i" toggle for touch. Pinned tooltips close on any outside tap.
 */
export function Tooltip({ tooltip, children }: TooltipProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (anchor.current && e.target instanceof Node && !anchor.current.contains(e.target)) setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinned]);

  const open = hovered || focused || pinned;

  return (
    <div
      ref={anchor}
      className={`tooltip-anchor ${open ? 'tooltip-anchor--open' : ''}`}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {children}
      <button
        type="button"
        className="tooltip-toggle"
        aria-label="Details"
        aria-expanded={pinned}
        onClick={() => setPinned((p) => !p)}
      >
        i
      </button>
      {open && (
        <div id={id} role="tooltip" className={`tooltip ${pinned ? 'tooltip--pinned' : ''}`}>
          <p className="tooltip__body">{tooltip.body}</p>
          {tooltip.glossary.length > 0 && (
            <dl className="tooltip__glossary">
              {tooltip.glossary.map((entry) => (
                <div key={entry.term} className="tooltip__entry">
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
