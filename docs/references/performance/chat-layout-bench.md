# Chat Layout Bench

聊天列表「布局是否出问题、界面是否跳动」的本地基准。定位是**回归基准 + 诊断工具**双形态，
不做 CI 门禁：它驱动 iOS 模拟器跑固定场景，把 app 内探针发出的轨迹跑一遍相位感知的判据，
产出结构化结果、检查点截图与人读摘要。

帧率/掉帧族**不在**本期范围内：`agent-device perf` 在 iOS 模拟器上不报 FPS（见
[topic-rendering-benchmark.md](topic-rendering-benchmark.md)），FPS 留给真机阶段。

## 跑起来

```bash
pnpm bench:layout                                   # 跑全部场景
pnpm bench:layout --scenario send-anchor            # 只跑一个（逗号分隔可多选）
pnpm bench:layout --udid <UDID> --out artifacts/layout-bench/baseline
pnpm bench:layout --replay <probe.jsonl>            # 对已采集的 trace 重跑判据，不碰设备
```

前置条件：

- dev 构建的 app 已装在目标模拟器上，**并已连上 Metro**——探针只在 `__DEV__` 下发。
  若 app 停在 dev client 的启动页，这一轮会采到零事件并以明确报错终止。
- `agent-device` 在 PATH 上。
- 目标模拟器唯一在跑；否则用 `--udid` 或 `LAYOUT_BENCH_UDID` 指定。这台机器上常有多个并行
  workspace 各开一台模拟器，所以多台在跑时脚本**不猜**，直接列出让人选。

产物写在 `artifacts/layout-bench/<时间戳>/`（已 gitignore）：

```
results.json          结构化结果，供 A/B 对比
summary.md            人读摘要
<场景>/probe.jsonl    原始轨迹，可用 --replay 重跑判据
<场景>/<检查点>.png    检查点截图
```

退出码在有未白名单违规时为 1。已知未修的问题写进
[`scripts/layout-bench/known-issues.json`](../../../scripts/layout-bench/known-issues.json)，
条目按 `scenario` +（可选）`judge` 匹配，命中后降级为「已知问题」不计入违规。

## 零网络的确定性回放

基准不发真实请求。dev 构建里种了一个假 provider（`layout-bench-mock`）与配套助手
「Layout Bench」，发送 `bench:<夹具>[@每秒chunk数]` 就会零网络回放一段固定内容：

```
bench:text          长中文段落（行高基线对照组）
bench:code@20       代码块，每秒 20 个 chunk
bench:mixed@40      复合长回复，用于压满视口与尾随阶段
```

夹具按**渲染形态**而不是话题分类：text / code / list / table / longline / emoji /
reasoning / mixed。同一条 magic prompt 两次运行逐字节一致，节奏也一致。

注入方式是**委托**而不是替换：包一层 `openai-compatible` extension，只在
`providerSettings.name` 命中哨兵 id 时返回假 provider，其余一律透传，所以日常开发用的真实
provider 完全不受影响，`config.ts` 也零改动。详见
`src/backend/ai/devBench/installBenchMockProvider.ts`。

## 场景

| id | 造场 | 被测 |
| --- | --- | --- |
| `send-anchor` | 新话题 | 空话题里发第一条：钉顶落点、预留空白、slide-in 期间的位移 |
| `stream-scroll` | 新话题 | 流式中用户上滑：手势与尾随滚动的对抗、按钮显隐状态机 |
| `follow-up-turn` | 新话题 + 跑完一轮 | 已有长回复时再发一条：新行估算高度、内容塌陷与钉顶动画的相互作用 |

入口一律是 deep link `cherrystudio:///topics?assistantId=layout-bench-assistant`：没有
`topicId` 时它落到新建话题界面并按助手预填模型，于是每轮都是干净的新话题、模型必定是假模型，
不依赖任何既有数据。早期版本靠「点话题列表第一行」进入，应用一恢复到别的话题就点空，
整轮静默产出零探针。

## 判据

判据必须**知道相位**才能判定：同一条水平轨迹在钉顶期是合格、在尾随期是「该跟没跟」。
尾随状态机的三个相位见 `MessageList.tsx` 的 `TailFollowPhase`。

