# Development Toolchain

This project uses **Vite+** (`vite-plus`) as its unified toolchain, which bundles **Vite 8**, **Vitest 4**, **Oxlint**, and **Oxfmt** behind the `vp` command. **Stryker** (mutation testing), **Fallow** (codebase intelligence), and **pnpm** complete the toolchain. Vite+ is installed as a devDependency; `vite` and `vitest` are provided through the `pnpm-workspace.yaml` catalog so plugins and runners that peer on them resolve to Vite+'s versions.

## Commands

### Development

- `pnpm dev` - Start the dev server (`vp dev`)
- `pnpm build` - Production build (`vp build`)
- `pnpm preview` - Preview the production build (`vp preview`)

### Testing

- `pnpm test` - Run all tests (Vitest, watch mode)
- `pnpm test:unit` - Run unit tests only
- `pnpm test:browser` - Run browser tests only
- `pnpm test:integration` - Run integration tests (requires Docker)
- `pnpm test:e2e` - Run Playwright end-to-end tests
- `pnpm test:coverage` - Run all Vitest projects with coverage
- `pnpm test:mutate` - Run Stryker mutation tests against unit-tested source
- `pnpm vitest run --project <name>` - Run a specific test project in CI mode (no watch)

> **Note:** Test scripts invoke `vitest` directly rather than `vp test`. Vite+ 0.2.x has a packaging skew between its test proxy (`@voidzero-dev/vite-plus-test`, bundling `@vitest/*@4.1.8`) and its runtime (`@vitest/*@4.1.9`) that breaks `vp test` with `Cannot read properties of undefined (reading 'config')`. `vitest@4.1.9` (pinned via the catalog) runs the suite correctly. Revisit `vp test` once Vite+ aligns these versions.

### Integration Test Boundaries

- Use Testcontainers for validating database calls against real database infrastructure.
- Use Mock Service Worker (`msw`) for validating third-party HTTP calls, whether the application calls `fetch` directly or uses an SDK that communicates with its downstream service over HTTP.
- Add per-test HTTP handlers with the shared `server` from `test/msw/server.ts`; unhandled HTTP requests fail the integration test by default.

### Code Quality

- `pnpm lint` - Lint and auto-fix with Oxlint via `vp lint` (includes local `starter/*` JS plugin rules in `tools/oxlint-plugins/` plus the built-in `vite-plus/prefer-vite-plus-imports` rule)
- `pnpm lint:check` - Lint without writing fixes
- `pnpm format` - Format code with Oxfmt via `vp fmt`
- `pnpm format:check` - Check formatting without writing fixes
- `pnpm typecheck` - Type-check the full source project
- `pnpm typecheck:layers` - Type-check domain, infra, api, and webapp layer configs
- `pnpm typecheck:test` - Type-check all test variants
- `pnpm typecheck:test:unit` - Type-check `*.unit.test.{ts,tsx}` with unit-only test helpers
- `pnpm typecheck:test:integration` - Type-check `*.integration.test.{ts,tsx}` and integration setup helpers
- `pnpm typecheck:test:browser` - Type-check `*.browser.test.{ts,tsx}` and browser setup
- `pnpm typecheck:test:e2e` - Type-check Playwright E2E tests and config
- `pnpm run ci` - Full static CI check: lint, format, source typechecks, test typecheck, and Fallow audit
- `vp check` - Combined format + lint + type check in one pass (preferred for validation loops)

### Dependencies

- `vp install` - Install dependencies (delegates to pnpm)
- `vp add <pkg>` - Add a dependency (delegates to pnpm)
- `vp remove <pkg>` - Remove a dependency (delegates to pnpm)

## Configuration

