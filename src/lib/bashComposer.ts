import type { FamilyKey, HelpMappingFile, HelpNode } from './helpMapping'
import { LIST_FAMILIES, getNode, pathKey } from './helpMapping'
import { commandTextUsesSudo } from './sudoPolicy'

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
  const quoted = names.map((n) => shellQuote(n)).join(' ')
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
      if (raw) tokens.push(quoteValue(raw))
      continue
    }

    const raw =
      block.bindings[flag.name] ?? defaultBindingForFlag(flag.name, '', settings)
    if (raw) {
      tokens.push(flag.name, quoteValue(raw))
    }
  }

  return tokens.join(' \\\n  ')
}

export function composeBashScript(mapping: HelpMappingFile, blocks: ComposerBlock[], settings: ComposeSettings): string {
  const header = [
    '#!/usr/bin/env bash',
    '# Généré par Latch — exécuter dans votre terminal (jamais avec sudo).',
    'set -euo pipefail',
    '',
    'if [ "$(id -u)" -eq 0 ]; then',
    '  echo "sudo / root interdit : la base pass-cli ne doit pas être possédée par root." >&2',
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

  const script = [...header, ...globals, ...familyBlocks, ...bodyLines, ''].join('\n')
  if (commandTextUsesSudo(script)) throw new Error('Le script généré contient sudo — composition refusée.')
  return script
}

export function nodeIsComposable(node: HelpNode): boolean {
  return node.children.length === 0 && node.flags.some((f) => f.name !== '--help')
}
