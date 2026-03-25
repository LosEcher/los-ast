import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampExcerpt,
  deterministicSort,
  fingerprintFor,
  passesConstraints,
  renderReplacement,
  summarizeParseFailures,
  toIsoNow,
  validateNoOverlap,
} from '../packages/core/src/runner/shared.mjs'

function createNodeStub({
  text = '',
  singleMatches = {},
  multipleMatches = {},
} = {}) {
  return {
    text() {
      return text
    },
    getMatch(name) {
      const value = singleMatches[name]
      return value ? { text: () => value } : null
    },
    getMultipleMatches(name) {
      return (multipleMatches[name] || []).map((value) => ({ text: () => value }))
    },
  }
}

test('runner shared helpers clamp excerpts, timestamps, and fingerprints deterministically', () => {
  assert.equal(clampExcerpt('short', 10), 'short')
  assert.equal(clampExcerpt('123456', 5), '12345…')
  assert.equal(toIsoNow(true), '1970-01-01T00:00:00.000Z')
  assert.match(toIsoNow(false), /^\d{4}-\d{2}-\d{2}T/)

  const fullFingerprint = fingerprintFor({
    ruleId: 'rule-1',
    file: '/tmp/demo.js',
    range: { start: { index: 1 }, end: { index: 4 } },
    proposedReplacement: 'after',
    deterministic: false,
  })
  const deterministicFingerprint = fingerprintFor({
    ruleId: 'rule-1',
    file: '/tmp/demo.js',
    range: { start: { index: 1 }, end: { index: 4 } },
    proposedReplacement: 'after',
    deterministic: true,
  })
  assert.equal(fullFingerprint.length, 64)
  assert.equal(deterministicFingerprint, fullFingerprint.slice(0, 32))
})

test('runner shared helpers render replacements and enforce constraints', () => {
  const node = createNodeStub({
    text: 'console.log(foo, bar)',
    singleMatches: { callee: 'console.log', arg: 'foo' },
    multipleMatches: { rest: ['foo', 'bar'] },
  })

  assert.equal(renderReplacement('logger($arg, $$$rest)', node), 'logger(foo, foo, bar)')
  assert.equal(passesConstraints(node, [
    { name: 'callee', regex: '^console\\.log$' },
    { name: 'rest', regex: '^b', mode: 'any' },
  ]), true)
  assert.equal(passesConstraints(node, [
    { name: 'rest', regex: '^z', mode: 'all' },
  ]), false)
  assert.equal(passesConstraints(node, [
    { name: '.', regex: '^console\\.log' },
  ]), true)
})

test('runner shared helpers validate overlaps, summarize parse failures, and sort findings', () => {
  const sorted = validateNoOverlap([
    { startPos: 10, endPos: 12 },
    { startPos: 1, endPos: 2 },
  ])
  assert.deepEqual(sorted.map((item) => item.startPos), [1, 10])
  assert.throws(() => validateNoOverlap([
    { startPos: 1, endPos: 4 },
    { startPos: 3, endPos: 5 },
  ]), /overlapping edits/)

  const parseSummary = summarizeParseFailures([
    { file: 'a.js', language: 'JavaScript', error: 'boom' },
    { file: 'b.ts', language: 'TypeScript', error: 'oops' },
    { file: 'c.js', language: 'JavaScript', error: 'again' },
  ])
  assert.deepEqual(parseSummary.byLanguage, { JavaScript: 2, TypeScript: 1 })
  assert.equal(parseSummary.count, 3)
  assert.equal(summarizeParseFailures([]), null)

  const findings = [
    { file: 'b.js', range: { start: { line: 1, column: 0 } } },
    { file: 'a.js', range: { start: { line: 2, column: 0 } } },
    { file: 'a.js', range: { start: { line: 1, column: 4 } } },
  ]
  findings.sort(deterministicSort)
  assert.deepEqual(findings.map((item) => `${item.file}:${item.range.start.line}:${item.range.start.column}`), [
    'a.js:1:4',
    'a.js:2:0',
    'b.js:1:0',
  ])
})
