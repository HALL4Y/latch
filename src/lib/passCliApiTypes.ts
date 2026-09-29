export type PassCliUpstreamInfo = {
  reliable: boolean
  disclaimerFr?: string
  latestTag: string | null
  latestSemver: string | null
  behindUpstream: boolean | null
}

export type PassCliVersionInfo = {
  available: boolean
  version?: string
  error?: string
  localSemver?: string | null
  mappingSemver?: string | null
  mappingDrift?: boolean | null
  upstream?: PassCliUpstreamInfo
}

export type PassCliRefreshUpdate = {
  ran: boolean
  skippedReasonFr: string
  copyCommand: string
  log?: string
  error?: string
}
