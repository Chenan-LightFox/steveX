# steveX 下一阶段任务分工

> 生成日期：2026-06-05  
> 目标阶段：Phase 0 - 修复底座，统一协议  
> 核心原则：先跑通 Runtime 状态与结构化 Skill API，再接 LLM Planner。

---

## 1. 分工总览

| 成员 | 已完成 | 接下来负责方向 | 核心交付 |
| --- | --- | --- | --- |
| 章震南 | Agent 登录逻辑优化 | Runtime / Agent 状态与生命周期 | `executeCommand()` 修复、`AgentStateStore v0`、稳定 `/api/status` |
| 陈哲 | 暂无记录 | Skill API / Command 结构化封装 | `SkillRegistry`、8 个核心 skill schema、结构化 skill invoke API |
| 马嘉玲 | Config 页面编写 | Web UI / Runtime 状态展示 | 前端适配 Runtime DTO、debug-only 命令入口标识、日志与状态展示优化 |

---

## 2. 章震南待办清单

### 2.1 负责方向

章震南负责 Runtime 底座，重点是让 Agent 状态从“Web 展示字段”升级为“Runtime 可复用状态”。

### 2.2 待办任务

| 优先级 | 待办 | 修改/新增文件 | 参考来源 | 依赖 |
| --- | --- | --- | --- | --- |
| P0 | 修复命令 handler 第三参缺失 | `steveX/src/agent/agent.js` | `steveX/docs/todo-fix.md` 的 P0-1 | 无，最先做 |
| P0 | 新增轻量 `AgentStateStore v0` | 新增 `steveX/src/runtime/agent_state_store.js` | `steveX/docs/LLM Agent API 设计组会材料0519v4.md` Phase 0；`mindcraft/src/agent/library/full_state.js` | 可与 SkillRegistry 并行 |
| P0 | 给 Agent 状态增加 `lifecycle` | `steveX/src/agent/agent.js`、`steveX/src/agent/agent_manager.js` | `steveX/docs/todo-fix.md` 的 P0-7 | 依赖 `AgentStateStore v0` |
| P0 | 改造 `AgentManager.getStatus()` 从 StateStore 读状态 | `steveX/src/agent/agent_manager.js` | `steveX/docs/web-state.md` 2.2、3.5；设计材料 2.6 | 依赖 `AgentStateStore v0` |
| P1 | 清理 `getAgentBot` 多重 fallback | `steveX/src/agent/agent_manager.js` | `steveX/docs/todo-fix.md` 的 CLEAN-1 | 不阻塞其他任务 |
| P1 | 修复配置 merge 不支持 `null` 显式覆盖 | `steveX/src/utils/config.js` | `steveX/docs/todo-fix.md` 的 CLEAN-2 | 不阻塞其他任务 |

### 2.3 `AgentStateStore v0` 建议字段

第一版不要做重，只需要替代当前 `getStatus()` 的临时拼装逻辑。

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

### 2.4 验收标准

- `goto / mine / collect` 不再因为 `agent === undefined` 失败。
- `/api/status` 仍然可用，但数据来自稳定 Runtime DTO。
- 离线 Agent 不再被误判为满血可执行状态。
- 状态包含 `lastSeen` 和 `stateVersion`，为后续 trace / event diff 留接口。

---

## 3. 陈哲待办清单

### 3.1 负责方向

陈哲负责把现有字符串 command 封装为结构化 Skill API。短期目标不是重构 77 个命令，而是先用 8 个核心 skill 验证模式。

### 3.2 待办任务

| 优先级 | 待办 | 修改/新增文件 | 参考来源 | 依赖 |
| --- | --- | --- | --- | --- |
| P0 | 新增 `SkillRegistry` | 新增 `steveX/src/runtime/skill_registry.js` | 设计材料 Phase 0 第 4-6 条 | 可与 StateStore 并行 |
| P0 | 定义 8 个核心 skill schema | 建议新增 `steveX/src/runtime/skill_schemas.js`，或先放入 `skill_registry.js` | 设计材料 13.3；`steveX/src/commands/index.js` | 依赖现有 command 导出格式 |
| P0 | 优先封装 `goto` | `steveX/src/commands/actions/goto.js` | 设计材料 2.7、13.3 | 依赖 `executeCommand()` 修复 |
| P0 | 优先封装 `mine` | `steveX/src/commands/actions/mine.js` | 设计材料 2.7、13.3 | 依赖 `executeCommand()` 修复 |
| P0 | 优先封装 `craft` | `steveX/src/commands/actions/craft.js` | 设计材料 2.7、13.3 | 依赖 `SkillRegistry` |
| P0 | 优先封装 `inventory` | `steveX/src/commands/queries/inventory.js` | 设计材料 2.7、13.3 | 依赖 `SkillRegistry` |
| P0 | 优先封装 `findblock` | `steveX/src/commands/queries/findblock.js` | 设计材料 2.7、13.3 | 依赖 `SkillRegistry` |
| P0 | 优先封装 `nearby` | `steveX/src/commands/queries/nearby.js` | 设计材料 2.7、13.3 | 依赖 `SkillRegistry` |
| P0 | 优先封装 `eat` | `steveX/src/commands/actions/eat.js` | 设计材料 2.7、13.3 | 依赖 `SkillRegistry` |
| P0 | 优先封装 `attack` | `steveX/src/commands/actions/attack.js` | 设计材料 2.7、13.3 | 依赖 `SkillRegistry` |
| P0 | 新增 `GET /api/skills` | `steveX/src/web/server/routes.js` | 设计材料 9.1 Skill 调用 | 依赖 `SkillRegistry` |
| P0 | 新增 `POST /api/agents/:id/skills/:skill/invoke` | `steveX/src/web/server/routes.js`、`steveX/src/agent/agent_manager.js` | 设计材料 14.2 | 依赖 `executeCommand()` 修复与 `SkillRegistry` |
| P1 | 给 action skill 加 timeout / error code | 建议新增 `steveX/src/runtime/action_dispatcher.js` | `steveX/docs/todo-fix.md` 的 P0-6；`mindcraft/src/agent/action_manager.js` | 依赖结构化 invoke API |

