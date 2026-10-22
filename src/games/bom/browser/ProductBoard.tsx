import type { ReactNode } from 'react';
import { SUB_RND_GRADE, categoryName } from '../model';
import type { OwnedBlueprint, Part, PartCategory, RndChoice } from '../model';
import { fabricate, findRecipeParts } from '../rules';
import type { BomRun, ShipQuote } from '../rules';
import type { ProductView } from '../text';
import { partAccent, rndGains } from './present';

/** Round play: what the current selection can become. */
export type RoundActions = {
  readonly selection: readonly Part[];
  readonly onShip: (productId: string) => void;
  readonly onFabricate: () => void;
};

/** Between rounds: sell blueprints, or pick the target of an R&D Grant. */
export type ShopActions = {
  readonly onSell: (blueprintId: string) => void;
  /** Set while an R&D Grant waits for its blueprint (and Scale/Premium choice). */
  readonly onRnd: ((blueprintId: string, choice?: RndChoice) => void) | null;
};

export type ProductBoardProps = {
  run: BomRun;
  /** Product rows from the shared BoM view (next-Ship Demand, Ships, growth, R&D levels). */
  products: readonly ProductView[];
  round?: RoundActions;
  shop?: ShopActions;
};

/**
 * Owned blueprints as order tickets. Each Product shows its recipe, Units and Price, and a Demand
 * bar that halves with each repeat Ship this round and marks sell-out growth. With parts selected
 * it becomes a button priced at what that Ship would earn. Subs offer Fabricate for an exact recipe.
 */
