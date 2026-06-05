# LLM Agent API 设计组会材料：steveX / Mineflayer / Mindcraft / 组员方案综合评审

---

## 0. 结论先行

### 0.1 当前判断

`steveX` 现在已经具备一个可运行的 **Minecraft Bot 命令执行底座 + Web 控制台**：

- 使用 `mineflayer` 创建 Bot 连接 Minecraft；
- 使用 `mineflayer-pathfinder`，并在 `spawn` 后初始化 `Movements`；
- 支持多 Agent 配置、按名称连接、断开、重载配置、查询状态；
- 当前命令系统自动加载 77 个命令，其中 57 个 action、14 个 query、6 个 creative；
- 已有 Web 面板、Express REST API、`ws` WebSocket 状态推送；
- 已有环境配置读取 / 保存 API：`GET/POST /api/config/environment`；
- 已有 DeepSeek 客户端类，但尚未接入 Agent 决策循环，Web UI 的 “Send Message to LLM Planner” 仍是 `Coming soon`；
- 已有 `memory/`、`blackboard/`、`capsules/`、`benchmarks/` 等目录占位，目前仅有 `.gitkeep`，核心逻辑尚未实现。

因此当前项目不是“完整 LLM Agent”，也还不是完整 Runtime，而是一个 **Mineflayer Command Runtime + Web 控制台**。下一步 API 设计不能直接从 LLM prompt 入手，而应该先把 command runtime 收敛为结构化 skill API，再补齐 state、event、task、lock、BT 执行闭环。

### 0.2 最高优先级设计原则

1. **LLM 不直接控制 Mineflayer 原子 API**。LLM 面向 `Task / BehaviorTree / Skill`，不是 `bot.setControlState()`、`bot.dig()`、`bot.pathfinder.goto()`。
2. **字符串命令只保留给人类调试**。Planner 与 Runtime 之间必须使用结构化 JSON schema / TypeScript interface。
3. **Agent Runtime Layer 是系统核心**。它负责状态、事件、任务、锁、生命周期、动作调度，是多 Agent 稳定协作的前提。
4. **行为树负责长时序控制，FR-BT 负责毫秒级生存反射**。规划树可以由 LLM 生成和修复；快速反应树运行时禁止调用 LLM。
5. **Git / Capsule / Blackboard 是研究创新点，但不应进入第一步热路径**。第一步必须先保证单 Agent 稳定执行与状态闭环。

### 0.3 推荐目标架构

```text
User / Benchmark / Web UI
        │
        ▼
External API Layer
REST / WebSocket / CLI / Benchmark Runner
        │
        ▼
Agent Runtime Layer
Agent Registry │ State Store │ World State │ Event Bus │ Task Queue │ Lock Manager │ Lifecycle Watchdog │ Action Dispatcher
        │
        ▼
Cognitive Layer
Planner │ Behavior Tree Executor │ Reflex Controller │ Memory │ Reflector │ Capsule Manager │ Git Trace
        │
        ▼
Skill Layer
Typed Skills │ Preconditions │ Effects │ Timeout │ Cancellation │ Recovery │ Telemetry
        │
        ▼
Mineflayer Adapter Layer
mineflayer bot │ pathfinder │ inventory │ world/entity API │ chat │ crafting │ digging │ placing
        │
        ▼
Minecraft Server
```


### 2.4 已实现的外部 REST API

| 方法 | 路径 | 功能 | 当前评价 |
|---|---|---|---|
| `GET` | `/api/status` | 返回所有 Agent 状态与 uptime | 可用；字段来自 `AgentManager.getStatus()`，包括 `name/username/online/health/maxHealth/gameMode/position/currentAction/model` |
| `GET` | `/api/config/environment` | 读取 `configs/environments/app.json` | 可用；用于 Web 配置页 |
| `POST` | `/api/config/environment` | 保存环境配置 | 可用；校验 body 中必须有 `config` 对象，并限制 512KB，但缺少 schema 级配置校验 |
| `POST` | `/api/reload` | 重载配置并断开所有 Agent | 可用；缺少 reload 审计与失败回滚 |
| `POST` | `/api/agents/:name/connect` | 连接指定 Agent | 可用；`online` 以 `spawn` 后 `connected=true` 为准，连接中状态只能通过 `currentAction='Connecting'` 间接显示 |
| `POST` | `/api/agents/:name/disconnect` | 断开指定 Agent | 可用；只允许断开 `isOnline()` 的 Agent，连接中或异常态清理仍不完整 |
| `POST` | `/api/agents/:name/command` | 发送字符串命令 | 适合调试，不适合作为 planner-facing API |

### 2.5 已实现的 WebSocket 事件

| 事件 | 方向 | 说明 |
|---|---|---|
| `snapshot` | Server → Client | 连接时立即推送；之后由事件置脏并在 1 秒 tick 中节流推送 |
| `agent:connect` | Server → Client | Agent 连接请求已创建本地 Agent 实例 |
| `agent:disconnect` | Server → Client | Agent 断开事件 |
| `agent:update` | Server → Client | Agent 状态可能变化；前端用它触发轻量刷新 |
| `agent:command:start` | Server → Client | 命令开始 |
| `agent:command:done` | Server → Client | 命令完成，含输出或错误 |
| `agent:llm:input` | Server → Client | 预留 LLM 输入日志；当前没有真实 Planner 触发 |
| `agent:llm:output` | Server → Client | 预留 LLM 输出日志；当前没有真实 Planner 触发 |


### 2.6 当前状态来源：尚无独立 AgentStateStore

当前代码中没有独立 `AgentStateStore` 类，也没有 `buildSnapshot()` / `updateState()` 方法。状态由 `AgentManager.getStatus()` 即时从配置和 `SteveXAgent` / `bot` 对象派生：

```js
{
  name: cfg.name,
  username: agent?.getUsername() ?? cfg.minecraft?.username ?? cfg.name,
  online: agent?.isOnline() ?? false,
  health: bot?.health ?? 20,
  maxHealth: bot?.maxHealth ?? 20,
  gameMode: bot?.game?.gameMode ?? 'Survival',
  position: bot?.entity?.position ? { x, y, z } : { x: '~', y: '~', z: '~' },
  currentAction: agent?.currentAction ?? 'Idle',
  model: cfg?.llm?.model ?? 'Unknown'
}
```

这是一个可工作的 Web UI 状态聚合，但还不够支撑多 Agent 规划：

- 状态没有版本号、更新时间、来源、事件序列号；
- 位置被格式化成字符串 `toFixed(1)` 或 `~`，适合展示，不适合 Planner 计算；
- health / maxHealth 离线默认显示为 `20/20`，容易被 Planner 误解为真实健康状态；
- 没有 hunger、oxygen、xp、inventory、equipment、nearbyEntities、hazards；
- 没有 currentTaskId、currentBtNodeId、currentSkillInvocationId、locksHeld；
- 没有状态 diff、持久化、trace 或订阅机制。

