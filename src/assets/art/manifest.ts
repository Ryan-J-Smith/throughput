// Every generated illustration: its id, what to draw, and its output size, plus the art
// directions (style blocks) it can be drawn in. Read by the offline generator (scripts/art) and by
// the browser (typed art lookup, dev-only Art gallery). The game never generates art at runtime;
// finished images for the active direction are committed under src/assets/art/.

export type ArtKind = 'style' | 'sprite' | 'card' | 'fixture' | 'contract' | 'boss' | 'title' | 'bg' | 'token';

/**
 * How a prompt is built. `illustration` is the direction's style with its references attached;
 * `environment` is the same style as a full-bleed scene for behind the UI (no studio backdrop);
 * `surface` is the same style as a flat, straight-on design filling the square (e.g. the card back);
 * `sheet` is the direction's style laid out as a style sheet (which then becomes a reference);
 * `silhouettes` is flat black icons with no references, for the icon-extraction experiment.
 */
export type ArtTemplate = 'illustration' | 'environment' | 'surface' | 'sheet' | 'silhouettes';

export type ArtAsset = {
  readonly id: string;
  readonly kind: ArtKind;
  readonly template: ArtTemplate;
  /** Review batch: the user approves each batch in the Art gallery before the next is generated. */
  readonly batch: number;
  /** What to draw, one line. The template adds the style, composition and avoid blocks. */
  readonly subject: string;
  /** Width of the committed WebP in px; the height is the same, or 2/3 of it for `landscape`. */
  readonly size: number;
  readonly aspect?: 'landscape';
  /** Accent colours for the backdrop and rim light (Category, card type or rarity), in words. */
  readonly accent?: string;
  /** No backdrop: a cut-out on a transparent background, for compositing (e.g. the batch token). */
  readonly transparent?: true;
};

/** A visual style the whole set can be generated in, so directions can be compared on the same subjects. */
export type ArtDirection = {
  readonly id: string;
  readonly name: string;
  /** Status and intent, shown in the gallery. */
  readonly note: string;
  /** Style block prepended to illustration and style-sheet prompts. */
  readonly style: string;
  /** Avoid block appended to them. */
  readonly avoid: string;
  /** Camera and framing for square and landscape illustrations. */
  readonly composition: string;
  readonly wideComposition: string;
  /** Backdrop sentence; `{accent}` is replaced with the asset's accent colours. */
  readonly backdrop: string;
  /** Files under scripts/art/reference/<id>/ attached to every illustration; its style-sheet.jpg is added once generated. */
  readonly references: readonly string[];
  /** Rejected: raw files are kept for reference, but nothing is written into src/. */
  readonly archived?: boolean;
  /** Also write the palette-remapped variant (only meaningful for flat spot-colour styles). */
  readonly remap?: boolean;
};

export type ArtInk = { readonly name: string; readonly hex: string; readonly token: string };

/** Palette for the optional remap variant, from ui/theme/tokens.css; 50% tints of each over paper are also allowed. */
export const ART_INKS: readonly ArtInk[] = [
  { name: 'ink', hex: '#1f1a14', token: '--print' },
  { name: 'mustard', hex: '#e8a913', token: '--dept-mustard' },
  { name: 'red', hex: '#d7263d', token: '--dept-red' },
  { name: 'teal', hex: '#13817f', token: '--dept-teal' },
  { name: 'blue', hex: '#1d4e9e', token: '--dept-blue' },
];

export const ART_PAPER: ArtInk = { name: 'paper', hex: '#f1e6cb', token: '--stock' };

const PALETTE = `${ART_INKS.map((i) => `${i.name} ${i.hex}`).join(', ')}, on cream paper ${ART_PAPER.hex}`;

