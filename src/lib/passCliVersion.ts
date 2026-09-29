/** Parse a semver-like x.y.z from pass-cli --version or mapping.passCliVersion. */
export function parsePassCliSemver(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/)
  return m ? m[1] : null
}

export function parseReleaseTag(tag: string | null | undefined): string | null {
  if (!tag) return null
  const t = tag.replace(/^v/i, '')
  return parsePassCliSemver(t) ?? (/\d+\.\d+\.\d+/.test(t) ? t.match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)![0] : null)
}

function semverParts(v: string): number[] {
  const core = v.split(/[-+]/)[0]
  return core.split('.').map((n) => parseInt(n, 10) || 0)
}

/** True when `local` is strictly older than `upstream`. */
export function isSemverBehind(local: string | null, upstream: string | null): boolean | null {
  if (!local || !upstream) return null
  const a = semverParts(local)
  const b = semverParts(upstream)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x < y) return true
    if (x > y) return false
  }
  return false
}

export function mappingDrift(localRaw: string | undefined, mappingRaw: string | null | undefined): boolean | null {
  const local = parsePassCliSemver(localRaw)
  const mapping = parsePassCliSemver(mappingRaw ?? undefined)
  if (!local || !mapping) return null
  return local !== mapping
}
