import { useState } from 'react';
import { ACTIVE_DIRECTION, ART_ASSETS, ART_DIRECTIONS, ART_PROBES, artDirection, artPrompt } from '../../assets/art';
import type { ArtAsset, ArtVariant } from '../../assets/art';
import { experimentFiles, reviewUrl, takeViews } from '../../assets/art/review';
import type { ExperimentFile, TakeView } from '../../assets/art/review';
import { ICON_NAMES, Icon } from '../icons';
import type { BrowserGameProps } from '../games';
import './gallery.css';

type Show = ArtVariant | 'both';

const SHOW_LABEL: Readonly<Record<Show, string>> = { plain: 'As generated', remap: 'Ink remap', both: 'Side by side' };

/** Dev-only review screen: direction comparison, every manifest asset by batch, icons and experiments. */
export function ArtGallery(_props: BrowserGameProps) {
  const [show, setShow] = useState<Show>('plain');
  const active = artDirection(ACTIVE_DIRECTION);
  const batches = [...new Set(ART_ASSETS.map((a) => a.batch))].sort((a, b) => a - b);
  const done = ART_ASSETS.filter((a) => reviewUrl(a, 'plain') !== undefined).length;

  return (
    <main className="screen gallery">
      <header className="gallery__head">
        <h1 className="gallery__title">Art gallery</h1>
        <p className="gallery__note">
          Dev only. Direction: <strong>{active.name}</strong>. {done} of {ART_ASSETS.length} assets processed. The small copy is roughly card size;
          takes come from this machine's raw folder.
        </p>
        <div className="gallery__show" role="radiogroup" aria-label="Variant">
          {(Object.keys(SHOW_LABEL) as Show[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={show === s} className={`gallery__pill ${show === s ? 'is-on' : ''}`} onClick={() => setShow(s)}>
              {SHOW_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      <DirectionComparison />

      {batches.map((batch) => (
        <section key={batch} className="gallery__batch" aria-labelledby={`gallery-batch-${batch}`}>
          <h2 id={`gallery-batch-${batch}`} className="section-label">
            Batch {batch}
          </h2>
          <ul className={`gallery__grid ${show === 'both' ? 'gallery__grid--both' : ''}`}>
            {ART_ASSETS.filter((a) => a.batch === batch).map((asset) => (
              <AssetTile key={asset.id} asset={asset} show={show} />
            ))}
          </ul>
        </section>
      ))}

      <IconSet />
      <IconSheetExperiment name="icon-sheet" />
      <IconSheetExperiment name="icon-sheet-2" />
    </main>
  );
}

/** The probe subjects in every direction, side by side. */
function DirectionComparison() {
  const probes = ART_ASSETS.filter((a) => (ART_PROBES as readonly string[]).includes(a.id));
  return (
    <section className="gallery__batch" aria-labelledby="gallery-directions">
      <h2 id="gallery-directions" className="section-label">
        Style comparison
      </h2>
      <div className="gallery__compare" style={{ gridTemplateColumns: `repeat(${ART_DIRECTIONS.length}, minmax(0, 1fr))` }}>
        {ART_DIRECTIONS.map((d) => (
          <div key={d.id} className="gallery__direction">
            <strong>
              {d.name}
              {d.id === ACTIVE_DIRECTION ? ' (active)' : ''}
            </strong>
            <span>{d.note}</span>
          </div>
        ))}
        {probes.map((asset) =>
          ART_DIRECTIONS.map((d) => (
            <div key={`${asset.id}-${d.id}`} className="gallery__compare-cell">
              <code className="gallery__id">{asset.id}</code>
              <Takes takes={takeViews(asset, d.id)} large />
            </div>
          )),
        )}
      </div>
    </section>
  );
}

function Takes({ takes, large = false }: { takes: readonly TakeView[]; large?: boolean }) {
  if (takes.length === 0) return <div className="gallery__missing">No takes</div>;
  return (
    <div className="gallery__takes">
      {takes.map((t) => (
        <a key={t.take} href={t.url} target="_blank" rel="noreferrer" className={`gallery__take ${t.picked ? 'is-picked' : ''} ${large ? 'gallery__take--large' : ''}`}>
          <img src={t.url} alt={`Take ${t.take}${t.picked ? ' (picked)' : ''}`} loading="lazy" />
          <span>
            #{t.take}
            {t.picked ? ' picked' : ''}
          </span>
        </a>
      ))}
    </div>
  );
}

function AssetTile({ asset, show }: { asset: ArtAsset; show: Show }) {
  const variants: readonly ArtVariant[] = asset.kind === 'sprite' ? ['plain'] : show === 'both' ? ['plain', 'remap'] : [show];
  const takes = takeViews(asset);
  return (
    <li className="gallery__tile">
      <div className="gallery__images">
        {variants.map((variant) => {
          const url = reviewUrl(asset, variant);
          return (
            <figure key={variant} className="gallery__figure">
              {url === undefined ? (
                <div className="gallery__missing">{variant === 'remap' ? 'No remap in this direction' : 'Not generated'}</div>
              ) : (
                <div className="gallery__pair">
                  <img className="gallery__img" src={url} alt={`${asset.id}, ${SHOW_LABEL[variant]}`} loading="lazy" />
                  <img className="gallery__thumb" src={url} alt="" loading="lazy" />
                </div>
              )}
              <figcaption className="gallery__variant">{SHOW_LABEL[variant]}</figcaption>
            </figure>
          );
        })}
      </div>
      <div className="gallery__meta">
        <code className="gallery__id">{asset.id}</code>
        <span className="gallery__kind">
          {asset.kind}
          {asset.accent !== undefined ? `, accent: ${asset.accent}` : ''}
        </span>
        <p className="gallery__subject">{asset.subject}</p>
        <details className="gallery__prompt">
          <summary>Full prompt</summary>
          <pre>{artPrompt(asset, artDirection(ACTIVE_DIRECTION))}</pre>
        </details>
        {takes.length > 1 && (
          <div className="gallery__rejects">
            <span className="gallery__variant">All takes</span>
            <Takes takes={takes} />
          </div>
        )}
      </div>
    </li>
  );
}

/** The hand-drawn SVG icon set at two sizes. */
function IconSet() {
  return (
    <section className="gallery__batch" aria-labelledby="gallery-icon-set">
      <h2 id="gallery-icon-set" className="section-label">
        Icon set (hand-drawn SVG)
      </h2>
      <ul className="gallery__icons">
        {ICON_NAMES.map((name) => (
          <li key={name} className="gallery__icon">
            <Icon name={name} size="xl" />
            <Icon name={name} size="md" />
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pieces cut from a generated icon sheet, one row per extraction route (folders under experiments/<name>/). */
function IconSheetExperiment({ name }: { name: string }) {
  const files = experimentFiles(name).filter((f) => f.path.includes('/'));
  const routes = new Map<string, ExperimentFile[]>();
  for (const f of files) {
    const route = f.path.split('/')[0] ?? '';
    routes.set(route, [...(routes.get(route) ?? []), f]);
  }
  return (
    <section className="gallery__batch" aria-labelledby={`gallery-${name}`}>
      <h2 id={`gallery-${name}`} className="section-label">
        {name} extraction
      </h2>
      {routes.size === 0 ? (
        <p className="gallery__note">No extraction results yet.</p>
      ) : (
        [...routes].map(([route, pieces]) => (
          <div key={route} className="gallery__route">
            <h3 className="gallery__route-name">{route}</h3>
            <ul className="gallery__strip">
              {pieces.map((piece) => (
                <li key={piece.path} className="gallery__piece">
                  <img src={piece.url} alt={piece.path} />
                  {piece.path.endsWith('.svg') && (
                    <span className="gallery__tint-bg">
                      <span className="gallery__tinted" style={{ maskImage: `url(${piece.url})`, WebkitMaskImage: `url(${piece.url})` }} />
                    </span>
                  )}
                  <code>{piece.path.split('/').pop()}</code>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
