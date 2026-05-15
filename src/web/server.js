const http = require('http')
const fs = require('fs')
const path = require('path')
const { logInfo, logError } = require('../telemetry/logger')

function startWebServer({ manager, loadConfig, webConfig }) {
  const host = webConfig.host || '0.0.0.0'
  const port = webConfig.port || 8090
  const publicDir = path.join(__dirname, 'public')

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)

      if (req.method === 'GET' && url.pathname === '/') {
        return sendFile(res, path.join(publicDir, 'index.html'), 'text/html')
      }

      if (req.method === 'GET' && url.pathname === '/app.js') {
        return sendFile(res, path.join(publicDir, 'app.js'), 'application/javascript')
      }

      if (req.method === 'GET' && url.pathname === '/api/status') {
        return sendJson(res, 200, {
          agents: manager.getStatus(),
          uptimeSec: Math.floor(process.uptime())
        })
      }

      if (req.method === 'POST' && url.pathname === '/api/reload') {
        const nextConfig = loadConfig()
        manager.reload(nextConfig)
        return sendJson(res, 200, { ok: true })
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/agents/')) {
        const parts = url.pathname.split('/').filter(Boolean)
        const name = decodeURIComponent(parts[2] || '')
        const action = parts[3] || ''

        if (!name) return sendJson(res, 400, { ok: false, error: 'Missing agent name' })

        if (action === 'start') {
          const ok = manager.startAgent(name)
          return sendJson(res, ok ? 200 : 404, { ok })
        }

        if (action === 'stop') {
          const ok = manager.stopAgent(name)
          return sendJson(res, ok ? 200 : 404, { ok })
        }

        if (action === 'chat') {
          const body = await readJsonBody(req)
          const message = body.message || ''
          if (!message) return sendJson(res, 400, { ok: false, error: 'Missing message' })
          const ok = manager.sendChat(name, message)
          return sendJson(res, ok ? 200 : 404, { ok })
        }

        if (action === 'command') {
          const body = await readJsonBody(req)
          const command = body.command || ''
          if (!command) return sendJson(res, 400, { ok: false, error: 'Missing command' })
          const result = await manager.sendCommand(name, command)
          return sendJson(res, result.ok ? 200 : 400, result)
        }
      }

      sendJson(res, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      logError('Web server error', error)
      sendJson(res, 500, { ok: false, error: 'Internal error' })
    }
  })

  server.listen(port, host, () => {
    logInfo(`Web panel listening on http://${host}:${port}`)
  })
}

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  })
  res.end(data)
}

function sendFile(res, filePath, contentType) {
  const data = fs.readFileSync(filePath)
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': data.length
  })
  res.end(data)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

module.exports = {
  startWebServer
}
