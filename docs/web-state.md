# steveX Web 面板状态文档

> 最后更新：2026-05-28
> 对应代码：`src/web/`

---

## 一、架构总览

```
浏览器 (Web Panel)
    │
    ├── HTTP 请求 ──→ Express (server.js → server/app.js → server/routes.js) ──→ AgentManager
    │
    ├── WebSocket ──→ server/ws.js (事件总线桥接) ──→ AgentManager.eventBus
    │
    └── 静态文件 ←── public/ (index.html + style.css + ES Module app.js)
```

---

## 二、后端结构 (`src/web/server/`)

### 2.1 文件职责

| 文件 | 职责 |
|------|------|
| `src/web/server.js` | HTTP 服务入口，读取 `manager.config.web`，创建 Express + WebSocket 并监听端口 |
| `src/web/server/app.js` | Express 应用工厂，启用 JSON body parser，挂载静态文件 + API 路由 |
| `src/web/server/routes.js` | REST API 路由定义，包含 Agent 操作和环境配置读写 |
| `src/web/server/ws.js` | WebSocket 服务，桥接 AgentManager.eventBus → 浏览器，并定时推送快照 |

### 2.2 REST API 清单

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| `GET` | `/api/status` | 获取所有 Agent 状态 + uptime | ✅ |
| `GET` | `/api/config/environment` | 读取 `configs/environments/app.json` | ✅ |
| `POST` | `/api/config/environment` | 保存 `configs/environments/app.json`，请求体为 `{ config }` | ✅ |
| `POST` | `/api/reload` | 调用 `manager.reload()` 重载配置 | ✅ |
| `POST` | `/api/agents/:name/connect` | 连接指定 Agent | ✅ |
| `POST` | `/api/agents/:name/disconnect` | 断开指定 Agent | ✅ |
| `POST` | `/api/agents/:name/command` | 向指定 Agent 发送指令 | ✅ |

环境配置保存接口会校验：
- `config` 必须是对象且不能是数组
- 序列化后的 JSON 最大 512 KB
- 保存路径固定为 `configs/environments/app.json`

### 2.3 WebSocket 事件类型

| 事件 | 方向 | 说明 | 前端处理 |
|------|------|------|----------|
| `snapshot` | 服务器→客户端 | 连接时立即推送 + 每 1 秒定时推送，包含 `agents` 和 `uptimeSec` | ✅ 更新全局状态 |
| `agent:connect` | 服务器→客户端 | Agent 上线通知；随后服务端再广播一次 `snapshot` | ✅ 更新 online |
| `agent:disconnect` | 服务器→客户端 | Agent 下线通知；随后服务端再广播一次 `snapshot` | ✅ 更新 online |
| `agent:update` | 服务器→客户端 | Agent 状态更新通知；随后服务端再广播一次 `snapshot` | ⛔ 当前前端未单独处理，依赖随后 snapshot |
| `agent:command:start` | 服务器→客户端 | 命令开始执行；随后服务端再广播一次 `snapshot` | ✅ 写入命令开始日志 |
| `agent:command:done` | 服务器→客户端 | 命令执行完成（含 ok/error/output）；随后服务端再广播一次 `snapshot` | ✅ 写入命令完成/失败日志 |
| `agent:llm:input` | 服务器→客户端 | LLM 输入 | ✅ 写入 LLM 输入日志 |
| `agent:llm:output` | 服务器→客户端 | LLM 输出 | ✅ 写入 LLM 输出日志 |

---

## 三、前端结构 (`src/web/public/`)

### 3.1 文件树

```
public/
├── index.html          # 主页面骨架 (侧边栏 + 顶栏 + 控制栏 + 内容容器)
├── style.css           # 全局样式 (CSS variables + 响应式 + agent/config/log UI)
├── app.js              # ES Module 入口，负责路由切换、WS、首屏加载、全局事件绑定
├── lib/
│   ├── utils.js        # 工具函数 (escapeHtml, truncate)
│   ├── state.js        # 全局响应式状态 (agents/logs/filters + pub/sub)
│   ├── api.js          # HTTP API 客户端封装
│   ├── ws-client.js    # WebSocket 客户端
│   └── icons.js        # SVG 图标集 + hydrateIcons
└── pages/
    ├── agents.js       # Agents 页面 (Agent 卡片、命令发送、日志弹窗)
    └── configs.js      # Configs 页面 (环境配置加载、编辑、保存、格式化、复制、保存并重载)
```

