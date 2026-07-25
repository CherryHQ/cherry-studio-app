# Chat Message List Render Gate TODOs

Status: active

本文记录聊天消息列表首帧遮罩（`ChatInitialRenderCover`）及其 gate 的重构待办。遮罩本身是为了挡住列表首帧的高度修正与钉顶滚动抖动而加的，但它的显示条件已经开始随「进入聊天的方式」增多而叠加否决项，需要在后续梳理时重构。

相关文档：`docs/architecture/mobile-chat-streaming-rendering.md`。

## CHATGATE-TODO-001: 重构消息列表首帧遮罩的判定条件

当前状态：`useMessageListInitialRenderGate` 的判定是三个来源不同的布尔量拼出来的：

```
isCoverVisible =
  !isHandedOverFromNewTopic &&                                   // runtime overlay 有没有刚发出的消息
  (isLoadingInitial ||                                           // messages query 的加载态
   (hasMessages && readyListRenderKey !== renderGateKey))        // 列表 onReady 回调是否已到
```

其中 `isHandedOverFromNewTopic` 是为修「从助手详情页点开始聊天、发送后中途闪一层 spinner」补上的否决项：那条路径下 `isLoadingInitial` 为真只是因为 `topicId` 刚出现、messages query key 是全新的，而用户刚发的消息其实已经在 runtime overlay 里可以直接画出来，盖遮罩等于把它藏起来几百毫秒。补丁有效（见 `useMessageListInitialRenderGate.test.tsx` 的四条行为测试），但形态不对：真正要表达的语义只有一个——「列表首帧是否已经有可信内容且布局已 settle」——现在却用三个代理变量近似，每多一种进入聊天的方式就要再加一个否决项。

完成条件：

- 把「有内容可画」与「布局已 settle」拆成两个各自单一来源的信号，遮罩只依赖后者；进入方式不再参与判定。
- 复核遮罩是否还必要：它挡的是 `estimatedItemSize` 坏估值造成的首帧高度修正。若按 role 分别估值（`getItemType`）后首帧误差已足够小，遮罩连同这个 gate 可以整体删掉，而不是继续维护它的条件。
- 新增进入方式（deep link、搜索结果跳转、通知打开）不需要再往判定里加分支。
- 保留或改写现有 gate 测试作为回归基线，至少覆盖：从列表进入有历史消息的话题仍被遮住到 settle、新话题交接不遮、onReady 后揭示。
- 真机对照两条路径抽帧确认：新话题发送后首帧不闪、从列表进入不露出高度修正。

依赖：无。可与 `anchoredEndSpace` 钉顶逻辑的梳理一起做，二者判据同源。
