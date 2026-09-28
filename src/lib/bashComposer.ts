import type { FamilyKey, HelpMappingFile, HelpNode } from './helpMapping'
import { LIST_FAMILIES, getNode, pathKey } from './helpMapping'
import { userInputUsesSudo } from './sudoPolicy'

export type FamilyMode = 'manual' | 'auto' | 'off'

export type ComposerBlock = {
  id: string
  path: string[]
  bindings: Record<string, string>
}

export type FamilyConfig = {
  mode: FamilyMode
  manualNames: string[]
  useInLoops: boolean
}

export type ComposeSettings = {
  role: string
  outputFormat: '' | 'json' | 'human'
  families: Record<FamilyKey, FamilyConfig>
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._/@+-]+$/.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function quoteValue(v: string): string {
  if (v.startsWith('$')) return `"${v}"`
  return shellQuote(v)
}

function safeLiteral(v: string): string | null {
  if (userInputUsesSudo(v)) return null
  return v
}

function listPathToCli(listPath: string[]): string {
  return `pass-cli ${listPath.join(' ')}`
}

function autoListBlock(family: (typeof LIST_FAMILIES)[number], outputFormat: string): string {
  const cmd = listPathToCli(family.listPath)
  const outFlag = outputFormat ? ` --output ${outputFormat}` : ''
  return [
    `# ${family.label} — liste auto (sortie reste dans votre terminal)`,
    `${family.arrayName}=()`,
    `if command -v jq >/dev/null 2>&1; then`,
    `  while IFS= read -r _line; do`,
    `    [ -n "$_line" ] && ${family.arrayName}+=("$_line")`,
    `  done < <(${cmd}${outFlag} 2>/dev/null | jq -r '.[] | (.Title // .title // .Name // .name // .label // empty)' | sed '/^$/d')`,
    `else`,
    `  while IFS= read -r _line; do`,
    `    [ -n "$_line" ] && ${family.arrayName}+=("$_line")`,
    `  done < <(${cmd}${outFlag} 2>/dev/null | tail -n +2)`,
    `fi`,
    `_latch_prune_${family.key}() {`,
    `  while true; do`,
    `    echo "${family.label} — numéro à retirer, ou Entrée pour continuer:"`,
    `    _i=1`,
    `    for _x in "\${${family.arrayName}[@]}"; do echo "  $_i) $_x"; _i=$((_i+1)); done`,
    `    read -r _pick`,
    `    [ -z "$_pick" ] && break`,
    `    case "$_pick" in (*[!0-9]*) break ;; esac`,
    `    if [ "$_pick" -ge 1 ] && [ "$_pick" -le "\${#${family.arrayName}[@]}" ]; then`,
    `      unset "${family.arrayName}[$((_pick-1))]"`,
    `      ${family.arrayName}=("\${${family.arrayName}[@]}")`,
    `    fi`,
    `  done`,
    `}`,
    `_latch_prune_${family.key}`,
    '',
  ].join('\n')
}

function manualArrayBlock(family: (typeof LIST_FAMILIES)[number], names: string[]): string {
  const safe = names.filter((n) => !userInputUsesSudo(n))
  const quoted = safe.map((n) => shellQuote(n)).join(' ')
  return [`# ${family.label} — saisie manuelle (non enregistrée par Latch)`, `${family.arrayName}=(${quoted})`, ''].join(
    '\n',
  )
}

function defaultBindingForFlag(
  flagName: string,
  posName: string,
  settings: ComposeSettings,
): string | undefined {
  if (flagName === '--role' && settings.role) return '$ROLE'
  if (flagName === '--output' && settings.outputFormat) return '$OUTPUT_FORMAT'
  if (flagName === '--vault-name' && settings.families.vault.useInLoops) return '$VAULT'
  if (flagName === '--share-id' && settings.families.share.useInLoops) return '$SHARE'
  if (posName === 'NAME' && settings.families.agent.useInLoops) return '$AGENT'
  return undefined
}

function placeholderForField(
  flagName: string,
  positional: boolean,
  path: string[],
  settings: ComposeSettings,
): string {
  if (flagName === '--vault-name') {
    return settings.families.vault.useInLoops ? '$VAULT' : '<$vault>'
  }
  if (flagName === '--share-id') {
    return settings.families.share.useInLoops ? '$SHARE' : '<$share>'
  }
  if (positional && flagName === 'NAME') {
    if (path[0] === 'personal-access-token' || path.includes('pat')) {
      return settings.families.pat.useInLoops ? '$PAT' : '<$pat>'
    }
    if (path[0] === 'agent') {
      return settings.families.agent.useInLoops ? '$AGENT' : '<$agent>'
    }
    return '<$name>'
  }
  const slug = flagName.replace(/^--/, '').replace(/-/g, '')
  return `<$${slug || 'valeur'}>`
}