### 3.2 前端架构说明

**方案：ES Modules，零依赖，浏览器原生按需加载**

`index.html` 通过 `<script type="module" src="/app.js">` 加载入口，所有依赖通过 `import`/`export` 自动解析。

**页面切换：**
- `Agents`：显示搜索、状态筛选、排序、New Agent、Reload Config，并渲染 Agent 列表。
- `Configs`：隐藏 Agent 专用控件和 New Agent，显示配置编辑器，Reload Config 保留可用。
- 其他侧边栏入口：当前仍为 `alert('Coming soon')`。

**数据流：**

```
API/WebSocket ──→ state.js (全局状态) ──→ subscribe ──→ 当前页面重新渲染/更新指标
```

**核心设计：Smart Diff 渲染**
- `agents.js` 的 `renderAgents()` 不整体替换 Agent 列表，而是：
  - 已存在的卡片 → 仅更新动态字段（online、username、health、mode、model、position、action）
  - 新增的 Agent → 创建新卡片附加
  - 已删除的 Agent → 移除对应卡片
- 日志不再内嵌在每张卡片中，而是通过 `Agent Log` 按钮打开弹窗。
- 日志弹窗打开后会订阅全局状态，实时追加新日志。

### 3.3 模块职责

| 模块 | 导入 | 导出 | 说明 |
|------|------|------|------|
| `app.js` | state, ws, api, icons, agents, configs | — | 入口：初始化 WS、首屏加载、页面切换、全局控件事件绑定 |
| `lib/state.js` | — | getState, setState, subscribe, patchAgent, addLog | 全局单一数据源 + 发布订阅 + 每 Agent 最多 200 条日志 |
| `lib/api.js` | state | fetchStatus, reloadConfig, connectAgent, disconnectAgent, sendCommand, fetchEnvConfig, saveEnvConfig | HTTP REST 封装 |
| `lib/ws-client.js` | state | initWebSocket | WebSocket 客户端 + 事件分发 |
| `lib/utils.js` | — | escapeHtml, truncate | 纯工具函数 |
| `lib/icons.js` | — | iconMap, hydrateIcons | SVG 图标注册与注入 |
| `pages/agents.js` | state, api, utils, icons | renderAgents, initAgents | Agent 卡片渲染、过滤排序、命令发送、日志弹窗 |
| `pages/configs.js` | api | renderConfigs | 环境配置编辑器：Load / Format / Copy / Save / Save & Reload |

### 3.4 全局状态结构 (`state.js`)

```javascript
{
  agents: [],                    // Agent 数组，字段来自 manager.getStatus()
  uptimeSec: 0,                  // 服务端 uptime (秒)
  wsConnected: false,            // WebSocket 连接状态
  filters: {
    query: '',                   // 搜索关键词
    status: 'all',               // all | online | offline
    sortBy: 'name'               // name | status | health
  },
  logs: {                        // 日志存储，按 agent 名称分组
    'agent-1': [ LogEntry, ... ],
    'agent-2': [ LogEntry, ... ]
  },
  _listeners: []                 // subscribe 内部使用
}
```

`LogEntry` 当前字段：

```javascript
{
  type: 'cmd-start' | 'cmd-done' | 'cmd-error' | 'llm-input' | 'llm-output',
  command: string | null,
  output: string | null,
  model: string | null,
  prompt: string | null,
  response: string | null,
  timestamp: number
}
```

### 3.5 Agent 视图字段

Agent 卡片优先使用后端 `manager.getStatus()` 返回的真实字段：

| UI 字段 | 后端字段 | 缺省值 |
|---------|----------|--------|
| Health | `health` / `maxHealth` | `20 / 20` |
| Game Mode | `gameMode` | `Survival` |
| Model | `model` | `deepseek-v4-flash` |
| Position | `position.x/y/z` | `x: ~, y: ~, z: ~` |
| Current Action | `currentAction` | `Idle` |
| Username | `username` | `—` |
| Status | `online` | 由后端状态决定 |

