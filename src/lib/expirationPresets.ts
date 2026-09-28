/** Valeurs documentées pour `--expiration` (PAT / agent). */
export const DOCUMENTED_EXPIRATIONS = ['1h', '1d', '1w', '1m', '3m', '6m', '1y'] as const

export type DocumentedExpiration = (typeof DOCUMENTED_EXPIRATIONS)[number]

export const EXPIRATION_PRESETS: { label: string; value: DocumentedExpiration | 'custom' }[] = [
  { label: '1 heure', value: '1h' },
  { label: '1 jour', value: '1d' },
  { label: '7 jours', value: '1w' },
  { label: '30 jours', value: '1m' },
  { label: '90 jours', value: '3m' },
  { label: '6 mois', value: '6m' },
  { label: '1 an', value: '1y' },
  { label: 'Personnalisée (valeurs doc)', value: 'custom' },
]

export function isExpirationFlag(name: string): boolean {
  return name === '--expiration'
}