下一步应新增真正的 `AgentStateStore`，并让 Web UI 从 DTO 读取展示字段，而不是直接把展示状态当 Runtime 状态。

### 2.7 当前命令系统

命令系统自动加载 `actions/queries/creative` 三类目录，每个文件导出：

```js
{
  name,
  description,
  usage,
  async handler(bot, args, agent) { ... }
}
```

当前命令总数：

| 类别 | 数量 | 说明 |
|---|---:|---:|---|
| Actions | 57 | 改变游戏状态的动作命令 |
| Queries | 14 | 环境与自身状态查询 |
| Creative | 6 | 创造模式专用命令 |
| 合计 | 77 | 已经可以作为 Skill Layer 的初始资产 |


#### Actions：改变游戏状态的动作命令

| 命令 | 用法 | 说明 |
|---|---|---|
| `acceptpack` | `acceptpack` | Accept server resource pack |
| `anvil` | `anvil` | Open the anvil block in sight |
| `attack` | `attack` | Attack the nearest entity |
| `click` | `click <slot> [button]` | Click a slot in the current window |
| `close` | `close` | Close the currently open container/window |
| `collect` | `collect` | Walk to the nearest dropped item and pick it up |
| `craft` | `craft <itemName> [count]` | Craft an item from inventory (hand-craftable only) |
| `denypack` | `denypack` | Deny server resource pack |
| `dig` | `dig` | Dig the block in sight |
| `dismount` | `dismount` | Dismount from current vehicle |
| `dispenser` | `dispenser` | Open the dispenser or dropper block in sight |
| `drive` | `drive <left\|right> <forward\|back>` | Control a vehicle (mount first) |
| `drop` | `drop <itemName> [count]` | Drop items from inventory |
| `eat` | `eat` | Eat the currently held food item |
| `elytra` | `elytra` | Start elytra flight |
| `enchant` | `enchant` | Open the enchantment table in sight |
| `equip` | `equip <item name>` | Equip an item from inventory |
| `fish` | `fish` | Go fishing with a fishing rod |
| `follow` | `follow <playerName>` | Follow a player continuously |
| `furnace` | `furnace` | Open the furnace block in sight |
| `goto` | `goto <x> <y> <z>` | Pathfind to coordinates |
| `hotbar` | `hotbar <slot>` | Select a quick bar slot (0-8) |
| `interact` | `interact` | Interact with the block or entity in sight |
| `interactat` | `interactat <entityName>` | Interact with a matching entity at its position |
| `jump` | `jump` | Make the bot jump |
| `look` | `look <yaw> <pitch>` | Set view angle |
| `lookat` | `lookat <x> <y> <z>` | Look at a position |
| `mine` | `mine <x> <y> <z>` | Walk to and dig a block at coordinates |
| `mount` | `mount` | Mount the nearest rideable entity |
| `move` | `move <forward\|back\|left\|right\|sprint\|sneak> [durationMs]` | Set movement control state |
| `moveslot` | `moveslot <sourceSlot> <destSlot>` | Move an item from source slot to destination slot |
| `open` | `open` | Open the container/entity in sight |
| `openentity` | `openentity` | Open an entity with an inventory in sight |
| `place` | `place` | Place the held block against the block in sight |
| `placeentity` | `placeentity` | Place an entity (painting, armor stand) against the block in sight |
| `putaway` | `putaway <slot>` | Put an item from a slot into empty inventory space |
| `quit` | `quit [reason]` | Disconnect from the server |
| `release` | `release` | Deactivate the held item (release bow, stop eating, etc.) |
| `respawn` | `respawn` | Manually respawn after death |
| `say` | `say <message>` | Send a chat message |
| `setcommandblock` | `setcommandblock <x> <y> <z> <command>` | Set a command block at coordinates |
| `settings` | `settings <key> <value>` | Change client settings |
| `sleep` | `sleep` | Find and sleep in a nearby bed |
| `stand` | `stand` | Stop all movement controls |
| `stop` | `stop` | Stop pathfinding |
| `stopdig` | `stopdig` | Stop digging the current block |
| `swing` | `swing [hand]` | Play arm swing animation |
| `toss` | `toss <itemName> [count]` | Toss/drop items from inventory |
| `trade` | `trade <index> [times]` | Trade with an opened villager |
| `transfer` | `transfer <itemName> [count]` | Transfer items between inventory and open container |
| `unequip` | `unequip [slot]` | Unequip an item from a slot |
| `use` | `use` | Use/activate the currently held item |
| `useon` | `useon <entityName>` | Use the held item on a matching entity |
| `wait` | `wait <ticks>` | Wait for a number of game ticks |
| `wake` | `wake` | Get out of bed |
| `whisper` | `whisper <player> <message>` | Send a whisper to a player |
| `writebook` | `writebook <slot> <page1>\|<page2>\|...` | Write text into a book |

#### Queries：只读环境查询命令

| 命令 | 用法 | 说明 |
|---|---|---|
| `digtime` | `digtime` | Show dig time for the block in sight |
| `equipslot` | `equipslot <hand\|head\|torso\|legs\|feet\|off-hand>` | Get inventory slot number for an equipment destination |
| `findblock` | `findblock <blockName> [radius]` | Find the nearest block by name |
| `findplayer` | `findplayer <name>` | Find players by name and show their info |
| `gamemode` | `gamemode` | Show current game mode |
| `hp` | `hp` | Show current health |
| `hunger` | `hunger` | Show food level and saturation |
| `inventory` | `inventory` | List inventory contents |
| `nearby` | `nearby [type]` | List nearby entities, optionally filtered by type |
| `oxygen` | `oxygen` | Show oxygen level |
| `pos` | `pos` | Show current position and dimension |
| `time` | `time` | Show game time, day and moon phase |
| `weather` | `weather` | Show current weather |
| `xp` | `xp` | Show experience level, points and progress |

#### Creative：创造模式命令

| 命令 | 用法 | 说明 |
|---|---|---|
| `clearinventory` | `clearinventory` | [Creative] Clear all inventory slots |
| `clearslot` | `clearslot <slot>` | [Creative] Clear a specific inventory slot |
| `flyto` | `flyto <x> <y> <z>` | [Creative] Fly in a straight line to coordinates |
| `setinventory` | `setinventory <slot> [itemName] [count] [metadata]` | [Creative] Set or clear an inventory slot |
| `startfly` | `startfly` | [Creative] Start flying (zero gravity) |
| `stopfly` | `stopfly` | [Creative] Stop flying and restore gravity |



## 3. API 设计总原则

### 3.1 API 分层原则

