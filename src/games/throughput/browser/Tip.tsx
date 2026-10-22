import type { TipId } from './tips';
import './tips.css';

export type TipProps = {
  id: TipId;
  text: string;
  /** Hides this tip for good. */
  onDone: () => void;
  /** Hides every tip for good. */
  onTurnOff: () => void;
};

/** A first-run tip next to the thing it explains. */
export function Tip({ id, text, onDone, onTurnOff }: TipProps) {
  return (
    <aside className="tp-tip" data-tip={id} aria-label="Tip">
      <p className="tp-tip__text" aria-live="polite">
        {text}
      </p>
      <div className="tp-tip__actions">
        <button type="button" className="btn tp-tip__done" onClick={onDone}>
          Got it
        </button>
        <button type="button" className="tp-tip__off" onClick={onTurnOff}>
          Turn off tips
        </button>
      </div>
    </aside>
  );
}
