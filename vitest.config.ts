import react from '@vitejs/plugin-react'
import { playwright } from 'vite-plus/test/browser-playwright'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

const defaultExclude = ['**/node_modules/**', '**/dist/**', '**/.{git,cache,output,temp}/**']
const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },

  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Vitest v4 compatibility: keep separate Vite servers for inline projects.
    // Remove when plugins and config hooks can run once for shared projects.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#inline-projects-share-the-vite-server-by-default
    sharedViteServer: false,
    projects: [
      {
        // Vitest v4 compatibility: keep this inline project independent of the root config.
        // Remove to inherit root options, including plugins and setup files.
        // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
        // https://vitest.dev/guide/migration/#inline-projects-inherit-the-root-config-by-default
        extends: false,
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: {
            '@test-utils': resolvePath('./test/browser'),
          },
        },
        test: {
          // Vitest v4 compatibility: preserve mock call history.
          name: 'browser',
          include: ['**/*.browser.test.{ts,tsx}'],
          exclude: defaultExclude,
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          browser: {
            locators: {
              // Vitest v4 compatibility: keep partial, case-insensitive locator matching.
              // Remove after updating locators for full, case-sensitive matches.
              // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
              // https://vitest.dev/guide/migration/#locators-are-strict-by-default
              exact: false,
            },
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
          },
          css: true,
        },
      },
      {
        // Vitest v4 compatibility: keep this inline project independent of the root config.
        // Remove to inherit root options, including plugins and setup files.
        // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
        // https://vitest.dev/guide/migration/#inline-projects-inherit-the-root-config-by-default
        extends: false,
        resolve: {
          tsconfigPaths: true,
          alias: {
            '@test-utils': resolvePath('./test/unit'),
          },
        },
        test: {
          // Vitest v4 compatibility: preserve mock call history.
          name: 'unit',
          include: ['**/*.unit.test.{ts,tsx}'],
          exclude: defaultExclude,
          globals: true,
          environment: 'node',
        },
      },
      {
        // Vitest v4 compatibility: keep this inline project independent of the root config.
        // Remove to inherit root options, including plugins and setup files.
        // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
        // https://vitest.dev/guide/migration/#inline-projects-inherit-the-root-config-by-default
        extends: false,
        resolve: {
          tsconfigPaths: true,
          alias: {
            '@test-utils': resolvePath('./test/integration'),
          },
        },
        test: {
          // Vitest v4 compatibility: preserve mock call history.
          name: 'integration',
          include: ['**/*.integration.test.{ts,tsx}'],
          exclude: defaultExclude,
          globals: true,
          environment: 'node',
          setupFiles: ['./test/integration/setup.ts'],
          globalSetup: ['./test/integration/global-setup.ts'],
          testTimeout: 30000,
          hookTimeout: 60000,
          pool: 'forks',
          fileParallelism: false,
        },
      },
    ],
  },
})
