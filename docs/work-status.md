# steveX 项目工作状态文档

> 最后更新：2026-05-28

> Web 面板细节见 [`web-state.md`](web-state.md)

---

## 一、项目定位

本项目旨在构建一套**以「版本控制」与「群体进化」为核心的多智能体系统架构**，在 Minecraft 虚拟环境中探索 AI Agent 的前沿技术。

---

## 二、当前架构总览

```
用户输入 (Web Panel / API)
    ↓
AgentManager (多 Agent 管理)
    ├── 启停管理 (connectAgent / disconnectAgent)
    ├── 命令转发 (sendCommand)
    ├── 状态查询 (getStatus — 含 health/position/gameMode 等)
    ├── 配置重载 (reload)
    └── 事件总线 (eventBus → WebSocket 推送)
    ↓
SteveXAgent (单个 Agent 实例)
    ├── Bot (mineflayer)           ← Minecraft 连接（内联于 agent.js）
    ├── Commands (77 个命令)        ← 57 action + 14 query + 6 creative
    ├── LLM (DeepSeekClient)        ← 客户端已实现，Agent 层尚未集成
    ├── Memory                      ← src/memory/ 占位（空）
    ├── Blackboard                  ← src/blackboard/ 占位（空）
    ├── Capsules                    ← src/capsules/ 占位（空）
    └── Benchmarks                  ← src/benchmarks/ 占位（空）

    ↓
Web 面板 (Express + WebSocket + ES Modules)
    ├── HTTP API
    │     status / reload / connect / disconnect / command
    │     config/environment (GET/POST)
    ├── WebSocket 实时推送
    │     snapshot (1s) / agent 事件 / command 事件 / LLM 事件
    └── 前端 (零依赖 ES Module)
          Agents 页 — 卡片式 UI、Smart Diff、日志弹窗
          Configs 页 — 环境配置编辑与保存
```

---

## 三、子系统完成状态

### ✅ 已完成

| 子系统 | 状态 | 说明 |
|--------|------|------|
| **命令系统 (Commands)** | ✅ 完成 | 77 个命令（57 action + 14 query + 6 creative），自动发现加载，分三类 |
| **Bot 连接器** | ✅ 完成 | mineflayer 封装，pathfinder 寻路、事件注册、断连/异常处理 |
| **Agent 基础类** | ✅ 完成 | 启停、命令执行、在线状态、`currentAction` 运行时字段 |
| **Agent 管理器** | ✅ 完成 | 多 Agent 启停、命令转发、丰富 `getStatus()`、事件总线 |
| **Web 面板（后端）** | ✅ 完成 | Express 5 + WebSocket；7 个 REST 端点；eventBus 桥接 |
| **Web 面板（前端）** | ✅ 完成 | ES Module 多页面；Agents（Smart Diff + 日志弹窗 + 筛选排序）；Configs（环境配置 CRUD） |
| **DeepSeek Client** | ✅ 完成 | LLM 调用客户端，超时与错误处理 |
| **配置系统** | ✅ 完成 | `defaults` + `environments` 深度合并；Web 可读写环境配置 |
| **日志系统** | ✅ 完成 | `console.log/error` 封装；前端按 Agent 分组日志（每 Agent 最多 200 条） |

### ❌ 未开始（认知与协作层）

> 基础设施（命令、Bot、Web）已就绪；以下子系统仅有目录占位或设计文档，尚无业务代码。

| 子系统 | 状态 | 预期阶段 |
|--------|------|----------|
| **LLM 集成到 Agent** | ❌ | Phase 1 — 让 Agent 能用 LLM 自主决策 |
| **Agent 认知架构 (Brain/Planner/Executor/Reflector/Memory)** | ❌ | Phase 1 — 设计已完成，代码未编写 |
| **Memory 记忆系统** | ❌ | Phase 2 — 文件系统持久化记忆 |
| **Git 版本控制** | ❌ | Phase 2 — 每次决策 commit，可审计可回滚 |
| **Blackboard 黑板** | ❌ | Phase 3 — 多 Agent 共享工作区 |
| **Multi-Agent 协作** | ❌ | Phase 3 — 分工角色 + Git 分支协作 |
| **Capsule 胶囊系统** | ❌ | Phase 4 — 能力封装与遗传协议 |
| **Planning 规划系统** | ❌ | Phase 3 — 长时序任务分解 |
| **Benchmark 基准测试** | ❌ | Phase 5 — 论文实验数据采集 |

### ⛔ 部分就绪（前端已接通道，后端未实现）

| 能力 | 前端 | 后端 |
|------|------|------|
| **LLM 日志展示** | ✅ `agent:llm:input/output` → 日志弹窗 | ⛔ eventBus 尚无发射方 |
| **Send Message (LLM Planner)** | ⛔ UI 占位 `Coming soon` | ❌ 无聊天 API |
| **New Agent** | ⛔ UI 占位 | ❌ 无动态创建 API |
| **Overview / World / Tasks 等侧边栏页** | ⛔ `Coming soon` | ❌ |

---

## 四、分阶段实施路线图

### Phase 1：让 Agent「活起来」（LLM + 认知循环）

