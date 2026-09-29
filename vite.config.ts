import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import {
  buildPassCliVersionPayload,
  getLatchWorkspacePath,
  loadMappingFromDisk,
  runHelpWalk,
  tryPassCliUpdate,
} from './scripts/latchDevApi.ts'

const PORT = 4317

function latchLocalApi(): Plugin {
  return {
    name: 'latch-local-api',
    configureServer(server) {
      server.middlewares.use('/api/latch/workspace', (_req, res) => {
        const path = getLatchWorkspacePath()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ path }))
      })

      server.middlewares.use('/api/pass-cli/version', async (_req, res) => {
        const bin = process.env.PASS_CLI_BIN || 'pass-cli'
        const cwd = process.cwd()
        let mapping
        try {
          mapping = loadMappingFromDisk(cwd)
        } catch {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ available: false, mappingDrift: null, upstream: { reliable: false } }))
          return
        }
        const payload = await buildPassCliVersionPayload(mapping, bin)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(payload))
      })

      server.middlewares.use('/api/help/refresh', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const bin = process.env.PASS_CLI_BIN || 'pass-cli'
        const cwd = process.cwd()

        let mapping = loadMappingFromDisk(cwd)
        const update = tryPassCliUpdate(bin, mapping)

        const walk = runHelpWalk(bin, cwd)
        if (!walk.ok) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: walk.error, update }))
          return
        }

        mapping = loadMappingFromDisk(cwd)
        const version = await buildPassCliVersionPayload(mapping, bin)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: true,
            mapping,
            log: walk.log,
            update,
            version,
          }),
        )
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
