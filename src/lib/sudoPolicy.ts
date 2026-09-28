/** Refus explicite — ne jamais proposer sudo comme contournement. */
export const SUDO_REFUSAL_MESSAGE =
  'sudo pose des droits root sur la base, ensuite pass-cli normal ne peut plus y accéder. Latch n’exécute jamais pass-cli avec sudo.'

export function lineStartsWithSudo(line: string): boolean {
  return /^\s*sudo\b/.test(line.trim())
}

export function commandTextUsesSudo(text: string): boolean {
  const t = text.trim()
  if (lineStartsWithSudo(t)) return true
  if (/\bsudo\s+pass-cli\b/.test(t)) return true
  if (/\bsudo\s+/.test(t) && /\bpass-cli\b/.test(t)) return true
  return false
}

export function argvUsesSudo(argv: string[]): boolean {
  if (argv.length === 0) return false
  if (argv[0] === 'sudo') return true
  return commandTextUsesSudo(argv.join(' '))
}
