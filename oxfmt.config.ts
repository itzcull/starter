import { defineConfig } from 'oxfmt'

export default defineConfig({
  semi: false,
  singleQuote: true,
  ignorePatterns: ['dist/**', 'worker-configuration.d.ts', 'src/webapp/routeTree.gen.ts'],
})
