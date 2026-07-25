# Chat Message List Render Gate TODOs

Status: active

本文记录聊天消息列表首帧遮罩（`ChatInitialRenderCover`）判定逻辑的收敛待办。**遮罩本身保留**（已确认的产品行为：进入话题时需要 loading 状态），待办针对的是它的判定条件形态——目前是三个来源不同的布尔量拼出来的，每新增一种进入聊天的方式就要再加一个否决项。

相关文档：`docs/architecture/mobile-chat-streaming-rendering.md`。

## CHATGATE-TODO-001: 把遮罩判定收敛为两个各归其位的信号

实施状态：代码与自动化回归已完成，待真机对照验证。

```
requiresInitialHistoryLayout =
  hasHistoryBeforePendingTurn !== false &&
  (isLoadingInitial || queryMessageCount > 0)

isCoverVisible =
  requiresInitialHistoryLayout &&
  !isCurrentRenderGateResolved
```

`ChatRuntime` 在创建消息前读取发送前的 `topic.activeNodeId`，把 `hasHistoryBeforePendingTurn` 随 runtime overlay 一起交给 workspace：

- `false` 表示当前是第一轮，没有需要按估算高度铺出的历史消息；runtime overlay 可直接交接，不遮。
- `true` 表示当前 turn 前已有历史；即使该话题仍在流式，重新进入时也要遮到列表 settle。
- `undefined` 表示没有 runtime 交接，按 messages query 的加载态和消息量判断。

`ChatMessageList.onReady` 继续只表示「非空消息列表已完成测量和 settle」。加载期的空列表不能提前上报，否则会在 query 返回历史消息前把一次性 ready 消耗掉。已结算的空话题由 `requiresInitialHistoryLayout = false` 直接打开 gate。

gate 对每个 `renderGateKey` 只有单调的「未解决 → 已解决」转换：

- 列表 `onReady` 到达，下一帧标记为已解决。
- requirement 变为 `false`，立即标记为已解决；同一代际之后不得重新盖回。
- key 改变时重置代际并取消旧 key 尚未执行的 ready rAF；A → B → A 不能复用第一次 A 的 ready。

回归覆盖：

- 普通加载和已有历史保持遮罩到 settle。
- 第一轮 runtime 交接不遮，交接字段清除后也不重新闪遮罩。
- 已有历史的流式话题重新进入仍遮。
- 空话题 query 结算后不永久遮罩。
- key 切换、A → B → A 和旧 rAF 不污染当前代际。

剩余验收：真机对照新话题发送后首帧不闪、从列表进入不露出高度修正，并复核已有历史的流式话题重新进入仍受 gate 保护。

可选的进一步收敛（非本待办前置）：交接时用 `setQueryData` 把已写入 DB 的用户消息种进新 topic 的 messages 缓存。`useMessageHistoryWindow` 走的是 `useDataInfiniteQuery`，需要先确认分页缓存形状是否便于外部写入。

依赖：无。可与 `anchoredEndSpace` 钉顶逻辑的梳理一起做，二者判据同源。
