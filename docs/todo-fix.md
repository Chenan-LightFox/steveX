# steveX 已知问题与技术债

> 最后更新：2026-05-28

> 本文档记录已识别但暂不修复的问题，标注原因与预期修复时机。

---

## Command 层问题（待重构时一并修复）

> 以下问题将在 command 系统重新封装时统一解决，当前不做零散修补。

### CMD-1: `follow` 命令资源泄漏

- **文件**: `src/commands/actions/follow.js`
- **问题**: `setInterval` 挂在 `target.entity._followInterval` 上，bot 断连时 interval 不会被清理；对同一玩家执行两次 `follow` 时旧 interval 泄漏；`entityGone` 事件可能不触发
- **修复方向**: 在 `SteveXAgent` 上维护活跃任务注册表（`_activeTasks: Set`），`shutdown()` 时统一清理；command handler 通过 `agent.registerTask(cleanup)` 注册生命周期

### CMD-2: `move` 命令的 `setTimeout` 无法取消

- **文件**: `src/commands/actions/move.js`
- **问题**: `setTimeout(() => bot.setControlState(...), duration)` 在 bot 断连后仍会触发，调用已销毁 bot 的方法导致崩溃；`stop` 命令也无法取消 pending timeout
- **修复方向**: 同 CMD-1，将 timeout 注册到 agent 任务系统，断连时统一清理

### CMD-3: 容器命令污染 mineflayer bot 实例

- **文件**: `src/commands/actions/furnace.js`, `anvil.js`, `enchant.js` 等
- **问题**: 直接在 `bot` 上挂载私有属性（`bot._furnace`, `bot._anvil` 等），污染第三方库实例；同时打开两个容器时前一个引用丢失
- **修复方向**: 在 `SteveXAgent` 上维护 `this.openContainers = new Map()`，用容器类型做 key；command 重构时统一容器状态管理

---

## 性能问题

### PERF-1: `craft` 命令每次调用都重新加载 `minecraft-data`

- **文件**: `src/commands/actions/craft.js:14`
- **问题**: `require('minecraft-data')(bot.version)` 每次创建新对象，而 `agent.js` 的 spawn 事件中已加载过
- **修复方向**: 在 `SteveXAgent` 上缓存 `this.mcData`，command handler 通过 `agent.mcData` 访问
- **优先级**: 低
- **状态**: ✅ 已修复（2026-06-05）

### PERF-2: 前端 `subscribe` 无节流，每秒触发完整渲染

- **文件**: `src/web/public/app.js:201-208`
- **问题**: 全局 `subscribe` 永不取消，配合每秒 WebSocket snapshot，每秒触发 `renderAgents`（虽有 Smart Diff 但 DOM 查询仍有开销）
- **修复方向**: 对 `renderAgents` 做 `requestAnimationFrame` 节流
- **优先级**: 低
- **状态**: ✅ 已修复（2026-05-28）

### PERF-3: `addLog` 用 `shift()` 清理旧日志

- **文件**: `src/web/public/lib/state.js:53-55`
- **问题**: `Array.shift()` 是 O(n) 操作，每次删除需移动全部元素
- **修复方向**: 改为 `state.logs[name] = state.logs[name].slice(-LOG_MAX)`
- **优先级**: 低
- **状态**: 待修

---

## 代码清理

### CLEAN-1: `getAgentBot` 多重 fallback 是死代码

- **文件**: `src/agent/agent_manager.js:105-107`
- **问题**: `agent?.minecraftBot` 和 `agent?._bot` 从不存在，fallback 链无意义
- **修复方向**: 简化为 `return agent?.bot ?? null`
- **优先级**: 低
- **状态**: 待修

### CLEAN-2: `deepMerge` 不处理 `null` 值

- **文件**: `src/utils/config.js:9-22`
- **问题**: `typeof null === 'object'` 但 `null && ...` 短路为 falsy，环境配置无法用 `null` 显式覆盖默认值
- **修复方向**: 在 merge 条件中显式排除 null：`source[key] !== null && typeof source[key] === 'object' && ...`
- **优先级**: 低
- **状态**: 待修





#### P0-1：命令调用签名错误

`commands/index.js` 注释与部分命令实现要求 `handler(bot, args, agent)`，但 `SteveXAgent.executeCommand()` 当前调用为：

```js
return await handler.call(this, this.bot, args)
```

因此 `goto.js`、`mine.js`、`collect.js` 中的 `agent.movements` 会因为 `agent === undefined` 而失败。应立即改为：

```js
return await handler.call(this, this.bot, args, this)
```

同时建议统一规范：命令内部要么使用第三参 `agent`，要么使用 `this`，不要混用。

#### P0-2：缺少 Runtime State Store，当前状态只是 Web 展示聚合

