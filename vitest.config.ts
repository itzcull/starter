import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const defaultExclude = ['**/node_modules/**', '**/dist/**', '**/.{git,cache,output,temp}/**']
const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },

  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: {
            '@test-utils': resolvePath('./test/browser'),
          },
        },
        test: {
          name: 'browser',
          include: ['**/*.browser.test.{ts,tsx}'],
          exclude: defaultExclude,
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          browser: {
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
          },
          css: true,
        },
      },
      {
        resolve: {
          tsconfigPaths: true,
          alias: {
            '@test-utils': resolvePath('./test/unit'),
          },
        },
        test: {
          name: 'unit',
          include: ['**/*.unit.test.{ts,tsx}'],
          exclude: defaultExclude,
          globals: true,
          environment: 'node',
        },
      },
      {
        resolve: {
          tsconfigPaths: true,
          alias: {
            '@test-utils': resolvePath('./test/integration'),
          },
        },
        test: {
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
