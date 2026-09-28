import enrichments from '../data/command-enrichments.json'
import snapshot from '../data/spec-snapshot.json'
import { applyCommandPolicy } from './commandPolicy'
import type { CommandDef, PassCliSpec } from './types'

const enrichMap = enrichments as Record<
  string,
  Partial<Pick<CommandDef, 'flags' | 'positionalArgs' | 'path'>>
>

function isNoiseCommand(c: CommandDef): boolean {
  if (c.path.some((p) => p.includes('<') || p.includes('[') || p.includes(']'))) return true
  const last = c.path[c.path.length - 1] ?? ''
  if (/^[A-Z]/.test(last) && last.includes(' ')) return true
  if (/^[a-f0-9]{6,}$/i.test(last)) return true
  if (c.id.includes('.human') || c.id.includes('.json')) return true
  if (c.id.includes('[--')) return true
  if (c.path.length > 5) return true
  return false
}

export function loadSpec(): PassCliSpec {
  const base = snapshot as PassCliSpec
  const byId = new Map<string, CommandDef>()

  for (const c of base.commands) {
    if (isNoiseCommand(c)) continue
    const existing = byId.get(c.id)
    if (!existing || c.flags.length > existing.flags.length) {
      byId.set(c.id, { ...c })
    }
  }

  for (const [id, patch] of Object.entries(enrichMap)) {
    const existing = byId.get(id)
    const path = patch.path ?? existing?.path ?? id.split('.')
    byId.set(id, {
      id,
      path,
      category: existing?.category ?? path[0],
      synopsis: existing?.synopsis ?? `pass-cli ${path.join(' ')}`,
      mayEmitSecrets: existing?.mayEmitSecrets ?? false,
      composeOnly: existing?.composeOnly ?? false,
      positionalArgs: patch.positionalArgs ?? existing?.positionalArgs ?? [],
      flags: patch.flags ?? existing?.flags ?? [],
    })
  }

  const commands = [...byId.values()].map(applyCommandPolicy).sort((a, b) => a.id.localeCompare(b.id))
  return { ...base, commands }
}

export const CATEGORY_LABELS: Record<string, string> = {
  pat: 'Jetons PAT',
  agent: 'Agents',
  vault: 'Coffres',
  sharing: 'Partages',
  session: 'Session',
  admin: 'Administration',
  items: 'Items (composition — pas d’exécution locale)',
  ssh: 'SSH',
  other: 'Autre',
}

/** Masquer le focus « lecture d’items » dans la navigation principale */
export function isPrimaryGovernanceCommand(c: CommandDef): boolean {
  if (c.category === 'items') return false
  if (c.mayEmitSecrets && c.path[0] === 'item') return false
  if (/^item\.view/.test(c.id)) return false
  if (/^password/.test(c.id)) return false
  if (/^contents\./.test(c.id)) return false
  return true
}
