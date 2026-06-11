# steveX 下一阶段任务分工

> 更新日期：2026-06-11  


## 2. 分工总览

| 成员 | 已完成/已有进展 | 接下来负责方向 | 当前最高优先级 |
| --- | --- | --- | --- |
| 章震南 | Agent 登录逻辑优化 | Runtime / Agent 状态与生命周期 | 修复 `executeCommand()` 与新 command handler 的兼容问题 |
| 陈哲 | `SkillRegistry` 初版；8 个核心命令初步封装 | Skill API / Command 结构化封装 | 修正 8 个命令注册与 handler 适配，并接入 REST API |
| 马嘉玲 | Config 页面| Web UI / Runtime 状态展示 | 等待 `/api/status` DTO 与 `/api/skills` 后适配 UI |

---

## 3. 章震南待办清单

### 3.1 负责方向

章震南负责 Runtime 底座。当前最重要的是保证旧字符串命令路径仍可运行，同时为后续 StateStore 提供稳定状态来源。

### 3.2 待办任务

| 优先级 | 状态 | 待办 | 修改/新增文件 | 参考来源 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| P0 | 未完成 | 修复 `executeCommand()` handler 传参问题 | `src/agent/agent.js` | `docs/todo-fix.md` P0-1 | 无，必须最先做 |
| P0 | 新增 | 统一 command handler 兼容策略：旧命令保持 `handler(bot, args, agent)`，新 skill wrapper 不破坏旧调用 | `src/agent/agent.js`、8 个核心命令 | `src/commands/index.js` 注释；设计材料 Phase 0 | 依赖 P0 传参修复 |
| P0 | 未完成 | 新增轻量 `AgentStateStore v0` | 建议新增 `src/runtime/agent_state_store.js` 或 `src/runtime/agent_state_store.ts` | `docs/LLM Agent API 设计组会材料0519v4.md` Phase 0；`mindcraft/src/agent/library/full_state.js` | 可与 Skill API 并行 |
| P0 | 未完成 | 给 Agent 状态增加显式 `lifecycle` | `src/agent/agent.js`、`src/agent/agent_manager.js` | `docs/todo-fix.md` P0-7 | 依赖 StateStore 字段定义 |
| P0 | 未完成 | 改造 `AgentManager.getStatus()` 从 StateStore 读状态 | `src/agent/agent_manager.js` | `docs/web-state.md` 2.2、3.5；设计材料 2.6 | 依赖 StateStore |
| P1 | 未完成 | 清理 `getAgentBot` 多重 fallback | `src/agent/agent_manager.js` | `docs/todo-fix.md` CLEAN-1 | 不阻塞 |
| P1 | 未完成 | 修复配置 merge 不支持 `null` 显式覆盖 | `src/utils/config.js` | `docs/todo-fix.md` CLEAN-2 | 不阻塞 |

### 3.3 `executeCommand()` 修正建议

当前代码仍是：

```js
const result = await handler.call(this, this.bot, args)
```

应先恢复为兼容旧命令的形式：

```js
const result = await handler.call(this, this.bot, args, this)
```

后续如果 Skill API 使用 `handler(agent, params)`，不要直接替换 command handler 签名，应通过 adapter 包一层，否则会破坏现有 command loader。

### 3.4 `AgentStateStore v0` 建议字段

第一版只做当前状态快照，不做数据库。

```js
{
  id,
  name,
  username,
  lifecycle,
  online,
  health,
  maxHealth,
  hunger,
  position,
  gameMode,
  currentAction,
  lastSeen,
  stateVersion
}
```

### 3.5 验收标准

- `goto / mine / collect` 在旧 `/api/agents/:name/command` 路径下仍可运行。
- `/api/status` 仍可用，且状态来自稳定 Runtime DTO。
- 离线 Agent 不再被误判为真实 `20/20` 满血状态。
- 状态包含 `lastSeen` 和 `stateVersion`。

---

## 4. 陈哲待办清单

### 4.1 负责方向

陈哲负责 Skill API。当前已有 `SkillRegistry` 与 8 个核心命令初步封装，但还需要完成集成、注册一致性、REST API 和参数适配。

### 4.2 已完成项

