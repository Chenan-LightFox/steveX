const skillRegistry = require("../../runtime/skill_registry.ts");

const args = {}

const skill = {
  name: 'eat',
  description: 'Eat the currently held food item',
  args,
  async handler(agent, _args) {
    if (!agent.bot.heldItem) return { ok: false, error: 'No item in hand' }
    await agent.bot.consume()
    return { ok: true, output: `Ate ${agent.bot.heldItem.name}` }
  }
}

skillRegistry.register(skill);

/**
 * eat — eat the held food
 */
module.exports = {
  name: skill.name,
  description: skill.description,
  usage: 'eat',
  handler: skill.handler
}
