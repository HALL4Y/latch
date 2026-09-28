export const KEYCHAIN_USER_MESSAGE = `pass-cli doit s’exécuter sous votre utilisateur graphique macOS pour que le trousseau puisse répondre (code -25308 « User interaction is not allowed »).

Cette erreur survient souvent après un pass-cli lancé avec sudo : sudo pose des droits root sur la base locale, le trousseau refuse l’accès, et pass-cli normal ne peut plus ouvrir la base.

Latch n’utilise jamais sudo et ne proposera pas d’élévation pour « réparer » cela. Reprenez pass-cli uniquement sous votre compte utilisateur (sans sudo), depuis une session graphique où vous êtes connecté.`

export function isKeyringOrSudoError(text: string): boolean {
  return (
    /-25308/.test(text) ||
    /User interaction is not allowed/i.test(text) ||
    /keyring/i.test(text) ||
    /encryption key/i.test(text) ||
    /local key/i.test(text)
  )
}
