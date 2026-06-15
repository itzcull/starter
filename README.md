# starter

A starter template for full-stack apps on **Cloudflare Workers** with **Vite 8**, **React 19**, **TanStack Start**, **Drizzle**, **Vitest 4**, and **pnpm**. See [`AGENTS.md`](./AGENTS.md) for the full command reference.

This README is both **descriptive** (what the repo enforces today) and **prescriptive** (the conventions you should keep if you adopt this starter). Commands and config details live in `AGENTS.md`; this file explains _why_ they exist.

Most sections below carry two extra blocks so the conventions are machine-actionable: **Rules (MUST / SHOULD)** — the constraints to uphold — and **Aligning an existing repo** — concrete steps to retrofit a codebase to the convention. Exact dependency versions are intentionally omitted from the prose; [`package.json`](./package.json) is the single source of truth for them.

## Toolchain at a glance

- **Runtime**: Cloudflare Workers (via `wrangler` + `@cloudflare/vite-plugin`)
- **App**: React 19, TanStack Start/Router, Chakra UI
- **Build**: Vite 8
- **Tests**: Vitest 4 (unit + browser + integration), Playwright (e2e), Stryker (mutation)
- **DB**: Drizzle ORM + Postgres
- **Auth**: better-auth
- **Lint / format**: oxlint, oxfmt
- **Typecheck**: full source plus layered (`tsconfig.domain.json`, `tsconfig.infra.json`, `tsconfig.api.json`, `tsconfig.webapp.json`)
- **Codebase intelligence**: [fallow](#codebase-intelligence-fallow)
- **Git hooks**: lefthook

Versions are pinned in [`package.json`](./package.json) — read them from there, not from this document. See [Reproducing this setup in your own repo](#reproducing-this-setup-in-your-own-repo) for grouped install commands.

## Getting started

This repo is developed exclusively inside a dev container. The container owns the inner loop — Postgres, the Vite dev server, Vitest, Playwright browsers, and the testcontainers daemon all run inside it, so two workspaces side-by-side never collide on host ports or share state. Local `pnpm install` / `pnpm dev` on the host is unsupported.

Open the workspace and **Reopen in Container** (VS Code / Cursor with the Dev Containers extension), or:

```sh
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . pnpm dev
```

The first build runs `.devcontainer/post-create.sh`, which installs pnpm deps and Playwright browsers into per-workspace named volumes, then runs `docker compose up -d --wait` against the root `docker-compose.yml` on the container's nested docker daemon. Postgres (and any future app services) are reachable inside the container at `localhost:5432` and are not published to the real host.

Run the test suites:

```sh
pnpm test          # watch mode, all projects
pnpm test:unit     # unit
pnpm test:browser  # browser (Vitest + Playwright)
pnpm test:e2e      # Playwright e2e
pnpm test:coverage # Vitest coverage
pnpm test:mutate   # Stryker mutation tests
```

Full static quality gate (lint, format, layer typechecks, full source typecheck, test typecheck, codebase audit):

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
2. **Layered typechecks** — `tsconfig.domain.json` compiles the domain alone; `tsconfig.infra.json` compiles domain + infra; `tsconfig.api.json` compiles the HTTP composition layer with its allowed dependencies; `tsconfig.webapp.json` compiles the UI layer with its allowed dependencies. If a lower layer reaches upward, the relevant layer typecheck fails before anything else runs. `pnpm typecheck:layers` runs all four, while `pnpm typecheck` checks the full source project and `pnpm typecheck:test` checks tests.
3. **Custom oxlint rule** — `starter/domain-no-infra-imports` (in `tools/oxlint-plugins/rules/`) blocks both static and dynamic imports from `src/infra/**` inside `src/domain/**` files.
4. **Fallow custom boundaries** — `.fallowrc.json` defines explicit zones for `domain`, `infra`, `api`, `webapp`, and `server`, then fails `boundary-violation` issues in CI.

Any one of the four would catch most mistakes; all four together make the violation loud and local.

**Rules (MUST / SHOULD):**

- `src/domain/**` MUST NOT import from `src/infra/**`, framework globals, or Node/Workers APIs. It MAY import `src/utils/**`.
- Dependencies MUST flow downward only: infra → domain; api → domain + infra; webapp → domain + api; server → all. (This is the `boundaries.rules` table in `.fallowrc.json`.)
- The domain→infra boundary MUST stay enforced in all four places — don't disable one and lean on the others.
- Infra adapters SHOULD be named for the entity/capability (`user-repository.ts`), not the technology; the folder denotes the tech.
- Interfaces the domain needs (ports) MUST live in the domain as `*.types.ts` and be implemented by infra.

**Aligning an existing repo:**

1. Create `src/domain`, `src/infra`, `src/api`, `src/webapp` (and `src/utils` for third-party wrappers); add `@domain/*` and `@infra/*` to `tsconfig.json` `paths`.
2. Add the four layer tsconfigs and a `typecheck:layers` script that runs them in order.
3. Copy `tools/oxlint-plugins/`, rename the `starter` namespace, and enable `<ns>/domain-no-infra-imports` in `oxlint.config.ts`.
4. Add `boundaries.zones` + `boundaries.rules` to `.fallowrc.json` mirroring the dependency direction, with `boundary-violation: error`.

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

## Configuration & environment

Configuration is read from the runtime, not from `process.env` scattered through the code. On Workers, Cloudflare injects an `Env` object (typed as `Cloudflare.Env`) that Hono exposes per-request as `c.env` — `c.env.HYPERDRIVE.connectionString`, `c.env.BETTER_AUTH_SECRET`, and so on. Bindings and plain vars are declared in `wrangler.jsonc` (`hyperdrive`, `vars`); `pnpm typegen` regenerates the `Cloudflare.Env` types from that file so the bindings stay typed.

Secrets and local overrides live in untracked `.env` / `.dev.vars`, with `.env.example` / `.dev.vars.example` as the committed templates. In Conductor workspaces, `.conductor/setup.sh` symlinks `.env` and `.dev.vars` from the root repo so every parallel workspace shares one set of credentials. Tooling that needs a value at config time fails fast when it's missing — `drizzle.config.ts` throws if `DATABASE_URL` is unset rather than running against an undefined database.

Local Postgres comes from the root `docker-compose.yml` (`postgres:18`, reachable at `localhost:5432`), started inside the dev container — never on the host (see [Getting started](#getting-started)).

`wrangler types` preserves literal values for plain `vars`, so a config value like `"false"` can be emitted as the literal type `"false"` instead of `string`. When code intentionally compares an env flag against another value, widen it at the boundary with `String(c.env.FEATURE_FLAG) === 'true'`. For third-party services, prefer an env-gated stub mode at the `src/api/` composition boundary (for example `<SERVICE>_STUB_MODE`) so local dev and E2E can run without live external credentials while production wiring remains explicit.

**Rules (MUST / SHOULD):**

- App code MUST read config from the injected runtime env (`c.env`), not module-level `process.env`. Required values MUST fail fast when absent.
- Every binding/var MUST be declared in `wrangler.jsonc`; run `pnpm typegen` after changing it.
- Secrets MUST NOT be committed. New ones MUST be added to `.env.example` / `.dev.vars.example` as empty placeholders.
- Env flag comparisons SHOULD widen literal `wrangler types` output with `String(...)` at the composition boundary.
- External adapters SHOULD provide an env-gated in-memory stub for local dev and E2E when the real service is not essential to the flow.

**Aligning an existing repo:**

1. Funnel scattered `process.env.*` reads to a single composition boundary that receives the runtime env.
2. Declare bindings + vars in `wrangler.jsonc`; commit `.example` templates and gitignore the real files.
3. On Conductor, add `.conductor/setup.sh` to symlink env files; otherwise document a `cp .env.example .env` step.

## Data & persistence

Drizzle ORM is the database adapter (the `database/postgres` slot in the hexagon). The schema is defined as TypeScript in `src/infra/drizzle/schema/`, and the row types are _inferred from the schema_ (`InferSelectModel` / `InferInsertModel` in `src/infra/drizzle/types.ts`) — the schema is the single source of truth, so types can never drift from the table definition. The connection is built by a `createDatabase(connectionString)` factory (`src/infra/drizzle/client.ts`), so the driver is injected rather than imported as a global singleton.

Migrations are generated from the schema and applied with the `db:*` scripts (`db:generate`, `db:push`, `db:migrate`, `db:studio`); `drizzle.config.ts` points at the schema and reads `DATABASE_URL`. In production, Cloudflare Hyperdrive pools the Postgres connection at the edge. Integration tests run the real adapter against a Postgres testcontainer (see [Testing strategy](#testing-strategy)) — the database is never mocked. The test database schema is created by running the committed `drizzle/*.sql` migrations through Drizzle's migrator, and test cleanup truncates the public tables discovered from Postgres metadata, so schema changes need a generated migration rather than a parallel hand-written test DDL edit.

**Rules (MUST / SHOULD):**

- Row/insert types MUST be inferred from the schema, never hand-written in parallel.
- Database access MUST go through the `createDatabase` factory so the connection is injected; no top-level client singletons in domain/api code.
- Schema changes MUST be captured as migrations via `pnpm db:generate`; applied migrations MUST NOT be hand-edited.
- Each repository/adapter SHOULD ship ≥1 `*.integration.test.ts` against a real testcontainer.
- Integration test schema setup MUST use the committed Drizzle migrations as the source of truth.

**Aligning an existing repo:**

1. Put the schema in `src/infra/<orm>/schema/`; export inferred types from a sibling `types.ts`.
2. Wrap connection creation in a `createDatabase(connectionString)` factory injected at the api boundary.
3. Add `db:*` scripts and a config that reads the DB URL from env and throws if it's missing.

## Type safety & error handling

TypeScript runs in full `strict` mode plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`. These live in `tsconfig.base.json`, which every other config (`tsconfig.json`, the layer configs, and the per-variant test configs) extends, so the strictness can't be quietly dropped in one corner. On top of that, two patterns keep failures explicit:

- **Result over exceptions.** `src/domain/shared/result.ts` defines `Result<T, E>` — a discriminated union of `{ ok: true, value }` / `{ ok: false, error }` — plus an `AsyncResult<T, E>` alias and `ok()` / `err()` constructors. Domain operations that can fail return a `Result` instead of throwing, so callers must handle both branches and the type narrows on `result.ok`.
- **Parse, don't validate.** Untrusted input is parsed into constrained types at the boundary with Zod (`*.schema.ts`), wired into HTTP routes via `@hono/zod-openapi`. Past the boundary, code trusts the types rather than re-checking the same data.

Declaration-only modules carry explicit suffixes (`*.types.ts`, `*.schema.ts`) and are coverage-exempt (see [Module filename conventions](#module-filename-conventions)).

**Rules (MUST / SHOULD):**

- `strict` MUST stay on; don't weaken compiler flags to land a change — fix the types.
- Fallible domain operations SHOULD return `Result` / `AsyncResult` rather than throwing.
- External input MUST be parsed (Zod) at the boundary into a typed value; downstream code MUST NOT re-validate it.

**Aligning an existing repo:**

1. Turn on `strict` plus the `noUnused*` / `noImplicitReturns` / `noFallthroughCasesInSwitch` flags.
2. Add a `Result` type to the domain and adopt it for operations that currently throw on expected failures.
3. Define Zod schemas at each input boundary; infer the parsed type and drop redundant downstream checks.

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

When testing HTTP code, import and drive the real Hono app from `src/api/` or `src/server.ts`; the unit and integration test TypeScript configs include the generated `worker-configuration.d.ts` so `Cloudflare.Env` remains available where server code is tested. Browser tests stay on webapp-facing aliases and should not import infra modules. Layer typechecks are source-only: tests are excluded from `tsconfig.domain.json`, `tsconfig.infra.json`, `tsconfig.api.json`, and `tsconfig.webapp.json` and checked by the per-variant test configs instead.

Each test type maps to a Vitest project or Playwright (`vitest.config.ts` defines the `unit`, `browser`, and `integration` projects; the `integration` project boots a Postgres testcontainer via `test/integration/global-setup.ts` and an MSW server via `test/integration/setup.ts`). The principle is **mock only what you don't own**: third-party HTTP is faked with MSW, while your own database is exercised for real against a container.

**Test helpers and per-variant configs.** Test helpers are imported through `@test-utils/*` — a _variant-local_ alias that resolves to a different directory per test type: `test/unit/*`, `test/integration/*`, `test/browser/*`, or `e2e/test-utils/*`. Each level gets its own helper namespace, so a unit test can't reach for integration-only helpers (e.g. testcontainers) and the deep `../../../test/...` relative imports disappear. The alias is wired twice: a per-project `resolve.alias` in `vitest.config.ts` for the runtime, and a narrowed `paths` entry in each test config for the type-checker. Each variant also carries its own TypeScript config — `tsconfig.test.unit.json`, `tsconfig.test.integration.json`, `tsconfig.test.browser.json`, `tsconfig.test.e2e.json`, all extending the shared `tsconfig.base.json` — that models its runtime's APIs (node + `vitest/globals` for unit/integration, DOM + `@vitest/browser` for browser, node + Playwright for e2e), so the type-checker flags use of an API the runtime doesn't have. `tsconfig.test.json` aggregates the four through project references, and `pnpm typecheck:test` fans out to `typecheck:test:{unit,integration,browser,e2e}`. (Playwright needs `e2e/tsconfig.json` as a shim, because it resolves path aliases from the nearest `tsconfig.json` under the test dir.)

**Rules (MUST / SHOULD):**

- Every test file MUST use exactly one of the four suffixes (`.unit`, `.browser`, `.integration`, `.e2e`). The suffix selects the runner and the coverage expectation.
- Tests MUST mock only what you don't own — third-party HTTP via the shared MSW `server` (imported as `@test-utils/msw-server`), where unhandled requests fail the test. Things you own (the database) MUST be exercised for real against a testcontainer.
- New adapter code MUST ship ≥1 `*.integration.test.ts`. Domain logic MUST keep its 100% unit-coverage expectation (and the ≥80% mutation score below).
- Test data SHOULD come from factories (e.g. `src/infra/drizzle/user-factory.ts`), not inline literals; tests SHOULD assert behaviour (given/when/then), not implementation detail.
- Test helpers MUST be imported via the variant-local `@test-utils/*` alias, not deep relative paths.
- Each test variant MUST type-check under its own `tsconfig.test.<variant>.json` modelling its runtime; don't add DOM libs to node-only variants, or `@infra` to the browser/e2e configs.

**Aligning an existing repo:**

1. Define Vitest `projects` for unit/browser/integration keyed on the suffixes; add Playwright for `.e2e`.
2. Add a global setup that starts a DB testcontainer and an MSW server with `onUnhandledRequest: 'error'`.
3. Rename existing tests to the four-suffix scheme and add factories for shared fixtures.
4. Add a variant-local `@test-utils/*` alias (per-project `resolve.alias` in `vitest.config.ts` + a narrowed `paths` entry per test config), and split `tsconfig.test.json` into per-variant configs that extend a shared `tsconfig.base.json`.

## Mutation Testing

Mutation testing is the test-quality gate. Line coverage can show that tests executed code; Stryker checks whether those tests would fail if the code's behaviour changed.

Run it with:

```sh
pnpm test:mutate
```

Configuration lives in `stryker.config.mjs`. Stryker uses `vitest.mutation.config.ts`, not the main `vitest.config.ts`, so mutation testing runs only fast Node-based unit tests. This is deliberate: Stryker's Vitest runner does not support Vitest Browser Mode, and integration/e2e suites are too slow and environment-heavy for the mutation loop.

Current mutation scope is `src/domain/**` and `src/api/**`, excluding all test suffixes, declarations, and declaration-only `*.types.ts` modules. Schema modules stay in scope when they live under mutated layers because schemas often encode runtime validation or API contracts. Expand the `mutate` globs only when the new code has fast behavioural unit tests; do not add browser, integration, generated, or adapter-only code to the default mutation target set. Composition or adapter code that is intentionally covered only by integration tests should be excluded from mutation rather than pulled into the unit-only mutation runner.

The mutation score must stay at or above **80%**. `thresholds.break` enforces this in Stryker, so `pnpm test:mutate` and the mutation CI workflow fail below that floor. HTML reports are written under `reports/` for local investigation.

**Rules (MUST / SHOULD):**

- The mutation score MUST stay ≥ **80%** (`thresholds.break`); both `pnpm test:mutate` and the mutation workflow fail below it.
- The `mutate` globs MUST stay scoped to `src/domain/**` + `src/api/**` (tests/declarations excluded); add globs only for code with fast behavioural unit tests.
- Mutation MUST run only the unit project (`vitest.mutation.config.ts`) — no browser/integration/e2e in the loop.

**Aligning an existing repo:**

1. Add `@stryker-mutator/core` + the Vitest runner; point Stryker at a unit-only Vitest config.
2. Set `thresholds.break` to your floor (80% here) and scope `mutate` to the business-logic layers.
3. Gate it in CI on changes to those layers (see [Continuous integration](#continuous-integration)).

## Linting & formatting

oxlint (type-aware: `typeAware` + `typeCheck` in `oxlint.config.ts`) is the linter; oxfmt is the formatter (`semi: false`, `singleQuote: true`). Both are Rust-native and run in milliseconds, which is what makes them viable inside the pre-commit hook. Architectural rules a per-file linter can't normally express are added as a local JS plugin under `tools/oxlint-plugins/` — currently `starter/domain-no-infra-imports` (see [`tools/oxlint-plugins/README.md`](./tools/oxlint-plugins/README.md) for the rule and how to add more). Generated files (`src/webapp/routeTree.gen.ts`, `worker-configuration.d.ts`, `dist/**`) are ignored by both.

Each tool has a write variant and a check variant — `lint` / `lint:check`, `format` / `format:check`: the write variants fix locally, the `:check` variants are read-only for CI. Editors format on save through the oxc language servers (`.vscode/settings.json`, `.zed/settings.json`, the latter also disabling Prettier). Markdown — including this file — is outside the oxlint/oxfmt globs, so it isn't auto-formatted.

**Rules (MUST / SHOULD):**

- `pnpm lint:check` and `pnpm format:check` MUST pass with zero findings before merge; CI runs the read-only variants.
- Project-specific architectural constraints SHOULD be encoded as oxlint plugin rules (with a co-located `*.unit.test.ts`), not left to review.
- Generated files MUST be listed in both tools' `ignorePatterns`.

**Aligning an existing repo:**

1. Add `oxlint` + `oxfmt`, create `oxlint.config.ts` / `oxfmt.config.ts`, and ignore generated files.
2. Add the four script pairs (`lint`/`lint:check`, `format`/`format:check`).
3. Port custom rules into `tools/oxlint-plugins/` and enable them under your own namespace.

## UI scaffolding

Chakra v3 provides low-level primitives; the starter vendors the common CLI snippets in `src/webapp/components/ui/` so a first real screen can use `Button`, `Field`, and the app-mounted `Toaster` without recreating the snippet path. Add more snippets with `pnpm dlx @chakra-ui/cli snippet add <name>` and move generated files under `src/webapp/components/ui/` if the CLI writes to its default `src/components/ui` path.

Route protection should keep authorization enforceable on the server. The default pattern is a pathless TanStack `_authed` layout using `useSession` for client-side navigation UX, backed by explicit session checks on every protected API route. If you use an SSR `beforeLoad` guard instead, forward the incoming request `cookie` header to better-auth `getSession`; otherwise server-rendered route loads can see an anonymous request even when the browser has a valid session cookie.

**Rules (MUST / SHOULD):**

- Shared Chakra snippets SHOULD live under `src/webapp/components/ui/` and be mounted through the existing `Provider` when they are app-level services like toasts.
- Protected data and mutations MUST be enforced in API routes; client route guards are UX, not authorization.
- SSR auth guards MUST forward request cookies when calling better-auth session APIs.

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

**Rules (MUST / SHOULD):**

- A declaration-only module MUST use `*.schema.ts` (validation schemas) or `*.types.ts` (types/interfaces, including ports); both are coverage-exempt.
- A module containing behaviour MUST NOT use those suffixes, and its tests MUST use the matching `*.test.ts` suffix.
- Interfaces MUST be `*.types.ts`; don't introduce a `*.interface.ts` suffix.

**Aligning an existing repo:**

1. Rename declaration-only files to `*.types.ts` / `*.schema.ts` and point coverage/mutation exemptions at those globs.
2. Adopt the four test suffixes before writing new tests.

## Scripts

Scripts in `package.json` follow a few conventions so the command surface stays predictable; the exhaustive list is in [`AGENTS.md`](./AGENTS.md).

- **Namespaced groups.** Related commands share a prefix — `test:*`, `typecheck:*`, `codebase:*`, `db:*` — so they're discoverable and tab-completable.
- **Stable names over tools.** The `codebase:*` scripts are tool-agnostic aliases; fallow is the current implementation behind them (`codebase:audit` → `fallow audit`). Hooks and CI call the stable name, so the analyzer can be swapped without touching them. `fallow:ci` is itself an alias for `codebase:audit`.
- **Composite gates, fail-fast.** `ci`, `fix`, `typecheck:layers`, and `typecheck:test` chain sub-commands with `&&`, so the first failure stops the run and there's one memorable entry point — `pnpm run ci` is the whole static gate, `pnpm fix` is lint + format, `pnpm typecheck:layers` is the four layer checks, and `pnpm typecheck:test` fans out to `typecheck:test:{unit,integration,browser,e2e}` (one per test variant).
- **Check vs write pairs.** `lint`/`lint:check` and `format`/`format:check` — write variants for local dev, `:check` variants for CI so CI never mutates the tree.
- **Lifecycle hook.** `prepare` runs `lefthook install`, so git hooks self-install on `pnpm install`.

**Rules (MUST / SHOULD):**

- New commands MUST join the right namespace (`test:`, `typecheck:`, `codebase:`, `db:`).
- Tooling invoked by hooks/CI SHOULD be reached through a stable script alias, not the raw binary, when the tool might be swapped.
- CI-facing scripts MUST be read-only (`:check` variants); composite gates MUST chain with `&&`.

**Aligning an existing repo:**

1. Group scripts by prefix and add `ci` / `fix` composites.
2. Put third-party analyzers behind `codebase:*`-style aliases.
3. Add a `prepare` script that installs your hook manager.

## Quality gates

Every stage has a specific job. Understanding the _why_ matters as much as the commands.

- **Pre-commit (lefthook)** — runs `oxlint --fix` and `oxfmt --write` on staged files (auto-restaged), then `vitest related --run --project unit` over the staged files and `pnpm codebase:audit` for codebase intelligence checks. _Why_: keeps git history clean and readable (no "fix lint" commits), and ensures every commit is **independently releasable** — no commit silently breaks the behaviour or architecture of code near the change.
- **Pre-push (lefthook)** — `vitest run --changed origin/master --project unit`. Catches regressions across the whole change set before they leave the machine.
- **`pnpm run ci`** (local + CI) — `pnpm lint:check && pnpm format:check && pnpm typecheck:layers && pnpm typecheck && pnpm typecheck:test && pnpm codebase:audit`. Read-only static quality gate; no fixes, no writes. The source of truth for "does this branch pass static analysis?"
- **GitHub Actions** — runs the same static gate as named jobs plus the test matrix (unit, browser, integration, e2e) and build. See [Continuous integration](#continuous-integration).
- **Mutation Tests workflow** — `pnpm test:mutate` on pull requests that touch `src/domain/**`, `src/api/**`, unit tests, or mutation config, with manual dispatch available. It fails below an 80% mutation score.

To skip hooks for a single command (e.g. an intentional WIP commit), set `LEFTHOOK=0`.

**Rules (MUST / SHOULD):**

- Pre-commit MUST lint + format staged files (auto-restaged), run the related unit tests, and run `codebase:audit`. Pre-push MUST run the changed unit tests against `origin/master`.
- `pnpm run ci` MUST stay read-only and is the source of truth for static-analysis pass/fail.
- Hooks MAY be skipped for one command with `LEFTHOOK=0`, but the same checks MUST still pass in CI.

**Aligning an existing repo:**

1. Add lefthook (`prepare: lefthook install`) with pre-commit + pre-push jobs mirroring the above.
2. Add the `ci` composite and run it both locally (pre-merge) and in CI.

## Continuous integration

GitHub Actions enforces the same gates as the local hooks, plus the full test matrix and build. The workflow files are the source of truth — see [`.github/workflows/`](./.github/workflows/).

- **`ci.yml` ("CI Tests")** runs on every PR to `master`, with `concurrency` cancelling superseded runs on the same ref. The static gate is split into separate, parallel named jobs — `lint`, `typecheck`, `codebase-audit` — rather than one `pnpm run ci` call, so a failure points at the exact check and the jobs run concurrently. The test matrix is likewise parallel jobs: `test-unit`, `test-browser` (installs the Chromium binary first), and `test-integration` (sets `TESTCONTAINERS_RYUK_DISABLED=true`, since the ephemeral runner cleans itself up). `build` runs standalone, and `test-e2e` declares `needs: [build]` and brings up its own `postgres:18` service. `codebase-audit` checks out full history (`fetch-depth: 0`) and scopes analysis to `--base origin/<base-ref>`. Every job pins **Node 22** and installs with `pnpm install --frozen-lockfile`.
- **`mutation.yml` ("Mutation Tests")** is path-filtered: it runs `pnpm test:mutate` only when `src/domain/**`, `src/api/**`, unit tests, or the mutation config change (plus manual `workflow_dispatch`), because the mutation loop is too slow to run on every PR.
- **`deploy.yml` ("Deploy")** is manual `workflow_dispatch` only — the `push` trigger is commented out until the Cloudflare secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) are set — and uses `concurrency: cancel-in-progress: false` so an in-flight production deploy is never interrupted.

**Rules (MUST / SHOULD):**

- The static checks and the test matrix MUST run as parallel jobs on every PR to `master`.
- Installs MUST use `--frozen-lockfile`; every job MUST pin the Node version (22).
- `test-e2e` MUST `needs: [build]` and MUST provide its own Postgres service.
- Slow gates (mutation) MUST be path-filtered; deploy MUST be guarded (manual trigger + non-cancelling concurrency + secrets).

**Aligning an existing repo:**

1. Add a PR workflow whose jobs mirror `pnpm run ci` plus per-suffix test jobs; pin Node and use `--frozen-lockfile`.
2. Add a path-filtered mutation workflow and a manual, secret-gated deploy workflow.
3. Set `concurrency` to cancel superseded CI runs but never deploys.

## Runtime choices

- **Hono** as the HTTP server — deliberately runtime-agnostic. If Cloudflare Workers stops fitting (a cold-start regression, a pricing change, a feature Workers can't express), the Hono app moves to Node / Bun / Deno / a container with near-zero rewrite.
- **Cloudflare Workers** as the starter runtime — chosen because it's exceptionally cheap and fast out of the box, with a global edge by default. Drizzle + Hyperdrive give Postgres access without managing a connection pool.
- **The swap path** — `src/api/` is the composition boundary. Replace `src/server.ts` (the Workers entry) with a different runtime adapter to change runtime; the app factory does not change.

**Rules (MUST / SHOULD):**

- All HTTP MUST be defined on the Hono app, never bound directly to a Workers handler, so the runtime stays swappable.
- A runtime change MUST happen only at `src/server.ts` (the runtime adapter); the app factory in `src/api/` MUST NOT change.

**Aligning an existing repo:**

1. Define your HTTP surface on a runtime-agnostic framework (Hono).
2. Keep the runtime entry (`server.ts`) as the only runtime-specific file; compose the app in `src/api/`.

## Codebase intelligence (fallow)

[fallow](https://github.com/fallow-rs/fallow) is a Rust-native, sub-second whole-project analyzer for TypeScript/JavaScript. It finds things oxlint's per-file model can't see:

- **Dead code** — unused files, exports, types, dependencies
- **Duplication** — cross-file clone groups
- **Complexity hotspots** — cyclomatic + cognitive complexity, churn-vs-complexity hotspots
- **Circular dependencies**
- **Architecture drift**

Use the `codebase:*` scripts for stable, tool-agnostic commands — they're aliases (see [Scripts](#scripts)), and fallow is the current implementation behind them:

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

`pnpm run ci` runs `pnpm codebase:audit` (`fallow audit`) as a quality gate — it scopes analysis to files changed against the base branch and returns a pass/warn/fail verdict. Configuration lives in `.fallowrc.json`, including custom boundary zones and rules for the hexagonal architecture. Generated files that should not be analyzed directly are ignored, while generated reachability roots such as `src/webapp/routeTree.gen.ts`, the deliberate public inferred-row-type surface `src/infra/drizzle/types.ts`, and intentionally vendored UI snippets are listed as entries so routes, shared row types, and template scaffolding do not look unused.

The fast audit does not consume coverage output. Because this template intentionally unit-tests `domain`/`api` and browser/integration-tests `webapp`/`infra`, `.fallowrc.json` raises `health.maxCrap` so zero-coverage CRAP false positives on UI/infra code do not become stricter than the cyclomatic and cognitive complexity gates. Duplication scans use a higher `duplicates.minLines` threshold because short Testcontainers/MSW setup blocks are acceptable boilerplate, and `duplicate-exports` is a warning because TanStack route files must each export `Route`.

For the full feature set, see the [fallow docs](https://docs.fallow.tools).

## Reproducing this setup in your own repo

### Install the toolchain

Versions live in [`package.json`](./package.json) — copy them from there. The commands below intentionally omit version pins.

```sh
# Package manager (pin the version from package.json)
corepack enable
corepack prepare pnpm@<version-from-package.json> --activate

# App, runtime, build
pnpm add react react-dom @tanstack/react-start @tanstack/react-router @chakra-ui/react @emotion/react
pnpm add -D vite @vitejs/plugin-react @cloudflare/vite-plugin wrangler

# Data, auth, HTTP
pnpm add drizzle-orm postgres hono @hono/zod-openapi zod better-auth
pnpm add -D drizzle-kit

# Lint, format, codebase intelligence, hooks, types
pnpm add -D oxlint oxfmt fallow lefthook typescript

# Testing
pnpm add -D vitest @vitest/browser @vitest/browser-playwright @vitest/coverage-v8 \
  @playwright/test testcontainers @testcontainers/postgresql msw \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  @stryker-mutator/core @stryker-mutator/vitest-runner

# Install git hooks
pnpm run prepare
```

### Then apply the conventions

A short checklist for applying these conventions to a greenfield project:

1. `pnpm init`, set `"packageManager": "pnpm@10.x"`.
2. Create `src/domain`, `src/infra`, `src/utils` on day one, even if empty. Directory shape is a commitment.
3. Copy `tsconfig.json`, `tsconfig.app.json`, and the layer configs (`tsconfig.domain.json`, `tsconfig.infra.json`, `tsconfig.api.json`, `tsconfig.webapp.json`); adjust the includes/aliases.
4. Set up `oxlint.config.ts` and `oxfmt.config.ts`. Copy `tools/oxlint-plugins/` and rename the `starter` namespace.
5. Add `lefthook.yml` with pre-commit (lint + format + `vitest related --project unit` + `pnpm fallow:ci`) and pre-push (`vitest run --changed origin/master --project unit`).
6. Add the `pnpm ci` script: lint check → format check → layered typecheck → full source typecheck → test typecheck → fallow audit.
7. Add Stryker (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`), `stryker.config.mjs`, `vitest.mutation.config.ts`, and the `pnpm test:mutate` script with an 80% `thresholds.break` floor.
8. Adopt the four test-type filename suffixes (`.unit`, `.browser`, `.integration`, `.e2e`) before writing any tests.
9. Adopt `*.schema.ts` / `*.types.ts` before introducing any declaration-only module.
10. Put your HTTP server behind Hono so the runtime stays swappable.
11. Wire fallow with `.fallowrc.json` to catch dead code and duplication as the project grows.
12. Mirror the local gates in CI: parallel static + test-matrix jobs, path-filtered mutation, and a guarded deploy (see [Continuous integration](#continuous-integration)).

## Reference

- [`AGENTS.md`](./AGENTS.md) — commands, imports, hook commands, and agent workflow notes.
- [`package.json`](./package.json) — dependency versions (source of truth) and the full script list.
- [`.github/workflows/`](./.github/workflows/) — `ci.yml`, `mutation.yml`, and `deploy.yml` pipelines.
- `tsconfig*.json` — base strict config plus the layered configs.
- `oxlint.config.ts` / `oxfmt.config.ts` — lint and format configuration.
- `tools/oxlint-plugins/README.md` — the custom lint plugin, including `domain-no-infra-imports`.
- `.fallowrc.json` — fallow configuration (boundary zones and rules).
- `stryker.config.mjs` and `vitest.mutation.config.ts` — mutation testing configuration.
- `wrangler.jsonc` — Cloudflare Workers config (bindings, vars).
- `drizzle.config.ts` — database schema/migration configuration.
- `lefthook.yml` — git hook definitions.
- `.devcontainer/` — dev container definition and post-create setup.
