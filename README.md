# starter

A starter template for full-stack apps on **Cloudflare Workers** with **Vite 8**, **React 19**, **TanStack Start**, **Drizzle**, **Vitest 4**, and **pnpm**. See [`AGENTS.md`](./AGENTS.md) for the full command reference.

This README is both **descriptive** (what the repo enforces today) and **prescriptive** (the conventions you should keep if you adopt this starter). Commands and config details live in `AGENTS.md`; this file explains _why_ they exist.

## Toolchain at a glance

- **Runtime**: Cloudflare Workers (via `wrangler` + `@cloudflare/vite-plugin`)
- **App**: React 19, TanStack Start/Router, Chakra UI
- **Build**: Vite 8
- **Tests**: Vitest 4 (unit + browser + integration), Playwright (e2e), Stryker (mutation)
- **DB**: Drizzle ORM + Postgres
- **Lint / format**: oxlint, oxfmt
- **Typecheck**: layered (`tsconfig.domain.json`, `tsconfig.infra.json`)
- **Codebase intelligence**: [fallow](#codebase-intelligence-fallow)
- **Git hooks**: lefthook

## Getting started

```sh
pnpm install
pnpm dev
```

Run the test suites:

```sh
pnpm test          # watch mode, all projects
pnpm test:unit     # unit
pnpm test:browser  # browser (Vitest + Playwright)
pnpm test:e2e      # Playwright e2e
pnpm test:mutate   # Stryker mutation tests
```

Full quality gate (lint, format, typecheck layers, codebase audit):

```sh
pnpm run ci
```

See `AGENTS.md` for the complete command list and configuration details.

## Architecture: Hexagonal / Ports & Adapters

Business logic lives in pure TypeScript. Frameworks, databases, and external services are adapters plugged into ports. The goal is to express domain models and use cases without depending on the runtime, the HTTP server, the database driver, or the UI framework — so any of those can be swapped with near-zero rewrite to the core.

**Layers:**

- `src/domain/` — one folder per subdomain of the application (`billing/`, `auth/`, `account/`, …). Each subdomain contains its own entities, value objects, use cases, and a `ports/` folder holding the interfaces it needs from the outside world (`user-repository.types.ts`, `event-publisher.types.ts`). No imports from `src/infra/`, no framework globals, no Node/Workers APIs. May import from `src/utils/`.
- `src/infra/` — adapter implementations, grouped by _technology concept_ and then by _specific technology_: `database/postgres/user-repository.ts`, `messaging/kafka/event-publisher.ts`. Files are named after the _entity or capability_ (`user-repository.ts`, `event-publisher.ts`) — never the technology, because the folder already denotes it. Nesting the concrete tech inside the concept makes it obvious what each adapter is fulfilling and keeps the swap path (e.g. `postgres/` → `sqlite/`) local. Infra depends on domain ports; the reverse is never allowed.
- `src/utils/` — thin wrappers over third-party libraries (`lodash`, `date-fns`, …). The escape hatch that lets domain code use common utilities without defining a port per library. The utility module _is_ the port; the library is its implementation, swappable at the utility boundary.
- `src/api/` — HTTP composition root (Hono). Wires concrete adapters into use cases and exposes them as routes.
- `src/webapp/` — React + TanStack Start UI. Calls into the API; composes its own adapters where needed.

**The boundary is enforced four times, on purpose:**

1. **Path aliases** — `@domain/*` and `@infra/*` in `tsconfig.json` make the layer of every import readable at a glance.
2. **Layered typechecks** — `tsconfig.domain.json` compiles the domain alone; `tsconfig.infra.json` compiles domain + infra. If domain code reaches into infra, the domain typecheck fails before anything else runs. `pnpm typecheck:layers` runs both.
3. **Custom oxlint rule** — `starter/domain-no-infra-imports` (in `tools/oxlint-plugins/rules/`) blocks both static and dynamic imports from `src/infra/**` inside `src/domain/**` files.
4. **Fallow custom boundaries** — `.fallowrc.json` defines explicit zones for `domain`, `infra`, `api`, `webapp`, and `server`, then fails `boundary-violation` issues in CI.

Any one of the four would catch most mistakes; all four together make the violation loud and local.

## Directory layout

```
src/
  domain/                       # one folder per subdomain; pure business logic + ports
    billing/
      ports/
        invoice-repository.types.ts
      invoice.ts
    auth/
      ports/
        user-repository.types.ts
      user.ts
    account/
      ...
  infra/                        # adapters grouped by technology concept, then specific tech
    database/
      postgres/
        user-repository.ts      # named for the entity; folder denotes the tech
    messaging/
      kafka/
        event-publisher.ts
  utils/                        # thin wrappers over 3rd-party libs (lodash, date-fns, ...)
  api/                          # Hono server — composes domain + infra
  webapp/                       # React + TanStack Start UI
  server.ts                     # Cloudflare Workers entry
tools/
  oxlint-plugins/               # custom lint rules (e.g. domain-no-infra-imports)
test/                           # shared test setup (database harness, factories)
e2e/                            # Playwright specs
```

## Testing strategy

Four test types. The filename tells you which, because it reads like the test type it is.

| Type        | Filename                | Purpose                                                                                                                                                             | Tool                             | Coverage expectation               |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------- |
| Unit        | `*.unit.test.ts`        | Behavioural units of domain logic                                                                                                                                   | Vitest                           | **100%** on domain                 |
| Browser     | `*.browser.test.ts`     | UI components interacting with real DOM APIs                                                                                                                        | Vitest browser mode + Playwright | As needed per component            |
| Integration | `*.integration.test.ts` | Adapter implementations reaching real third-party boundaries — e.g. a Drizzle repository against a Postgres testcontainer, or an HTTP client against an MSW handler | Vitest (+ Testcontainers / MSW)  | At least one per adapter           |
| E2E         | `*.e2e.test.ts`         | Full user flows across multiple routes — signup, login, the journeys that must always work                                                                          | Playwright                       | Critical flows only (top priority) |

Examples from the repo: `src/domain/shared/result.unit.test.ts`, `src/infra/drizzle/user-operations.integration.test.ts`, `e2e/home.e2e.test.ts`, and the oxlint plugin's `tools/oxlint-plugins/rules/domain-no-infra-imports.unit.test.ts`.

Unit tests are the load-bearing layer: they run on every staged-file commit and every push, and they drive the 100% domain-coverage expectation. Integration tests verify that adapter code actually talks to the thing it claims to. E2E tests keep the most important journeys honest. Browser tests catch regressions in DOM-dependent behaviour that jsdom-style runners miss.

## Mutation Testing

Mutation testing is the test-quality gate. Line coverage can show that tests executed code; Stryker checks whether those tests would fail if the code's behaviour changed.

Run it with:

```sh
pnpm test:mutate
```

Configuration lives in `stryker.config.mjs`. Stryker uses `vitest.mutation.config.ts`, not the main `vitest.config.ts`, so mutation testing runs only fast Node-based unit tests. This is deliberate: Stryker's Vitest runner does not support Vitest Browser Mode, and integration/e2e suites are too slow and environment-heavy for the mutation loop.

Current mutation scope is `src/domain/**` and `src/api/**`, excluding tests, declarations, and declaration-only `*.types.ts` / `*.schema.ts` modules. Expand the `mutate` globs only when the new code has fast behavioural unit tests; do not add browser, integration, generated, or adapter-only code to the default mutation target set.

The mutation score must stay at or above **80%**. `thresholds.break` enforces this in Stryker, so `pnpm test:mutate` and the mutation CI workflow fail below that floor. HTML reports are written under `reports/` for local investigation.

## Module filename conventions

Filename suffixes encode module intent. They act as machine-readable tags: tooling can treat them uniformly (coverage exemptions, lint overrides, test discovery) and readers can see the shape of a module before opening it.

| Pattern                 | Purpose                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `*.unit.test.ts`        | Unit tests — behavioural units of domain logic.                                                                            |
| `*.browser.test.ts`     | Browser tests — UI components against real DOM APIs.                                                                       |
| `*.integration.test.ts` | Integration tests — adapters against real third-party boundaries.                                                          |
| `*.e2e.test.ts`         | End-to-end tests — full user flows across routes.                                                                          |
| `*.schema.ts`           | Validation schemas (Zod or similar). No branching logic.                                                                   |
| `*.types.ts`            | Type and interface declarations only — including port interfaces under `src/domain/**/ports/`. No `*.interface.ts` suffix. |

`*.schema.ts` and `*.types.ts` are **exempt from unit-test coverage demands** — they contain no behaviour to verify; unit-testing them would only restate the declarations. The explicit suffix makes that exemption self-documenting.

See [Testing strategy](#testing-strategy) for the tool and coverage expectation behind each test suffix.

Rule of thumb: if a module contains only declarations, use `*.schema.ts` or `*.types.ts`. If it contains behaviour, don't — and use the matching `*.test.ts` suffix for its tests.

## Quality gates

Every stage has a specific job. Understanding the _why_ matters as much as the commands.

- **Pre-commit (lefthook)** — runs `oxlint --fix` and `oxfmt --write` on staged files (auto-restaged), then `vitest related --run --project unit` over the staged files and `pnpm codebase:audit` for codebase intelligence checks. _Why_: keeps git history clean and readable (no "fix lint" commits), and ensures every commit is **independently releasable** — no commit silently breaks the behaviour or architecture of code near the change.
- **Pre-push (lefthook)** — `vitest run --changed origin/master --project unit`. Catches regressions across the whole change set before they leave the machine.
- **`pnpm run ci`** (local + CI) — `oxlint && oxfmt --check . && pnpm typecheck:layers && pnpm codebase:audit`. Read-only quality gate; no fixes, no writes. The source of truth for "is this branch green?"
- **GitHub Actions** — runs the same gate plus the test matrix (unit, browser, integration).
- **Mutation Tests workflow** — `pnpm test:mutate` on pull requests that touch `src/domain/**`, `src/api/**`, unit tests, or mutation config, with manual dispatch available. It fails below an 80% mutation score.

To skip hooks for a single command (e.g. an intentional WIP commit), set `LEFTHOOK=0`.

## Runtime choices

- **Hono** as the HTTP server — deliberately runtime-agnostic. If Cloudflare Workers stops fitting (a cold-start regression, a pricing change, a feature Workers can't express), the Hono app moves to Node / Bun / Deno / a container with near-zero rewrite.
- **Cloudflare Workers** as the starter runtime — chosen because it's exceptionally cheap and fast out of the box, with a global edge by default. Drizzle + Hyperdrive give Postgres access without managing a connection pool.
- **The swap path** — `src/api/` is the composition boundary. Replace `src/server.ts` (the Workers entry) with a different runtime adapter to change runtime; the app factory does not change.

## Codebase intelligence (fallow)

[fallow](https://github.com/fallow-rs/fallow) is a Rust-native, sub-second whole-project analyzer for TypeScript/JavaScript. It finds things oxlint's per-file model can't see:

- **Dead code** — unused files, exports, types, dependencies
- **Duplication** — cross-file clone groups
- **Complexity hotspots** — cyclomatic + cognitive complexity, churn-vs-complexity hotspots
- **Circular dependencies**
- **Architecture drift**

Use the `codebase:*` scripts for stable, tool-agnostic commands. Fallow is the current implementation behind them:

```sh
pnpm codebase:analyze             # full analysis (dead code + dupes + health)
pnpm codebase:audit               # changed-file quality gate for hooks and CI
pnpm codebase:dead-code           # unused code + circular deps only
pnpm codebase:duplicates          # duplication scan
pnpm codebase:health              # complexity + maintainability
pnpm codebase:boundaries          # resolved architecture boundary config
pnpm codebase:boundary-violations # architecture boundary violations only
pnpm codebase:fix:dry-run         # preview auto-fixes for unused exports/deps
```

`pnpm run ci` runs `pnpm codebase:audit` (`fallow audit`) as a quality gate — it scopes analysis to files changed against the base branch and returns a pass/warn/fail verdict. Configuration lives in `.fallowrc.json`, including custom boundary zones and rules for the hexagonal architecture. For the full feature set, see the [fallow docs](https://docs.fallow.tools).

## Reproducing this setup in your own repo

A short checklist for applying these conventions to a greenfield project:

1. `pnpm init`, set `"packageManager": "pnpm@10.x"`.
2. Create `src/domain`, `src/infra`, `src/utils` on day one, even if empty. Directory shape is a commitment.
3. Copy the `tsconfig.json` + `tsconfig.domain.json` + `tsconfig.infra.json` trio; adjust the includes/aliases.
4. Set up `oxlint.config.ts` and `oxfmt.config.ts`. Copy `tools/oxlint-plugins/` and rename the `starter` namespace.
5. Add `lefthook.yml` with pre-commit (lint + format + `vitest related --project unit` + `pnpm fallow:ci`) and pre-push (`vitest run --changed origin/master --project unit`).
6. Add the `pnpm ci` script: lint → format check → layered typecheck → fallow audit.
7. Add Stryker (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`), `stryker.config.mjs`, `vitest.mutation.config.ts`, and the `pnpm test:mutate` script with an 80% `thresholds.break` floor.
8. Adopt the four test-type filename suffixes (`.unit`, `.browser`, `.integration`, `.e2e`) before writing any tests.
9. Adopt `*.schema.ts` / `*.types.ts` before introducing any declaration-only module.
10. Put your HTTP server behind Hono so the runtime stays swappable.
11. Wire fallow with `.fallowrc.json` to catch dead code and duplication as the project grows.

## Reference

- [`AGENTS.md`](./AGENTS.md) — commands, imports, hook commands, and agent workflow notes.
- `.fallowrc.json` — fallow configuration.
- `stryker.config.mjs` and `vitest.mutation.config.ts` — mutation testing configuration.
- `tools/oxlint-plugins/README.md` — the custom lint plugin, including `domain-no-infra-imports`.
