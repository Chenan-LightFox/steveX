const { SteveXAgent } = require('../agent/agent')

class AgentManager {
  constructor(config) {
    this.config = config
    this.agents = []
    this.agentConfigs = []
  }

  startAll() {
    const agentConfigs = this.normalizeAgents(this.config)
    this.agentConfigs = agentConfigs
    this.agents = []

    agentConfigs.forEach((agentConfig) => {
      const agent = new SteveXAgent(agentConfig.config, agentConfig.name)
      agent.start()
      this.agents.push({ name: agentConfig.name, config: agentConfig.config, agent })
    })
  }

  stopAll() {
    this.agents.forEach((entry) => {
      if (entry.agent && entry.agent.bot) {
        entry.agent.bot.quit('Shutdown')
      }
      entry.agent = null
    })
    this.agents = []
  }

  reload(config) {
    this.stopAll()
    this.config = config
    this.startAll()
  }

  startAgent(name) {
    const entry = this.findEntryByName(name)
    if (!entry) return false
    if (entry.agent && entry.agent.bot) return true

    const agent = new SteveXAgent(entry.config, entry.name)
    agent.start()
    entry.agent = agent
    return true
  }

  stopAgent(name) {
    const entry = this.findEntryByName(name)
    if (!entry) return false
    if (entry.agent && entry.agent.bot) {
      entry.agent.bot.quit('Shutdown')
      entry.agent = null
      return true
    }
    return false
  }

  sendChat(name, message) {
    const entry = this.findEntryByName(name)
    if (!entry || !entry.agent || !entry.agent.bot) return false
    entry.agent.bot.chat(message)
    return true
  }

  async sendCommand(name, command) {
    const entry = this.findEntryByName(name)
    if (!entry || !entry.agent) {
      return { ok: false, error: 'Agent not found or not started' }
    }
    return await entry.agent.executeCommand(command)
  }

  getStatus() {
    return this.agents.map((entry) => {
      const bot = entry.agent ? entry.agent.bot : null
      return {
        name: entry.name,
        username: bot ? bot.username : entry.config.minecraft.username,
        online: Boolean(bot && bot.player)
      }
    })
  }

  findEntryByName(name) {
    return this.agents.find((entry) => entry.name === name)
  }

  normalizeAgents(config) {
    const agents = Array.isArray(config.agents) ? config.agents : []

    if (agents.length === 0) {
      throw new Error('No agents configured. Add agents in configs/defaults/app.json')
    }

    return agents.map((agent) => {
      const mergedMinecraft = agent.minecraft || {}
      const mergedLlm = agent.llm || {}
      const name = agent.name || mergedMinecraft.username || 'steveX'
      return {
        name,
        config: { ...config, minecraft: mergedMinecraft, llm: mergedLlm }
      }
    })
  }
}

module.exports = {
  AgentManager
}
