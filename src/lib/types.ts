export interface FlagDef {
  name: string
  required?: boolean
  type: 'string' | 'enum' | 'boolean'
  allowedValues?: string[]
  help?: string
  valueKind?: 'plain' | 'sensitive'
}

export interface PositionalArg {
  name: string
  required?: boolean
  type: string
  help?: string
}

export interface CommandDef {
  id: string
  path: string[]
  category: string
  synopsis: string
  mayEmitSecrets?: boolean
  composeOnly?: boolean
  positionalArgs: PositionalArg[]
  flags: FlagDef[]
}

export interface PassCliSpec {
  sourceUrl: string
  rawDocBase: string
  fetchedAt: string
  cliVersionKnown: string | null
  commands: CommandDef[]
}

export type ParamBinding =
  | { kind: 'literal'; value: string }
  | { kind: 'step'; stepId: string; jqPath: string }

export interface StepConfig {
  id: string
  commandId: string
  flagValues: Record<string, ParamBinding | undefined>
  positionalValues: Record<string, ParamBinding | undefined>
}

export interface GroupConfig {
  id: string
  name: string
  description: string
  steps: StepConfig[]
}

/** jq paths allowed for bindings — metadata only, never secret fields */
export const SAFE_BIND_PATHS = [
  '.[].share_id',
  '.[].id',
  '.[].name',
  '.[].vault_name',
  '.[].role',
  '.[].expires',
  '.accesses[].share_id',
  '.accesses[].role',
  '.accesses[].type',
] as const
