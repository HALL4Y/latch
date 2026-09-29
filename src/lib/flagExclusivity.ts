import type { HelpNode } from './helpMapping'

type BlockLike = { bindings: Record<string, string> }

/** Pairs where pass-cli accepts only one flag; used in simple preview. */
export const EXCLUSIVE_PREVIEW_PAIRS: [string, string][] = [
  ['--share-id', '--vault-name'],
  ['--from-share-id', '--from-vault-name'],
  ['--to-share-id', '--to-vault-name'],
  ['--item-id', '--item-title'],
  ['--only-items', '--only-vaults'],
]

/** Same pairs as one control in mode simple (share list chips stay split). */
export const EXCLUSIVE_UI_PAIRS: [string, string][] = EXCLUSIVE_PREVIEW_PAIRS.filter(
  ([a, b]) => a !== '--only-items' || b !== '--only-vaults',
)

export function exclusiveChoiceKey(a: string, b: string): string {
  return `__choice__${a}|${b}`
}

export function exclusivePairsOnNode(
  node: HelpNode,
  pairs: [string, string][] = EXCLUSIVE_PREVIEW_PAIRS,
): [string, string][] {
  const names = new Set(node.flags.map((f) => f.name))
  return pairs.filter(([a, b]) => names.has(a) && names.has(b))
}

export function pickExclusiveFlag(pair: [string, string], block: BlockLike): string {
  const [a, b] = pair
  const stored = block.bindings[exclusiveChoiceKey(a, b)]
  if (stored === a || stored === b) return stored

  const aVal = block.bindings[a]?.trim()
  const bVal = block.bindings[b]?.trim()
  if (aVal && !bVal) return a
  if (bVal && !aVal) return b
  if (aVal && bVal) return stored === b ? b : a

  return a
}

export function shouldEmitSimpleFlag(
  node: HelpNode,
  flagName: string,
  block: BlockLike,
): boolean {
  for (const pair of exclusivePairsOnNode(node)) {
    if (pair[0] !== flagName && pair[1] !== flagName) continue
    return pickExclusiveFlag(pair, block) === flagName
  }
  return true
}

export function flagsHiddenByExclusiveUi(node: HelpNode): Set<string> {
  const hidden = new Set<string>()
  for (const [a, b] of exclusivePairsOnNode(node, EXCLUSIVE_UI_PAIRS)) {
    hidden.add(a)
    hidden.add(b)
  }
  return hidden
}

export function applyExclusiveChoice(
  bindings: Record<string, string>,
  pair: [string, string],
  active: string,
  value: string,
): Record<string, string> {
  const [a, b] = pair
  const next = { ...bindings, [exclusiveChoiceKey(a, b)]: active }
  if (active === a) {
    next[a] = value
    delete next[b]
  } else {
    next[b] = value
    delete next[a]
  }
  return next
}

export function setExclusiveMode(
  bindings: Record<string, string>,
  pair: [string, string],
  active: string,
): Record<string, string> {
  const [a, b] = pair
  const prev = active === a ? bindings[a] ?? '' : bindings[b] ?? ''
  return applyExclusiveChoice(bindings, pair, active, prev)
}