function resolveNakedToken(
  block: ComposerBlock,
  settings: ComposeSettings,
  flag: HelpNode['flags'][number],
): string | null {
  if (flag.name === '--help') return null

  if (flag.positional) {
    const key = flag.name
    const raw =
      block.bindings[key] ??
      defaultBindingForFlag('', key, settings) ??
      (key === 'NAME' && settings.families.agent.useInLoops ? '$AGENT' : '')
    if (raw && !raw.startsWith('$')) {
      const safe = safeLiteral(raw)
      return safe ?? placeholderForField(key, true, block.path, settings)
    }
    if (raw) return raw
    return placeholderForField(key, true, block.path, settings)
  }

  if (flag.name === '--role' && settings.role) {
    const bound = block.bindings['--role']
    if (bound && !bound.startsWith('$')) return bound
    return settings.role
  }
  if (flag.name === '--output' && settings.outputFormat) {
    const bound = block.bindings['--output']
    if (bound && !bound.startsWith('$')) return bound
    return settings.outputFormat
  }

  const raw = block.bindings[flag.name] ?? defaultBindingForFlag(flag.name, '', settings)
  if (raw) {
    if (!raw.startsWith('$')) {
      const safe = safeLiteral(raw)
      return safe ?? placeholderForField(flag.name, false, block.path, settings)
    }
    return raw
  }
  return null
}

export function simplePlaceholderForFlag(flag: HelpNode['flags'][number]): string {
  if (flag.positional) {
    if (flag.name === 'NAME') return '<nom>'
    return `<${flag.name.toLowerCase()}>`
  }
  const n = flag.name.replace(/^--/, '')
  if (n === 'personal-access-token-id' || n.endsWith('-id')) return '<id>'
  if (n === 'personal-access-token-name' || n.endsWith('-name')) return '<nom>'
  if (n.endsWith('-title')) return '<titre>'
  if (flag.possibleValues?.length) return `<${flag.possibleValues[0]}>`
  const tail = n.split('-').pop() ?? 'valeur'
  return `<${tail}>`
}

function simpleDisplayValue(block: ComposerBlock, flag: HelpNode['flags'][number]): string {
  const bound = block.bindings[flag.name]
  if (bound && !bound.startsWith('$')) {
    const safe = safeLiteral(bound)
    if (safe) return safe
  }
  return simplePlaceholderForFlag(flag)
}

export function buildSimpleInvocation(mapping: HelpMappingFile, block: ComposerBlock): string {
  const node = getNode(mapping, block.path)
  if (!node) return `pass-cli ${block.path.join(' ')}`

  const tokens: string[] = ['pass-cli', ...block.path]

  for (const flag of node.flags) {
    if (flag.name === '--help') continue
    if (flag.positional) {
      tokens.push(simpleDisplayValue(block, flag))
    } else {
      tokens.push(flag.name, simpleDisplayValue(block, flag))
    }
  }

  return tokens.join(' ')
}

export function composeSimpleCommandLine(mapping: HelpMappingFile, blocks: ComposerBlock[]): string {
  if (blocks.length === 0) return ''
  return blocks.map((b) => buildSimpleInvocation(mapping, b)).join(' && ')
}

/** Aperçu simple pour un nœud list (aucune exécution). */
export function composeSimpleListPreview(mapping: HelpMappingFile, listPath: string[]): string {
  if (!getNode(mapping, listPath)) return ''
  return buildSimpleInvocation(mapping, { id: 'preview', path: listPath, bindings: {} })
}

export function composeSimpleListPreviewAll(
  mapping: HelpMappingFile,
  listPaths: string[][],
): string {
  const parts = listPaths
    .map((p) => composeSimpleListPreview(mapping, p))
    .filter(Boolean)
  return parts.join(' && ')
}

export function buildNakedInvocation(
  mapping: HelpMappingFile,
  block: ComposerBlock,
  settings: ComposeSettings,
): string {
  const node = getNode(mapping, block.path)
  if (!node) return `pass-cli ${block.path.join(' ')}`

  const tokens: string[] = ['pass-cli', ...block.path]
  const hasOutputFlag = node.flags.some((f) => f.name === '--output')
  const hasRoleFlag = node.flags.some((f) => f.name === '--role')

  for (const flag of node.flags) {
    const tok = resolveNakedToken(block, settings, flag)
    if (tok === null) continue
    if (flag.positional) {
      tokens.push(tok)
    } else {
      tokens.push(flag.name, tok)
    }
  }

  if (settings.outputFormat && hasOutputFlag && !tokens.includes('--output')) {
    tokens.push('--output', settings.outputFormat)
  }
  if (settings.role && hasRoleFlag && !tokens.includes('--role')) {
    tokens.push('--role', settings.role)
  }

  return tokens.join(' ')
}