export const ART_DIRECTIONS: readonly ArtDirection[] = [
  {
    id: 'catalog-print',
    name: 'Mid-century catalog print',
    note: 'Rejected by the user on 2026-10-22: no 50s/60s or retro-future look. Kept in the raw folder for reference only.',
    archived: true,
    remap: true,
    style:
      'Style: mid-century product-catalog screen print matching the attached reference image(s). ' +
      `Flat spot colours only from this palette: ${PALETTE}; lighter tones only as halftone dots of those inks. ` +
      'Bold, even ink outlines about 1% of the image width, slight misregistration between colour layers, ' +
      'grainy cream paper texture, flat even lighting.',
    avoid: 'Avoid: any text, letters, numbers, lettering, logos or signage; gradients; photorealism; drop shadows; frames or borders.',
    composition: 'Three-quarter view. One subject, centred, with about 10% empty margin on every side. Square 1:1.',
    wideComposition: 'Wide 3:2 landscape. The main action centred, with about 10% empty margin on every side.',
    backdrop: 'Simple background with soft teal factory hints.',
    references: ['robot-arm.jpg'],
  },
  {
    id: 'premium-3d',
    name: 'Premium stylized 3D',
    note: 'Chosen by the user on 2026-10-22: polished stylized 3D props on a dark premium backdrop (card-game polish, chunky mobile-game props).',
    style:
      'Style: premium stylized 3D render. Glossy, clay-like materials with a soft subsurface feel; rounded, bevelled, chunky forms, toy-like but high-end. ' +
      'Soft studio lighting with a key light and a coloured rim light, gentle ambient occlusion, slight depth of field. ' +
      'Chunky, toy-like proportions and simple smooth materials (soft matte plastic, clay, a little glossy metal); no ornate detail or realistic fabric texture. ' +
      'Clean and polished, like a top-tier collectible card game or a polished stylized mobile game prop, in one consistent world with the attached scene. Dark premium mood.',
    avoid:
      'Avoid: retro, vintage, mid-century, 1950s or 1960s styling, retro-futurism, atomic age, halftone, screen print, paper texture, film grain, sepia; ' +
      'photorealism; any text, lettering, numbers, logos or brands; cluttered backgrounds; harsh shadows; frames or borders.',
    composition: 'Camera: three-quarter view from about 20 degrees above. A single hero object or a small vignette, centred, with about 10% empty margin on every side. Square 1:1.',
    wideComposition: 'Camera: three-quarter view from slightly above. Wide 3:2 landscape, the main action centred, with about 10% empty margin on every side.',
    backdrop: 'Backdrop: a soft radial-gradient glow fading into deep navy and charcoal (#0f1724). Accent colours for the glow and rim light: {accent}.',
    // The probe winners: card-apparel-design, fixture-robot-arm and title-key-art (take 1 each).
    references: ['ref-scene.jpg', 'ref-card.jpg', 'ref-fixture.jpg'],
  },
];

/** The direction the game's art is generated in. While it is archived, nothing new lands in src/assets/art. */
export const ACTIVE_DIRECTION = 'premium-3d';

export function artDirection(id: string): ArtDirection {
  const direction = ART_DIRECTIONS.find((d) => d.id === id);
  if (direction === undefined) throw new Error(`unknown art direction "${id}"`);
  return direction;
}

const SHEET_COMPOSITION = 'Square 1:1. A tidy, evenly spaced layout with clear margins around every element.';

/** Scenes that sit behind the UI: the whole frame is the place, and nothing in the middle competes with the UI on top. */
const ENVIRONMENT_COMPOSITION =
  'Camera: a wide establishing shot from about eye level, slightly above. Full-bleed: the scene fills the whole frame edge to edge, with no studio backdrop, vignette or border. ' +
  'Wide 3:2 landscape. Large, simple shapes and soft pools of light, low in contrast overall, with no single hero object in the middle of the frame (game UI sits on top of it).';

/** Flat designs the UI crops and frames itself (the card back): no perspective, nothing around the design. */
const SURFACE_COMPOSITION =
  'Camera: straight-on and flat, like a scan, with no perspective. The design fills the whole square frame edge to edge, centred and symmetrical, ' +
  'with no table, backdrop, card edge, rounded corners or border around it (the game crops and frames it). Square 1:1.';

/** Art the game shows. The style sheet and icon sheets are review-only and stay out of the game's lookup. */
export function isGameArt(asset: ArtAsset): boolean {
  return asset.kind !== 'style' && asset.kind !== 'sprite';
}

