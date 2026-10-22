# Throughput

A Balatro-inspired roguelike deckbuilder about running a factory: load Designs, Makes and Ships
into the Line's bays, ride the trends, beat each quarter's sales target, and build your Line in the
shop between rounds.

**Play it:** https://ryan-j-smith.github.io/throughput/

Browser-only static site (Vite + React + TypeScript), deployed to GitHub Pages. All game logic is
deterministic from a seed, so runs can be replayed, simulated headlessly, and played from a text CLI.

## Getting started

Requires Node 22.

```sh
npm ci
npm run dev        # local dev server with hot reload
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` (strict); must pass with zero errors |
| `npm test` | Vitest unit tests (`src/**/*.test.ts[x]`) |
| `npm run sim -- …` | Headless bot simulations and balance reports (see below) |
| `npm run -s cli -- …` | Text interface for playing a run one command at a time (see below) |

CI (`.github/workflows/deploy.yml`) runs typecheck, tests and build on every push to `main`, then
deploys `dist/` to GitHub Pages. The build uses a relative base path, so it works under any Pages URL.

## Layout

| Folder | Contents |
| --- | --- |
| `src/engine/` | Pure, deterministic game engine: seeded RNG, deck, scoring, modifiers, bosses, shop, run state machine. No DOM/React. |
| `src/content/` | Data-driven content definitions (cards, modifiers, bosses). |
| `src/app/` | Glue between the engine and the UI (game controller, view mapping). |
| `src/ui/` | React components and screens. |
| `src/play/` | Pure text front end: action parsing, state views, replayable saves (used by the CLI). |
| `src/cli/` | `npm run cli` entry point (thin Node shell over `src/play/`). |
| `src/sim/` | Bot simulation harness, reports and `npm run sim` entry point. |

Each folder exposes an `index.ts` barrel. Conventions for contributors (and agents) are in `CLAUDE.md`.

## Simulation (`npm run sim`)

Bots play many seeded runs headlessly and the results are summarized as compact tables.

```sh
npm run sim -- --help
npm run sim -- --runs 500 --bots greedy,hoarder           # win rate + margin-over-target curves
npm run sim -- --runs 500 --report impact                  # per shop item impact
npm run sim -- --runs 500 --report all --csv sim.csv       # writes sim-curves.csv and sim-impact.csv
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--scenario NAME` | `demo` | Which game setup and bot roster to use |
| `--runs N` | `200` | Runs per bot (seeds `first-seed … first-seed+N-1`) |
| `--first-seed N` | `1` | First seed |
| `--bots a,b` | all | Bots to run |
| `--report curves\|impact\|all` | `curves` | Which report to print |
| `--min-samples N` | `20` | Below this many runs bought/skipped, an item is flagged `LOW N` |
| `--csv PATH` | – | Also write the report data as CSV (`PATH-curves.csv` / `PATH-impact.csv` for `all`) |

- **curves**: win rate, mean/median round reached, and mean margin over target per round, per bot,
  plus a breakdown per archetype when bots label runs (`Bot.archetypeOf`).
- **impact**: per shop item, its offer count, pick rate, win rate of runs that bought it vs skipped it,
  and purchase timing. **aware Δ** compares buyers with skippers who were offered it at the same shop
  round, so items that only show up late aren't credited for the strength of the runs that reach them.
  The table is sorted by it.

New scenarios are registered in `src/sim/cli/all-scenarios.ts`.

## Text CLI (`npm run -s cli`)

A stateless interface meant for scripted or LLM playtesters. The save file is just
`{ seed, actions[] }`; every command replays the log to rebuild the run, so no process stays running.

```sh
npm run -s cli -- new   --seed 42 --save run.json     # start a run (refuses to overwrite without --force)
npm run -s cli -- state --save run.json               # print the current state
npm run -s cli -- act   --save run.json "play 1 3 4"  # apply an action and print what happened
```

Actions use the 1-based numbers shown in the state printout:

| Action | Meaning |
| --- | --- |
| `play 1 3 4` | Score these hand positions |
| `discard 2 5` | Discard and redraw these hand positions |
| `buy 2` | Buy shop slot 2 |
| `sell 1` | Sell the modifier in slot 1 |
| `reroll` | Reroll the shop |
| `continue` | Start the round / go to the shop / leave the shop |

- Every printout ends with the list of legal actions.
- An illegal action prints the reason, exits with code 1, and leaves the save file unchanged. Exit
  code 2 means a usage error or an unreadable save.
- Add `--json` to any command for machine-readable output.
- Relative `--save` paths are resolved from the directory you run `npm` in.
- A save only replays against the content version it was made with.

Playable games are registered in `src/cli/all-games.ts`.
