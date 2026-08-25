# Chat Layout Bench

> Retired after the Agent Session migration removed the legacy Assistant/Topic/Message development
> seeders. This document and the source under `scripts/layout-bench/` are historical reference only;
> there is no supported command until an Agent Session-native benchmark replaces it.

聊天布局基准是一套本地设备回归工具，用固定回复、固定交互和应用内探针验证消息列表的定位、
流式布局、按钮显隐与用户手势。它用于复现和量化真机上的跳动，不是 CI 门禁。

## 当前交互契约

消息列表把定位动作与流式生成严格分开：

1. 进入已有话题时，ready gate 可以执行一次初始定位。
2. 发送新消息时，新用户消息可以执行一次钉顶动画。
3. 回复生成期间，消息 chunk、内容高度和行高变化都不得调用滚动 API。
4. `maintainVisibleContentPosition` 始终启用，用于稳定动态测量和数据变化。
5. 预留空间耗尽且 LegendList 报告 `isAtEnd=false` 时，滚动到底部按钮应立即出现。
6. 用户点击按钮只执行一次动画 `scrollToEnd`；后续 chunk 不会开启持续滚动。
7. 用户触摸、拖动或惯性滚动时，ready gate 不得与手势争抢列表位置。

“到 composer 附近”没有额外像素阈值。它对应 `anchoredEndSpace` 耗尽后，LegendList 首次把
`isAtEnd` 变为 `false` 的时刻。

## 固定输入

开发环境中的布局基准助手识别以下指令：

```text
bench:text@40
bench:code@40
bench:list@40
bench:table@40
bench:emoji@40
bench:longline@40
bench:reasoning@40
bench:mixed@40+2000+2000
```

- `@40` 表示按固定长度切 chunk，保证重复运行得到相同序列。
- 两个 `+2000` 分别延长待生成占位和思考块，便于截图与轨迹采集。
- `mixed` 覆盖长正文、代码块、嵌套列表、表格与思考块，是默认设备场景。
- 修改 `src/backend/ai/devBench/fixtures.ts` 会改变基准输入，历史轨迹不再可直接比较。

## 设备场景

| 场景 | 覆盖范围 |
| --- | --- |
| `send-anchor` | 空话题首轮发送、预留空间、一次性钉顶与入场动画 |
| `stream-scroll` | 正文流式期间的用户滑动、位置独占与按钮显隐 |
| `follow-up-turn` | 已有长回复后的再次发送、行高估算与钉顶动画 |

场景坐标以 iPhone 17 Pro（402×874pt）标定。使用其他机型前要重新测量
`scripts/layout-bench/scenarios.ts` 中的坐标。

## 探针信号

应用通过 `[LBP]` 日志记录以下事件：

| 事件 | 含义 |
| --- | --- |
| `scroll` | 列表实际 offset |
| `content` | 内容总高与 ready 状态 |
| `endSpace` | `anchoredEndSpace` 当前大小 |
| `itemSize` | 单行估算值与实测值 |
| `interaction` | touch、drag、momentum 的开始和结束 |
| `progScroll` | 程序化滚动来源及调用时的列表状态 |
| `button` | 滚动到底部按钮目标显隐状态 |
| `keyboard` | 键盘尺寸变化与当时的预留空间 |
| `slideIn` | 新用户消息入场动画的装填、启动与落位 |

探针只报告事实。`probe.ts` 负责合成交互窗口和滚动采样，`judges.ts` 负责应用判据。

## 判据

| 判据 | 要求 |
| --- | --- |
| `scroll-button-visibility` | 预留空间耗尽且内容继续增长后，按钮在 250ms 内出现 |
| `scroll-button-chatter` | 排除手势及惯性余波后，按钮不得在一秒内反复翻转 |
| `stream-programmatic-scroll` | 只允许 `readyGate`、`anchorReady`、`button` 三种滚动来源 |
| `stream-position-stability` | 预留空间耗尽后，非交互且无一次性命令时 offset 保持稳定 |
| `gesture-conflict` | 用户手势窗口内不得执行非按钮程序化滚动 |
| `offset-reversal` | 非交互期不得出现超过噪声阈值的自行往返 |
| `viewport-blank` | 视口不得长时间滚到内容和预留空间之外 |
| `content-shrink` | 流式期间内容总高不应异常回缩 |
| `row-shrink` | 首次实测之后，消息行不应异常变矮 |
| `estimate-collapse` | 新行估算高度与首次实测不得相差过大 |
| `slide-in-flight` | 入场消息必须启动，且具有非零可见行程 |

`stream-position-stability` 排除用户交互窗口及其惯性余波，也排除一次性动画命令的落位窗口。
这样判据量到的是生成内容是否自行改变位置，而不是把合法手势或钉顶动画报成缺陷。

## 归档状态

旧场景仍依赖 `layout-bench-assistant` 与 legacy Topic 路由，新开发数据库不再创建这些前置数据。
因此 `package.json` 不再暴露运行入口，也不应直接执行归档脚本。后续基准需要先改用 Agent、
Session、Agent Message 数据模型，再重新提供命令、设备校准与产物约定。
