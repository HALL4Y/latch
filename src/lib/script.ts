import type { GroupConfig, ParamBinding, PassCliSpec, StepConfig } from './types'

function shellQuote(s: string): string {
  if (!s) return "''"
  if (/^[a-zA-Z0-9._/@+-]+$/.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function resolveBinding(
  binding: ParamBinding | undefined,
  stepIndexById: Map<string, number>,
): string {
  if (!binding) return ''
  if (binding.kind === 'literal') return binding.value
  const idx = stepIndexById.get(binding.stepId)
  if (idx === undefined) return ''
  const varName = `LATCH_STEP_${idx + 1}_OUT`
  const path = binding.jqPath.replace(/^\./, '')
  if (!path) return `"$${varName}"`
  return `"$(echo "$${varName}" | jq -r '${binding.jqPath}')"`
}

export function buildArgv(
  spec: PassCliSpec,
  step: StepConfig,
): string[] {
  const cmd = spec.commands.find((c) => c.id === step.commandId)
  if (!cmd) return ['pass-cli']
  const argv = ['pass-cli', ...cmd.path]
  for (const f of cmd.flags) {
    const b = step.flagValues[f.name]
    if (!b) continue
    const val = b.kind === 'literal' ? b.value : ''
    if (b.kind === 'step') {
      argv.push(f.name, `__BIND_${f.name}__`)
      continue
    }
    if (f.type === 'boolean' && val === 'true') {
      argv.push(f.name)
    } else if (val) {
      argv.push(f.name, val)
    }
  }
  for (const p of cmd.positionalArgs) {
    const b = step.positionalValues[p.name]
    if (b?.kind === 'literal' && b.value) argv.push(b.value)
    else if (b?.kind === 'step') argv.push(`__BIND_POS_${p.name}__`)
  }
  return argv
}

export function generatePosixScript(spec: PassCliSpec, group: GroupConfig): string {
  const lines: string[] = [
    '#!/bin/sh',
    '# Généré par Latch — interface locale pour pass-cli (POSIX sh)',
    'set -eu',
    '',
    'if ! command -v pass-cli >/dev/null 2>&1; then',
    '  echo "pass-cli introuvable sur PATH" >&2',
    '  exit 1',
    'fi',
    '',
  ]

  const stepIndexById = new Map(group.steps.map((s, i) => [s.id, i]))

  group.steps.forEach((step, i) => {
    const cmd = spec.commands.find((c) => c.id === step.commandId)
    if (!cmd) return
    const varName = `LATCH_STEP_${i + 1}_OUT`
    lines.push(`# Étape ${i + 1}: ${cmd.id}`)
    lines.push(`echo ">>> pass-cli ${cmd.path.join(' ')}"`)

    const parts: string[] = ['pass-cli', ...cmd.path.map(shellQuote)]
    for (const f of cmd.flags) {
      const b = step.flagValues[f.name]
      if (!b) continue
      parts.push(shellQuote(f.name))
      if (b.kind === 'literal') {
        if (f.type !== 'boolean' || b.value === 'true') {
          parts.push(shellQuote(b.value))
        }
      } else {
        const resolved = resolveBinding(b, stepIndexById)
        parts.push(resolved.startsWith('"') ? resolved : shellQuote(resolved))
      }
    }
    for (const p of cmd.positionalArgs) {
      const b = step.positionalValues[p.name]
      if (!b) continue
      if (b.kind === 'literal') parts.push(shellQuote(b.value))
      else parts.push(resolveBinding(b, stepIndexById))
    }

    lines.push(`${varName}=$(${parts.join(' ')})`)
    lines.push(`export ${varName}`)
    lines.push('')
  })

  lines.push('echo "Terminé."')
  return lines.join('\n')
}

export function formatCommandPreview(spec: PassCliSpec, step: StepConfig): string {
  const cmd = spec.commands.find((c) => c.id === step.commandId)
  if (!cmd) return ''
  const parts = ['pass-cli', ...cmd.path]
  for (const f of cmd.flags) {
    const b = step.flagValues[f.name]
    if (!b) continue
    if (b.kind === 'literal' && b.value) {
      parts.push(f.name, b.value)
    } else if (b.kind === 'step') {
      parts.push(f.name, `<${b.stepId}${b.jqPath}>`)
    }
  }
  for (const p of cmd.positionalArgs) {
    const b = step.positionalValues[p.name]
    if (b?.kind === 'literal') parts.push(b.value)
    else if (b?.kind === 'step') parts.push(`<${b.stepId}${b.jqPath}>`)
  }
  return parts.join(' ')
}
