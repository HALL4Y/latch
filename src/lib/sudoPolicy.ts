/** Refus explicite — ne jamais proposer sudo comme contournement. */
export const SUDO_REFUSAL_MESSAGE =
  'sudo pose des droits root sur la base, ensuite pass-cli normal ne peut plus y accéder. Latch n’exécute jamais pass-cli avec sudo.'

export function lineStartsWithSudo(line: string): boolean {
  return /^\s*sudo\b/.test(line.trim())
}

/** Saisie utilisateur (nom, flag) — refuser si le token commence par sudo. */
export function userInputUsesSudo(value: string): boolean {
  const t = value.trim()
  if (!t) return false
  return lineStartsWithSudo(t) || /^\s*sudo\b/i.test(t)
}

export function scriptContainsSudoWord(script: string): boolean {
  return /\bsudo\b/i.test(script)
}

/** Détecte une invocation sudo réelle, pas le mot « sudo » dans un commentaire (# …). */
export function commandTextUsesSudo(text: string): boolean {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (lineStartsWithSudo(trimmed)) return true
    if (/\bsudo\s+pass-cli\b/.test(trimmed)) return true
    if (/\bsudo\s+/.test(trimmed) && /\bpass-cli\b/.test(trimmed)) return true
  }
  return false
}

export function argvUsesSudo(argv: string[]): boolean {
  if (argv.length === 0) return false
  if (argv[0] === 'sudo') return true
  return commandTextUsesSudo(argv.join(' '))
}
