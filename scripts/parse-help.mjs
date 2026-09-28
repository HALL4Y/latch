/** Parse clap-style `pass-cli … --help` text (no secrets). */

export function parseHelp(stdout) {
  const lines = stdout.split(/\r?\n/)
  const description = (lines.find((l) => l.trim() && !l.startsWith('Usage:')) || '').trim()

  let section = null
  const children = []
  const flags = []
  const arguments_ = []

  for (const line of lines) {
    const t = line.trimEnd()
    if (/^Commands:\s*$/.test(t)) {
      section = 'commands'
      continue
    }
    if (/^Options:\s*$/.test(t)) {
      section = 'options'
      continue
    }
    if (/^Arguments:\s*$/.test(t)) {
      section = 'arguments'
      continue
    }
    if (/^Usage:/.test(t)) {
      section = null
      continue
    }

    if (section === 'commands') {
      const m = t.match(/^ +(\S+)\s{2,}(.+)$/) || t.match(/^ +(\S+)\s+(.+)$/)
      if (!m) continue
      const name = m[1]
      if (name === 'help') continue
      children.push({ name, description: m[2].trim() })
      continue
    }

    if (section === 'arguments') {
      const m = t.match(/^ +<([^>]+)>\s+(.+)$/)
      if (m) arguments_.push({ name: m[1], description: m[2].trim(), positional: true })
      continue
    }

    if (section === 'options') {
      const m = t.match(/^ +(--[\w-]+)(?:\s+<[^>]+>)?\s{2,}(.+)$/) || t.match(/^ +(--[\w-]+)\s+(.+)$/)
      if (m) {
        flags.push(parseFlagLine(m[1], m[2]))
        continue
      }
      const m2 = t.match(/^ +(-h, --help)\s+(.+)$/)
      if (m2) flags.push({ name: '--help', description: m2[2].trim(), takesValue: false })
    }
  }

  return { description, children, flags, arguments: arguments_ }
}

function parseFlagLine(name, rest) {
  const possible = rest.match(/\[possible values: ([^\]]+)\]/)
  let possibleValues
  if (possible) {
    possibleValues = possible[1].split(',').map((s) => s.trim())
  }
  const takesValue = /<[^>]+>/.test(rest) || /--[\w-]+/.test(name)
  return {
    name,
    description: rest.replace(/\s*\[default:[^\]]+\]/g, '').replace(/\s*\[possible values:[^\]]+\]/g, '').trim(),
    takesValue: name !== '--help' && (takesValue || name.startsWith('--')),
    possibleValues,
  }
}
