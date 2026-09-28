export const KEYCHAIN_USER_MESSAGE = `pass-cli doit s’exécuter sous votre utilisateur graphique macOS pour que le trousseau puisse répondre (code -25308 « User interaction is not allowed »).

Si vous avez lancé pass-cli avec sudo, le trousseau refuse l’accès et la base locale peut être possédée par root. Latch n’utilise jamais sudo et ne lance pas pass-cli en root.

Corrigez côté machine : exécutez pass-cli sans sudo, depuis une session où vous êtes connecté, puis relancez la commande depuis Latch ou le script exporté.`

export function isKeyringOrSudoError(text: string): boolean {
  return (
    /-25308/.test(text) ||
    /User interaction is not allowed/i.test(text) ||
    /keyring/i.test(text) ||
    /encryption key/i.test(text) ||
    /local key/i.test(text)
  )
}