| 层 | 面向对象 | 不应暴露给谁 | 主要职责 |
|---|---|---|---|
| External API | Web UI、Benchmark、CLI、人类 | 不直接暴露 Mineflayer | 管理 Agent、任务、状态、日志、实验 |
| Runtime API | Planner、BT Executor、Skill、UI | 不暴露底层 bot 私有对象 | 状态、任务、锁、事件、生命周期 |
| Planner API | LLM / Brain | 不直接暴露 bot API | 目标分解、行为树生成、修复、反思 |
| Skill API | Runtime / BT Executor | 不直接暴露给自然语言输出 | 原子能力、参数校验、预条件、效果、错误 |
| Mineflayer Adapter | Skill 实现者 | 不暴露给 LLM | 对 `bot`、pathfinder、inventory、world 的封装 |

### 3.2 结构化优先原则

所有 Agent 内部协议必须是结构化对象。允许 Web UI 保留字符串命令，但应通过 adapter 转换为结构化 skill invocation。

错误示例：

```text
LLM → "mine 10 63 20"
```

正确示例：

```json
{
  "type": "skill.invoke",
  "agentId": "steveX-1",
  "skill": "mine_block_at",
  "params": { "pos": { "x": 10, "y": 63, "z": 20 } },
  "context": { "taskId": "task_001", "nodeId": "bt_1.2.3" }
}
```

### 3.3 Query 与 Action 分离

Mindcraft 的经验说明，query-driven observation 可以降低上下文噪声。steveX 应继续保留 query/action 分离，并进一步制度化：

| 类型 | 是否改变世界 | 是否可中断 | 是否需要锁 | 是否进入任务轨迹 | 示例 |
|---|---:|---:|---:|---:|---|
| Query | 否 | 通常否 | 否 | 是，作为 observation | `get_inventory`、`find_block` |
| Action | 是 | 是 | 通常是 | 是，作为 transition | `mine_block`、`craft_item` |
| Reflex | 是 | 是，最高优先级 | 可抢占 | 是，作为 safety trace | `escape_lava`、`eat_food` |
| Meta | 不直接改变世界 | 可中断 | 否 | 是 | `plan`、`reflect`、`publish_capsule` |

### 3.4 LLM 只负责不确定推理，不负责确定执行

LLM 适合：

- 任务分解；
- 行为树生成；
- 失败原因诊断；
- 经验归纳；
- Capsule 泛化；
- Prompt / memory 压缩。

LLM 不适合：

- 每 tick 决定怎么移动；
- 实时躲避危险；
- 直接拼接底层 JavaScript；
- 处理毫秒级中断；
- 维护资源锁一致性。

---

## 4. 推荐核心 API：Runtime Layer

### 4.1 Runtime API 总接口

```ts
interface AgentRuntimeAPI {
  // Agent lifecycle
  registerAgent(config: AgentConfig): Promise<AgentDescriptor>
  connectAgent(agentId: string): Promise<AgentState>
  disconnectAgent(agentId: string, reason?: string): Promise<void>
  restartAgent(agentId: string): Promise<AgentState>

  // State
  getAgentState(agentId: string): AgentState
  listAgentStates(filter?: AgentFilter): AgentState[]
  updateAgentState(agentId: string, patch: Partial<AgentState>, source: EventSource): AgentState

  // World
  queryWorldState(query: WorldQuery): WorldQueryResult
  updateWorldState(patch: WorldStatePatch, source: EventSource): void

  // Events
  emitEvent<T>(event: EventEnvelope<T>): void
  subscribe(pattern: EventPattern, handler: EventHandler): Subscription

  // Skills
  registerSkill(skill: SkillDefinition): void
  listSkills(filter?: SkillFilter): SkillDefinition[]
  invokeSkill(request: SkillInvokeRequest): Promise<SkillResult>
  cancelSkill(invocationId: string, reason?: string): Promise<void>

  // Tasks
  createTask(spec: TaskSpec): Promise<TaskRecord>
  assignTask(taskId: string, agentId: string): Promise<TaskRecord>
  updateTask(taskId: string, patch: Partial<TaskRecord>): TaskRecord
  cancelTask(taskId: string, reason?: string): Promise<void>
  listTasks(filter?: TaskFilter): TaskRecord[]

  // Locks
  acquireLock(request: LockRequest): Promise<LockRecord>
  releaseLock(lockId: string, reason?: string): Promise<void>

  // Memory / artifacts
  appendTrace(record: TraceRecord): Promise<void>
  saveArtifact(artifact: RuntimeArtifact): Promise<ArtifactRef>
}
```

### 4.2 AgentState 数据结构

```ts
type AgentLifecycleStatus =
  | 'configured'
  | 'connecting'
  | 'online'
  | 'idle'
  | 'busy'
  | 'blocked'
  | 'reflex'
  | 'disconnecting'
  | 'offline'
  | 'error'

interface AgentState {
  id: string
  name: string
  username: string
  lifecycle: AgentLifecycleStatus
  online: boolean

  position: Vec3DTO | null
  velocity?: Vec3DTO | null
  dimension?: string | null
  gamemode?: string | null

  health: number | null
  hunger: number | null
  saturation?: number | null
  oxygen?: number | null
  armor?: number | null
  xp?: {
    level: number
    points: number
    progress: number
  }

  inventory: InventoryItemDTO[]
  equipment: EquipmentDTO
  heldItem?: InventoryItemDTO | null

  nearbyEntities: EntitySummary[]
  nearbyBlocks?: BlockSummary[]
  hazards: HazardSummary[]

  currentTaskId: string | null
  currentBtNodeId: string | null
  currentSkillInvocationId: string | null
  actionStatus: 'idle' | 'running' | 'blocked' | 'error' | 'cancelled'
  currentAction: string | null
  lastError: RuntimeError | null

  locksHeld: string[]
  memorySummary?: string

  lastSeen: number
  stateVersion: number
}

interface Vec3DTO {
  x: number
  y: number
  z: number
}

interface InventoryItemDTO {
  name: string
  displayName?: string
  count: number
  slot: number
  metadata?: number
  nbtHash?: string
}

interface EquipmentDTO {
  hand?: InventoryItemDTO | null
  offHand?: InventoryItemDTO | null
  head?: InventoryItemDTO | null
  torso?: InventoryItemDTO | null
  legs?: InventoryItemDTO | null
  feet?: InventoryItemDTO | null
}

interface EntitySummary {
  id: number | string
  name?: string
  type: string
  position: Vec3DTO
  distance: number
  hostile?: boolean
}

interface HazardSummary {
  type: 'lava' | 'fire' | 'falling' | 'drowning' | 'hostile_mob' | 'low_health' | 'low_hunger' | 'void' | 'unknown'
  severity: 1 | 2 | 3 | 4 | 5
  position?: Vec3DTO
  distance?: number
  detectedAt: number
}
```

### 4.3 WorldState 数据结构