---

## 四、功能对照表

### 4.1 已实现功能

| 功能 | 触发方式 | 后端 API / WS | 前端处理 |
|------|----------|---------------|----------|
| 初始状态加载 | 页面加载 | `GET /api/status` | `fetchStatus()` → `state.setState()` → `renderAgents()` |
| WebSocket 实时推送 | 自动连接 | `server/ws.js` eventBus 桥接 | `ws-client.js` 分发到 state/addLog |
| Agent 状态实时更新 | WS snapshot / connect / disconnect / update 后 snapshot | WebSocket | `patchAgent()` 或 `setState()` 更新状态 |
| 重载配置 | 顶栏 Reload Config 按钮 | `POST /api/reload` | `reloadConfig()`，1.5s 后刷新 status；Configs 页会重新渲染配置页 |
| 连接 Agent | Connect 按钮 | `POST /api/agents/:name/connect` | `connectAgent()` |
| 断开 Agent | Disconnect 按钮 | `POST /api/agents/:name/disconnect` | `disconnectAgent()` |
| 发送命令 | 命令输入框 + Send 按钮 | `POST /api/agents/:name/command` | 只调用 API；日志统一由 WebSocket `agent:command:start/done` 事件写入 |
| 命令日志实时推送 | WS agent:command:start / done | WebSocket | `addLog()` 追加到对应 Agent 日志 |
| LLM 日志实时推送 | WS agent:llm:input / output | WebSocket | `addLog()` 追加到对应 Agent 日志 |
| Agent 日志弹窗 | Agent Log 按钮 | — | 打开 modal，显示历史日志并实时追加 |
| 搜索过滤 | 搜索框输入 | — | 按 `agent.name` 过滤 |
| 状态筛选 | 下拉选择 all/online/offline | — | 过滤 agents |
| 排序 | 下拉选择 name/status/health | — | 按名称、在线状态或血量排序 |
| Configs 页面 | 侧边栏 Configs | `GET/POST /api/config/environment` | 加载、编辑、格式化、复制、保存、保存并重载环境配置 |
| WebSocket 断线处理 | WS close | — | 设置 offline，2 秒后 reload 页面 |
| Uptime 显示 | snapshot + 本地 ticker | `/api/status` / WS snapshot | 服务端 uptime 同步，本地每秒 +1 |

### 4.2 占位功能（UI 存在但未接入后端）

| 功能 | 当前行为 | 计划 |
|------|----------|------|
| **New Agent** 按钮 | `alert('Coming soon')` | 后续实现动态创建 Agent |
| **Send Message (to LLM Planner)** 表单 | `alert('Coming soon')` | 接入 LLM Planner 消息发送 |
| Overview / World / Tasks / Capsules / Evolution / Logs 页面 | `alert('Coming soon')` | 各页面按需实现 |

### 4.3 UI 功能清单

