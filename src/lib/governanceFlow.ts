import type { GroupConfig, StepConfig } from './types'

export type EntryPoint = 'vault' | 'pat-agent' | 'item-access'

export type GovAction = 'list' | 'create' | 'rename' | 'delete' | 'revoke' | 'grant'

export type OutputFormat = 'json' | 'human'

export interface EntryPointDef {
  id: EntryPoint
  title: string
  description: string
  actions: GovActionDef[]
  starterIds: string[]
}

export interface GovActionDef {
  id: GovAction
  label: string
  description: string
  commandId: string
  needsOutputFormat: boolean
  needsRole: boolean
  composeOnlyHint?: boolean
}

export const ENTRY_POINTS: EntryPointDef[] = [
  {
    id: 'vault',
    title: 'Depuis un coffre ou une liste',
    description: 'Coffres, partages et membres — métadonnées uniquement.',
    starterIds: ['inventory-vaults', 'vault-members', 'pat-grant-vault'],
    actions: [
      {
        id: 'list',
        label: 'Lister',
        description: 'Inventaire des coffres ou des partages.',
        commandId: 'vault.list',
        needsOutputFormat: true,
        needsRole: false,
      },
      {
        id: 'list',
        label: 'Lister les partages',
        description: 'Voir les partages documentés (`share list`).',
        commandId: 'share.list',
        needsOutputFormat: true,
        needsRole: false,
      },
      {
        id: 'create',
        label: 'Créer',
        description: 'Nouveau coffre (`vault create --name`).',
        commandId: 'vault.create',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'rename',
        label: 'Renommer',
        description: 'Changer le nom d’un coffre (`vault update --name`).',
        commandId: 'vault.update',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'delete',
        label: 'Supprimer',
        description: 'Supprimer un coffre documenté.',
        commandId: 'vault.delete',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'grant',
        label: 'Partager / octroyer',
        description: 'Inviter sur un coffre avec un rôle documenté.',
        commandId: 'vault.share',
        needsOutputFormat: false,
        needsRole: true,
      },
      {
        id: 'revoke',
        label: 'Retirer un membre',
        description: 'Retirer l’accès d’un membre au coffre.',
        commandId: 'vault.member.remove',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'list',
        label: 'Lister les membres',
        description: 'Qui a accès au coffre et avec quel rôle.',
        commandId: 'vault.member.list',
        needsOutputFormat: true,
        needsRole: false,
      },
    ],
  },
  {
    id: 'pat-agent',
    title: 'Depuis un PAT ou un agent',
    description: 'Jetons et agents — création en composition seulement (secret hors UI).',
    starterIds: ['pat-audit', 'agent-grant'],
    actions: [
      {
        id: 'list',
        label: 'Lister les PAT',
        description: 'Inventaire des jetons et expirations.',
        commandId: 'pat.list',
        needsOutputFormat: true,
        needsRole: false,
      },
      {
        id: 'list',
        label: 'Lister les agents',
        description: 'Agents configurés et métadonnées.',
        commandId: 'agent.list',
        needsOutputFormat: true,
        needsRole: false,
      },
      {
        id: 'list',
        label: 'Lister les accès PAT',
        description: 'Droits d’un PAT sur coffres/items.',
        commandId: 'pat.access.list-access',
        needsOutputFormat: true,
        needsRole: false,
      },
      {
        id: 'create',
        label: 'Créer un PAT',
        description: 'Composition uniquement — exécuter le script dans votre terminal.',
        commandId: 'pat.create',
        needsOutputFormat: true,
        needsRole: false,
        composeOnlyHint: true,
      },
      {
        id: 'create',
        label: 'Créer un agent',
        description: 'Composition uniquement — secret hors interface.',
        commandId: 'agent.create',
        needsOutputFormat: true,
        needsRole: false,
        composeOnlyHint: true,
      },
      {
        id: 'delete',
        label: 'Supprimer un PAT',
        description: 'Révoquer définitivement un jeton.',
        commandId: 'pat.delete',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'delete',
        label: 'Supprimer un agent',
        description: 'Retirer un agent documenté.',
        commandId: 'agent.delete',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'grant',
        label: 'Accorder un accès PAT',
        description: 'Rôle sur coffre (ou item via l’autre entrée).',
        commandId: 'pat.access.grant',
        needsOutputFormat: false,
        needsRole: true,
      },
      {
        id: 'grant',
        label: 'Accorder un accès agent',
        description: 'Rôle sur coffre pour un agent nommé.',
        commandId: 'agent.access.grant',
        needsOutputFormat: false,
        needsRole: true,
      },
      {
        id: 'revoke',
        label: 'Révoquer un accès PAT',
        description: 'Retirer un accès précédemment accordé.',
        commandId: 'pat.access.revoke',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'revoke',
        label: 'Révoquer un accès agent',
        description: 'Retirer l’accès d’un agent à un coffre.',
        commandId: 'agent.access.revoke',
        needsOutputFormat: false,
        needsRole: false,
      },
    ],
  },
  {
    id: 'item-access',
    title: 'Depuis un item (cible d’accès)',
    description: 'ID ou titre pour un octroi — jamais le contenu ni les secrets de l’item.',
    starterIds: ['pat-grant-item', 'pat-revoke-item'],
    actions: [
      {
        id: 'list',
        label: 'Lister les accès PAT (audit)',
        description: 'Vérifier les droits avant octroi ou révocation.',
        commandId: 'pat.access.list-access',
        needsOutputFormat: true,
        needsRole: false,
      },
      {
        id: 'grant',
        label: 'Octroyer via PAT',
        description: 'Rôle sur un item par `--item-id` ou `--item-title`.',
        commandId: 'pat.access.grant',
        needsOutputFormat: false,
        needsRole: true,
      },
      {
        id: 'grant',
        label: 'Octroyer via agent',
        description: 'Rôle agent sur un item identifié.',
        commandId: 'agent.access.grant',
        needsOutputFormat: false,
        needsRole: true,
      },
      {
        id: 'revoke',
        label: 'Révoquer accès PAT',
        description: 'Retirer l’accès PAT à un item ou coffre.',
        commandId: 'pat.access.revoke',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'revoke',
        label: 'Révoquer accès agent',
        description: 'Retirer l’accès agent sur la cible.',
        commandId: 'agent.access.revoke',
        needsOutputFormat: false,
        needsRole: false,
      },
      {
        id: 'grant',
        label: 'Partager l’item',
        description: 'Partage documenté (`item share`) — métadonnées seulement.',
        commandId: 'item.share',
        needsOutputFormat: false,
        needsRole: true,
      },
      {
        id: 'delete',
        label: 'Supprimer l’item',
        description: 'Suppression documentée — sans lecture du contenu.',
        commandId: 'item.delete',
        needsOutputFormat: false,
        needsRole: false,
      },
    ],
  },
]

export function buildStepFromFlow(
  commandId: string,
  outputFormat: OutputFormat | null,
  role: string | null,
): StepConfig {
  const flagValues: StepConfig['flagValues'] = {}
  if (outputFormat) {
    flagValues['--output'] = { kind: 'literal', value: outputFormat }
  }
  if (role) {
    flagValues['--role'] = { kind: 'literal', value: role }
  }
  return {
    id: `step-${crypto.randomUUID().slice(0, 8)}`,
    commandId,
    flagValues,
    positionalValues: {},
  }
}

export function getStartersForEntry(entry: EntryPointDef, all: GroupConfig[]): GroupConfig[] {
  return all.filter((g) => entry.starterIds.includes(g.id))
}