```ts
interface WorldState {
  id: string
  dimension: string
  knownBlocks: Record<string, BlockMemory>
  resourceNodes: ResourceNode[]
  sharedStorage: StorageRecord[]
  furnaces: FurnaceRecord[]
  craftingTables: BlockMemory[]
  beds: BlockMemory[]
  farms: FarmRecord[]
  hostiles: EntitySummary[]
  players: PlayerSummary[]
  claimedResources: ResourceLockSummary[]
  updatedAt: number
}

interface ResourceNode {
  id: string
  type: 'tree' | 'ore' | 'crop' | 'animal' | 'water' | 'lava' | 'structure'
  name: string
  position: Vec3DTO
  countEstimate?: number
  discoveredBy: string
  discoveredAt: number
  status: 'available' | 'claimed' | 'depleted' | 'unknown'
}

interface StorageRecord {
  id: string
  type: 'chest' | 'barrel' | 'shulker_box' | 'agent_inventory'
  position?: Vec3DTO
  owner?: string
  items: InventoryItemDTO[]
  lastScannedAt: number
}
```

### 4.4 EventEnvelope

```ts
interface EventEnvelope<T = unknown> {
  id: string
  type: RuntimeEventType
  ts: number
  source: {
    kind: 'agent' | 'runtime' | 'planner' | 'skill' | 'web' | 'benchmark' | 'reflex'
    id: string
  }
  correlationId?: string
  taskId?: string
  agentId?: string
  btNodeId?: string
  payload: T
}

type RuntimeEventType =
  | 'agent.lifecycle.changed'
  | 'agent.state.updated'
  | 'agent.health.changed'
  | 'agent.inventory.changed'
  | 'world.block.updated'
  | 'world.entity.detected'
  | 'task.created'
  | 'task.assigned'
  | 'task.started'
  | 'task.blocked'
  | 'task.completed'
  | 'task.failed'
  | 'skill.started'
  | 'skill.progress'
  | 'skill.completed'
  | 'skill.failed'
  | 'skill.cancelled'
  | 'lock.acquired'
  | 'lock.released'
  | 'reflex.triggered'
  | 'reflex.resolved'
  | 'llm.requested'
  | 'llm.completed'
  | 'memory.updated'
  | 'capsule.published'
```

### 4.5 Task API

```ts
interface TaskSpec {
  title: string
  description: string
  goal: GoalSpec
  priority: number
  createdBy: 'user' | 'planner' | 'benchmark' | 'agent'
  assignedAgentId?: string
  dependencies?: string[]
  requiredResources?: ResourceRequirement[]
  constraints?: TaskConstraint[]
  deadlineAt?: number
  metadata?: Record<string, unknown>
}

interface TaskRecord extends TaskSpec {
  id: string
  status: 'pending' | 'assigned' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled'
  assignedAgentId: string | null
  ownerAgentId: string | null
  locks: string[]
  btRootId?: string
  progress: number
  attempts: number
  lastError?: RuntimeError
  createdAt: number
  updatedAt: number
  startedAt?: number
  finishedAt?: number
}

interface GoalSpec {
  type: 'obtain_item' | 'place_blocks' | 'move_to' | 'survive' | 'explore' | 'custom'
  target?: string
  count?: number
  position?: Vec3DTO
  successCondition?: string
}
```

### 4.6 Resource Lock API

多 Agent 协作必须有锁。否则会出现两个 Agent 同时砍同一棵树、同时拿同一组材料、互相破坏建筑的问题。

```ts
interface LockRequest {
  agentId: string
  taskId?: string
  resourceType: 'block' | 'entity' | 'item' | 'area' | 'container' | 'bt_node'
  resourceId: string
  ttlMs: number
  mode: 'exclusive' | 'shared'
  reason: string
}

interface LockRecord extends LockRequest {
  id: string
  status: 'held' | 'released' | 'expired'
  acquiredAt: number
  expiresAt: number
}
```

锁的最低落地方案：先实现 in-memory Map + TTL。未来再迁移 Redis。

---

## 5. 推荐核心 API：Skill Layer

### 5.1 SkillDefinition

```ts
interface SkillDefinition<P = unknown, R = unknown> {
  name: string
  version: string
  category: 'movement' | 'mining' | 'crafting' | 'combat' | 'inventory' | 'query' | 'social' | 'survival' | 'creative' | 'meta'
  description: string

  paramsSchema: JsonSchema
  resultSchema: JsonSchema

  preconditions?: SkillPrecondition[]
  effects?: SkillEffect[]

  timeoutMs: number
  interruptible: boolean
  requiresLock?: LockRequirement[]
  plannerVisible: boolean
  reflexSafe: boolean

  invoke(ctx: SkillContext, params: P): Promise<SkillResult<R>>
  cancel?(ctx: SkillContext): Promise<void>
  recover?(ctx: SkillContext, error: RuntimeError): Promise<SkillRecoveryResult>
}
```

### 5.2 SkillInvokeRequest / SkillResult

```ts
interface SkillInvokeRequest<P = unknown> {
  requestId: string
  agentId: string
  skill: string
  params: P
  taskId?: string
  btNodeId?: string
  timeoutMs?: number
  priority?: number
  dryRun?: boolean
}

interface SkillResult<R = unknown> {
  invocationId: string
  ok: boolean
  status: 'success' | 'failed' | 'cancelled' | 'timeout' | 'blocked'
  output?: R
  error?: RuntimeError
  stateDelta?: Partial<AgentState>
  worldDelta?: WorldStatePatch
  artifacts?: ArtifactRef[]
  startedAt: number
  finishedAt: number
  durationMs: number
}

interface RuntimeError {
  code: string
  message: string
  retryable: boolean
  category: 'validation' | 'precondition' | 'pathfinding' | 'inventory' | 'crafting' | 'world' | 'timeout' | 'llm' | 'unknown'
  details?: Record<string, unknown>
  observedState?: Partial<AgentState>
  suggestedRecovery?: string
}
```

### 5.3 当前命令到 Skill 的映射策略

| 当前命令类型 | 迁移方式 | 示例 |
|---|---|---|
| `queries/*` | 直接包装为 query skill | `inventory` → `query_inventory` |
| 简单 action | 加 schema、timeout、error code | `jump`、`lookat`、`eat` |
| 路径 action | 加 cancellation、path status、hazard check | `goto`、`follow`、`collect` |
| 资源 action | 加 lock、precondition、effect | `mine`、`craft`、`drop`、`transfer` |
| creative | 标记为 `creativeOnly`，默认不暴露给 survival planner | `setinventory`、`flyto` |
| 复杂组合 | 不作为 primitive，改为 behavior tree 或 capsule | “采集 10 个木头并合成工具” |

### 5.4 示例：`goto` Skill

