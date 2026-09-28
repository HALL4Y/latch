import type { CommandDef } from './types'

/** Commands that enumerate or read vault item payloads — compose scripts only, never run in Latch. */
export function retrievesVaultItems(c: CommandDef): boolean {
  const top = c.path[0]
  if (top === 'password') return true
  if (top === 'contents') return true
  if (top !== 'item') return false
  const sub = c.path[1] ?? ''
  if (sub === 'view' || sub === 'read' || sub === 'get' || sub === 'show') return true
  if (sub === 'list' || sub === 'totp') return true
  if (sub === 'attachment') return true
  return false
}

export function applyCommandPolicy(c: CommandDef): CommandDef {
  const blockedRun =
    c.mayEmitSecrets ||
    c.composeOnly ||
    retrievesVaultItems(c) ||
    c.path[0] === 'password' ||
    c.path[0] === 'contents'

  return {
    ...c,
    composeOnly: blockedRun,
    mayEmitSecrets: Boolean(
      c.mayEmitSecrets || retrievesVaultItems(c) || c.path[0] === 'password' || c.path[0] === 'contents',
    ),
  }
}

/** POSIX argv joined string — block secret / item payload execution in the dev API. */
export function isBlockedLocalArgv(argv: string[]): boolean {
  const joined = argv.join(' ')
  return (
    /\bitem\s+(view|read|get|show|list|totp|attachment)\b/.test(joined) ||
    /\bcontents\/(view|run|inject)\b/.test(joined) ||
    /\bpassword\b/.test(joined) ||
    /\bpat\s+(create|renew)\b/.test(joined) ||
    /\bagent\s+(create|renew)\b/.test(joined) ||
    /\blogin\b/.test(joined) ||
    /\bssh-agent\b/.test(joined)
  )
}

export function isLocallyRunnable(c: CommandDef): boolean {
  return !applyCommandPolicy(c).composeOnly
}
