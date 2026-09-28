import type { GroupConfig } from './types'

/** Groupes orientés gouvernance (PAT, agents, coffres, membres) — pas de lecture d’items. */
export const STARTER_GROUPS: GroupConfig[] = [
  {
    id: 'inventory-vaults',
    name: 'Inventaire des coffres',
    description: 'Lister les coffres accessibles (métadonnées uniquement).',
    steps: [
      {
        id: 's1',
        commandId: 'vault.list',
        flagValues: {
          '--output': { kind: 'literal', value: 'json' },
        },
        positionalValues: {},
      },
    ],
  },
  {
    id: 'pat-audit',
    name: 'Audit accès PAT',
    description: 'Inspecter les droits d’un jeton d’accès personnel sur les coffres.',
    steps: [
      {
        id: 's1',
        commandId: 'pat.access.list-access',
        flagValues: {
          '--personal-access-token-name': { kind: 'literal', value: 'NOM_DU_PAT' },
          '--output': { kind: 'literal', value: 'human' },
        },
        positionalValues: {},
      },
    ],
  },
  {
    id: 'pat-grant-item',
    name: 'PAT ciblé sur un item',
    description:
      'Accorder un rôle sur un item précis (ID ou titre) dans un coffre — sans lire le contenu de l’item.',
    steps: [
      {
        id: 's1',
        commandId: 'vault.list',
        flagValues: { '--output': { kind: 'literal', value: 'json' } },
        positionalValues: {},
      },
      {
        id: 's2',
        commandId: 'pat.access.grant',
        flagValues: {
          '--personal-access-token-name': { kind: 'literal', value: 'NOM_DU_PAT' },
          '--vault-name': { kind: 'literal', value: 'NOM_COFFRE' },
          '--item-id': { kind: 'literal', value: 'ITEM_ID' },
          '--role': { kind: 'literal', value: 'viewer' },
        },
        positionalValues: {},
      },
      {
        id: 's3',
        commandId: 'pat.access.list-access',
        flagValues: {
          '--personal-access-token-name': { kind: 'literal', value: 'NOM_DU_PAT' },
          '--output': { kind: 'literal', value: 'human' },
        },
        positionalValues: {},
      },
    ],
  },
  {
    id: 'pat-revoke-item',
    name: 'Révoquer accès PAT (item)',
    description: 'Retirer l’accès d’un PAT à un item ou coffre après audit.',
    steps: [
      {
        id: 's1',
        commandId: 'pat.access.list-access',
        flagValues: {
          '--personal-access-token-name': { kind: 'literal', value: 'NOM_DU_PAT' },
          '--output': { kind: 'literal', value: 'json' },
        },
        positionalValues: {},
      },
      {
        id: 's2',
        commandId: 'pat.access.revoke',
        flagValues: {
          '--personal-access-token-name': { kind: 'literal', value: 'NOM_DU_PAT' },
          '--vault-name': { kind: 'literal', value: 'NOM_COFFRE' },
          '--item-id': { kind: 'literal', value: 'ITEM_ID' },
        },
        positionalValues: {},
      },
    ],
  },
  {
    id: 'pat-grant-vault',
    name: 'Octroi PAT sur coffre',
    description: 'Accorder un rôle sur un coffre entier à un PAT nommé.',
    steps: [
      {
        id: 's1',
        commandId: 'vault.list',
        flagValues: { '--output': { kind: 'literal', value: 'json' } },
        positionalValues: {},
      },
      {
        id: 's2',
        commandId: 'pat.access.grant',
        flagValues: {
          '--personal-access-token-name': { kind: 'literal', value: 'NOM_DU_PAT' },
          '--vault-name': { kind: 'literal', value: 'NOM_COFFRE' },
          '--role': { kind: 'literal', value: 'viewer' },
        },
        positionalValues: {},
      },
    ],
  },
  {
    id: 'agent-grant',
    name: 'Octroi agent sur coffre',
    description: 'Accorder un rôle à un agent sur un coffre (journalisation côté Proton).',
    steps: [
      {
        id: 's1',
        commandId: 'agent.list',
        flagValues: { '--output': { kind: 'literal', value: 'human' } },
        positionalValues: {},
      },
      {
        id: 's2',
        commandId: 'agent.access.grant',
        flagValues: {
          '--vault-name': { kind: 'literal', value: 'NOM_COFFRE' },
          '--role': { kind: 'literal', value: 'viewer' },
        },
        positionalValues: {
          NAME: { kind: 'literal', value: 'NOM_AGENT' },
        },
      },
    ],
  },
  {
    id: 'vault-members',
    name: 'Membres d’un coffre',
    description: 'Voir qui a accès à un coffre et avec quel rôle.',
    steps: [
      {
        id: 's1',
        commandId: 'vault.member.list',
        flagValues: {
          '--vault-name': { kind: 'literal', value: 'NOM_COFFRE' },
          '--output': { kind: 'literal', value: 'human' },
        },
        positionalValues: {},
      },
    ],
  },
]