### 3.3 第一批核心 Skill

| Skill | 类型 | 作用 |
| --- | --- | --- |
| `goto` | Action | 移动到指定坐标 |
| `mine` | Action | 到指定坐标并挖掘方块 |
| `craft` | Action | 合成指定物品 |
| `inventory` | Query | 查询背包 |
| `findblock` | Query | 查找附近方块 |
| `nearby` | Query | 查询附近实体 |
| `eat` | Action / Reflex 预备 | 吃食物恢复饥饿值 |
| `attack` | Action / Reflex 预备 | 攻击附近实体 |

### 3.4 验收标准

- 旧 `/api/agents/:name/command` 保留，作为 debug-only。
- 新 `/api/skills` 能列出至少 8 个核心 skill。
- 新结构化接口能调用 `goto / mine / craft / inventory`。
- 失败返回稳定结构：

```js
{
  ok: false,
  code: 'SKILL_TIMEOUT',
  message: 'goto timed out after 30000ms'
}
```

---

## 4. 马嘉玲待办清单

### 4.1 负责方向

马嘉玲负责 Web UI 与 Runtime 状态的衔接。重点不是新增大页面，而是确保状态展示不误导用户，并为结构化 Skill API 留调试入口。

### 4.2 待办任务

| 优先级 | 待办 | 修改/新增文件 | 参考来源 | 依赖 |
| --- | --- | --- | --- | --- |
| P0 | 适配 `/api/status` 新 Runtime DTO | `steveX/src/web/public/pages/agents.js`、`steveX/src/web/public/lib/state.js`、`steveX/src/web/public/lib/ws-client.js` | `steveX/docs/web-state.md` 3.4、3.5 | 依赖章震南 StateStore DTO 字段定稿 |
| P0 | 保留 Send Command，但标注 debug-only | `steveX/src/web/public/pages/agents.js`、必要时修改 `steveX/src/web/public/style.css` | 设计材料 Phase 0 第 7 条 | 不阻塞 |
| P0 | `Send Message to LLM Planner` 保持 disabled / coming soon | `steveX/src/web/public/pages/agents.js` | 设计材料 Phase 0 第 9 条；`steveX/docs/web-state.md` 4.2 | 不阻塞 |
| P1 | 接入或移除冗余 `agent:update` 单独处理 | `steveX/src/web/public/lib/ws-client.js`、`steveX/src/web/server/ws.js` | `steveX/docs/web-state.md` 的“六、后续规划” | 依赖是否升级 EventBus Envelope |
| P1 | 修复 `addLog` 使用 `shift()` 的性能债 | `steveX/src/web/public/lib/state.js` | `steveX/docs/todo-fix.md` 的 PERF-3 | 不阻塞 |
| P1 | 为 `/api/skills` 做简单调试入口或日志展示 | `steveX/src/web/public/lib/api.js`、`steveX/src/web/public/pages/agents.js` | 设计材料 9.1、14.2 | 依赖陈哲 `/api/skills` |

### 4.3 UI 展示注意事项

- 离线 Agent 的 `health` 应显示为未知或不可用，不应误显示为真实 `20/20`。
- `position` 应由前端格式化，后端 DTO 保持数字或 `null`。
- `Send Command` 是人类调试入口，不是 Planner 接口。
- `Send Message to LLM Planner` 在 Planner 接入前不要伪装成可用功能。

### 4.4 验收标准

- 新旧状态字段切换后 UI 不崩。
- Agent 卡片能展示 lifecycle / online / position / health / currentAction。
- 命令日志不重复。
- 用户能明确区分 debug command 与未来 Planner 入口。

---

## 5. 总依赖关系

```text
章震南：修复 executeCommand 第三参
        ↓
陈哲：封装 goto / mine / collect / craft 等 skill
        ↓
陈哲：提供 /api/skills 与 skill invoke API
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

## 6. 本阶段暂缓任务

| 暂缓项 | 原因 |
| --- | --- |
| 真正接入 LLM Planner | 结构化 Skill API 尚未完成 |
| 多 Agent 协作 | Task / Lock / State 基础还没有 |
| Capsule / Git Trace / Benchmark | 没有稳定 task result 与 skill trace，过早做会空转 |
| 一次性重构 77 个命令 | 先做 8 个核心 skill，验证模式后再批量推进 |

---

## 7. 参考文档

| 文档 | 用途 |
| --- | --- |
| `steveX/docs/设计材料0519.md` | 技术路线、Phase 0-5、Runtime / Skill / BT / FR-BT 设计 |
| `steveX/docs/todo-fix.md` | 当前已知问题、P0 bug、技术债 |
| `steveX/docs/web-state.md` | Web 面板现状、REST / WebSocket / 前端模块结构 |
| `mindcraft/src/agent/library/full_state.js` | 状态观察分层参考：gameplay / action / surroundings / inventory / nearby |
| `mindcraft/src/agent/action_manager.js` | action timeout / interrupt / resume 参考 |
| `mindcraft/src/agent/modes.js` | self_preservation / unstuck / cowardice 等 FR-BT 雏形参考 |
