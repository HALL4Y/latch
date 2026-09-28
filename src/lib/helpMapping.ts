import bundled from '../data/help-mapping.json'

export type HelpChild = { name: string; description: string }

export type HelpFlag = {
  name: string
  description: string
  takesValue: boolean
  possibleValues?: string[]
  positional?: boolean
}

export type HelpNode = {
  path: string[]
  description: string
  children: HelpChild[]
  flags: HelpFlag[]
}

export type HelpMappingFile = {
  generatedAt: string
  passCliVersion: string | null
  fixture: boolean
  source: string
  passCliBin?: string
  nodes: Record<string, HelpNode>
}

export const LIST_FAMILIES = [
  { key: 'vault' as const, label: 'Coffres', listPath: ['vault', 'list'], arrayName: 'VAULTS', loopVar: 'VAULT' },
  { key: 'agent' as const, label: 'Agents', listPath: ['agent', 'list'], arrayName: 'AGENTS', loopVar: 'AGENT' },
  {
    key: 'pat' as const,
    label: 'PAT',
    listPath: ['personal-access-token', 'list'],
    arrayName: 'PATS',
    loopVar: 'PAT',
  },
  { key: 'share' as const, label: 'Partages', listPath: ['share', 'list'], arrayName: 'SHARES', loopVar: 'SHARE' },
]

export type FamilyKey = (typeof LIST_FAMILIES)[number]['key']

export function pathKey(path: string[]): string {
  return path.length ? path.join('.') : '_root'
}

export function loadBundledMapping(): HelpMappingFile {
  return bundled as HelpMappingFile
}

export function getNode(mapping: HelpMappingFile, path: string[]): HelpNode | undefined {
  return mapping.nodes[pathKey(path)]
}

export function familyHasList(mapping: HelpMappingFile, listPath: string[]): boolean {
  return Boolean(mapping.nodes[pathKey(listPath)])
}

export function commandLabel(path: string[]): string {
  return path.join(' ')
}