export function composeNakedCommandLine(
  mapping: HelpMappingFile,
  blocks: ComposerBlock[],
  settings: ComposeSettings,
): string {
  if (blocks.length === 0) return ''
  return blocks.map((b) => buildNakedInvocation(mapping, b, settings)).join(' && ')
}

export function collectFlagEnum(mapping: HelpMappingFile, flagName: string): string[] {
  const values = new Set<string>()
  for (const node of Object.values(mapping.nodes)) {
    for (const f of node.flags) {
      if (f.name === flagName && f.possibleValues) {
        for (const v of f.possibleValues) values.add(v)
      }
    }
  }
  return [...values]
}

function buildInvocation(mapping: HelpMappingFile, block: ComposerBlock, settings: ComposeSettings): string {
  const node = getNode(mapping, block.path)
  if (!node) return `# commande inconnue: ${block.path.join(' ')}`

  const tokens: string[] = ['pass-cli', ...block.path]

  for (const flag of node.flags) {
    if (flag.name === '--help') continue

    if (flag.positional) {
      const key = flag.name
      const raw =
        block.bindings[key] ??
        defaultBindingForFlag('', key, settings) ??
        (key === 'NAME' ? '$AGENT' : '')
      if (raw && !raw.startsWith('$')) {
        const safe = safeLiteral(raw)
        if (!safe) continue
        tokens.push(quoteValue(safe))
      } else if (raw) tokens.push(quoteValue(raw))
      continue
    }

    const raw =
      block.bindings[flag.name] ?? defaultBindingForFlag(flag.name, '', settings)
    if (raw) {
      if (!raw.startsWith('$')) {
        const safe = safeLiteral(raw)
        if (!safe) continue
        tokens.push(flag.name, quoteValue(safe))
      } else {
        tokens.push(flag.name, quoteValue(raw))
      }
    }
  }

  const lineContinue = ' \\\n  '
  return tokens.join(lineContinue)
}

export function composeBashScript(mapping: HelpMappingFile, blocks: ComposerBlock[], settings: ComposeSettings): string {
  const header = [
    '#!/usr/bin/env bash',
    '# Généré par Latch — exécuter sous votre compte utilisateur.',
    'set -euo pipefail',
    '',
    'if [ "$(id -u)" -eq 0 ]; then',
    '  echo "Exécution en tant que root interdite pour pass-cli." >&2',
    '  exit 1',
    'fi',
    '',
  ]

  const globals: string[] = []
  if (settings.role) globals.push(`ROLE=${shellQuote(settings.role)}`)
  if (settings.outputFormat) globals.push(`OUTPUT_FORMAT=${shellQuote(settings.outputFormat)}`)
  if (globals.length) globals.push('')

  const familyBlocks: string[] = []
  for (const fam of LIST_FAMILIES) {
    if (!mapping.nodes[pathKey(fam.listPath)]) continue
    const cfg = settings.families[fam.key]
    if (!cfg.useInLoops || cfg.mode === 'off') continue
    if (cfg.mode === 'manual') familyBlocks.push(manualArrayBlock(fam, cfg.manualNames))
    if (cfg.mode === 'auto') familyBlocks.push(autoListBlock(fam, settings.outputFormat))
  }

  const loopOrder = LIST_FAMILIES.filter(
    (f) => settings.families[f.key].useInLoops && settings.families[f.key].mode !== 'off',
  )

  const bodyLines: string[] = []
  if (blocks.length === 0) {
    bodyLines.push('echo "Aucune commande composée."')
  } else if (loopOrder.length === 0) {
    for (const block of blocks) bodyLines.push(buildInvocation(mapping, block, settings))
  } else {
    let depth = 0
    for (const fam of loopOrder) {
      bodyLines.push(`${'  '.repeat(depth)}for ${fam.loopVar} in "\${${fam.arrayName}[@]}"; do`)
      depth++
    }
    for (const block of blocks) {
      bodyLines.push(`${'  '.repeat(depth)}${buildInvocation(mapping, block, settings)}`)
    }
    for (let d = loopOrder.length - 1; d >= 0; d--) {
      bodyLines.push(`${'  '.repeat(d)}done`)
    }
  }

  return [...header, ...globals, ...familyBlocks, ...bodyLines, ''].join('\n')
}

export function nodeIsComposable(node: HelpNode): boolean {
  return node.children.length === 0 && node.flags.some((f) => f.name !== '--help')
}
