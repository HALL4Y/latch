import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decidePassCliUpdate } from './passCliUpdatePolicyCore.ts'

describe('decidePassCliUpdate', () => {
  it('allows server update only when --yes is in the mapping', () => {
    const d = decidePassCliUpdate(['--set-track', '--yes'])
    assert.equal(d.canRunFromServer, true)
    assert.deepEqual(d.argv, ['update', '--yes'])
    assert.equal(d.copyCommand, 'pass-cli update --yes')
  })

  it('refuses server update when mapping lacks --yes (current 2.4.1 help tree)', () => {
    const d = decidePassCliUpdate(['--set-track'])
    assert.equal(d.canRunFromServer, false)
    assert.equal(d.argv, null)
    assert.equal(d.copyCommand, 'pass-cli update')
    assert.match(d.reasonFr, /Sans --yes/)
  })

  it('refuses server update when update node has no flags', () => {
    const d = decidePassCliUpdate([])
    assert.equal(d.canRunFromServer, false)
    assert.equal(d.copyCommand, 'pass-cli update')
  })
})