/** Reference files (relative to scripts/art/reference/) to attach; the generator skips ones that don't exist yet. */
export function artReferences(asset: ArtAsset, direction: ArtDirection): readonly string[] {
  const own = direction.references.map((file) => `${direction.id}/${file}`);
  switch (asset.template) {
    case 'illustration':
    case 'environment':
    case 'surface':
      return [...own, `${direction.id}/style-sheet.jpg`];
    case 'sheet':
      return own;
    case 'silhouettes':
      return [];
  }
}

/** The full image prompt for `asset` in `direction` (the generator adds where to save the file). */
export function artPrompt(asset: ArtAsset, direction: ArtDirection): string {
  switch (asset.template) {
    case 'illustration':
      return [
        direction.style,
        asset.aspect === 'landscape' ? direction.wideComposition : direction.composition,
        asset.transparent === true
          ? 'Background: fully transparent (a PNG with a real alpha channel): no backdrop, floor or cast shadow.'
          : direction.backdrop.replace('{accent}', asset.accent ?? 'cool blue'),
        `Subject: ${asset.subject}`,
        direction.avoid,
      ].join('\n');
    case 'environment':
      return [direction.style, ENVIRONMENT_COMPOSITION, `Lighting colours: ${asset.accent ?? 'cool blue'}.`, `Subject: ${asset.subject}`, direction.avoid].join('\n');
    case 'surface':
      return [direction.style, SURFACE_COMPOSITION, `Lighting colours: ${asset.accent ?? 'cool blue'}.`, `Subject: ${asset.subject}`, direction.avoid].join('\n');
    case 'sheet':
      return [direction.style, SHEET_COMPOSITION, `Subject: ${asset.subject}`, direction.avoid].join('\n');
    case 'silhouettes':
      return [
        `Subject: ${asset.subject}`,
        'Style: bold, solid, single-colour pure black (#000000) silhouettes with simple geometric shapes; no outlines, texture, shading or gradients.',
        'Background: transparent (a PNG with a real alpha channel) if you can produce one, otherwise flat pure white (#ffffff).',
        'Layout: the grid given above, each icon centred in its own equal cell with wide empty gutters between cells. Square 1:1.',
        'Avoid: any text, letters, numbers, labels, frames, grid lines or borders.',
      ].join('\n');
  }
}

const CARD = 512;
const FIXTURE = 512;

