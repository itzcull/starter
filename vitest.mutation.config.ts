import { defineConfig } from 'vite-plus'

const defaultExclude = ['**/node_modules/**', '**/dist/**', '**/.{git,cache,output,temp}/**']

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'mutation',
    include: ['**/*.unit.test.{ts,tsx}'],
    exclude: defaultExclude,
    globals: true,
    environment: 'node',
  },
})
