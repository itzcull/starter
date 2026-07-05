import { expect } from 'vite-plus/test'
import * as acorn from 'acorn'

type Visitor = (node: any) => void
type VisitorMap = Record<string, Visitor>

export type RuleContext = {
  getFilename: () => string
  getCwd: () => string
  sourceCode: { text: string }
  report: (descriptor: { message: string; node: any }) => void
}

export type Rule = {
  meta?: { type?: string }
  create: (context: RuleContext) => VisitorMap
}

export type ValidCase = {
  name?: string
  filename: string
  cwd?: string
  code: string
}

export type InvalidCase = ValidCase & {
  errors: Array<{ message?: string | RegExp }>
}

function parse(code: string): any {
  return acorn.parse(code, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    allowImportExportEverywhere: true,
  })
}

const SKIP_KEYS = new Set(['loc', 'range', 'start', 'end'])

function walk(node: any, visitors: VisitorMap): void {
  if (!node || typeof node.type !== 'string') return
  const visitor = visitors[node.type]
  if (visitor) visitor(node)
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue
    const child = (node as any)[key]
    if (!child) continue
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visitors)
    } else if (typeof child === 'object' && typeof child.type === 'string') {
      walk(child, visitors)
    }
  }
}

function runRule(
  rule: Rule,
  { filename, cwd, code }: { filename: string; cwd?: string; code: string },
): Array<{ message: string }> {
  const effectiveCwd = cwd ?? process.cwd()
  const collected: Array<{ message: string }> = []
  const ctx: RuleContext = {
    getFilename: () => filename,
    getCwd: () => effectiveCwd,
    sourceCode: { text: code },
    report: (d) => {
      collected.push({ message: d.message })
    },
  }
  const visitors = rule.create(ctx)
  walk(parse(code), visitors)
  return collected
}

export function runRuleTester(
  rule: Rule,
  cases: { valid: Array<ValidCase>; invalid: Array<InvalidCase> },
): void {
  for (const c of cases.valid) {
    const reports = runRule(rule, c)
    expect(
      reports,
      `valid case ${c.name ?? c.filename} should produce no diagnostics but produced: ${JSON.stringify(reports)}`,
    ).toEqual([])
  }
  for (const c of cases.invalid) {
    const reports = runRule(rule, c)
    expect(
      reports.length,
      `invalid case ${c.name ?? c.filename} expected ${c.errors.length} diagnostic(s), got ${reports.length}`,
    ).toBe(c.errors.length)
    c.errors.forEach((expected, i) => {
      if (expected.message instanceof RegExp) {
        expect(reports[i].message).toMatch(expected.message)
      } else if (typeof expected.message === 'string') {
        expect(reports[i].message).toBe(expected.message)
      }
    })
  }
}