| 状态 | 内容 | 文件 |
| --- | --- | --- |
| 已完成 | 新增 `SkillRegistry` 初版 | `src/runtime/skill_registry.ts` |
| 已完成 | 新增 TypeScript 配置 | `tsconfig.json` |
| 已完成 | 初步封装 `mine / craft / inventory / findblock / nearby / eat / attack` 并注册到 registry | 对应 7 个命令文件 |
| 部分完成 | 初步封装 `goto` | `src/commands/actions/goto.js`，但缺少 `skillRegistry.register(skill)` |

### 4.3 待办任务

| 优先级 | 状态 | 待办 | 修改/新增文件 | 参考来源 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| P0 | 需修正 | 给 `goto` 补 `skillRegistry.register(skill)` | `src/commands/actions/goto.js` | 当前实现检查 | 无 |
| P0 | 需修正 | 修正 8 个核心命令 handler 签名，避免破坏旧 command 调用路径 | 8 个核心命令文件 | `src/commands/index.js`；`docs/todo-fix.md` P0-1 | 依赖章震南确定 adapter 策略 |
| P0 | 待完成 | 确认 `skill_registry.ts` 的运行策略：要么编译后由 JS 引用，要么改成 `skill_registry.js` | `src/runtime/skill_registry.ts`、`package.json`、命令文件 require 路径 | 当前项目 `"type": "commonjs"`；`npm start` 入口是 JS | 无 |
| P0 | 待完成 | 新增 `GET /api/skills` | `src/web/server/routes.js` | 设计材料 9.1 Skill 调用 | 依赖 registry 可稳定加载 |
| P0 | 待完成 | 新增 `POST /api/agents/:id/skills/:skill/invoke` | `src/web/server/routes.js`、`src/agent/agent_manager.js` | 设计材料 14.2 | 依赖 handler adapter |
| P0 | 待完成 | 结构化参数与旧 `args` 数组之间做 adapter | 建议新增 `src/runtime/skill_invoker.js` 或 `.ts` | 设计材料 3.2、14.2 | 依赖 Skill schema |
| P1 | 待完成 | 给 action skill 加 timeout / error code | 建议新增 `src/runtime/action_dispatcher.js` 或 `.ts` | `docs/todo-fix.md` P0-6；`mindcraft/src/agent/action_manager.js` | 依赖结构化 invoke API |

### 4.4 8 个核心 Skill 当前状态

| Skill | 当前状态 | 下一步 |
| --- | --- | --- |
| `goto` | 已定义 skill，未注册 | 补 `skillRegistry.register(skill)`；修正 handler 兼容 |
| `mine` | 已注册 | 修正 handler 兼容；补结构化参数 adapter |
| `craft` | 已注册 | 修正 handler 兼容；复用 `MCDataManager`，避免重复加载 |
| `inventory` | 已注册 | 修正 handler 兼容；输出结构化 inventory 更适合 Planner |
| `findblock` | 已注册 | 修正 handler 兼容；输出结构化位置，而不是只输出字符串 |
| `nearby` | 已注册 | 修正 handler 兼容；输出结构化 entity summary |
| `eat` | 已注册 | 修正 handler 兼容；后续可接 FR-BT |
| `attack` | 已注册 | 修正 handler 兼容；后续可接 FR-BT |

### 4.5 验收标准

- `npm start` 不因 `SkillRegistry` 或 command require 失败。
- 旧 `/api/agents/:name/command` 仍可调用 8 个核心命令。
- `GET /api/skills` 能列出至少 8 个核心 skill。
- `POST /api/agents/:id/skills/:skill/invoke` 能结构化调用 `goto / mine / craft / inventory`。
- 失败返回稳定结构：

```js
{
  ok: false,
  code: 'SKILL_TIMEOUT',
  message: 'goto timed out after 30000ms'
}
```

---

## 5. 马嘉玲待办清单

### 5.1 负责方向

马嘉玲负责 Web UI 与 Runtime 状态/API 的衔接。当前前端日志性能债已完成，下一步应等后端 DTO 和 `/api/skills` 稳定后再接 UI。

### 5.3 待办任务

