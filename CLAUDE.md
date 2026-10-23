# Throughput

Balatro-inspired single-player roguelike card game about running a consumer goods business
(product design, pricing, manufacturing, distribution). Browser-only static site deployed to GitHub Pages.

## Stack
- Vite + React 18 + TypeScript (strict). Vitest for tests.
- `npm run typecheck` (tsc --noEmit) must pass with zero errors — this is the TS equivalent of the pyright rule.
- No backend. All game state is client-side. Deterministic seeded RNG for all randomness (never Math.random in engine code).

## Layout
- `src/engine/` — pure TS game logic, NO React/DOM imports. Fully unit-testable.
- `src/content/` — data-driven content definitions (cards, shop items, modifiers, bosses).
- `src/ui/` — React components.
- Each folder exposes an `index.ts` barrel; import from the lowest barrel that exports a symbol, never deep module paths across folders.

## Conventions
- Behavioral contracts (things with multiple implementations, e.g. effects/modifiers/hooks) are `abstract class`es, not structural `interface`s, so implementations are discoverable via `extends`. Plain data shapes may be `type`s.
- Tests use dependency injection and simple fakes passed directly — never module mocking (`vi.mock` with string paths is banned).
- Work happens on branches in git worktrees under `../stratgame-wt/<branch>`; the orchestrator (session `stratgame-24`) merges to `main`.
- `docs/ai_docs/` is gitignored planning material — never commit it.
