import path from 'node:path'
import { describe, it } from 'vite-plus/test'
import rawRule from './domain-no-infra-imports.js'
import { runRuleTester, type Rule } from '../test-utils/rule-tester'

const rule = rawRule as Rule

const cwd = '/repo'
const domainFile = path.join(cwd, 'src/domain/user/service.ts')
const infraFile = path.join(cwd, 'src/infra/db/client.ts')
const webappFile = path.join(cwd, 'src/webapp/route.ts')

const MESSAGE =
  'src/domain must not import from src/infra — domain is the pure core. Move the shared code to src/domain/, or invert the dependency via an interface injected at the infra boundary.'

describe('starter/domain-no-infra-imports', () => {
  it('flags infra imports from domain files and ignores non-domain files', () => {
    runRuleTester(rule, {
      valid: [
        {
          name: 'domain file importing from @domain alias',
          filename: domainFile,
          cwd,
          code: `import { User } from '@domain/user/model'`,
        },
        {
          name: 'domain file importing external package',
          filename: domainFile,
          cwd,
          code: `import React from 'react'`,
        },
        {
          name: 'domain file with relative import staying inside src/domain',
          filename: domainFile,
          cwd,
          code: `import { shared } from '../shared/util'`,
        },
        {
          name: 'non-domain file importing from @infra is ignored',
          filename: webappFile,
          cwd,
          code: `import { db } from '@infra/db'`,
        },
        {
          name: 'non-domain file importing relatively into infra is ignored',
          filename: infraFile,
          cwd,
          code: `import { other } from './other'`,
        },
        {
          name: 'domain file dynamically importing a domain module',
          filename: domainFile,
          cwd,
          code: `await import('@domain/user/model')`,
        },
        {
          name: 'domain file with non-literal dynamic import is not flagged',
          filename: domainFile,
          cwd,
          code: `const name = 'x'; await import(name)`,
        },
      ],
      invalid: [
        {
          name: 'static import from @infra alias',
          filename: domainFile,
          cwd,
          code: `import { db } from '@infra/db'`,
          errors: [{ message: MESSAGE }],
        },
        {
          name: 'side-effect import from @infra alias',
          filename: domainFile,
          cwd,
          code: `import '@infra/db/client'`,
          errors: [{ message: MESSAGE }],
        },
        {
          name: 'named re-export from @infra',
          filename: domainFile,
          cwd,
          code: `export { something } from '@infra/thing'`,
          errors: [{ message: MESSAGE }],
        },
        {
          name: 'star re-export from @infra',
          filename: domainFile,
          cwd,
          code: `export * from '@infra/thing'`,
          errors: [{ message: MESSAGE }],
        },
        {
          name: 'dynamic import from @infra',
          filename: domainFile,
          cwd,
          code: `await import('@infra/db')`,
          errors: [{ message: MESSAGE }],
        },
        {
          name: 'relative escape into src/infra',
          filename: domainFile,
          cwd,
          code: `import x from '../../infra/db'`,
          errors: [{ message: MESSAGE }],
        },
      ],
    })
  })
})
