#!/usr/bin/env node
/**
 * Fetches official Proton Pass CLI markdown docs and builds a Latch command spec.
 * Source: https://protonpass.github.io/pass-cli/ (content from protonpass/pass-cli repo)
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://protonpass.github.io/pass-cli/'
const RAW_BASE =
  'https://raw.githubusercontent.com/protonpass/pass-cli/main/docs/public/docs/commands'

const DOC_FILES = [
  'info.md',
  'login.md',
  'logout.md',
  'session.md',
  'settings.md',
  'update.md',
  'user.md',
  'vault.md',
  'share.md',
  'invite.md',
  'personal-access-token.md',
  'agent.md',
  'item.md',
  'password.md',
  'ssh-agent.md',
  'contents/inject.md',
  'contents/run.md',
  'contents/secret-references.md',
  'contents/view.md',
]

/** Commands whose primary purpose is reading item/secret payloads — compose only, never surface values in UI. */
const SECRET_EMIT_PATTERNS = [
  /^item\s+(view|read|get|show|list|totp|attachment)\b/,
  /^item\s+create\b/,
  /^password\b/,
  /^contents\/(view|run|inject)\b/,
  /^pat\s+create\b/,
  /^agent\s+create\b/,
  /^agent\s+renew\b/,
  /^pat\s+renew\b/,
  /^login\b/,
  /^ssh-agent\b/,
]

function mayEmitSecrets(commandPath) {
  const s = commandPath.join(' ')
  return SECRET_EMIT_PATTERNS.some((re) => re.test(s))
}

function parseFlagsFromOptionsBlock(text) {
  const flags = []
  const bulletRe = /^-\s+`(--[\w-]+)`(?:\s+\/\s+`(--[\w-]+)`)?(?:\s+-\s+(.+))?/gm
  let m
  while ((m = bulletRe.exec(text)) !== null) {
    const names = [m[1], m[2]].filter(Boolean)
    const help = (m[3] || '').trim()
    const required = /\(required\)/i.test(help)
    const enumMatch = help.match(/:\s*`([^`]+)`(?:\s*,\s*`([^`]+)`)*|:\s*([\w|]+)/i)
    let allowedValues
    if (help.includes('human') && help.includes('json')) {
      allowedValues = ['human', 'json']
    }
    if (help.match(/viewer.*editor.*manager/i)) {
      allowedValues = ['viewer', 'editor', 'manager']
    }
    for (const name of names) {
      if (!flags.some((f) => f.name === name)) {
        flags.push({
          name,
          required,
          type: allowedValues ? 'enum' : 'string',
          allowedValues,
          help,
        })
      }
    }
  }
  return flags
}

