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
- **状态**: 待修（可随 command 重构一并处理）

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