- **Vite+ config**: `vite.config.ts` (plugins, resolve, plus `fmt` and `lint` blocks that configure Oxfmt and Oxlint — no separate `oxlint.config.ts`/`oxfmt.config.ts`)
- **Vitest config**: `vitest.config.ts` (test projects: unit, browser, integration)
- **Mutation Vitest config**: `vitest.mutation.config.ts` (unit tests only for Stryker)
- **Stryker config**: `stryker.config.mjs` (mutation scope, reporters, 80% break threshold)
- **pnpm workspace catalog**: `pnpm-workspace.yaml` pins `vite-plus`, `vite`, and `vitest` so all consumers resolve to Vite+'s versions
- **Fallow config**: `.fallowrc.json` (dead code analysis, dependency checks, custom architecture boundary zones)
- **TypeScript**: `tsconfig.json`, `tsconfig.app.json`, and layer-specific configs
- **Test TypeScript**: `tsconfig.test.unit.json`, `tsconfig.test.integration.json`, `tsconfig.test.browser.json`, and `tsconfig.test.e2e.json` each model the runtime APIs for their test type. `@test-utils/*` is variant-local: unit tests resolve it to `test/unit/*`, integration tests to `test/integration/*`, browser tests to `test/browser/*`, and E2E tests to `e2e/test-utils/*`.

## Imports

- Import from `vite-plus` for Vite/Vite+ APIs (e.g., `import { defineConfig } from 'vite-plus'`)
- Import from `vite-plus/test` for test utilities (e.g., `import { describe, expect, it } from 'vite-plus/test'`)
- Import from `vite-plus/test/browser-playwright` for the browser test provider
- Import from `vite-plus/test/node` for node-specific test APIs
- `declare module 'vitest'` / `declare module '@vitest/browser*'` augmentations must keep targeting the upstream module names (`vitest`, `@vitest/browser*`) — `vite-plus/test*` is a thin re-export, so augmentations only merge when pointed at the upstream identity.

## Git Hooks

Git hooks are managed by [lefthook](https://lefthook.dev), configured in `lefthook.yml`.

- **pre-commit** runs `vp lint --fix` and `vp fmt --write` on staged files (auto-restaged), then runs `vitest related` over the staged files — only unit tests that import a staged file execute. It also runs `pnpm codebase:audit` to enforce codebase intelligence checks before each commit.
- **pre-push** runs `vitest run --changed origin/master --project unit`, executing only the unit tests affected by files changed against `origin/master`.

Mutation testing is intentionally not a git hook because it is slower than the commit/push feedback loop. Run `pnpm test:mutate` before merging changes to `src/domain/**`, `src/api/**`, or unit-test behaviour; CI enforces the same command for those paths.

Stryker runs only the unit Vitest project. Keep mutation scope to unit-tested `src/domain/**` and `src/api/**` behavior; exclude tests, generated files, declaration-only type modules, and adapter/composition code that is covered only by integration tests. Do not blanket-exclude schema modules because schemas often encode runtime contracts.

Fallow's fast audit runs without coverage data. `.fallowrc.json` treats generated route roots and deliberate public type surfaces as entries, ignores generated Worker types, raises CRAP tolerance so zero-coverage UI/infra false positives do not replace the cyclomatic/cognitive gates, warns on TanStack's repeated `Route` exports, and ignores short duplicate test setup blocks below 25 lines.

Integration test database setup applies committed Drizzle migrations through Drizzle's migrator; schema changes should be captured with `pnpm db:generate`, not mirrored in hand-written test DDL.

Chakra snippets live in `src/webapp/components/ui/`. The app provider mounts the shared toaster; add further snippets with the Chakra CLI and keep them under the webapp component tree.

For env flags generated by `wrangler types`, widen literal var types with `String(c.env.FLAG) === 'true'` before comparing. Prefer env-gated in-memory stubs at the `src/api/` composition boundary for external services needed by local dev or E2E.

Hooks install automatically via the `prepare` script (`lefthook install`). To skip them for a single command, set `LEFTHOOK=0`.

## Review Checklist for Agents

- [ ] Run `pnpm install` after pulling remote changes and before getting started.
- [ ] Run `pnpm run ci` and `pnpm test` to validate changes.
- [ ] Run `pnpm codebase:boundaries` and `pnpm codebase:boundary-violations` after changing architecture boundary config.
- [ ] Run `pnpm test:mutate` when changing mutation-scoped logic or unit tests.