| 优先级 | 状态 | 待办 | 修改/新增文件 | 参考来源 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| P0 | 待完成 | 适配 `/api/status` 新 Runtime DTO | `src/web/public/pages/agents.js`、`src/web/public/lib/state.js`、`src/web/public/lib/ws-client.js` | `docs/web-state.md` 3.4、3.5 | 依赖章震南 StateStore DTO |
| P0 | 待完成 | 保留 Send Command，但标注 debug-only | `src/web/public/pages/agents.js`、必要时 `src/web/public/style.css` | 设计材料 Phase 0 第 7 条 | 不阻塞 |
| P0 | 待完成 | `Send Message to LLM Planner` 保持 disabled / coming soon | `src/web/public/pages/agents.js` | 设计材料 Phase 0 第 9 条；`docs/web-state.md` 4.2 | 不阻塞 |
| P1 | 待完成 | 接入或移除冗余 `agent:update` 单独处理 | `src/web/public/lib/ws-client.js`、`src/web/server/ws.js` | `docs/web-state.md` 后续规划 | 依赖 EventBus 是否升级 Envelope |
| P1 | 待完成 | 为 `/api/skills` 做简单调试入口或日志展示 | `src/web/public/lib/api.js`、`src/web/public/pages/agents.js` | 设计材料 9.1、14.2 | 依赖陈哲 `/api/skills` |

### 5.4 UI 展示注意事项

- 离线 Agent 的 `health` 应显示为未知或不可用，不应误显示为真实 `20/20`。
- `position` 应由前端格式化，后端 DTO 保持数字或 `null`。
- `Send Command` 是人类调试入口，不是 Planner 接口。
- `Send Message to LLM Planner` 在 Planner 接入前不要伪装成可用功能。

### 5.5 验收标准

- 新旧状态字段切换后 UI 不崩。
- Agent 卡片能展示 lifecycle / online / position / health / currentAction。
- 命令日志不重复。
- 用户能明确区分 debug command 与未来 Planner 入口。

---

## 6. 总依赖关系

```text
章震南：修复 executeCommand 第三参与 handler 兼容
        ↓
陈哲：修正 8 个核心命令注册和 adapter
        ↓
陈哲：接入 /api/skills 与 skill invoke API
        ↓
马嘉玲：接入 skill 调试入口

并行线：
章震南：AgentStateStore v0
        ↓
马嘉玲：适配 /api/status 与 WebSocket snapshot

后续线：
AgentStateStore + SkillRegistry
        ↓
ActionDispatcher / timeout / error code
        ↓
TaskManager / 固定 BT demo
        ↓
LLM Planner
```

---

## 7. 当前最高优先级清单

1. 修复 `src/agent/agent.js` 的 `executeCommand()` 传参。
2. 统一 8 个核心命令的 handler 兼容方式，避免旧 command 与新 skill 两套接口互相破坏。
3. 给 `src/commands/actions/goto.js` 补注册。
4. 明确 `skill_registry.ts` 是编译后使用，还是改为 CommonJS JS 文件。
5. 接入 `GET /api/skills`。
6. 接入 `POST /api/agents/:id/skills/:skill/invoke`。
7. 新增 `AgentStateStore v0`。
8. 前端适配新的 Runtime DTO。

---

## 8. 本阶段暂缓任务

| 暂缓项 | 原因 |
| --- | --- |
| 真正接入 LLM Planner | 结构化 Skill API 尚未完成 |
| 多 Agent 协作 | Task / Lock / State 基础还没有 |
| Capsule / Git Trace / Benchmark | 没有稳定 task result 与 skill trace，过早做会空转 |
| 一次性重构 77 个命令 | 先把 8 个核心 skill 的模式跑通 |

---

## 9. 参考文档

| 文档 | 用途 |
| --- | --- |
| `docs/LLM Agent API 设计组会材料0519v4.md` | 技术路线、Phase 0-5、Runtime / Skill / BT / FR-BT 设计 |
| `docs/todo-fix.md` | 当前已知问题、P0 bug、技术债 |
| `docs/web-state.md` | Web 面板现状、REST / WebSocket / 前端模块结构 |
| `mindcraft/src/agent/library/full_state.js` | 状态观察分层参考：gameplay / action / surroundings / inventory / nearby |
| `mindcraft/src/agent/action_manager.js` | action timeout / interrupt / resume 参考 |
| `mindcraft/src/agent/modes.js` | self_preservation / unstuck / cowardice 等 FR-BT 雏形参考 |
