import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isSemverBehind, mappingDrift, parsePassCliSemver } from './passCliVersion.ts'

describe('parsePassCliSemver', () => {
  it('parses Proton Pass CLI version strings', () => {
    assert.equal(parsePassCliSemver('Proton Pass CLI 2.4.1 (04de99b)'), '2.4.1')
  })
})

describe('mappingDrift', () => {
  it('detects mismatch between local and mapping', () => {
    assert.equal(
      mappingDrift('Proton Pass CLI 2.4.2 (x)', 'Proton Pass CLI 2.4.1 (y)'),
      true,
    )
    assert.equal(
      mappingDrift('Proton Pass CLI 2.4.1 (x)', 'Proton Pass CLI 2.4.1 (y)'),
      false,
    )
  })
})

describe('isSemverBehind', () => {
  it('compares semver cores', () => {
    assert.equal(isSemverBehind('2.4.1', '2.5.0'), true)
    assert.equal(isSemverBehind('2.5.0', '2.4.1'), false)
    assert.equal(isSemverBehind('2.4.1', '2.4.1'), false)
  })
})
