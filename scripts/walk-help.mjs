#!/usr/bin/env node
/**
 * Walk pass-cli --help for every menu/submenu (skip `help` subcommand).
 * Writes src/data/help-mapping.json — metadata only, no vault/PAT/item names.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseHelp } from './parse-help.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outPath = join(root, 'src/data/help-mapping.json')

const bin = process.env.PASS_CLI_BIN || 'pass-cli'

function runHelp(path) {
  const args = path.length ? [...path, '--help'] : ['--help']
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  if (r.error) throw r.error
  if (r.status !== 0 && !out.includes('Usage:')) {
    throw new Error(`pass-cli ${args.join(' ')} failed: ${out.slice(0, 200)}`)
  }
  return out
}

function pathKey(path) {
  return path.length ? path.join('.') : '_root'
}

function walk(path, nodes, visited) {
  const key = pathKey(path)
  if (visited.has(key)) return
  visited.add(key)

  const raw = runHelp(path)
  const parsed = parseHelp(raw)
  const node = {
    path,
    description: parsed.description,
    children: parsed.children,
    flags: [...parsed.flags, ...parsed.arguments.map((a) => ({
      name: a.name,
      description: a.description,
      takesValue: true,
      positional: true,
    }))],
  }
  nodes[key] = node

  for (const child of parsed.children) {
    walk([...path, child.name], nodes, visited)
  }
}

function getVersion() {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  return (r.stdout || r.stderr || '').trim()
}

function main() {
  const version = getVersion()
  if (!version) {
    console.error(`pass-cli introuvable (${bin}). Conservation du mapping existant.`)
    process.exit(1)
  }

  const nodes = {}
  walk([], nodes, new Set())

  const mapping = {
    generatedAt: new Date().toISOString(),
    passCliVersion: version,
    fixture: false,
    source: 'help-walker',
    passCliBin: bin,
    nodes,
  }

  writeFileSync(outPath, JSON.stringify(mapping, null, 2), 'utf8')
  console.log(`Wrote ${Object.keys(nodes).length} nodes for ${version} -> ${outPath}`)
}

main()
