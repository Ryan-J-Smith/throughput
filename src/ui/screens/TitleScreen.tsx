export type TitleScreenProps = {
  onStart: () => void;
};

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <main className="screen screen--title">
      <h1 className="title-logo">stratgame</h1>
      <p className="title-tagline">Build the business. Beat the quarter.</p>
      <button type="button" className="btn btn--play btn--large" onClick={onStart}>
        New Run
      </button>
    </main>
  );
}