```ts
const gotoSkill: SkillDefinition<{
  x: number
  y: number
  z: number
  range?: number
}, {
  arrived: boolean
  finalPosition: Vec3DTO
}> = {
  name: 'goto',
  version: '1.0.0',
  category: 'movement',
  description: 'Pathfind to a coordinate using mineflayer-pathfinder.',
  paramsSchema: {
    type: 'object',
    required: ['x', 'y', 'z'],
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      z: { type: 'number' },
      range: { type: 'number', minimum: 0, default: 1 }
    }
  },
  resultSchema: {
    type: 'object',
    properties: {
      arrived: { type: 'boolean' },
      finalPosition: { type: 'object' }
    }
  },
  timeoutMs: 30000,
  interruptible: true,
  plannerVisible: true,
  reflexSafe: false,
  async invoke(ctx, params) {
    // 1. validate spawned
    // 2. set movements
    // 3. goto GoalNear
    // 4. listen for abort / timeout
    // 5. return structured result
  }
}
```

### 5.5 示例：`mine_block_at` Skill

```ts
interface MineBlockParams {
  pos: Vec3DTO
  expectedBlock?: string
  collectDrops?: boolean
}

interface MineBlockResult {
  blockName: string
  mined: boolean
  dropsCollected?: boolean
}
```

预条件：

- Agent online；
- block loaded；
- block 可挖；
- 工具可用或允许空手挖；
- 资源锁已获得：`block:x:y:z`。

效果：

- WorldState 中对应 block 标记为空气或未知；
- Inventory 可能增加掉落物；
- Task progress 可能更新。

---

## 6. 推荐核心 API：Behavior Tree Layer

### 6.1 行为树节点规范

```ts
interface BTNodeBase {
  id: string
  name: string
  type: BTNodeType
  status: BTStatus
  parentId?: string
  metadata?: Record<string, unknown>
}

type BTNodeType =
  | 'Selector'
  | 'Sequence'
  | 'Parallel'
  | 'Retry'
  | 'Timeout'
  | 'Condition'
  | 'Action'
  | 'Subtree'
  | 'ExpandLogic'

type BTStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'failure'
  | 'blocked'
  | 'cancelled'

interface BTControlNode extends BTNodeBase {
  type: 'Selector' | 'Sequence' | 'Parallel' | 'Retry' | 'Timeout'
  children: BTNode[]
  policy?: {
    parallelSuccess?: 'all' | 'any' | number
    maxRetries?: number
    timeoutMs?: number
  }
}

interface BTActionNode extends BTNodeBase {
  type: 'Action'
  skill: string
  params: Record<string, unknown>
  assignedAgentId?: string
  lockRequests?: LockRequest[]
  preconditions?: BTConditionNode[]
}

interface BTConditionNode extends BTNodeBase {
  type: 'Condition'
  query: string
  params: Record<string, unknown>
  expected: ConditionExpression
}

interface BTExpandLogicNode extends BTNodeBase {
  type: 'ExpandLogic'
  goal: {
    initialState: string
    requirements: string[]
    finalOutput: string
    constraints?: string[]
  }
}

type BTNode = BTControlNode | BTActionNode | BTConditionNode | BTExpandLogicNode
```

### 6.2 控制节点禁令

控制节点只能表达执行流，不允许携带 `skill / params / goal`。这是为了避免 LLM 生成混乱树：

```json
{
  "id": "1",
  "name": "Collect wood and craft tools",
  "type": "Sequence",
  "children": []
}
```

终端节点才允许执行：

```json
{
  "id": "1.2",
  "name": "Mine oak log at known position",
  "type": "Action",
  "skill": "mine_block_at",
  "params": {
    "pos": { "x": 10, "y": 64, "z": 20 },
    "expectedBlock": "oak_log"
  }
}
```

### 6.3 Planner 与 BT Executor 分工

| 模块 | 职责 | 是否调用 LLM | 是否执行 Minecraft 动作 |
|---|---|---:|---:|
| Planner | 生成 / 展开 / 修复行为树 | 是 | 否 |
| BT Executor | 按树调度节点、调用 skill、维护状态 | 否 | 间接通过 skill |
| Skill Executor | 执行具体技能 | 否 | 是 |
| Reflector | 任务后总结、生成 Capsule、更新 memory | 是 | 否 |
| FR Controller | 安全中断与反射执行 | 否 | 是 |

### 6.4 行为树执行事件

```text
bt.created
bt.node.started
bt.node.completed
bt.node.failed
bt.node.blocked
bt.node.expansion_requested
bt.node.assigned
bt.interrupted_by_reflex
bt.resumed
bt.finished
```

### 6.5 行为树与多 Agent

行为树可以是全局共享树，但每个节点必须有明确执行权：

```ts
interface BTExecutionLease {
  nodeId: string
  agentId: string
  taskId: string
  acquiredAt: number
  expiresAt: number
  status: 'running' | 'released' | 'expired'
}
```

没有 lease 的共享行为树会导致多个 Agent 同时执行同一叶子节点。

---

## 7. 推荐核心 API：FR-BT / Safety Layer

### 7.1 ReflexRule

```ts
interface ReflexRule {
  id: string
  name: string
  priority: number
  enabled: boolean
  condition: ReflexCondition
  treeId: string
  cooldownMs: number
  maxDurationMs: number
}

interface ReflexCondition {
  any?: HazardMatcher[]
  all?: HazardMatcher[]
}

interface HazardMatcher {
  type: HazardSummary['type']
  minSeverity?: number
  maxDistance?: number
}
```

### 7.2 ReflexTree

```ts
interface ReflexTree {
  id: string
  version: string
  name: string
  triggerRules: string[]
  root: BTNode
  runtimeConstraints: {
    allowLLM: false
    allowExpandLogic: false
    maxDurationMs: number
  }
  lastHardenedAt?: number
  sourceCommit?: string
}
```

### 7.3 中断协议

```ts
interface InterruptRecord {
  id: string
  agentId: string
  reason: string
  hazard: HazardSummary
  previousTaskId?: string
  previousBtNodeId?: string
  snapshotRef: ArtifactRef
  reflexTreeId: string
  startedAt: number
  resolvedAt?: number
  outcome?: 'escaped' | 'failed' | 'died' | 'timeout'
}
```

执行流程：

```text
StatusScanner detects hazard
    ↓
emit reflex.triggered
    ↓
ActionDispatcher cancels / pauses current skill
    ↓
BT Executor snapshots current plan state
    ↓
FR-BT Executor runs deterministic reflex tree
    ↓
If safe: emit reflex.resolved
    ↓
Reflector analyzes black-box trace later
    ↓
Optional: harden reflex_tree.json and commit
```

### 7.4 建议第一批 Reflex

| Reflex | 触发条件 | 动作 |
|---|---|---|
| `low_health_eat` | health ≤ 8 且有食物 | 停止当前动作，装备食物，吃 |
| `lava_escape` | 近距离岩浆 / 着火 | 后撤、跳跃、放水或寻路到安全点 |
| `hostile_mob_escape` | hostile mob 距离 ≤ N 且 health 低 | 拉开距离、格挡、吃、回安全点 |
| `falling_mlg_water` | 垂直速度过大且有水桶 | 尝试落地水 |
| `drowning_escape` | oxygen 低 | 向上移动 / 寻找空气 |
| `stuck_recover` | position 长时间无变化且 action running | stop pathfinder，短距离随机移动，重试 |

