import react from '@vitejs/plugin-react'
import { spawnSync } from 'node:child_process'
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

      server.middlewares.use('/api/pass-cli/run', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        for await (const chunk of req) body += chunk
        let payload: { argv?: string[]; allowSecrets?: boolean }
        try {
          payload = JSON.parse(body)
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }
        const argv = payload.argv
        if (!argv?.length || argv[0] !== 'pass-cli') {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'argv must start with pass-cli' }))
          return
        }
        const joined = argv.join(' ')
        const blocked =
          /\bitem\s+(view|read|get|show|list|totp|attachment)\b/.test(joined) ||
          /\bcontents\/(view|run|inject)\b/.test(joined) ||
          /\bpassword\b/.test(joined) ||
          /\bpat\s+(create|renew)\b/.test(joined) ||
          /\bagent\s+(create|renew)\b/.test(joined) ||
          /\blogin\b/.test(joined) ||
          /\bssh-agent\b/.test(joined)
        if (blocked && !payload.allowSecrets) {
          res.statusCode = 403
          res.end(
            JSON.stringify({
              error:
                'Latch ne exécute pas les commandes de lecture de secrets depuis l’interface. Utilisez le script exporté dans votre terminal.',
            }),
          )
          return
        }
        const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            status: r.status,
            stdout: r.stdout,
            stderr: r.stderr,
            redacted: false,
          }),
        )
      })

      server.middlewares.use('/api/spec/refresh', async (_req, res) => {
        const { spawn } = await import('node:child_process')
        const child = spawn('node', ['scripts/fetch-spec.mjs'], {
          cwd: process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let out = ''
        let err = ''
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (err += d))
        child.on('close', (code) => {
          if (code !== 0) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err || out || 'fetch failed' }))
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, log: out }))
        })
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