function parseTableFlags(tableText) {
  const flags = []
  const lines = tableText.split('\n').filter((l) => l.startsWith('|') && !l.includes('---'))
  for (const line of lines.slice(1)) {
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean)
    if (cols.length < 3) continue
    const flagCell = cols[0]
    const req = /yes/i.test(cols[1])
    const help = cols[2] || ''
    const flagMatch = flagCell.match(/`(--[\w-]+)`/g)
    if (!flagMatch) {
      if (flagCell.startsWith('`<') || flagCell.includes('NAME')) {
        continue
      }
    }
    for (const fm of flagMatch || []) {
      const name = fm.replace(/`/g, '')
      let allowedValues
      if (help.match(/1h|1d|1w|1m/)) {
        allowedValues = ['1h', '1d', '1w', '1m', '3m', '6m', '1y']
      }
      if (help.match(/viewer|editor|manager/i)) {
        allowedValues = ['viewer', 'editor', 'manager']
      }
      if (help.includes('human') && help.includes('json')) {
        allowedValues = ['human', 'json']
      }
      if (!flags.some((f) => f.name === name)) {
        flags.push({ name, required: req, type: allowedValues ? 'enum' : 'string', allowedValues, help })
      }
    }
  }
  return flags
}

function tokenizeCommandLine(line) {
  const cleaned = line.replace(/^pass-cli\s+/, '').trim()
  const parts = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (ch === '"' || ch === "'") {
      inQuote = !inQuote
      continue
    }
    if (!inQuote && /\s/.test(ch)) {
      if (cur) parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur) parts.push(cur)
  return parts
}

function extractCommandsFromMarkdown(md, fileHint) {
  const commands = []
  const bashBlocks = [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1])

  for (const block of bashBlocks) {
    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('pass-cli ') || trimmed.includes('#')) continue
      if (trimmed.includes('pst_') || trimmed.includes('TOKENKEY')) continue
      const parts = tokenizeCommandLine(trimmed)
      if (parts.length === 0) continue
      const path = []
      const positional = []
      const flagsInLine = new Set()
      for (const p of parts) {
        if (p.startsWith('--')) {
          flagsInLine.add(p.split('=')[0])
          continue
        }
        if (p.startsWith('-')) continue
        if (path.length < 4 && !p.includes('@') && !p.includes('.')) {
          path.push(p)
        } else {
          positional.push({
            name: p.replace(/[<>]/g, ''),
            required: true,
            type: 'string',
            help: 'Argument positionnel documenté',
          })
        }
      }
      const id = path.join('.')
      if (!id) continue
      commands.push({
        id,
        path,
        exampleLine: trimmed,
        positional,
        flagsInLine: [...flagsInLine],
        fileHint,
      })
    }
  }

  // Section headers like ## `pat access list-access`
  const sectionRe = /##+ `([^`]+)`/g
  let sm
  while ((sm = sectionRe.exec(md)) !== null) {
    const pathStr = sm[1].trim()
    if (!pathStr.includes(' ')) continue
    const path = pathStr.split(/\s+/)
    const id = path.join('.')
    const after = md.slice(sm.index, sm.index + 4000)
    const synMatch = after.match(/```bash\n(pass-cli[^\n]+)\n```/)
    const flags = []
    const optSection = after.match(/\*\*Options:\*\*([\s\S]*?)(?:\*\*|$)/)
    if (optSection) flags.push(...parseFlagsFromOptionsBlock(optSection[1]))
    const tableMatch = after.match(/\| Flag[\s\S]*?\n\n/)
    if (tableMatch) flags.push(...parseTableFlags(tableMatch[0]))
    commands.push({
      id,
      path,
      exampleLine: synMatch ? synMatch[1].trim() : `pass-cli ${pathStr}`,
      positional: [],
      flagsInLine: flags.map((f) => f.name),
      fileHint,
      sectionFlags: flags,
    })
  }

  return commands
}

function mergeCommands(rawList) {
  const byId = new Map()
  for (const c of rawList) {
    const existing = byId.get(c.id)
    if (!existing) {
      byId.set(c.id, { ...c, flags: c.sectionFlags || [] })
      continue
    }
    const flags = [...(existing.flags || []), ...(c.sectionFlags || [])]
    const seen = new Set()
    existing.flags = flags.filter((f) => {
      if (seen.has(f.name)) return false
      seen.add(f.name)
      return true
    })
    if (c.exampleLine && !existing.exampleLine.includes('<')) {
      existing.exampleLine = c.exampleLine
    }
  }
  return [...byId.values()]
}

function categorize(path) {
  const top = path[0]
  if (top === 'pat' || top === 'personal-access-token') return 'pat'
  if (top === 'agent') return 'agent'
  if (top === 'vault') return 'vault'
  if (top === 'share' || top === 'invite') return 'sharing'
  if (top === 'session' || top === 'login' || top === 'logout' || top === 'info') return 'session'
  if (top === 'item' || top === 'password') return 'items'
  if (top === 'ssh-agent') return 'ssh'
  if (top === 'settings' || top === 'update' || top === 'user') return 'admin'
  return 'other'
}

async function main() {
  const rawCommands = []
  for (const file of DOC_FILES) {
    const url = `${RAW_BASE}/${file}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('skip', file, res.status)
      continue
    }
    const md = await res.text()
    rawCommands.push(...extractCommandsFromMarkdown(md, file))
  }

  const merged = mergeCommands(rawCommands)
  const commands = merged
    .map((c) => {
      const path = c.path
      const mayEmit = mayEmitSecrets(path)
      return {
        id: c.id,
        path,
        category: categorize(path),
        synopsis: c.exampleLine,
        mayEmitSecrets: mayEmit,
        composeOnly: mayEmit,
        positionalArgs: c.positional || [],
        flags: (c.flags || []).map((f) => ({
          ...f,
          valueKind: f.name.includes('token') || f.name.includes('password') ? 'sensitive' : 'plain',
        })),
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  const spec = {
    sourceUrl: SOURCE_URL,
    rawDocBase: RAW_BASE,
    fetchedAt: new Date().toISOString(),
    cliVersionKnown: null,
    commands,
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'spec-snapshot.json')
  writeFileSync(outPath, JSON.stringify(spec, null, 2))
  console.log('Wrote', outPath, 'commands:', commands.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