**目标：** Agent 能用 LLM 自主决策、调用 77 个命令、与人类对话。

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | 创建 `src/agent/modules/` 目录结构 | ❌ |
| 1.2 | 实现 `Memory` 模块（对话历史管理） | ❌ |
| 1.3 | 创建 `src/agent/prompts/` 目录 + System Prompt 模板 | ❌ |
| 1.4 | 实现 `Planner` 模块（任务分解） | ❌ |
| 1.5 | 实现 `Executor` 模块（命令调用 + LLM 决策） | ❌ |
| 1.6 | 实现 `Reflector` 模块（反思总结） | ❌ |
| 1.7 | 实现 `Brain` 模块（认知循环调度器） | ❌ |
| 1.8 | 改造 `agent.js` 集成 Brain | ❌ |
| 1.9 | 改造 `agent_manager.js` 添加 LLM 聊天接口 | ❌ |
| 1.10 | 改造前端面板，添加 LLM 聊天界面 | ⛔ 日志通道已就绪；Send Message / 对话面板未实现 |

> **注：** WebSocket 与前端已处理 `agent:llm:input` / `agent:llm:output`，后端接入 LLM 后可直接复用。

### Phase 2：让 Agent「有记忆」（文件系统 + Git）

**目标：** Agent 的每次思考和行动都有 Git 记录，可查看、回滚、审计。

| # | 任务 | 状态 |
|---|------|------|
| 2.1 | 实现文件系统 Memory（对话/状态持久化到 Markdown/JSON） | ❌ |
| 2.2 | 实现 Git 集成（每次决策自动 commit） | ❌ |
| 2.3 | 实现状态快照 + 回滚（`git revert`） | ❌ |
| 2.4 | 实现记忆检索增强（语义搜索历史经验） | ❌ |

### Phase 3：让 Agent「能协作」（黑板 + 多角色）

**目标：** 多个 Agent 能像人类团队一样协作完成复杂任务。

| # | 任务 | 状态 |
|---|------|------|
| 3.1 | 实现 Blackboard 系统（共享文件目录） | ❌ |
| 3.2 | 实现角色系统（规划师/采集员/建造师） | ❌ |
| 3.3 | 实现任务分解与分发（Planner → Worker） | ❌ |
| 3.4 | 实现 Git 分支协作（不同角色不同分支） | ❌ |

### Phase 4：让 Agent「能进化」（Capsule 遗传协议）

**目标：** 一个 Agent 学会的技能，其他 Agent 能直接继承。

| # | 任务 | 状态 |
|---|------|------|
| 4.1 | 设计 Capsule 格式（目标/步骤/结果/条件） | ❌ |
| 4.2 | 实现 Capsule 录制与发布 | ❌ |
| 4.3 | 实现 Capsule 执行引擎（继承后自动执行） | ❌ |
| 4.4 | 实现信誉系统（成功率高者优胜劣汰） | ❌ |

### Phase 5：论文实验（Benchmark + 数据分析）

**目标：** 产出可量化的实验结果，支撑学术论文。

| # | 任务 | 状态 |
|---|------|------|
| 5.1 | 设计基准任务集 | ❌ |
| 5.2 | 增强 Telemetry（采集实验指标） | ❌ |
| 5.3 | 实现实验脚本（批量运行 + 自动记录） | ❌ |
| 5.4 | 数据分析与对比实验 | ❌ |

---

## 五、认知架构设计（Phase 1）

### 5.1 认知架构模块设计

```
┌─────────────────────────────────────────────────┐
│                   Brain (大脑)                     │
│         认知循环的总控调度器                          │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Planner  │  │ Executor │  │Reflector │        │
│  │  规划器   │→ │  执行器   │→ │  反思器   │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│       ↓              ↓              ↓             │
│  ┌────────────────────────────────────────┐       │
│  │            Memory (记忆)                │       │
│  │  短期记忆(对话) │ 长期记忆(文件) │ Git历史 │    │
│  └────────────────────────────────────────┘       │
│       ↓                                            │
│  ┌──────────┐                                      │
│  │ LLM 引擎  │  ← DeepSeekClient（✅ 已实现）        │
│  └──────────┘                                      │
└─────────────────────────────────────────────────┘
```

### 5.2 认知循环流程

```
用户: "去挖一些橡木来做 tools"
    ↓
Brain.think(userMessage)
    │
    ├─→ Planner.plan("挖橡木做 tools")
    │     返回结构化计划
    │
    ├─→ Executor.execute(plan)
    │     对每一步: LLM 决定调用哪个 !command
    │     返回执行结果
    │
    ├─→ Reflector.reflect(plan, results)
    │     返回反思总结
    │
    ├─→ Memory.save(conversation, reflection)
    │
    └─→ 回复用户
```

### 5.3 各模块职责