---

## 8. 推荐核心 API：Memory / Blackboard / Git / Capsule

### 8.1 Memory 分层

```text
memory/
├── agents/
│   └── steveX-1/
│       ├── profile.md
│       ├── short_term.jsonl
│       ├── state_summary.md
│       └── lessons.md
├── tasks/
│   └── task_001/
│       ├── plan.bt.json
│       ├── trace.jsonl
│       ├── artifacts/
│       └── reflection.md
├── world/
│   ├── resources.json
│   ├── storages.json
│   └── landmarks.json
└── capsules/
    └── craft_stone_pickaxe/
        ├── capsule.json
        ├── behavior_tree.json
        ├── success_trace.jsonl
        └── README.md
```

### 8.2 Blackboard API

```ts
interface BlackboardAPI {
  read(path: string): Promise<BlackboardFile>
  write(path: string, content: string | object, options?: WriteOptions): Promise<BlackboardFile>
  append(path: string, entry: object): Promise<void>
  list(path: string): Promise<BlackboardEntry[]>
  lock(path: string, owner: string, ttlMs: number): Promise<LockRecord>
  commit(message: string, metadata?: Record<string, unknown>): Promise<GitCommitRef>
}
```

Blackboard 应该承载：

- 全局任务状态；
- 行为树文件；
- Agent 自身状态摘要；
- 已发现资源；
- 共享库存；
- 反思与经验；
- Capsule 发布记录。

但不要把高频 tick 状态全部写入 Git，否则 commit 噪声过大。推荐策略：高频状态在内存 / SQLite，关键决策与任务节点写 Git。

### 8.3 Git Trace 策略

| 数据 | 是否进 Git | 频率 | 理由 |
|---|---:|---|---|
| 任务目标 | 是 | 每任务一次 | 可审计 |
| 初始行为树 | 是 | 每次规划 | 可复现 |
| 行为树修复 diff | 是 | 每次修复 | 研究价值高 |
| Skill 调用 trace | 可压缩后写 | 每 N 步或任务结束 | 原始 JSONL 太多 |
| Agent 每 tick 位置 | 否 | 高频 | 放数据库 / 日志 |
| Reflex 黑匣子 | 是 | 每次危险事件 | 可反思 |
| Capsule | 是 | 发布时 | 可继承 |

### 8.4 Capsule 数据结构

```ts
interface CapsuleManifest {
  id: string
  name: string
  version: string
  description: string
  goalType: string
  inputs: JsonSchema
  outputs: JsonSchema
  preconditions: string[]
  behaviorTreeRef: string
  successTraceRef: string
  createdByAgent: string
  createdFromTask: string
  metrics: {
    successRate: number
    averageDurationMs: number
    averageTokenCost: number
    averageRetries: number
    callCount: number
  }
  generalizationNotes: string
  knownFailureModes: string[]
  createdAt: number
  updatedAt: number
}
```

Capsule 不是简单脚本，而是“成功轨迹 + 可泛化计划 + 适用条件 + 评分”的组合。

---

## 9. 外部 API 设计建议

### 9.1 保留并扩展 REST API

#### Agent 管理

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/agents` | Agent 列表 |
| `POST` | `/api/agents` | 创建 Agent 配置 |
| `GET` | `/api/agents/:id` | Agent 详情 |
| `POST` | `/api/agents/:id/connect` | 连接 |
| `POST` | `/api/agents/:id/disconnect` | 断开 |
| `POST` | `/api/agents/:id/restart` | 重启 |
| `GET` | `/api/agents/:id/state` | 状态快照 |
| `GET` | `/api/agents/:id/events` | 最近事件 |

#### Skill 调用

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/skills` | skill schema 列表 |
| `GET` | `/api/skills/:name` | skill 详情 |
| `POST` | `/api/agents/:id/skills/:skill/invoke` | 结构化调用 skill |
| `POST` | `/api/invocations/:id/cancel` | 取消调用 |
| `GET` | `/api/invocations/:id` | 调用状态 |

#### 任务与行为树

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/tasks` | 任务列表 |
| `POST` | `/api/tasks` | 创建任务 |
| `GET` | `/api/tasks/:id` | 任务详情 |
| `POST` | `/api/tasks/:id/assign` | 分配任务 |
| `POST` | `/api/tasks/:id/cancel` | 取消任务 |
| `GET` | `/api/tasks/:id/bt` | 行为树 |
| `POST` | `/api/tasks/:id/bt/repair` | 触发修复 / 重规划 |

#### 世界状态与黑板

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/world/query` | 查询世界状态 |
| `GET` | `/api/world/resources` | 已发现资源 |
| `GET` | `/api/world/storage` | 共享库存 |
| `GET` | `/api/blackboard/*path` | 读取黑板文件 |
| `PUT` | `/api/blackboard/*path` | 写入黑板文件 |
| `POST` | `/api/blackboard/commit` | Git commit |

#### Capsule 与 Benchmark

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/capsules` | Capsule 列表 |
| `POST` | `/api/capsules` | 发布 Capsule |
| `POST` | `/api/capsules/:id/execute` | 执行 Capsule |
| `POST` | `/api/benchmarks/run` | 运行基准任务 |
| `GET` | `/api/benchmarks/runs/:id` | 运行结果 |

### 9.2 WebSocket 事件升级

当前 WS 事件应扩展为统一 Envelope：

```json
{
  "id": "evt_01",
  "type": "skill.completed",
  "ts": 1710000000000,
  "agentId": "steveX-1",
  "taskId": "task_001",
  "btNodeId": "1.2.3",
  "payload": {
    "skill": "mine_block_at",
    "ok": true,
    "durationMs": 1840
  }
}
```

UI 根据 `type` 渲染，而不是每种事件写死字段。

---

## 10. LLM / ReAct API 设计建议

### 10.1 Brain 模块

```ts
interface Brain {
  think(input: UserOrTaskInput): Promise<BrainResult>
  plan(goal: GoalSpec, context: PlanningContext): Promise<BehaviorTree>
  step(taskId: string): Promise<StepResult>
  reflect(taskId: string): Promise<ReflectionResult>
}
```

### 10.2 Planner 输出必须是 JSON，不是自然语言混合文本

```ts
interface PlannerResponse {
  type: 'bt.create' | 'bt.expand' | 'bt.repair' | 'ask_clarification' | 'fail'
  rationaleSummary: string
  behaviorTree?: BehaviorTree
  targetNodeId?: string
  assumptions: string[]
  requiredQueries: SkillInvokeRequest[]
}
```

`rationaleSummary` 只保存可审计摘要，不保存完整链式思考。

### 10.3 Context Preparation

Planner 上下文应由 Runtime 生成，包含：

- 当前目标；
- 当前行为树压缩状态；
- AgentState 摘要；
- WorldState 相关切片；
- 可用 Skill schema；
- 相关 Capsule 检索结果；
- 最近失败；
- 队友状态摘要；
- 资源锁状态；
- Token budget。

### 10.4 ReAct 循环边界

```text
ReAct Loop
    1. Runtime prepares structured context
    2. Planner emits BT / patch / query requests
    3. Runtime validates output
    4. BT Executor invokes skills
    5. Runtime collects events and artifacts
    6. Reflector summarizes and updates memory
