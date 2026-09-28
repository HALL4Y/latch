import react from '@vitejs/plugin-react'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const PORT = 4317

function latchLocalApi(): Plugin {
  return {
    name: 'latch-local-api',
    configureServer(server) {
      server.middlewares.use('/api/pass-cli/version', (_req, res) => {
        const r = spawnSync('pass-cli', ['--version'], { encoding: 'utf8' })
        if (r.error || r.status !== 0) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ available: false, error: r.stderr || String(r.error) }))
          return
        }
        const version = (r.stdout || r.stderr || '').trim()
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ available: true, version }))
      })

      server.middlewares.use('/api/help/refresh', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const bin = process.env.PASS_CLI_BIN || 'pass-cli'
        const walk = spawnSync('node', ['scripts/walk-help.mjs'], {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { ...process.env, PASS_CLI_BIN: bin },
        })
        if (walk.status !== 0) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              ok: false,
              error: walk.stderr || walk.stdout || 'pass-cli absent ou parcours help impossible',
            }),
          )
          return
        }
        const mapping = JSON.parse(readFileSync(join(process.cwd(), 'src/data/help-mapping.json'), 'utf8'))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, mapping, log: walk.stdout }))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), latchLocalApi()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
  },
})
