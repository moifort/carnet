import { describe, expect, test } from 'bun:test'
import { parseChangelog } from '~/system/changelog/business-rules'
import { ChangelogVersion } from '~/system/changelog/primitives'

describe('parseChangelog', () => {
  test('returns an empty list for an empty document', () => {
    expect(parseChangelog('')).toEqual([])
  })

  test('returns an empty list when no version heading exists', () => {
    expect(parseChangelog('# Changelog\n\nIntro paragraph.\n')).toEqual([])
  })

  test('parses a versioned heading into a version and a date', () => {
    const md = ['# Changelog', '', '## 1.1 (2026.04.26)', '- First note', '- Second note', ''].join(
      '\n',
    )
    const result = parseChangelog(md)
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe(ChangelogVersion('1.1'))
    expect(result[0].date?.toISOString()).toBe('2026-04-26T00:00:00.000Z')
    expect(result[0].notes).toEqual(['First note', 'Second note'])
  })

  test('parses a legacy bare-date heading (version equals the date)', () => {
    const md = ['# Changelog', '', '## 2026.04.26', '- Note', ''].join('\n')
    const result = parseChangelog(md)
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe(ChangelogVersion('2026.04.26'))
    expect(result[0].date?.toISOString()).toBe('2026-04-26T00:00:00.000Z')
  })

  test('parses an Unreleased section, which carries no date', () => {
    const md = '# Changelog\n\n## Unreleased\n- Pending note\n'
    const result = parseChangelog(md)
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe(ChangelogVersion('Unreleased'))
    expect(result[0].date).toBeUndefined()
    expect(result[0].notes).toEqual(['Pending note'])
  })

  test('preserves the order of versions as written', () => {
    const md = [
      '# Changelog',
      '',
      '## Unreleased',
      '- A',
      '',
      '## 1.1 (2026.04.26)',
      '- B',
      '',
      '## 1.0 (2026.04.20)',
      '- C',
    ].join('\n')
    const result = parseChangelog(md)
    expect(result.map(({ version }) => version)).toEqual([
      ChangelogVersion('Unreleased'),
      ChangelogVersion('1.1'),
      ChangelogVersion('1.0'),
    ])
  })

  test('accepts both dash and asterisk bullets', () => {
    const md = '## 2026.04.26\n- Dash note\n* Asterisk note\n'
    expect(parseChangelog(md)[0].notes).toEqual(['Dash note', 'Asterisk note'])
  })

  test('ignores non-bullet lines under a version heading', () => {
    const md = '## 2026.04.26\nSome paragraph.\n- Real note\nAnother paragraph.\n'
    expect(parseChangelog(md)[0].notes).toEqual(['Real note'])
  })

  test('ignores the level-1 title heading', () => {
    const md = '# Changelog\n\n## 2026.04.26\n- Note\n'
    expect(parseChangelog(md)).toHaveLength(1)
  })

  test('rejects malformed dates by rejecting the version itself', () => {
    expect(() => parseChangelog('## 2026/04/26\n- Note\n')).toThrow()
  })

  test('handles CRLF line endings', () => {
    const md = '# Changelog\r\n\r\n## 2026.04.26\r\n- Note\r\n'
    const result = parseChangelog(md)
    expect(result).toHaveLength(1)
    expect(result[0].notes).toEqual(['Note'])
  })
})
