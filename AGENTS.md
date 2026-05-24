# Development Toolchain

This project uses **Vite 8**, **Vitest 4**, **Stryker**, **oxlint**, **oxfmt**, and **pnpm** as its development toolchain. Each tool is installed directly as a devDependency.

## Commands

### Development

- `pnpm dev` - Start the Vite dev server
- `pnpm build` - Production build with Vite
- `pnpm preview` - Preview the production build

### Testing

- `pnpm test` - Run all tests (Vitest, watch mode)
- `pnpm test:unit` - Run unit tests only
- `pnpm test:browser` - Run browser tests only
- `pnpm test:integration` - Run integration tests (requires Docker)
- `pnpm test:e2e` - Run Playwright end-to-end tests
- `pnpm test:mutate` - Run Stryker mutation tests against unit-tested source
- `pnpm vitest run --project <name>` - Run a specific test project in CI mode (no watch)

### Integration Test Boundaries

- Use Testcontainers for validating database calls against real database infrastructure.
- Use Mock Service Worker (`msw`) for validating third-party HTTP calls, whether the application calls `fetch` directly or uses an SDK that communicates with its downstream service over HTTP.
- Add per-test HTTP handlers with the shared `server` from `test/msw/server.ts`; unhandled HTTP requests fail the integration test by default.

### Code Quality

- `pnpm lint` - Lint and auto-fix with oxlint (includes local `starter/*` JS plugin rules in `tools/oxlint-plugins/`)
- `pnpm format` - Format code with oxfmt
- `pnpm run ci` - Full CI check: lint, format, typecheck, and Fallow audit

### Dependencies

- `pnpm install` - Install dependencies
- `pnpm add <pkg>` - Add a dependency
- `pnpm remove <pkg>` - Remove a dependency

## Configuration

- **Vite config**: `vite.config.ts` (plugins, resolve)
- **Vitest config**: `vitest.config.ts` (test projects: unit, browser, integration)
- **Mutation Vitest config**: `vitest.mutation.config.ts` (unit tests only for Stryker)
- **Stryker config**: `stryker.config.mjs` (mutation scope, reporters, 80% break threshold)
- **oxlint config**: `oxlint.config.ts` (type-aware linting, ignore patterns)
- **oxfmt config**: `oxfmt.config.ts` (formatting: no semi, single quotes)
- **Fallow config**: `.fallowrc.json` (dead code analysis, dependency checks, custom architecture boundary zones)
- **TypeScript**: `tsconfig.json` and layer-specific configs

## Imports

- Import from `vite` for Vite APIs (e.g., `import { defineConfig } from 'vite'`)
- Import from `vitest` for test utilities (e.g., `import { describe, expect, it } from 'vitest'`)
- Import from `vitest/config` for test configuration
- Import from `vitest/node` for node-specific test APIs
- Import from `@vitest/browser-playwright` for browser test providers

## Git Hooks

Git hooks are managed by [lefthook](https://lefthook.dev), configured in `lefthook.yml`.

- **pre-commit** runs `oxlint --fix` and `oxfmt --write` on staged files (auto-restaged), then runs `vitest related` over the staged files — only unit tests that import a staged file execute. It also runs `pnpm fallow:ci` to enforce Fallow checks before each commit.
- **pre-push** runs `vitest run --changed origin/master --project unit`, executing only the unit tests affected by files changed against `origin/master`.

Mutation testing is intentionally not a git hook because it is slower than the commit/push feedback loop. Run `pnpm test:mutate` before merging changes to `src/domain/**`, `src/api/**`, or unit-test behaviour; CI enforces the same command for those paths.

Hooks install automatically via the `prepare` script (`lefthook install`). To skip them for a single command, set `LEFTHOOK=0`.

## Review Checklist for Agents

- [ ] Run `pnpm install` after pulling remote changes and before getting started.
- [ ] Run `pnpm run ci` and `pnpm test` to validate changes.
- [ ] Run `pnpm fallow list --boundaries` and `pnpm fallow dead-code --boundary-violations` after changing architecture boundary config.
- [ ] Run `pnpm test:mutate` when changing mutation-scoped logic or unit tests.
