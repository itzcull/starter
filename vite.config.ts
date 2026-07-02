import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    semi: false,
    singleQuote: true,
    ignorePatterns: ['dist/**', 'worker-configuration.d.ts', 'src/webapp/routeTree.gen.ts'],
  },
  lint: {
    ignorePatterns: ['dist/**', 'worker-configuration.d.ts', 'src/webapp/routeTree.gen.ts'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      './tools/oxlint-plugins/index.js',
      { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' },
    ],
    rules: {
      'starter/domain-no-infra-imports': 'error',
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
  },
  plugins: [
    cloudflare({
      viteEnvironment: {
        name: 'ssr',
      },
      configPath: './wrangler.jsonc',
      persistState: {
        path: './.wrangler/state',
      },
    }),
    tanstackStart({
      router: {
        entry: 'webapp/router',
        routesDirectory: 'webapp/routes',
        generatedRouteTree: 'webapp/routeTree.gen.ts',
      },
    }),
    react(),
  ],

  resolve: {
    tsconfigPaths: true,
  },
})