当前没有独立 `AgentStateStore`。`/api/status` 和 WebSocket `snapshot` 都直接调用 `AgentManager.getStatus()`，从 `bot` 与配置临时拼展示字段。这会导致 Planner / BT / Skill 共用状态时出现语义混乱：

- 离线 Agent 默认 `health: 20, maxHealth: 20`，不是可执行状态；
- position 是展示字符串或 `~`，不是稳定数值 DTO；
- 没有 hunger、inventory、equipment、hazards、current task、locks；
- 没有 stateVersion、lastSeen、source、trace。

因此第一步不是扩展 UI 字段，而是新增 Runtime 级 `AgentStateStore`，再由 UI adapter 把 DTO 转成展示格式。

#### P0-3：Planner-facing API 不能继续使用自由文本命令

当前 `/api/agents/:name/command` 接收的是字符串，例如：

```text
goto 10 64 20
mine 10 63 20
craft oak_planks 4
```

这对人类调试方便，但对 LLM 来说存在三类问题：

- 参数类型靠字符串拆分，缺少 schema 校验；
- LLM 容易生成拼写、顺序、数量错误；
- Runtime 难以做权限、超时、取消、预条件、效果记录。

后续必须引入结构化调用：

```json
{
  "agentId": "steveX-1",
  "skill": "goto",
  "params": { "x": 10, "y": 64, "z": 20 },
  "timeoutMs": 30000,
  "requestId": "req_..."
}
```

#### P0-4：EventBus 目前只是 UI 广播桥，不是 Runtime 事件总线

当前 `AgentManager.eventBus` 只发连接、断开、命令开始、命令完成、LLM 预留事件。Runtime 需要的事件包括：

- `agent.state.updated`
- `agent.health.changed`
- `agent.inventory.changed`
- `world.block.updated`
- `world.entity.spawned`
- `task.assigned`
- `task.blocked`
- `task.completed`
- `skill.started`
- `skill.progress`
- `skill.failed`
- `reflex.triggered`
- `reflex.resolved`
- `lock.acquired`
- `lock.released`

UI 可以订阅这些事件，但不应该定义这些事件。

#### P0-5：状态快照未规范化

当前状态不是从稳定 Runtime DTO 生成，而是 `getStatus()` 临时拼装展示字段：

```js
position: this.getAgentPosition(agent),
currentAction: this.getAgentAction(agent),
model: this.getAgentModel(cfg)
```

这会造成：

- 展示格式和执行语义混在一起，例如 position 使用字符串 `"12.3"` 或 `"~"`；
- 离线状态默认 health 为 `20`，容易误导 Planner；
- WebSocket `snapshot` 和 REST `/api/status` 只能服务 UI，不能作为 Runtime planning context；
- 未来加入 inventory、world、task、lock、Git trace 时缺少稳定 DTO 边界。

应先定义 `AgentStateDTO` / `InventoryItemDTO` / `Vec3DTO` 等稳定结构，再让 UI 做格式化：

```ts
interface InventoryItemDTO {
  name: string
  displayName?: string
  count: number
  slot: number
  metadata?: number
  nbtHash?: string
}
```

#### P0-6：缺少动作超时、取消、恢复

当前 `sendCommand()`（`agent_manager.js` 第 53 行）直接 `await agent.executeCommand(command)`，如果底层 `pathfinder.goto()`、`bot.dig()`、容器交互卡住，Runtime 无法统一取消或恢复。典型风险场景：

| 命令 | 风险 | 当前处理 |
|---|---|---|
| `goto` / `mine` / `collect` | `pathfinder.goto()` 寻路卡死 | 无超时，无取消 |
| `follow` | `setInterval` 持续运行 | 仅靠 `entityGone` 事件清理，无主动取消 |
| `dig` | `bot.dig()` 卡在不可挖方块 | 无超时 |
| `fish` | `bot.fish()` 无限等待 | 无超时 |
| 容器交互 | 窗口未响应 | 无超时 |

后续所有 skill 必须支持：

- `timeoutMs`
- `AbortSignal`
- `cancel()`
- `cleanup()`
- `recover()`
- `idempotencyKey`

#### P0-7：连接状态与生命周期还不严谨

当前 `connectAgent()` 会在 `agent.start()` 后立即将实例放入 `agents` Map 并广播 `agent:connect`，但 `online` 是 `SteveXAgent.isOnline()` 基于 `spawn` 后的 `connected=true` 计算出来的。这个设计避免了“spawn 前 online=true”的问题，但仍缺少完整 lifecycle：

```text
configured → connecting → spawned/online → busy/idle → disconnecting → offline/error
```

目前连接中、错误、离线主要靠 `currentAction` 字符串表达，不适合 Runtime 调度。应加入显式 lifecycle、heartbeat 与 watchdog。