export const ART_ASSETS = [
  // ---- Batch 0: house style sheet (becomes a reference) and the icon-sheet experiment ----
  {
    id: 'style-sheet',
    kind: 'style',
    template: 'sheet',
    batch: 0,
    size: 768,
    subject:
      'A house style sheet: a row of colour swatches of the palette across the top, and below it five sample objects: a cardboard box, a folded shirt on a hanger, a smart speaker, a stand mixer and a delivery truck.',
  },
  {
    id: 'icon-sheet',
    kind: 'sprite',
    template: 'silhouettes',
    batch: 0,
    size: 768,
    subject:
      'Nine icons in a 3 by 3 grid, left to right and top to bottom: a T-shirt, a transistor radio, a house, an apple, a pencil crossing a ruler, a gear with a wrench, a parcel box, a coin, a delivery truck.',
  },
  {
    id: 'icon-sheet-2',
    kind: 'sprite',
    template: 'silhouettes',
    batch: 0,
    size: 768,
    subject:
      'Sixteen icons in a 4 by 4 grid, left to right and top to bottom: a flame, a seedling with two leaves, a zig-zag arrow trending down, an equals sign, a heart, ' +
      'a four-pointed sparkle, a rosette medal with ribbons, a coin, a till receipt, a stack of three boxes, a price tag, two circular arrows, a waste bin, ' +
      'a factory with a sawtooth roof, a hex nut, a robotic arm.',
  },

  // ---- Batch 1: card art, one per Category and stage ----
  { id: 'card-apparel-design', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'rose and magenta as the one dominant glow, with a subtle violet rim light', subject: "A dressmaker's dress form draped with a half-pinned jacket, with fabric swatches and tailor's shears." },
  { id: 'card-apparel-make', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'rose and magenta as the one dominant glow, with a subtle steel with orange sparks rim light', subject: 'An industrial sewing machine stitching a shirt, with spools of thread and a stack of identical finished shirts.' },
  { id: 'card-apparel-ship', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'rose and magenta as the one dominant glow, with a subtle teal rim light', subject: 'A hand truck stacked with garment boxes beside a rolling rack of shirts on hangers.' },
  { id: 'card-gadgets-design', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'electric blue and cyan as the one dominant glow, with a subtle violet rim light', subject: 'A small white robot toy prototype with glowing cyan eyes standing on a design desk beside a stylus and a glowing tablet.' },
  { id: 'card-gadgets-make', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'electric blue and cyan as the one dominant glow, with a subtle steel with orange sparks rim light', subject: 'A robotic assembly station fitting heads onto a row of identical small white robot toys.' },
  { id: 'card-gadgets-ship', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'electric blue and cyan as the one dominant glow, with a subtle teal rim light', subject: 'A small delivery van with its rear doors open, loaded with boxes, one open box showing a small white robot toy.' },
  { id: 'card-home-design', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'warm amber as the one dominant glow, with a subtle violet rim light', subject: 'A modern armchair prototype and a table lamp beside a design desk with fabric and paint swatches.' },
  { id: 'card-home-make', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'warm amber as the one dominant glow, with a subtle steel with orange sparks rim light', subject: 'A wood lathe turning a chair leg, with a row of identical finished wooden chairs behind it.' },
  { id: 'card-home-ship', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'warm amber as the one dominant glow, with a subtle teal rim light', subject: 'A flatbed truck carrying a crated armchair and a wrapped table lamp, strapped down.' },
  { id: 'card-food-design', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'fresh lime green as the one dominant glow, with a subtle violet rim light', subject: "A chef's tasting spoon over a steaming saucepan, with spice jars, a whisk and a new snack prototype on a plate." },
  { id: 'card-food-make', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'fresh lime green as the one dominant glow, with a subtle steel with orange sparks rim light', subject: 'A canning line: a filling nozzle pouring into tin cans on a roller conveyor, with stacks of finished cans.' },
  { id: 'card-food-ship', kind: 'card', template: 'illustration', batch: 1, size: CARD, accent: 'fresh lime green as the one dominant glow, with a subtle teal rim light', subject: 'A refrigerated box truck being loaded with crates of fresh produce and tin cans from a pallet jack.' },

  // ---- Batch 1: Fixtures ----
  { id: 'fixture-quality-lab', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'soft satin teal', subject: 'A large magnifying glass on an arm over a product on an inspection turntable, with a dial gauge and calipers.' },
  { id: 'fixture-overtime-crew', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'soft satin teal', subject: 'Two chunky toy-like factory workers in hard hats still assembling boxes at a brightly lit workbench late at night, a big wall clock past midnight above them, a thermos and coffee mugs beside them.' },
  { id: 'fixture-showroom', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'soft satin teal', subject: 'A glossy product showroom stage: three hero products (a table lamp, a sneaker, a small white robot toy) on lit round pedestals under spotlights, velvet curtains behind.' },
  { id: 'fixture-rnd-lab', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A lab bench with bubbling glass flasks, coiled tubing and a prototype gear under a bell jar.' },
  { id: 'fixture-automation', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'An automated stamping press with pistons and gears, punching identical parts that drop into a bin.' },
  { id: 'fixture-brand-manager', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A giant rubber stamp pressing a bold star emblem onto a row of identical product boxes.' },
  { id: 'fixture-price-gun', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A vintage handheld price-labelling gun shooting a stream of blank price tags into the air.' },
  { id: 'fixture-assembly-line', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'Two parallel roller conveyors in perspective carrying rows of identical boxes.' },
  { id: 'fixture-warehouse', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'Tall steel pallet racking stacked with cardboard boxes, and a forklift lifting a pallet.' },
  { id: 'fixture-robot-arm', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'rich gold', subject: 'An industrial robot arm with a gripper lifting a box off a roller conveyor.' },
  { id: 'fixture-flagship-store', kind: 'fixture', template: 'illustration', batch: 1, size: FIXTURE, accent: 'rich gold', subject: 'A grand department-store front with striped awnings and lit display windows, spotlights sweeping the sky.' },

  // ---- Batch 2: shop cards (own art; starter cards use the Category art) ----
  { id: 'card-influencer', kind: 'card', template: 'illustration', batch: 2, size: CARD, accent: 'violet', subject: 'A glamorous presenter holding up a new product in front of a vintage studio TV camera under studio lights.' },
  { id: 'card-factory-floor', kind: 'card', template: 'illustration', batch: 2, size: CARD, accent: 'steel blue with orange sparks', subject: 'A vast factory hall with long rows of identical machines and conveyors stretching into the distance.' },
  { id: 'card-boutique', kind: 'card', template: 'illustration', batch: 2, size: CARD, accent: 'teal', subject: 'A shop assistant wrapping a single luxury product in tissue paper at an elegant boutique counter with a ribbon spool.' },
  { id: 'card-wholesale-club', kind: 'card', template: 'illustration', batch: 2, size: CARD, accent: 'teal', subject: 'A big-box warehouse store aisle with towering pallets of bulk goods and an oversized shopping cart heaped with boxes.' },

  // ---- Batch 2: Contracts ----
  { id: 'contract-tooling-upgrade', kind: 'contract', template: 'illustration', batch: 2, size: CARD, accent: 'crimson red', subject: "An open machinist's toolbox with a gleaming new drill bit, wrenches and a micrometer laid out on a workbench." },
  { id: 'contract-downsizing', kind: 'contract', template: 'illustration', batch: 2, size: CARD, accent: 'crimson red', subject: 'A gloved hand dropping a single product box into a scrap bin beside a conveyor.' },
  { id: 'contract-floor-expansion', kind: 'contract', template: 'illustration', batch: 2, size: CARD, accent: 'crimson red', subject: 'A crane raising new steel girders to extend a factory bay beside an existing conveyor line.' },

  // ---- Batch 2: Board bosses ----
  { id: 'boss-line-shift', kind: 'boss', template: 'illustration', batch: 2, size: CARD, accent: 'ominous red and deep purple', subject: 'Factory machines sliding sideways along floor rails, with big curved arrows showing each one moving one place to the right.' },
  { id: 'boss-turnover', kind: 'boss', template: 'illustration', batch: 2, size: CARD, accent: 'ominous red and deep purple', subject: 'An industrial paper shredder devouring a stack of design blueprints.' },
  { id: 'boss-supply-shock', kind: 'boss', template: 'illustration', batch: 2, size: CARD, accent: 'ominous red and deep purple', subject: 'A factory bay hatch welded shut with thick weld seams, heavy chains and a padlock, sparks flying from a welding torch.' },
  { id: 'boss-jit-auditor', kind: 'boss', template: 'illustration', batch: 2, size: CARD, accent: 'ominous red and deep purple', subject: 'A stern auditor in a suit with a clipboard and a stopwatch, frowning at a pile of unsold boxes.' },

  // ---- Batch 2: title and background ----
  {
    id: 'title-key-art',
    accent: 'teal, amber and magenta',
    kind: 'title',
    template: 'illustration',
    batch: 2,
    size: 1024,
    aspect: 'landscape',
    subject: 'A panoramic factory line: products ride a long conveyor past drafting tables and machines and out to delivery trucks at loading docks.',
  },
  {
    id: 'bg-factory-hall',
    accent: 'faint teal and amber',
    kind: 'bg',
    template: 'illustration',
    batch: 2,
    size: 1280,
    aspect: 'landscape',
    subject: 'An empty factory hall interior with steel roof trusses, skylights and conveyor lines receding into the distance; quiet, low contrast, mostly paper.',
  },

  // ---- Batch 2: the hero product (the little white robot toy from the key art) ----
  { id: 'token-hero-robot', kind: 'token', template: 'illustration', batch: 2, size: 256, transparent: true, subject: 'The small white robot toy with glowing cyan eyes, standing, seen from the front three-quarter.' },

  // ---- Batch 3: THROUGHPUT content wave 1 (asst-b's subjects). Shop cards share one picture across Categories. ----
  { id: 'card-prototype', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'violet', subject: 'A hand-built product prototype on a workbench beside pencil sketches and calipers.' },
  { id: 'card-rebrand', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'violet', subject: 'An old shop sign being lowered by a small crane while a shiny new sign swings into place on a storefront.' },
  { id: 'card-3d-printer', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'steel blue with orange sparks', subject: 'A chunky 3D printer mid-print with a glowing nozzle, a finished part sitting on the build plate.' },
  { id: 'card-contract-manufacturer', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'steel blue with orange sparks', subject: 'A large outsourced factory floor with rows of identical machines and stacked pallets.' },
  { id: 'card-pop-up-shop', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'teal', subject: 'A small temporary pop-up storefront kiosk with an awning and a short queue of toy-like shoppers.' },
  { id: 'card-marketplace', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'teal', subject: 'A big glossy smartphone showing an online product listing of the small white robot toy with a glowing buy button.' },
  { id: 'card-subscription-box', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'teal', subject: 'An open subscription box with curated products nestled in tissue paper.' },
  { id: 'card-export-deal', kind: 'card', template: 'illustration', batch: 3, size: CARD, accent: 'teal', subject: 'Colourful shipping containers being lifted by a port crane onto a cargo ship.' },

  { id: 'fixture-design-studio', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'soft satin teal', subject: 'A design studio desk with a drawing tablet, a mood board and fanned colour swatches.' },
  { id: 'fixture-packaging-line', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'soft satin teal', subject: 'A packaging machine sealing products into boxes on a conveyor.' },
  { id: 'fixture-conveyor-belt', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'soft satin teal', subject: 'A long roller conveyor belt carrying parts between two machines.' },
  { id: 'fixture-signature-line', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'soft satin teal', subject: 'A branded display shelf of matching products all in one bold colourway.' },
  { id: 'fixture-cross-dock', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'soft satin teal', subject: 'A loading dock where pallets roll straight from one truck into another.' },
  { id: 'fixture-logistics-hub', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'soft satin teal', subject: 'A large logistics hub with sorting lanes and stacks of parcels.' },
  { id: 'fixture-luxury-counter', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A glass luxury display counter with a single spot-lit product inside.' },
  { id: 'fixture-express-lane', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A dedicated express delivery lane with a delivery van passing through a fast-pass gate.' },
  { id: 'fixture-lean-cell', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A compact lean manufacturing cell with a kanban board of coloured cards and a few tidy workstations.' },
  { id: 'fixture-megafactory', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A vast automated megafactory hall with long production lines.' },
  { id: 'fixture-patent-office', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'rich gold', subject: 'A patent certificate with an embossed gold seal beside a rolled product blueprint.' },
  { id: 'fixture-superstore', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'brushed silver and cyan', subject: 'A huge superstore aisle stretching into the distance, packed with stock.' },
  { id: 'fixture-robotics-cell', kind: 'fixture', template: 'illustration', batch: 3, size: FIXTURE, accent: 'rich gold', subject: 'A caged robotics cell where three robot arms work together on one part.' },

  { id: 'contract-clone', kind: 'contract', template: 'illustration', batch: 3, size: CARD, accent: 'crimson red', subject: 'A product (the small white robot toy) and its exact duplicate side by side under a glowing scanner beam.' },
  { id: 'contract-ad-campaign', kind: 'contract', template: 'illustration', batch: 3, size: CARD, accent: 'crimson red', subject: 'A large digital billboard showing a product ad of the small white robot toy over a city square.' },
  { id: 'contract-training-program', kind: 'contract', template: 'illustration', batch: 3, size: CARD, accent: 'crimson red', subject: 'Toy-like factory workers in hard hats gathered around a machine while an instructor points at it.' },
  { id: 'contract-treasury-bond', kind: 'contract', template: 'illustration', batch: 3, size: CARD, accent: 'crimson red', subject: 'An ornate bond certificate with a ribbon seal beside a tall stack of gold coins.' },
  { id: 'contract-rnd-grant', kind: 'contract', template: 'illustration', batch: 3, size: CARD, accent: 'crimson red', subject: 'A research lab bench with a prototype gadget and a big approval stamp coming down on a grant folder.' },

  { id: 'boss-bottleneck', kind: 'boss', template: 'illustration', batch: 3, size: CARD, accent: 'ominous red and deep purple', subject: 'A production line jammed at a narrow chokepoint, parts piling up behind it.' },
  { id: 'boss-recession', kind: 'boss', template: 'illustration', batch: 3, size: CARD, accent: 'ominous red and deep purple', subject: 'An empty shopping street with sale banners and a screen showing a falling red chart.' },
  { id: 'boss-ethics-review', kind: 'boss', template: 'illustration', batch: 3, size: CARD, accent: 'ominous red and deep purple', subject: 'A stern review panel at a long table examining a product, with a gavel.' },
  { id: 'boss-short-week', kind: 'boss', template: 'illustration', batch: 3, size: CARD, accent: 'ominous red and deep purple', subject: 'A wall calendar with the last day crossed out in red above a half-empty office.' },

  // ---- Batch 4 (art wave 2): the company growing Year by Year behind the Shift screen, the Board, the shop, and the run's end ----
  { id: 'bg-y1-garage', kind: 'bg', template: 'environment', batch: 4, size: 960, aspect: 'landscape', accent: 'warm tungsten amber with a little teal', subject: 'Year one: a cosy home garage where the company starts. A cluttered workbench under a warm desk lamp, a pegboard of tools, a small 3D printer, a few prototype robot toys and cardboard boxes, and a roll-up door half open onto a dusky driveway.' },
  { id: 'bg-y2-factory', kind: 'bg', template: 'environment', batch: 4, size: 960, aspect: 'landscape', accent: 'amber and teal', subject: 'Year two: a small rented factory unit. One short conveyor line, a couple of machines and workbenches, shelves of boxed stock, and a single delivery van at the open loading door.' },
  { id: 'bg-y3-plant', kind: 'bg', template: 'environment', batch: 4, size: 960, aspect: 'landscape', accent: 'cool cyan and white with amber safety accents', subject: 'Year three: a big modern production plant. Long parallel conveyor lines, rows of orange robot arms, a glass skylight roof and a mezzanine walkway, bright and busy.' },
  { id: 'bg-y4-port', kind: 'bg', template: 'environment', batch: 4, size: 960, aspect: 'landscape', accent: 'magenta, cyan and gold city lights at night', subject: 'Year four: a global mega-facility on a harbour at night. A vast glowing factory complex, container cranes loading a huge cargo ship, stacks of colourful shipping containers, and a city skyline beyond.' },
  { id: 'bg-board-review', kind: 'bg', template: 'environment', batch: 4, size: 960, aspect: 'landscape', accent: 'ominous red and deep purple', subject: 'A Board Review: a dark executive boardroom with a long glossy table and empty high-backed chairs under one dramatic spotlight, a big wall screen glowing with an abstract downward chart line, and city lights through tall windows.' },
  { id: 'bg-shop', kind: 'bg', template: 'environment', batch: 4, size: 960, aspect: 'landscape', accent: 'teal and warm gold', subject: 'The supplier trade fair: a sleek showroom floor with spot-lit display pedestals and booths showing machines, robot arms and product samples, on a glossy reflective floor.' },
  { id: 'end-win', kind: 'title', template: 'environment', batch: 4, size: 1280, aspect: 'landscape', accent: 'gold, teal and magenta fireworks', subject: "Victory: the small white robot toy on a winner's podium on a rooftop at night, standing in the right third of the frame and holding a golden trophy high, with fireworks bursting over a glowing city skyline and the company's huge factory below. The left half is open night sky." },
  { id: 'card-back', kind: 'card', template: 'surface', batch: 4, size: 512, accent: 'teal and warm gold on deep navy', subject: 'The back of the game\'s playing cards: deep navy with a fine, even pattern of tiny embossed gears and conveyor rollers, and at the centre a raised emblem of the small white robot toy\'s head inside a glowing teal and gold gear ring.' },
  { id: 'end-loss', kind: 'title', template: 'environment', batch: 4, size: 1280, aspect: 'landscape', accent: 'muted blue with soft amber lamplight', subject: 'A gentle ending: the small white robot toy sitting on an upturned crate in the right third of the frame, in a quiet factory after closing, with a single warm work lamp on, an unopened box beside it and rain on a skylight. Wistful and hopeful rather than sad. The left half is calm, dim factory.' },
] as const satisfies readonly ArtAsset[];

export type ArtId = (typeof ART_ASSETS)[number]['id'];

/** Subjects generated in every candidate direction for the gallery's side-by-side style comparison. */
export const ART_PROBES: readonly ArtId[] = ['fixture-robot-arm', 'card-apparel-design', 'title-key-art'];
