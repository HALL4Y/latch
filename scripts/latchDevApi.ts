import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidePassCliUpdate } from '../src/lib/passCliUpdatePolicyCore.ts'
import {
  isSemverBehind,
  mappingDrift,
  parsePassCliSemver,
  parseReleaseTag,
} from '../src/lib/passCliVersion.ts'
type HelpMappingFile = {
  passCliVersion: string | null
  nodes: Record<string, { flags: { name: string }[] }>
}

function decidePassCliUpdateFromMapping(mapping: HelpMappingFile) {
  const node = mapping.nodes.update
  const flagNames = node
    ? node.flags.filter((f) => f.name !== '--help').map((f) => f.name)
    : []
  return decidePassCliUpdate(flagNames)
}

const UPSTREAM_DISCLAIMER_FR =
  'Comparaison indicative avec la dernière release GitHub (protonpass/pass-cli) — peut différer du canal stable du binaire (pass-cli update).'

export function getLatchWorkspacePath(): string | null {
  const cwd = process.cwd()
  if (!cwd || cwd === '/') return null
  return cwd
}

export function readPassCliVersion(bin: string): { available: boolean; version?: string; error?: string } {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) {
    return { available: false, error: r.stderr || String(r.error) }
  }
  return { available: true, version: (r.stdout || r.stderr || '').trim() }
}

export async function fetchGithubLatestPassCliTag(): Promise<string | null> {
  try {
    const res = await fetch('https://api.github.com/repos/protonpass/pass-cli/releases/latest', {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Latch-local-dev',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name?: string }
    return data.tag_name ?? null
  } catch {
    return null
  }
}

export async function buildPassCliVersionPayload(
  mapping: HelpMappingFile,
  bin: string,
): Promise<Record<string, unknown>> {
  const local = readPassCliVersion(bin)
  const latestTag = await fetchGithubLatestPassCliTag()
  const localSemver = parsePassCliSemver(local.version)
  const mappingSemver = parsePassCliSemver(mapping.passCliVersion)
  const upstreamSemver = parseReleaseTag(latestTag)
  const drift = mappingDrift(local.version, mapping.passCliVersion)
  const behindUpstream = isSemverBehind(localSemver, upstreamSemver)

  return {
    available: local.available,
    version: local.version,
    localSemver,
    mappingSemver,
    mappingDrift: drift,
    upstream: {
      reliable: false,
      disclaimerFr: UPSTREAM_DISCLAIMER_FR,
      latestTag,
      latestSemver: upstreamSemver,
      behindUpstream,
    },
  }
}

export function runHelpWalk(bin: string, cwd: string): { ok: boolean; error?: string; log?: string } {
  const walk = spawnSync('node', ['scripts/walk-help.mjs'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PASS_CLI_BIN: bin },
  })
  if (walk.status !== 0) {
    return { ok: false, error: walk.stderr || walk.stdout || 'pass-cli absent ou parcours help impossible' }
  }
  return { ok: true, log: walk.stdout }
}

export function tryPassCliUpdate(
  bin: string,
  mapping: HelpMappingFile,
): { ran: boolean; skippedReasonFr: string; copyCommand: string; log?: string; error?: string } {
  const decision = decidePassCliUpdateFromMapping(mapping)
  if (!decision.canRunFromServer || !decision.argv) {
    return {
      ran: false,
      skippedReasonFr: decision.reasonFr,
      copyCommand: decision.copyCommand,
    }
  }

  if (process.env.LATCH_ALLOW_PASS_CLI_UPDATE === '0') {
    return {
      ran: false,
      skippedReasonFr: 'Mise à jour pass-cli désactivée (LATCH_ALLOW_PASS_CLI_UPDATE=0).',
      copyCommand: decision.copyCommand,
    }
  }

  const r = spawnSync(bin, decision.argv, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  })
  if (r.error || r.status !== 0) {
    return {
      ran: false,
      skippedReasonFr: 'Échec de pass-cli update --yes sur ce serveur.',
      copyCommand: decision.copyCommand,
      error: r.stderr || r.stdout || String(r.error),
    }
  }
  return {
    ran: true,
    skippedReasonFr: decision.reasonFr,
    copyCommand: decision.copyCommand,
    log: (r.stdout || r.stderr || '').trim(),
  }
}

export function loadMappingFromDisk(cwd: string): HelpMappingFile {
  return JSON.parse(readFileSync(join(cwd, 'src/data/help-mapping.json'), 'utf8')) as HelpMappingFile
}
