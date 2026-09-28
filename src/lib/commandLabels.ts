import type { CommandDef, PassCliSpec } from './types'

const DOC_FILE_BY_TOP: Record<string, string> = {
  vault: 'vault.md',
  pat: 'personal-access-token.md',
  'personal-access-token': 'personal-access-token.md',
  agent: 'agent.md',
  share: 'share.md',
  invite: 'invite.md',
  item: 'item.md',
  session: 'session.md',
  login: 'login.md',
  logout: 'logout.md',
  info: 'info.md',
  settings: 'settings.md',
  user: 'user.md',
  update: 'update.md',
  'ssh-agent': 'ssh-agent.md',
}

const EXAMPLE_SEGMENT =
  /^(abc123def\d*|item\d+|my-agent|deploy-bot|ci-runner|abc123|member\d+|SHARE_ID|ITEM_ID|VAULT_NAME|NAME|EMAIL|TOKEN|<[^>]+>|\[[^\]]+\]|\$[A-Z_]+$|human|json|\d+m|\d+h)$/i

/** Prefer a stable spec id without doc example suffixes. */
export function canonicalCommandId(cmd: CommandDef): string {
  const parts = cmd.path.filter((p) => !EXAMPLE_SEGMENT.test(p) && !p.includes('|') && p !== '\\')
  if (parts.length === 0) return cmd.id.split('.').slice(0, 3).join('.')
  return parts.join('.')
}

const CANONICAL_LABELS: Record<string, string> = {
  'vault.list': 'Lister les coffres',
  'vault.create': 'Créer un coffre',
  'vault.update': 'Renommer un coffre',
  'vault.delete': 'Supprimer un coffre',
  'vault.share': 'Partager un coffre',
  'vault.member.list': 'Lister les membres d’un coffre',
  'vault.member.update': 'Modifier le rôle d’un membre',
  'vault.member.remove': 'Retirer un membre',
  'vault.members': 'Lister les membres (alias)',
  'vault.transfer': 'Transférer la propriété d’un coffre',
  'share.list': 'Lister les partages',
  'pat.list': 'Lister les PAT',
  'pat.create': 'Créer un PAT (composition — secret hors UI)',
  'pat.delete': 'Supprimer un PAT',
  'pat.renew': 'Renouveler un PAT (composition)',
  'pat.access.grant': 'Accorder un accès PAT',
  'pat.access.revoke': 'Révoquer un accès PAT',
  'pat.access.list-access': 'Lister les accès d’un PAT',
  'agent.list': 'Lister les agents',
  'agent.create': 'Créer un agent (composition)',
  'agent.delete': 'Supprimer un agent',
  'agent.renew': 'Renouveler un agent (composition)',
  'agent.access.grant': 'Accorder un accès agent',
  'agent.access.revoke': 'Révoquer un accès agent',
  'agent.monitor': 'Surveiller un agent',
  'item.share': 'Partager un item (métadonnées)',
  'item.delete': 'Supprimer un item (sans lire son contenu)',
  'invite.list': 'Lister les invitations',
}

export function getHumanLabel(cmd: CommandDef): string {
  const canonical = canonicalCommandId(cmd)
  if (CANONICAL_LABELS[canonical]) return CANONICAL_LABELS[canonical]
  const clean = cmd.path.filter((p) => !EXAMPLE_SEGMENT.test(p) && !p.includes('[') && p !== '\\')
  if (clean.length >= 2) {
    return `pass-cli ${clean.join(' ')}`
  }
  return cmd.synopsis.replace(/^pass-cli\s+/, '').slice(0, 80) || canonical
}

export function getDocHover(spec: PassCliSpec, cmd: CommandDef): string {
  const canonical = canonicalCommandId(cmd)
  const top = cmd.path[0] ?? 'command'
  const docFile = DOC_FILE_BY_TOP[top] ?? `${top}.md`
  const docUrl = `${spec.rawDocBase}/${docFile}`
  const placeholders =
    'Les segments comme <SHARE_ID>, ITEM_ID ou des exemples du guide (abc123def) sont des placeholders documentés — pas des identifiants réels sélectionnés.'
  return [
    `Commande : ${canonical}`,
    cmd.synopsis,
    placeholders,
    `Section doc : ${docFile}`,
    docUrl,
  ].join('\n')
}

export function pickCanonicalCommand(spec: PassCliSpec, canonicalId: string): CommandDef | undefined {
  const matches = spec.commands.filter((c) => canonicalCommandId(c) === canonicalId)
  if (matches.length === 0) {
    return spec.commands.find((c) => c.id === canonicalId)
  }
  return matches.sort((a, b) => a.flags.length - b.flags.length || a.id.length - b.id.length)[0]
}
