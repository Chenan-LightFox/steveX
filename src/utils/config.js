const fs = require('fs')
const path = require('path')

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function applyEnvOverrides(config) {
  const agents = Array.isArray(config.agents) ? config.agents : []

  if (!config.web) config.web = {}
  if (process.env.WEB_ENABLED) config.web.enabled = process.env.WEB_ENABLED === 'true'
  if (process.env.WEB_HOST) config.web.host = process.env.WEB_HOST
  if (process.env.WEB_PORT) config.web.port = Number(process.env.WEB_PORT)

  agents.forEach((agent) => {
    if (!agent.minecraft) agent.minecraft = {}
    if (!agent.llm) agent.llm = {}

    const mc = agent.minecraft
    const llm = agent.llm

    if (process.env.MC_HOST) mc.host = process.env.MC_HOST
    if (process.env.MC_PORT) mc.port = Number(process.env.MC_PORT)
    if (process.env.MC_USERNAME) mc.username = process.env.MC_USERNAME
    if (process.env.MC_AUTH) mc.auth = process.env.MC_AUTH
    if (process.env.MC_VERSION) mc.version = process.env.MC_VERSION

    if (process.env.DEEPSEEK_API_KEY) llm.apiKey = process.env.DEEPSEEK_API_KEY
    if (process.env.DEEPSEEK_BASE_URL) llm.baseUrl = process.env.DEEPSEEK_BASE_URL
    if (process.env.DEEPSEEK_MODEL) llm.model = process.env.DEEPSEEK_MODEL
  })

  return config
}

function loadConfig() {
  const root = path.resolve(__dirname, '..', '..')
  const defaultPath = path.join(root, 'configs', 'defaults', 'app.json')
  const config = loadJson(defaultPath)
  return applyEnvOverrides(config)
}

module.exports = {
  loadConfig
}
