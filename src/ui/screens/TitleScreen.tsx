export type TitleScreenProps = {
  onStart: () => void;
};

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <main className="screen screen--title">
      <div className="title-box" data-accent="red">
        <div className="title-box__band" aria-hidden="true" />
        <h1 className="title-logo">
          <span>Shelf</span>
          <span>Life</span>
        </h1>
        <p className="title-tagline">Make things. Price them. Ship them before the quarter closes.</p>
        <div className="title-box__footer" aria-hidden="true">
          <span className="title-box__barcode" />
          <span className="title-box__small">Contents: one company. Best before the market turns.</span>
        </div>
      </div>
      <button type="button" className="btn btn--play btn--large" onClick={onStart}>
        New run
      </button>
    </main>
  );
}