| 判据 | 判什么 |
| --- | --- |
| `scroll-button-phase` | 「滚动到底部」只允许在 `paused` 相位显示出来 |
| `scroll-button-chatter` | 按钮 1 秒内翻转不超过 2 次 |
| `gesture-conflict` | 用户手势窗口内不得有程序化滚动 |
| `offset-reversal` | 非交互期不得出现「去一段又弹回来」的往返 |
| `viewport-blank` | 视口不得长时间停在内容之外 |
| `content-shrink` | 流式期间内容总高只应增长 |
| `row-shrink` | 消息行高度不应变矮 |
| `estimate-collapse` | 新行的估算高度不得与实测高度相差过大 |

阈值集中在 `scripts/layout-bench/judges.ts` 的 `THRESHOLDS`，每个都注明是怎么量出来的。

几条判据的写法是被实测纠正过的，改动前先读注释：

- `gesture-conflict` 必须忽略没有配对 `begin` 的 `momentum end`——原生 ScrollView 在**每次
  程序化滚动之后**都会发一次 `onMomentumScrollEnd`（实测一轮 47 次），当成关窗信号会拼出
  覆盖整条轨迹的假窗口，然后全线误报。
- `offset-reversal` 取往返**两腿中较短的那条**作为跳动幅度。拿反转前那一段的长度当幅度的话，
  正常钉顶动画（几百像素单调位移）末尾几像素的回弹会被报成几百像素的跳动。
- `estimate-collapse` 与 `row-shrink` 靠「是不是该行的首次实测」区分：首次实测的 `prev` 是
  估算值不是量出来的高度，拿它算「行变矮」必然误报。

## 真值来源与工具边界

几何真值来自 **app 内探针**，不是无障碍树：agent-device 读到的树里聊天列表与输入框都被
view flattening 抹成匿名节点，`text=` / `id=` 选择器一律 miss（原生导航栏与系统弹窗正常可见）。
因此：

- 驱动层只能打坐标，坐标集中在 `scripts/layout-bench/scenarios.ts` 的 `LAYOUT`，实测自
  iPhone 17 Pro（402×874pt）；换机型必须重量一遍。
- 要摆脱坐标，替换 `scripts/layout-bench/device.ts` 为走 RN 组件树的驱动（如
  [argent](https://github.com/software-mansion/argent)）即可，场景定义不用动。

探针通道（`src/shared/devBench/layoutBenchProbe.ts`）有两条硬约束：

- 必须发在 **info 级**。`LoggerService` 的 debug 落到 `console.debug`，而 `console.debug`
  **不进 os_log**（实测同一时刻 info 正常、debug 采集 0 行），任何基于设备日志的 harness 都
  读不到它。`agent-device logs` 没有级别开关。
- 默认关闭，由假模型被创建时 arm。`onScroll` 按 `scrollEventThrottle=16` 每帧一条，常开会把
  Metro 控制台淹掉。

日志行尾部有 RN console 桥补的引号，解析正则**不能**锚定行尾。

## 已经抓出来的问题

首轮上线就抓到三类，都已修：

1. **`estimate-collapse` 2964px**：新建的 pending 助手行按 `assistant` 的尺寸均值估成 3012px，
   实测只有 48px（加载点）。一帧内内容少掉近 3000px，贴底的列表被迫回夹再补一段动画。
   修法是让「还没有内容的助手行」自成一类（`getMessageRowType`），修后修正量 2964px → 5px。
2. **`gesture-conflict`**：ready gate 的 `scrollToEnd` 不看 `isUserInteractingRef`，而它依赖
   `contentBaseHeight`、流式每个 chunk 都会重跑，于是变成第二条不受尾随状态机管的自动滚动，
   拖动中把列表硬拽回底部（实测一次拖动被拽 +198px）。补上交互锁后冲突 2 → 0，
   程序化滚动 217 → 87。
3. **`scroll-button-chatter`**：按钮 1 秒翻转 4 次，是上一条的症状而非独立缺陷，随之消失。

`follow-up-turn` 的 `offset-reversal` 仍在 known-issues 里挂账，签名与线索见该文件。