```

LLM 不应该直接调用 `/api/agents/:name/command`，后续应调用结构化 `/api/agents/:id/skills/:skill/invoke` 或 Runtime 内部 `invokeSkill()`。

---

## 11. 与组员方案的融合设计

### 11.1 融合后的模块归属

| 方案来源 | 保留内容 | 放入模块 |
|---|---|---|
| 章震南 Runtime Layer | AgentState、WorldState、EventBus、TaskQueue、Ownership、Lifecycle | Agent Runtime Layer |
| 张宗祺 ReAct + BT | 行为树节点规范、expand_logic、多 Agent 共享 BT、自我进化、上下文压缩 | Cognitive Layer / BT Layer / Memory Layer |
| 张宗祺 FR-BT | No LLM runtime、双环切换、黑匣子、事后硬化 | Safety Layer / Reflex Controller |
| 项目简介 | Git、Blackboard、Capsule、GEP、Benchmark | Memory / Evolution / Experiment Layer |
| Mindcraft | 高层工具、query-driven observation、action/query 分离、多 Agent benchmark | Skill Layer / Benchmark / Evaluation |
| steveX 代码 | 77 个命令、多 Agent 管理、Web UI、Mineflayer 连接 | 当前工程底座 |

### 11.2 推荐最终路线

不是三套方案三选一，而是按层融合：

```text
Runtime Layer 解决“稳定运行”
Behavior Tree 解决“长时序任务结构”
FR-BT 解决“动态环境下快速生存”
Git/Blackboard/Capsule 解决“可追溯协作与进化”
Benchmark 解决“论文验证”
```

### 11.3 不建议采用的做法

| 做法 | 问题 |
|---|---|
| 让 LLM 每轮直接输出 Mineflayer JS | 安全风险高、调试困难、长时序不稳定 |
| 用自然语言聊天作为主要多 Agent 协作协议 | 信息丢失、冲突难检测、难复现 |
| 直接把所有 tick 状态写进 Git | 噪声巨大，Git 历史不可读 |
| 一开始上 Redis / NATS / 大型数据库 | 当前阶段复杂度过高，先用内存 + JSONL / SQLite |
| 先做 Capsule 进化再做 Runtime | 没有稳定 trace 与 task result，Capsule 质量无法保证 |
| 把 FR-BT 交给 LLM 运行时展开 | 违反毫秒级响应目标，危险场景会暴毙 |

---

## 12. 实施路线图

### Phase 0：修复底座，统一协议

目标：让现有命令系统可靠运行，并具备结构化 skill 调用入口。按当前代码状态，Phase 0 应先处理“命令能跑通 + 状态边界清晰”，再接 LLM。

任务：

1. 修复 `executeCommand()` 传参 bug：`handler.call(this, bot, args, this)`。
2. 新增 Runtime 级 `AgentStateStore`，不要继续把 `getStatus()` 展示结果当 Planner 状态。
3. 定义 `AgentStateDTO / Vec3DTO / InventoryItemDTO / RuntimeError`，并让 `/api/status` 返回可 JSON 序列化的干净状态。
4. 给所有命令补充 schema：参数类型、必填、默认值、范围。
5. 新增 `SkillRegistry`，把 77 个命令包装成 skill。
6. 新增 `/api/skills` 与 `/api/agents/:id/skills/:skill/invoke`。
7. 保留 `/api/agents/:name/command`，但标记为 debug-only。
8. 给 action skill 加 timeout；至少先覆盖 `goto / mine / collect / craft`。
9. 明确 Web UI 的 “Send Message to LLM Planner” 在 Planner 接入前保持 disabled / coming soon，避免误导为已接入 LLM。

验收标准：

- Web UI 仍可发送旧字符串命令；
- `goto / mine / collect` 不再因第三参 `agent` 缺失而失败；
- 新 API 能结构化调用 `goto / mine / craft / inventory`；
- 所有 skill 失败时返回稳定 error code；
- `/api/status` 返回 Runtime DTO + UI 可展示字段，不再用展示字符串替代执行状态；
- WebSocket snapshot 仍保持节流推送，不因状态 DTO 扩展造成前端频繁全量刷新。

### Phase 1：单 Agent 稳定 Runtime

目标：单 Agent 能稳定执行任务、被监控、可中断、可恢复。

任务：

1. 完整 AgentStateStore。
2. EventBus 升级为 Envelope。
3. ActionDispatcher：统一调度 skill、timeout、cancel、progress。
4. Watchdog：heartbeat、stuck detection、offline detection。
5. 初版 WorldState：资源点、箱子、工作台、敌人。
6. 初版 TaskManager：任务创建、分配、状态机。
7. 初版 LockManager：资源锁与 TTL。

验收标准：

- 单 Agent 可以执行 “找树 → 去树旁 → 挖木头 → 捡起 → 合成木板”；
- 中途卡住或超时可取消；
- 状态面板能看到任务、当前 skill、位置、背包、错误；
- 所有步骤产生 trace。

### Phase 2：LLM + 行为树

目标：LLM 不直接发命令，而是生成 / 修复行为树。

任务：

1. 实现 `Brain / Planner / Executor / Reflector / Memory`。
2. 定义 BT JSON schema。
3. 实现 BT Executor。
4. 支持 `expand_logic`。
5. 支持 BT 状态压缩。
6. 让 Planner 使用 Skill schema 与 State 摘要。
7. Web UI 展示 BT 当前节点。

验收标准：

- 用户输入自然语言目标后，系统生成行为树；
- Runtime 验证行为树 schema；
- BT Executor 调用 skill；
- 失败节点触发 repair；
- 任务后生成 reflection。

### Phase 3：多 Agent 协作

目标：多个 Agent 基于共享状态、任务、锁协作，而不只是聊天。

任务：

1. TaskQueue 支持多 Agent 分配。
2. 行为树节点支持 assignedAgentId 与 lease。
3. 资源锁支持 area/container/block/item。
4. Blackboard 支持共享任务文件。
5. WorldState 支持共享库存与资源节点。
6. Agent 间自然语言聊天降级为辅助通道，核心协作走结构化任务协议。

验收标准：

- 两个 Agent 不会挖同一棵树；
- 一个 Agent 能把材料放入共享箱子，另一个读取并继续任务；
- 建筑任务中不会互相拆对方成果；
- Web UI 能显示任务分工与资源锁。

### Phase 4：FR-BT 安全与进化

目标：危险状态下不依赖 LLM，执行确定性生存反射，并在事后反思优化。

任务：

1. StatusScanner：20Hz 或可配置频率。
2. HazardDetector：血量、饥饿、岩浆、火、敌人、掉落、溺水、卡住。
3. ReflexController：中断、快照、接管、恢复。
4. 初版 `reflex_tree.json`。
5. 事后 Post-Mortem Reflection。
6. Reflex hardening：更新 FR-BT 并 Git commit。

验收标准：

- Agent 低血量能自动吃东西；
- 靠近岩浆或着火能中断主任务逃离；
- 脱险后能恢复或触发重规划；
- 每次危险事件都有黑匣子记录。

### Phase 5：Capsule / Git / Benchmark

目标：形成论文所需的可量化系统。

任务：

1. Capsule manifest 与发布机制。
2. Capsule 检索与执行。
3. Git commit 规范：plan、trace、reflection、capsule。
4. Benchmark Runner。
5. MineCollab 风格任务：crafting、cooking、construction。
6. 指标采集与对比实验。

验收标准：

- 成功任务能自动生成 Capsule；
- 相似任务能检索并复用 Capsule；
- Benchmark 运行自动记录成功率、时长、资源消耗、token、重试；
- 能生成论文图表所需数据。

---

## 13. 组会建议讨论题

### 13.1 必须现场定下来的 API 决策

1. Planner-facing API 是否从现在开始禁止使用自由文本命令？建议：是。
2. Skill schema 用 JSON Schema、Zod 还是 TypeScript interface + runtime validator？建议：Zod 或 JSON Schema，优先运行时可校验。
3. EventBus 是否统一 Envelope？建议：是。
4. AgentState 是否只存 DTO，不存 Mineflayer 原始对象？建议：是。
5. Task / BT / Skill 的 ID 与 trace 如何关联？建议：统一 `correlationId + taskId + btNodeId + invocationId`。
6. Git commit 粒度是什么？建议：任务级和关键决策级，不是 tick 级。
7. FR-BT 是否允许任何 LLM 调用？建议：运行期绝对禁止，事后反思允许。
8. 多 Agent 协作先做 structured task/lock，还是先做聊天？建议：先 task/lock。

### 13.2 组员分工建议

| 方向 | 负责人类型 | 第一阶段交付物 |
|---|---|---|
| Runtime | 工程能力强 | AgentStateStore、EventBus、ActionDispatcher、Watchdog |
| Skill API | 熟悉 Mineflayer | 77 commands schema 化、timeout、error code |
| BT / Planner | 熟悉 LLM | BT schema、Planner prompt、Executor、repair |
| FR-BT | 熟悉控制逻辑 | StatusScanner、ReflexController、初版 reflex tree |
| Memory / Git | 熟悉文件系统 | Trace JSONL、Git commit 规范、Blackboard API |
| Web UI | 前端 | 状态、任务、BT、日志、锁、世界状态面板 |
| Benchmark | 科研 | 任务集、指标、实验脚本 |

### 13.3 最近一周可执行任务

1. 修 `executeCommand()` 传参 bug，让 `goto / mine / collect` 能拿到 `agent.movements`。
2. 建 `src/runtime/agent_state_store.js`，先把 `name/username/lifecycle/online/health/position/currentAction/lastSeen/stateVersion` 做成 DTO。
3. 把 `AgentManager.getStatus()` 改为读取 Runtime DTO，再由 Web UI 做展示格式化。
4. 建 `src/runtime/skill_registry.js`。
5. 给 `goto / mine / craft / inventory / findblock / nearby / eat / attack` 先做 8 个标准 skill schema。
6. 新增结构化 skill invoke REST API，并保留旧 `/api/agents/:name/command` 作为 debug-only。
7. EventBus 改 Envelope，至少覆盖 `agent.lifecycle.changed / agent.state.updated / skill.started / skill.completed / skill.failed`。
8. TaskManager 做最小状态机。
9. 写一个 demo：用户创建 `obtain_item(oak_log, 3)` 任务，Runtime 分解为固定 BT，不接 LLM，先跑通执行闭环。

---

## 14. 最小可用 API 样例

### 14.1 创建任务

```http
POST /api/tasks
Content-Type: application/json

