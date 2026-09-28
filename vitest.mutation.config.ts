import { defineConfig } from 'vite-plus'

const defaultExclude = ['**/node_modules/**', '**/dist/**', '**/.{git,cache,output,temp}/**']

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    name: 'mutation',
    include: ['**/*.unit.test.{ts,tsx}'],
    exclude: defaultExclude,
    globals: true,
    environment: 'node',
  },
})
