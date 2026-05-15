const { loadConfig } = require('./utils/config')
const { AgentManager } = require('./multiagent/agent_manager')
const { startWebServer } = require('./web/server')
const { logInfo } = require('./telemetry/logger')

function main() {
  const config = loadConfig()
  const manager = new AgentManager(config)

  manager.startAll()
  logInfo('steveX agents started')

  const webConfig = config.web || { enabled: false }
  if (webConfig.enabled) {
    startWebServer({
      manager,
      loadConfig,
      webConfig
    })
  }

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (data) => {
    const command = data.trim()
    if (command === 'reload') {
      logInfo('Reloading agent config')
      const nextConfig = loadConfig()
      manager.reload(nextConfig)
    }
  })

  process.on('SIGINT', () => {
    logInfo('Shutting down')
    manager.stopAll()
    process.exit(0)
  })
}

main()