{
  "title": "Collect oak logs",
  "description": "Collect 3 oak logs and put them in shared storage.",
  "goal": {
    "type": "obtain_item",
    "target": "oak_log",
    "count": 3
  },
  "priority": 5,
  "createdBy": "user"
}
```

响应：

```json
{
  "id": "task_001",
  "status": "pending",
  "progress": 0,
  "createdAt": 1710000000000
}
```

### 14.2 结构化调用 Skill

```http
POST /api/agents/steveX-1/skills/find_block/invoke
Content-Type: application/json

{
  "requestId": "req_001",
  "params": {
    "blockName": "oak_log",
    "radius": 32
  },
  "taskId": "task_001",
  "timeoutMs": 5000
}
```

响应：

```json
{
  "invocationId": "inv_001",
  "ok": true,
  "status": "success",
  "output": {
    "found": true,
    "blocks": [
      { "name": "oak_log", "pos": { "x": 12, "y": 64, "z": 20 }, "distance": 8 }
    ]
  },
  "durationMs": 42
}
```

### 14.3 行为树片段

```json
{
  "id": "bt_001",
  "taskId": "task_001",
  "root": {
    "id": "1",
    "type": "Sequence",
    "name": "Collect 3 oak logs",
    "status": "idle",
    "children": [
      {
        "id": "1.1",
        "type": "Action",
        "name": "Find nearest oak log",
        "status": "idle",
        "skill": "find_block",
        "params": { "blockName": "oak_log", "radius": 32 }
      },
      {
        "id": "1.2",
        "type": "Action",
        "name": "Mine selected oak log",
        "status": "idle",
        "skill": "mine_block_at",
        "params": { "pos": "${1.1.output.blocks[0].pos}", "expectedBlock": "oak_log" }
      },
      {
        "id": "1.3",
        "type": "Action",
        "name": "Collect dropped items",
        "status": "idle",
        "skill": "collect_nearby_items",
        "params": { "itemName": "oak_log", "count": 3 }
      }
    ]
  }
}
```

### 14.4 WebSocket 事件

```json
{
  "id": "evt_123",
  "type": "task.completed",
  "ts": 1710000000000,
  "source": { "kind": "runtime", "id": "runtime-main" },
  "taskId": "task_001",
  "agentId": "steveX-1",
  "payload": {
    "title": "Collect oak logs",
    "durationMs": 81234,
    "skillCalls": 9,
    "retries": 1
  }
}
```
