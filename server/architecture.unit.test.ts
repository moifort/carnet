/**
 * Architecture unit tests — validates project-wide conventions.
 * This file is intentionally at the server root and self-excluded from the co-location rule.
 */
import { describe, expect, test } from 'bun:test'
import { globSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const SERVER_DIR = join(import.meta.dir)
const DOMAIN_DIR = join(SERVER_DIR, 'domain')

// Mini-domains that live under server/system/ but must still obey the domain rules
// (folder shape, purity, naming, no-throw). They escape the server/domain/* globs,
// so their files are folded back into the relevant checks below.
const SYSTEM_HOSTED = ['account', 'changelog', 'portability'] as const

const domains = readdirSync(DOMAIN_DIR).filter((d) => statSync(join(DOMAIN_DIR, d)).isDirectory())

const readFile = (path: string) => readFileSync(path, 'utf-8')

const glob = (pattern: string) => globSync(pattern, { cwd: join(SERVER_DIR, '..') })

// Same relative pattern applied to server/domain/* and to each system-hosted mini-domain.
const domainAndSystemHostedGlob = (suffix: string) => [
  ...glob(`server/domain/*/${suffix}`),
  ...SYSTEM_HOSTED.flatMap((d) => glob(`server/system/${d}/${suffix}`)),
]

describe('architecture', () => {
  describe('each domain has a types.ts', () => {
    for (const domain of domains) {
      test(domain, () => {
        const typesPath = join(DOMAIN_DIR, domain, 'types.ts')
        expect(statSync(typesPath).isFile()).toBe(true)
      })
    }
  })

  describe('primitives.ts imports ts-brand and zod', () => {
    const primitivesFiles = glob('server/domain/*/primitives.ts')

    // Skip pure re-export files (e.g. gift/primitives.ts re-exports from shared)
    const ownPrimitives = primitivesFiles.filter((f) => {
      const content = readFile(join(SERVER_DIR, '..', f))
      return !content.split('\n').every((l) => l.trim() === '' || l.startsWith('export '))
    })

    for (const file of ownPrimitives) {
      const fullPath = join(SERVER_DIR, '..', file)
      const domain = file.split('/')[2]

      test(domain, () => {
        const content = readFile(fullPath)
        expect(content).toContain('ts-brand')
        expect(content).toContain('zod')
      })
    }
  })

  describe('no console.log/error/warn in server code', () => {
    const serverFiles = glob('server/**/*.ts').filter(
      (f) => !f.includes('test/') && !f.endsWith('.test.ts'),
    )

    test('no console statements found', () => {
      const violations: string[] = []
      for (const file of serverFiles) {
        const content = readFile(join(SERVER_DIR, '..', file))
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (/console\.(log|error|warn)/.test(lines[i])) {
            violations.push(`${file}:${i + 1}: ${lines[i].trim()}`)
          }
        }
      }
      expect(violations).toEqual([])
    })
  })

  describe('no cross-domain repository imports', () => {
    const domainFiles = glob('server/domain/**/*.ts').filter((f) => !f.endsWith('.test.ts'))

    test('production code does not import repository from another domain', () => {
      const violations: string[] = []
      for (const file of domainFiles) {
        const parts = file.split('/')
        const currentDomain = parts[2]
        const content = readFile(join(SERVER_DIR, '..', file))
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(
            /from\s+['"]~\/domain\/(\w+)\/infrastructure\/repository['"]/,
          )
          if (match && match[1] !== currentDomain) {
            violations.push(`${file}:${i + 1}: imports ${match[1]}/infrastructure/repository`)
          }
        }
      }
      expect(violations).toEqual([])
    })
  })

  describe('tests are co-located with source files', () => {
    const testFiles = glob('server/**/*.test.ts').filter(
      (f) => f !== 'server/architecture.unit.test.ts',
    )
    const validSuffixes = ['.unit.test.ts', '.int.test.ts', '.feat.test.ts']

    test('each test file uses a valid suffix', () => {
      const violations = testFiles.filter(
        (f) => !validSuffixes.some((suffix) => f.endsWith(suffix)),
      )
      expect(violations).toEqual([])
    })

    test('each test file is in the same directory as a source file', () => {
      const violations: string[] = []
      for (const testFile of testFiles) {
        const dir = dirname(join(SERVER_DIR, '..', testFile))
        const sourceFiles = readdirSync(dir).filter(
          (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
        )
        if (sourceFiles.length === 0) {
          violations.push(testFile)
        }
      }
      expect(violations).toEqual([])
    })
  })

  describe('query.ts and command.ts name the business concept, not the technical pattern', () => {
    const targets = domainAndSystemHostedGlob('{query,command,business-rules}.ts')
    // Exported names must carry intent, never a getX/computeX/handleX scaffold.
    // Reads read as `all`, `byId`, `view`, `placements`; writes as the business
    // action (`create`, `addVersion`). `findAll`/`findBy` stay (repository idiom).
    const bannedPrefixes = /export const (get|compute|handle|process|manage|perform|fetch)[A-Z]/

    for (const file of targets) {
      test(`${basename(dirname(file))}/${basename(file)}`, () => {
        const content = readFile(join(SERVER_DIR, '..', file))
        const lines = content.split('\n')
        const violations: string[] = []
        for (let i = 0; i < lines.length; i++) {
          if (bannedPrefixes.test(lines[i])) {
            violations.push(`${file}:${i + 1}: ${lines[i].trim()}`)
          }
        }
        expect(violations).toEqual([])
      })
    }
  })

  describe('business-rules.ts is pure (no IO)', () => {
    const businessRulesFiles = domainAndSystemHostedGlob('business-rules.ts')

    for (const file of businessRulesFiles) {
      test(basename(dirname(file)), () => {
        const content = readFile(join(SERVER_DIR, '..', file))
        const violations: string[] = []
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (/~\/system\/firebase|firebase-admin|\bdb\(/.test(lines[i])) {
            violations.push(`${file}:${i + 1}: touches Firestore (must be pure)`)
          }
          if (/\basync\b/.test(lines[i])) {
            violations.push(`${file}:${i + 1}: uses async (must be pure/synchronous)`)
          }
        }
        expect(violations).toEqual([])
      })
    }
  })

  describe('use-case.ts does not bypass domain boundaries', () => {
    const useCaseFiles = domainAndSystemHostedGlob('use-case.ts')

    for (const file of useCaseFiles) {
      test(basename(dirname(file)), () => {
        const content = readFile(join(SERVER_DIR, '..', file))
        const violations: string[] = []
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          // `db()` only — a use case may still reach for `auth` (deleting the account
          // itself), which is not storage and has no command/query to go through.
          if (/\bdb\(/.test(lines[i])) {
            violations.push(
              `${file}:${i + 1}: touches Firestore directly (must go through commands/queries)`,
            )
          }
          const repoMatch = lines[i].match(
            /from\s+['"]~\/domain\/(\w+)\/infrastructure\/repository['"]/,
          )
          if (repoMatch) {
            violations.push(
              `${file}:${i + 1}: imports ${repoMatch[1]}/infrastructure/repository (must go through commands/queries)`,
            )
          }
        }
        expect(violations).toEqual([])
      })
    }
  })

  describe('Firestore is reached only through the storage layer', () => {
    // `db()` belongs to the repositories and to the shared Firestore utils. Everything
    // else must go through a domain's command/query namespace. The migration runner is
    // the storage layer of the migrations, so it holds the same licence.
    const allowedDbImporters =
      /^server\/(domain\/\w+\/infrastructure\/repository\.ts|system\/(ai|electrolux)\/repository\.ts|utils\/firestore\.ts|system\/migration\/runner\.ts)$/
    const serverFiles = glob('server/**/*.ts').filter((f) => !f.endsWith('.test.ts'))
    // `db` as a named import — `auth` from the same module is not storage and is
    // deliberately left to the auth middleware and the account use case.
    const importsDb = /import\s+\{[^}]*\bdb\b[^}]*\}\s+from\s+['"]~\/system\/firebase['"]/

    test('db() is imported only from the storage layer', () => {
      const violations = serverFiles.filter(
        (f) => !allowedDbImporters.test(f) && importsDb.test(readFile(join(SERVER_DIR, '..', f))),
      )
      expect(violations).toEqual([])
    })
  })

  describe('test suffixes match what the test exercises', () => {
    test('every .int.test.ts drives the fake Firestore', () => {
      const violations = glob('server/**/*.int.test.ts').filter(
        (f) => !/test\/fake-firestore/.test(readFile(join(SERVER_DIR, '..', f))),
      )
      expect(violations).toEqual([])
    })

    test('every .feat.test.ts executes the GraphQL schema', () => {
      const violations = glob('server/**/*.feat.test.ts').filter(
        (f) => !/from\s+['"]graphql['"]/.test(readFile(join(SERVER_DIR, '..', f))),
      )
      expect(violations).toEqual([])
    })
  })

  describe('no throw in domain query.ts and command.ts', () => {
    const targets = domainAndSystemHostedGlob('{query,command}.ts')

    // Known exceptions: data integrity checks where referenced entity is missing
    const allowedThrowPatterns: Record<string, RegExp[]> = {}

    for (const file of targets) {
      test(`${basename(dirname(file))}/${basename(file)}`, () => {
        const content = readFile(join(SERVER_DIR, '..', file))
        const lines = content.split('\n')
        const patterns = allowedThrowPatterns[file] ?? []
        const violations: string[] = []
        for (let i = 0; i < lines.length; i++) {
          if (/throw\s+new\s+Error/.test(lines[i]) && !patterns.some((p) => p.test(lines[i]))) {
            violations.push(`${file}:${i + 1}: ${lines[i].trim()}`)
          }
        }
        expect(violations).toEqual([])
      })
    }
  })
})
