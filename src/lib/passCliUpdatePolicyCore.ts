export type PassCliUpdateDecision = {
  canRunFromServer: boolean
  reasonFr: string
  copyCommand: string
  argv: string[] | null
  flagNames: string[]
}

export function decidePassCliUpdate(flagNames: string[]): PassCliUpdateDecision {
  const names = new Set(flagNames)
  const flagList = [...names].sort()

  if (names.has('--yes')) {
    return {
      canRunFromServer: true,
      reasonFr:
        'Le mapping documente --yes : mise à jour possible sans invite (pass-cli update --yes).',
      copyCommand: 'pass-cli update --yes',
      argv: ['update', '--yes'],
      flagNames: flagList,
    }
  }

  const trackHint = names.has('--set-track')
    ? ' Le mapping documente --set-track (changement de canal, pas une mise à jour silencieuse).'
    : ''

  return {
    canRunFromServer: false,
    reasonFr: `Sans --yes dans le mapping, pass-cli update demande une confirmation (TTY).${trackHint}`,
    copyCommand: 'pass-cli update',
    argv: null,
    flagNames: flagList,
  }
}
