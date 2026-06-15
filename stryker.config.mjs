export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.mutation.config.ts',
  },
  tsconfigFile: 'tsconfig.json',
  mutate: [
    'src/domain/**/!(*.unit.test|*.integration.test|*.browser.test|*.types|*.d).ts',
    'src/api/**/!(*.unit.test|*.integration.test|*.browser.test|*.types|*.d).ts',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  thresholds: {
    high: 80,
    low: 60,
    break: 80,
  },
}
