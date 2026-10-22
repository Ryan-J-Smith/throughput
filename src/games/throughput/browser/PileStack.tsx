import './piles.css';

export type PileStackProps = {
  /** Cards left to draw. */
  draw: number;
  /** Cards in the discard pile. */
  discard: number;
  /** A short status after the counts, e.g. "Restock ready". */
  note?: string;
};

/** How many card backs a pile shows stacked (0 to 4), so a glance says roughly how much is left. */
export function pileDepth(count: number): number {
  return count <= 0 ? 0 : Math.min(4, Math.ceil(count / 5));
}

/**
 * The draw pile as a little stack of card backs with its count, beside a smaller discard stack.
 * Display only: the label says it all in words.
 */
export function PileStack({ draw, discard, note }: PileStackProps) {
  const label = `Draw pile ${draw}, ${discard} discarded${note === undefined ? '' : `, ${note}`}`;
  return (
    <span className="tp-piles" role="img" aria-label={label}>
      <Pile kind="draw" count={draw} />
      <Pile kind="discard" count={discard} />
      {note !== undefined && <span className="tp-piles__note">{note}</span>}
    </span>
  );
}

function Pile({ kind, count }: { kind: 'draw' | 'discard'; count: number }) {
  return (
    <span className={`tp-pile tp-pile--${kind}`} data-depth={pileDepth(count)}>
      <span className="tp-pile__count">{count}</span>
    </span>
  );
}
