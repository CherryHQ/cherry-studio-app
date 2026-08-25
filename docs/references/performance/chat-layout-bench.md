# Chat Layout Bench

> Retired after the Agent Session migration removed the legacy Assistant/Topic/Message development
> seeders. Keep this document and its tooling as historical reference until an Agent Session-native
> benchmark replaces it.

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

## 运行

先准备已经连接 Metro 的 dev build，并使用当前 Conductor workspace 专属模拟器。不要复用其他
workspace 正在使用的设备。Conductor 中要把 Metro 地址指向当前 workspace 的保留端口：

```bash
LAYOUT_BENCH_METRO_URL="http://127.0.0.1:${CONDUCTOR_PORT}" \
  pnpm bench:layout --udid <SIMULATOR_UDID>
LAYOUT_BENCH_METRO_URL="http://127.0.0.1:${CONDUCTOR_PORT}" \
  pnpm bench:layout --scenario send-anchor,stream-scroll --udid <SIMULATOR_UDID>
pnpm bench:layout --replay artifacts/layout-bench/<run>/stream-scroll/probe.jsonl
```

在非 Conductor 环境中，也可以通过环境变量显式指定设备与 Metro：

```bash
LAYOUT_BENCH_UDID=<SIMULATOR_UDID> \
LAYOUT_BENCH_METRO_URL=http://localhost:8081 \
pnpm bench:layout
```

## 产物

每轮写入 `artifacts/layout-bench/<timestamp>/`：

- `results.json`：结构化判据、指标和违规。
- `summary.md`：人读摘要。
- `<scenario>/probe.jsonl`：可重放的原始探针。
- `<scenario>/trace.svg`：offset、交互窗口、程序化命令、内容高度与预留空间时间线。
- `<scenario>/*.png`：关键交互检查点。

图中的 offset 在没有灰色手势窗口和顶边命令短线时应保持水平。内容高度可以继续上升；预留空间
降到零后，按钮应出现，但 offset 不应随内容继续移动。

## 修改与校准

阈值集中在 `scripts/layout-bench/judges.ts`。调整阈值前必须保留同一设备、同一 fixture、同一
chunk 长度和同一场景，至少重复三轮并比较原始轨迹。不要用阈值掩盖稳定复现的位移。

修改列表行为时至少运行：

```bash
pnpm test:app -- scripts/__tests__/layoutBenchJudges.test.ts --runInBand
pnpm test:app -- \
  src/frontend/components/messages/list/__tests__/MessageList.test.tsx \
  packages/ui/src/components/scroll-to-bottom-button/__tests__/scroll-to-bottom-button.test.tsx \
  --runInBand
pnpm typecheck
```

设备验收需覆盖 iOS 26 明暗主题：长回复触及 composer 后列表保持静止，按钮有可见材质和按压
反馈；点击后只滚动一次，后续内容增长会让按钮重新出现。旧 iOS 与 Android 应显示普通圆形回退
表面，并保持相同的滚动语义。