export function ProductBoard({ run, products, round, shop }: ProductBoardProps) {
  const scale = Math.max(1, ...products.map((p) => p.demand));
  const subs = run.blueprints.filter((b) => b.def.kind === 'sub');
  const slots = `${run.blueprints.length}/${run.config.shop.maxBlueprints} blueprints`;
  return (
    <section className="bom-board" aria-label="Blueprints">
      <header className="bom-board__head">
        <h2 className="bom-board__title">Products</h2>
        <span className="bom-board__slots">{slots}</span>
      </header>
      <ul className="bom-board__list">
        {products.map((view) => {
          const blueprint = run.blueprint(view.id);
          return blueprint === undefined ? null : (
            <ProductRow key={view.id} run={run} blueprint={blueprint} view={view} scale={scale} round={round} shop={shop} />
          );
        })}
      </ul>
      {subs.length > 0 && (
        <>
          <h2 className="bom-board__title bom-board__title--subs">Sub-assemblies</h2>
          <ul className="bom-board__list">
            {subs.map((sub) => (
              <SubRow key={sub.id} run={run} sub={sub} round={round} shop={shop} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Which recipe slots the selection covers, slot by slot. */
function coverage(recipe: readonly PartCategory[], parts: readonly Part[]): boolean[] {
  const left = parts.map((p) => p.category);
  return recipe.map((category) => {
    const i = left.indexOf(category);
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

function RecipeChips({ recipe, met }: { recipe: readonly PartCategory[]; met: readonly boolean[] | null }) {
  return (
    <span className="bom-recipe" aria-label={`Recipe: ${recipe.map(categoryName).join(', ')}`}>
      {recipe.map((category, i) => (
        <span key={`${category}-${i}`} className={`bom-chip ${met?.[i] ? 'is-met' : ''}`} data-accent={partAccent(category)}>
          {categoryName(category)}
        </span>
      ))}
    </span>
  );
}

function DemandBar({ view, scale }: { view: ProductView; scale: number }) {
  const base = Math.max(1, view.demand);
  const halved = view.nextDemand < view.demand;
  const label = [
    `Demand ${view.nextDemand}`,
    halved ? `halved from ${view.demand} (shipped ×${view.shipsThisRound} this round)` : '',
    view.growth > 0 ? `+${view.growth} grown from sell-outs` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div className="bom-demand">
      <div className="bom-demand__rail" aria-hidden="true">
        <div className="bom-demand__track" style={{ width: `${(100 * view.demand) / scale}%` }}>
          <div className="bom-demand__fill" style={{ width: `${(100 * view.nextDemand) / base}%` }} />
          {view.growth > 0 && <div className="bom-demand__growth" style={{ width: `${(100 * view.growth) / base}%` }} />}
        </div>
      </div>
      <span className="bom-demand__label">{label}</span>
    </div>
  );
}

function quoteLine(quote: ShipQuote, growth: number): string {
  const v = quote.score.values();
  const units = v.units ?? 0;
  const demand = v.demand ?? 0;
  const markup = v.markup ?? 1;
  const parts = [
    `${units} Units into ${demand} Demand`,
    `$${v.price ?? 0}`,
    markup !== 1 ? `×${Math.round(markup * 100) / 100}` : '',
    quote.sellsOut ? `sells out: Demand +${growth} for good` : units > demand ? `${units - demand} Units unsold` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

function ProductRow({ run, blueprint, view, scale, round, shop }: { run: BomRun; blueprint: OwnedBlueprint; view: ProductView; scale: number; round?: RoundActions; shop?: ShopActions }) {
  const recipe = blueprint.def.recipe;
  const selection = round?.selection ?? [];
  const quote = round !== undefined && selection.length > 0 ? run.quoteFor(blueprint.id, selection) : null;
  const ready = findRecipeParts(recipe, [...run.hand, ...run.bench]) !== null;
  const levels = [view.scale > 0 ? `Scale ${view.scale}` : '', view.premium > 0 ? `Premium ${view.premium}` : ''].filter(Boolean).join(', ');

  let action: ReactNode = null;
  if (round !== undefined) {
    const why = selection.length === 0 ? (ready ? 'Select its parts' : 'Parts not in hand') : run.whyCannotShip(selection, blueprint.id);
    // In Overtime a Ship earns cash rather than revenue toward the target.
    const cash = quote !== null && run.phase === 'overtime' ? run.overtimePayFor(quote.revenue) : null;
    action = (
      <button type="button" className="btn bom-product__ship" disabled={quote === null} onClick={() => round.onShip(blueprint.id)}>
        {quote === null ? shortReason(why) : cash !== null ? `Ship: +$${cash} cash` : `Ship $${quote.revenue}`}
      </button>
    );
  } else if (shop !== undefined) {
    const gains = rndGains(blueprint);
    const onRnd = shop.onRnd;
    action =
      onRnd !== null && gains !== null ? (
        <span className="bom-product__rnd">
          <button type="button" className="btn btn--buy" onClick={() => onRnd(blueprint.id, 'scale')}>
            Scale: {gains.scale}
          </button>
          <button type="button" className="btn btn--buy" onClick={() => onRnd(blueprint.id, 'premium')}>
            Premium: {gains.premium}
          </button>
        </span>
      ) : (
        <SellButton run={run} id={blueprint.id} onSell={shop.onSell} />
      );
  }

  return (
    <li className={`bom-product ${quote !== null ? 'is-quoted' : ''} ${quote?.sellsOut ? 'is-sellout' : ''}`}>
      <div className="bom-product__head">
        <span className="bom-product__name">{blueprint.def.name}</span>
        <RecipeChips recipe={recipe} met={round !== undefined ? coverage(recipe, selection) : null} />
      </div>
      <div className="bom-product__stats">
        <span>
          <strong>{view.units}</strong> Units
        </span>
        <span>
          <strong>${view.price}</strong> Price
        </span>
        {levels && <span className="bom-product__levels">{levels}</span>}
        {view.shipsThisRun > 0 && <span className="bom-product__ships">Shipped ×{view.shipsThisRun} this run</span>}
      </div>
      <DemandBar view={view} scale={scale} />
      {quote !== null && <p className="bom-product__quote">{quoteLine(quote, run.mods.sellOutGrowth)}</p>}
      {action}
    </li>
  );
}

function SubRow({ run, sub, round, shop }: { run: BomRun; sub: OwnedBlueprint; round?: RoundActions; shop?: ShopActions }) {
  const def = sub.def;
  if (def.kind !== 'sub') return null;
  const selection = round?.selection ?? [];
  const exact = round !== undefined && selection.length > 0 && run.subFor(selection)?.id === sub.id;
  const output = exact ? fabricate(sub, selection, run.activeRules).output : null;
  const benchAfter = run.bench.filter((p) => !selection.includes(p)).length;
  const needsTrash = exact && benchAfter >= run.mods.benchSlots;

  let action: ReactNode = null;
  if (round !== undefined) {
    action = (
      <button type="button" className="btn bom-product__ship bom-sub__fab" disabled={!exact || run.buildsLeft <= 0} onClick={round.onFabricate}>
        {output !== null ? `Fabricate: ${categoryName(output.category)} ${output.grade}${needsTrash ? ', trash a Bench part' : ''}` : 'Select exactly its recipe'}
      </button>
    );
  } else if (shop !== undefined) {
    const onRnd = shop.onRnd;
    action =
      onRnd !== null ? (
        <button type="button" className="btn btn--buy" onClick={() => onRnd(sub.id)}>
          R&D: +{SUB_RND_GRADE} output grade
        </button>
      ) : (
        <SellButton run={run} id={sub.id} onSell={shop.onSell} />
      );
  }

  return (
    <li className={`bom-product bom-sub ${exact ? 'is-quoted' : ''}`}>
      <div className="bom-product__head">
        <span className="bom-product__name">{def.name}</span>
        <RecipeChips recipe={def.recipe} met={round !== undefined ? coverage(def.recipe, selection) : null} />
        <span className="bom-sub__arrow" aria-hidden="true">
          →
        </span>
        <span className="bom-chip is-met" data-accent={partAccent(def.output)}>
          {categoryName(def.output)}
        </span>
      </div>
      <p className="bom-sub__rule">
        Grade = 2 × the input grades{sub.subLevels > 0 ? ` + ${SUB_RND_GRADE * sub.subLevels} (R&D)` : ''}. Goes to the Bench; earns nothing now.
      </p>
      {action}
    </li>
  );
}

function SellButton({ run, id, onSell }: { run: BomRun; id: string; onSell: (id: string) => void }) {
  const blueprint = run.blueprint(id);
  if (blueprint === undefined) return null;
  const ok = run.whyCannotSell(id) === null;
  return (
    <button type="button" className={`btn bom-product__sell ${ok ? '' : 'btn--unaffordable'}`} onClick={() => onSell(id)}>
      Sell ${run.sellValue(blueprint.def.cost)}
    </button>
  );
}

/** Button-sized refusal text. */
function shortReason(reason: string | null): string {
  if (reason === null) return 'Ship';
  const needs = /needs (.+)$/.exec(reason);
  return needs ? `Needs ${needs[1]}` : reason;
}