| 元素 | 状态 |
|------|------|
| 侧边栏导航 (8 个入口) | ✅ 全部渲染；Agents / Configs 可用，其他弹 Coming soon |
| 品牌标识 (steveX) | ✅ |
| WS 状态指示 (顶栏 + 侧边栏) | ✅ 实时反映 `wsConnected` |
| Uptime 显示 | ✅ 服务端 uptime + 客户端 ticker |
| 搜索框 | ✅ Agents 页实时过滤 |
| 状态筛选下拉 | ✅ all / online / offline |
| 排序下拉 | ✅ name / status / health |
| New Agent 按钮 | ⛔ Coming soon |
| Reload Config 按钮 | ✅ 带点击动画，调用真实 API |
| Agent 卡片 | ✅ 真实 API 交互 + Smart Diff 更新 |
| Agent 卡片 - 状态指示 (dot + label) | ✅ |
| Agent 卡片 - Username 显示 | ✅ 从 API 读取，缺省为 `—` |
| Agent 卡片 - Stats 面板 (6 项) | ✅ 优先显示真实字段，缺失时使用占位 |
| Agent 卡片 - Health Bar | ✅ 根据 `health / maxHealth` 计算百分比 |
| Agent 卡片 - Connect/Disconnect 按钮 | ✅ 调用真实 API |
| Agent 卡片 - Send Command 面板 | ✅ 调用真实 API |
| Agent 卡片 - Send Message 面板 | ⛔ Coming soon |
| Agent 卡片 - Agent Log 按钮 | ✅ 打开日志弹窗 |
| Log Modal | ✅ 历史日志 + 实时追加，最多 200 条 |
| Configs 页面 | ✅ 环境配置编辑器可用 |
| Configs - Load | ✅ 读取 `configs/environments/app.json` |
| Configs - Format | ✅ 本地 JSON 格式化 |
| Configs - Copy | ✅ 复制编辑器内容到剪贴板 |
| Configs - Save | ✅ 保存 JSON 到后端 |
| Configs - Save & Reload | ✅ 保存后调用 reload |
| 空状态提示 | ✅ "No agents match the current filters." |
| 响应式布局 | ✅ 样式中定义多断点适配 |

---

## 五、UI 设计规范

### 5.1 设计令牌 (CSS Variables)

```css
--bg: #fbfaf8              /* 主背景 */
--panel: #ffffff           /* 面板背景 */
--text: #171513            /* 主文字 */
--muted: #7b746d           /* 次要文字 */
--accent: #d76625          /* 强调色（橙色） */
--success: #43ad51         /* 成功/在线色（绿色） */
--sidebar-width: 252px     /* 侧边栏宽度 */
```

### 5.2 布局

```
┌──────────────┬─────────────────────────────────────────┐
│   Sidebar    │  Topbar (title + uptime + ws + reload)  │
│   (252px)    ├─────────────────────────────────────────┤
│              │  Controls (Agents 页显示)               │
│  nav items   ├─────────────────────────────────────────┤
│  ×8          │                                         │
│              │  Content Container (#agents-list)        │
│              │  ├─ Agents: Agent Cards                  │
│              │  │  ┌─────────────────────────────────┐  │
│              │  │  │ Agent Header + Actions          │  │
│              │  │  │ Stats Panel + Command Panels    │  │
│              │  │  └─────────────────────────────────┘  │
│              │  └─ Configs: Config Editor              │
│  ws status   │                                         │
└──────────────┴─────────────────────────────────────────┘
```

### 5.3 日志条目样式

日志通过 `Agent Log` 弹窗展示，每条记录包含本地格式化时间 `toLocaleTimeString()`。

```
log-entry.cmd-start   → "[CMD] → command"
log-entry.cmd-done    → "[CMD] ← command\noutput"
log-entry.cmd-error   → "[CMD] ✕ command\noutput"  (红色)
log-entry.llm-input   → "[LLM] → model\nprompt..."
log-entry.llm-output  → "[LLM] ← model\nresponse..."
```

LLM prompt/response 超过 2000 字符会自动截断并追加省略号。

---

## 六、后续规划

### 立即
- [x] 从 `web_public_old/` 迁移真实 WebSocket + API 逻辑到新 UI 框架
- [x] 按功能拆分为独立 ES Module 文件
- [x] 接入真实 Agent 状态字段（health/mode/model/position/action，缺失时 fallback）
- [x] 实现 Configs 页面基础配置编辑能力
- [ ] 前端单独处理 `agent:update` 事件，或删除该事件的冗余广播
- [x] 处理命令日志可能重复的问题：命令提交只调用 API，日志统一由 WS 事件写入

### Phase 1
- [ ] 实现 Send Message (to LLM Planner) 功能
- [ ] 实现 New Agent 功能
- [ ] 实现 Overview/World/Tasks/Capsules/Evolution/Logs 独立页面
- [ ] 添加 LLM 对话聊天面板
- [ ] 增强 Configs 页面：校验 schema、拆分多配置文件、显示保存前 diff

### Phase 2+
- [ ] 多 Agent 协作视图
- [ ] Git 历史查看器
- [ ] Capsule 管理界面
- [ ] Benchmark 运行面板
