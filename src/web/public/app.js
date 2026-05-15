const grid = document.getElementById('grid')
const reloadButton = document.getElementById('reload')
const uptimeEl = document.getElementById('uptime')

reloadButton.addEventListener('click', async () => {
  await fetch('/api/reload', { method: 'POST' })
  await refresh()
})

function getStatusClass(online) {
  return online ? 'online' : 'offline'
}

function getStatusText(online) {
  return online ? 'online' : 'offline'
}

function createCard(agent) {
  const card = document.createElement('section')
  card.className = 'card'
  card.dataset.agentName = agent.name

  card.innerHTML = `
    <h2>${agent.name}</h2>
    <div class="pill status-pill ${getStatusClass(agent.online)}">${getStatusText(agent.online)}</div>
    <div class="pill">${agent.username}</div>
    <div class="actions">
      <button class="green" data-action="start">Start</button>
      <button class="orange" data-action="stop">Stop</button>
    </div>
    <div class="chat">
      <input type="text" placeholder="Send chat..." />
      <button class="secondary" data-action="chat">Send</button>
    </div>
    <div class="command">
      <input type="text" class="cmd-input" placeholder="Command: goto 0 64 0, dig, lookat..." />
      <button class="secondary" data-action="command">Run</button>
    </div>
    <div class="output"></div>
  `

  const buttons = card.querySelectorAll('button')
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => onAction(agent.name, btn, card))
  })

  return card
}

function buildGrid(agents) {
  grid.innerHTML = ''
  agents.forEach((agent) => {
    grid.appendChild(createCard(agent))
  })
}

function updateStatus(agents) {
  agents.forEach((agent) => {
    const card = grid.querySelector(`.card[data-agent-name="${agent.name}"]`)
    if (!card) {
      grid.appendChild(createCard(agent))
      return
    }
    const pill = card.querySelector('.status-pill')
    if (pill) {
      pill.className = `pill status-pill ${getStatusClass(agent.online)}`
      pill.textContent = getStatusText(agent.online)
    }
  })
}

async function refresh() {
  const response = await fetch('/api/status')
  const data = await response.json()

  uptimeEl.textContent = `Uptime: ${data.uptimeSec}s`

  // First load — build all cards
  if (grid.children.length === 0) {
    buildGrid(data.agents)
    return
  }

  // Subsequent refreshes — only update status pills, don't touch inputs
  updateStatus(data.agents)
}

async function onAction(name, button, card) {
  const action = button.dataset.action

  if (action === 'start' || action === 'stop') {
    await fetch(`/api/agents/${encodeURIComponent(name)}/${action}`, {
      method: 'POST'
    })
    await refresh()
    return
  }

  if (action === 'chat') {
    const input = card.querySelector('.chat input')
    const message = input.value.trim()
    if (!message) return

    await fetch(`/api/agents/${encodeURIComponent(name)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })

    input.value = ''
  }

  if (action === 'command') {
    const input = card.querySelector('.cmd-input')
    const command = input.value.trim()
    if (!command) return

    const outputEl = card.querySelector('.output')

    outputEl.style.display = 'block'
    outputEl.className = 'output'
    outputEl.textContent = 'Running...'

    const response = await fetch(`/api/agents/${encodeURIComponent(name)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    })

    const result = await response.json()
    outputEl.className = result.ok ? 'output success' : 'output error'
    outputEl.textContent = result.output || result.error || 'Done'
    input.value = ''
  }
}

refresh()
setInterval(refresh, 4000)