| 模块 | 文件 | 职责 | 调用 LLM？ |
|------|------|------|-----------|
| **Brain** | `src/agent/brain.js` | 认知循环调度器，协调 P→E→R 循环 | ❌ 只调度 |
| **Planner** | `src/agent/modules/planner.js` | 接收目标，分解为子任务，生成执行计划 | ✅ |
| **Executor** | `src/agent/modules/executor.js` | 执行计划步骤 → 调用命令 | ✅ |
| **Reflector** | `src/agent/modules/reflector.js` | 反思结果，总结经验，改进下一次 | ✅ |
| **Memory** | `src/agent/modules/memory.js` | 对话历史、状态缓存、文件持久化 | ❌ |
| **LLM Engine** | `src/llm/deepseek_client.js` | 统一的 LLM 调用接口（✅ 已实现） | 被调用方 |

### 5.4 目录结构规划（待创建）

```
src/agent/
├── agent.js             # SteveXAgent — 当前仅 Bot + 命令，待集成 Brain
├── agent_manager.js     # 多 Agent 管理（✅ 已实现）
├── brain.js             # ❌ 待创建 — 认知循环调度器
├── modules/             # ❌ 待创建
│   ├── memory.js
│   ├── planner.js
│   ├── executor.js
│   └── reflector.js
└── prompts/             # ❌ 待创建
    ├── planner.md
    ├── executor.md
    └── reflector.md
```

---

## 六、命令系统清单

### Actions（57 个）

```
acceptpack   anvil       attack      click       close
collect      craft       denypack    dig         dismount
dispenser    drive       drop        eat         elytra
enchant      equip       fish        follow      furnace
goto         hotbar      interact    interactat  jump
look         lookat      mine        mount       move
moveslot     open        openentity  place       placeentity
putaway      quit        release     respawn     say
setcommandblock settings  sleep       stand       stop
stopdig      swing       toss        trade       transfer
unequip      use         useon       wait        wake
whisper      writebook
```

### Queries（14 个）

```
digtime      equipslot   findblock   findplayer  gamemode
hp           hunger      inventory   nearby      oxygen
pos          time        weather     xp
```

### Creative（6 个）

```
clearinventory  clearslot  flyto  setinventory  startfly  stopfly
```

**总计：77 个命令**（57 action + 14 query + 6 creative）

---

## 七、项目文件结构

```
steveX/
├── package.json              # 项目配置 (v0.1.0)
├── start.bat                 # 启动脚本 (npm start)
├── runs/                     # 实验运行记录（空目录）
├── configs/
│   ├── defaults/
│   │   └── app.json          # 默认配置（agents + web）
│   └── environments/
│       └── app.json          # 环境覆盖配置（Web 可编辑）
├── docs/
│   ├── work-status.md        # 本文件
│   └── web-state.md          # Web 面板专项状态
├── src/
│   ├── main.js               # 入口 — AgentManager + Web 服务器
│   ├── agent/
│   │   ├── agent.js          # SteveXAgent（mineflayer + 命令执行）
│   │   └── agent_manager.js  # 多 Agent 管理器
│   ├── commands/
│   │   ├── index.js          # 命令自动加载器
│   │   ├── actions/          # 57 个动作命令
│   │   ├── queries/          # 14 个查询命令
│   │   └── creative/         # 6 个创造模式命令
│   ├── llm/
│   │   └── deepseek_client.js# DeepSeek API 客户端
│   ├── memory/               # 占位（空）
│   ├── blackboard/           # 占位（空）
│   ├── capsules/             # 占位（空）
│   ├── benchmarks/           # 占位（空）
│   ├── utils/
│   │   └── config.js         # defaults + environments 深度合并
│   └── web/
│       ├── server.js         # HTTP 服务入口
│       ├── server/
│       │   ├── app.js        # Express 应用
│       │   ├── routes.js     # REST API（含环境配置读写）
│       │   └── ws.js         # WebSocket（snapshot + eventBus）
│       └── public/
│           ├── index.html    # 主页面（侧边栏 + 顶栏）
│           ├── app.js        # ES Module 入口
│           ├── style.css     # 全局样式
│           ├── lib/
│           │   ├── api.js
│           │   ├── state.js
│           │   ├── ws-client.js
│           │   ├── utils.js
│           │   └── icons.js
│           └── pages/
│               ├── agents.js # Agents 页
│               └── configs.js# Configs 页
```

---

## 八、REST API 速览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/status` | 所有 Agent 状态 + uptime |
| `GET` | `/api/config/environment` | 读取环境配置 |
| `POST` | `/api/config/environment` | 保存环境配置（≤512 KB） |
| `POST` | `/api/reload` | 重载配置并断开所有 Agent |
| `POST` | `/api/agents/:name/connect` | 连接 Agent |
| `POST` | `/api/agents/:name/disconnect` | 断开 Agent |
| `POST` | `/api/agents/:name/command` | 发送游戏命令 |

---

## 九、技术栈

| 技术 | 用途 | 版本 |
|------|------|------|
| Node.js | 运行时 | ≥18 |
| CommonJS | 后端模块系统 | — |
| ES Modules | 前端模块系统 | 浏览器原生 |
| mineflayer | Minecraft 机器人库 | ^4.37.1 |
| mineflayer-pathfinder | 寻路插件 | ^2.4.5 |
| Express | Web 框架 | ^5.2.1 |
| ws | WebSocket 实时推送 | ^8.20.1 |
| DeepSeek API | LLM 调用 | — |
