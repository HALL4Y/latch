import type { HelpMappingFile } from './helpMapping'
import { getNode } from './helpMapping'
import { decidePassCliUpdate, type PassCliUpdateDecision } from './passCliUpdatePolicyCore'

export type { PassCliUpdateDecision }
export { decidePassCliUpdate }

export function updateFlagNamesFromMapping(mapping: HelpMappingFile): string[] {
  const node = getNode(mapping, ['update'])
  if (!node) return []
  return node.flags.filter((f) => f.name !== '--help').map((f) => f.name)
}

export function decidePassCliUpdateFromMapping(mapping: HelpMappingFile): PassCliUpdateDecision {
  return decidePassCliUpdate(updateFlagNamesFromMapping(mapping))
}
