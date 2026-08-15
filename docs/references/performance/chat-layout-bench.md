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
- 改完 app 代码后**先确认新代码真的在跑**再开始量。这里踩过两次：
  - Metro 的 Hermes 字节码走**另一套缓存**（app 请求的是 `/index.ts.bundle?...transform.bytecode=1`，
    不是 `/index.bundle`），源码明明改了、curl 打包结果也对，设备上仍是旧行为，须 `--clear` 重启 Metro。
  - Fast Refresh 会**静默不生效**。曾据此得出「改了没变化 ⇒ 该因素无关」的假阴性结论，
    实际是补丁根本没上去。判别办法是让探针自报所用参数（如给 `progScroll` 带上本次的
    `closeKeyboard`），或干脆走一次完整重载：
    `xcrun simctl openurl <UDID> "com.cherry-ai.cherry-studio-app://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`。
- `agent-device` 在 PATH 上。
- 目标模拟器唯一在跑；否则用 `--udid` 或 `LAYOUT_BENCH_UDID` 指定。这台机器上常有多个并行
  workspace 各开一台模拟器，所以多台在跑时脚本**不猜**，直接列出让人选。

产物写在 `artifacts/layout-bench/<时间戳>/`（已 gitignore）：

```
results.json          结构化结果，供 A/B 对比
summary.md            人读摘要
<场景>/probe.jsonl    原始轨迹，可用 --replay 重跑判据
<场景>/trace.svg      轨迹图，浏览器直接打开
<场景>/<检查点>.png    检查点截图
```

退出码在有未白名单违规时为 1。已知未修的问题写进
[`scripts/layout-bench/known-issues.json`](../../../scripts/layout-bench/known-issues.json)，
条目按 `scenario` +（可选）`judge` 匹配，命中后降级为「已知问题」不计入违规。**当前是空的**
——挂过账的那一条（续轮发送的 -310px）已修，见「已经抓出来的问题」。往里加条目时把根因和
判别实验一起写进 `reason`：上一条的头两版根因都是错的，而下一个人只会读到这里。

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
- `offset-reversal` 切分单调段时必须带噪声地板（`offsetNoisePx`）。按逐帧 delta 切段时，
  一次 616px 的爬升被中途一个 5px 的回撤切开，「两腿取短」于是拿到 88px，前面那条 310px
  的突跳就此被判成合格——**判据漏掉了自己被造出来要抓的那个缺陷**，而报告看起来是全绿的。

已知盲区，别顺手「优化」掉：`offset-reversal` 只看 offset，区分不了「键盘耦合的位移」和
「布局跳动」。探针明明采了 `keyboard` 事件，看上去很适合拿来做豁免——**不要**。续轮发送
那条 310px 缺陷同样落在键盘窗口内、幅度也同样等于键盘有效高度，加了豁免就等于让判据对
自己被造出来要抓的那类缺陷闭眼。要区分只能回到像素（见最后一节）。

## 读轨迹图

判据只回答「红还是绿」，回答不了「这一段动得顺不顺」——两条同样零违规的轨迹，一条可以是
单调爬升，另一条可以是在阈值底下反复搓动。所以每个场景另出一张 `trace.svg`（四条泳道共用
一根时间轴：位移、逐样本增量、预留空白、内容总高），跨轮对比先看图，能省掉大半次翻 jsonl。

底色是尾随相位，竖线是程序化滚动**按来源分色**——后者是读图的重点：同样一片密集滚动，全是
绿色 `tailFollow` 属正常尾随，全是红色 `readyGate` 就是 ready gate 越界那个缺陷的形态。

设计不变式在图上是可视的，偏离一眼可见：

- 钉顶期（`anchoring`，橙底）位移应当是**平的**，靠预留空白从 512 收缩到 0 来「生长」；
- 尾随期（`following`，蓝底）位移单调升、预留空白已经是 0；
- 增量泳道的**负值柱**是抖动的直接形态。

有两个坑已经踩过并修在渲染里，改这张图时别退回去：

- **手势期的负增量不是缺陷**。用户上滑本来就连出一整片负值，和非交互期的反向弹动画成同一个
  红色，这张图就成了误报机器。现在手势期一律中性灰，只有非交互期的负值才是红的——与
  `offset-reversal` 判据同语义（它同样排除手势窗口）。
- **预留空白与内容高度必须取原始事件，不能跟着滚动采样走**。采样只在 `scroll` 事件上生成，
  而钉顶最关键的那一段（预留空白 512 → 0）大半发生在列表还没滚动之前，跟着采样走会把它整段
  丢掉——第一版就是这样，曲线从 230 开始，最有信息量的前半段不见了。

同理，时间轴要覆盖所有画得出来的东西：程序化滚动与内容高度都可能晚于最后一次滚动（尾随停了
内容还在长），只按滚动采样定标会把它们画到画布外面去。

## 有意不做的判据

原计划里还有一组静态几何判据（消息行重叠 / 被 header 与输入框遮挡 / 越界 / 间距异常）。
落地前先验了一次可行性，结论是**按原设计做出来抓不到这一类里真实发生过的缺陷**，因此不做：

- 行与行在**布局盒**上不可能重叠——列表本来就是顺序摆放的，`onLayout` 拿到的矩形永远互不
  相交，判据会恒绿。
- 这一类真实发生过的缺陷是「盒子量小了、内容画大了」：用户气泡里的 `@expo/ui` MenuView 是
  SwiftUI 宿主视图，竖向欠测高，RN 按矮盒子排版而原生画得更高（修复见 commit `3f9b6cfb`）。
  `onLayout` 与 `onItemSizeChanged` 报的都是盒子，看不见画出来的东西。
- 要抓它只能比像素。而通用的像素级重叠检测在这套素材上很脆（正文是等行距重复纹理），
  投入与收益不成比例。

真要覆盖这一类，正确形态是「针对具体嫌疑组件的定点像素断言」，而不是一条通用判据——
等下一次真出这类问题时按当时的形态写，比现在先摆一个恒绿的判据诚实。

驱动层的 argent 备选槽位同理暂不接：当初留它是为了补「视觉 diff」与「模拟器上的 JS
profiling」两个缺口，前者已由 `agent-device record` + 定点像素测量覆盖（见下节），后者属于
帧率族、本期不在范围内。要换驱动仍然只需替换 `device.ts`。

## 真值来源与工具边界

几何真值来自 **app 内探针**，不是无障碍树：agent-device 读到的树里聊天列表与输入框都被
view flattening 抹成匿名节点，`text=` / `id=` 选择器一律 miss（原生导航栏与系统弹窗正常可见）。
因此：

- 驱动层只能打坐标，坐标集中在 `scripts/layout-bench/scenarios.ts` 的 `LAYOUT`，实测自
  iPhone 17 Pro（402×874pt）；换机型必须重量一遍。
- 要摆脱坐标，替换 `scripts/layout-bench/device.ts` 为走 RN 组件树的驱动（如
  [argent](https://github.com/software-mansion/argent)）即可，场景定义不用动。

键盘是唯一**不改 contentSize 也不改视口**却会挪动内容的因素，所以 `keyboard` 与 `freeze`
两类事件必须单独采：缺了它们，发送瞬间那一帧位移无法归因。`keyboard` 还要带上当时的
`endSpace`——键盘造成**净**位移的充要条件就是「抬起与收起两次之间预留空白变了」，只记
事件不记这个数，就只能像上一版那样把锅甩给 MVCP（见「续轮发送的 -310px」）。
`keyboard` 的订阅刻意不按 armed 开关——探针由假模型在**第一次发送**时 arm，而订阅所在的
effect 在列表挂载时就跑完了，按 armed 判断等于永远不订阅（实测整轮零 keyboard 事件）。

探针通道（`src/shared/devBench/layoutBenchProbe.ts`）有两条硬约束：

- 必须发在 **info 级**。`LoggerService` 的 debug 落到 `console.debug`，而 `console.debug`
  **不进 os_log**（实测同一时刻 info 正常、debug 采集 0 行），任何基于设备日志的 harness 都
  读不到它。`agent-device logs` 没有级别开关。
- 默认关闭，由假模型被创建时 arm。`onScroll` 按 `scrollEventThrottle=16` 每帧一条，常开会把
  Metro 控制台淹掉。

日志行尾部有 RN console 桥补的引号，解析正则**不能**锚定行尾。

## 已经抓出来的问题

首轮上线就抓到四类，都已修：

1. **`estimate-collapse` 2964px**：新建的 pending 助手行按 `assistant` 的尺寸均值估成 3012px，
   实测只有 48px（加载点）。一帧内内容少掉近 3000px，贴底的列表被迫回夹再补一段动画。
   修法是让「还没有内容的助手行」自成一类（`getMessageRowType`），修后修正量 2964px → 5px。
2. **`gesture-conflict`**：ready gate 的 `scrollToEnd` 不看 `isUserInteractingRef`，而它依赖
   `contentBaseHeight`、流式每个 chunk 都会重跑，于是变成第二条不受尾随状态机管的自动滚动，
   拖动中把列表硬拽回底部（实测一次拖动被拽 +198px）。补上交互锁后冲突 2 → 0，
   程序化滚动 217 → 87。
3. **`scroll-button-chatter`**：按钮 1 秒翻转 4 次，是上一条的症状而非独立缺陷，随之消失。
4. **`offset-reversal` 310px**（`follow-up-turn`）：续轮发送时钉顶动画前有一帧 -310px 的突跳，
   动画因此走 616px 而非 306px。首轮不出现只因它 `animated:false`，位移与落点同帧完成。
   详见下一节。

### 续轮发送的 -310px：一个错过两次的根因

这条值得单独写，因为**它的头两版根因都是错的，而且都写进了代码注释和 known-issues**。

错的版本：「收键盘一帧抽掉 336px 底部 inset，原生 ScrollView 把 contentOffset 夹回新末端」。
两处都不对——底部 inset 是 `min(视口, max(预留空白, 键盘有效高度))`，收键盘前后分别是
`max(512, 310)` 和 `max(512, 0)`，**全程 512 没动过**；而 336 这个数在 inset 里从来不存在，
键盘的有效抬升是 `336 − keyboardOffset 26 = 310`。同一份 trace 里真正的末端夹回长这样：-24。

对的版本：`react-native-keyboard-controller` 的 `keyboardWillHide` worklet 按**键盘抬起那一刻
记录下来的抬升量**原样回退（`useChatKeyboard/index.ios.ts` 的 `prevScrollEffective`）。这在
可滚动末端没挪动时是对的，而发送恰好在两次键盘事件之间把钉顶预留空白从 0 顶到 512、末端
跟着下移 512 —— 回退的前提已经不成立，于是回退量成了净位移。

| 时刻 | offset | |
| --- | --- | --- |
| 静止（键盘关） | 2452 | `= contentLength 3326 − 视口 874` |
| 点输入框打字 | 2762 | 键盘抬起 **+310**，此时预留空白 0 |
| 发送 → 锚点就绪 | 2762 | 预留空白 0 → **512**，末端变 3068 |
| 收键盘 | **2452** | 按记录量回退 310 ← 缺陷 |
| 钉顶动画终点 | 3068 | 于是要走 616px |

**充要条件收得很紧**：键盘抬起时预留空白为 A、收起时为 B，`A ≠ B` 就会产生量级为差值的净
位移。全 app 只有「发送」这一条路径会在键盘开着的时候改变预留空白，所以别的键盘路径（历史
区聚焦、下拉收键盘、模型选择器）本来就没病。为了让这个不变量能被观测，`keyboard` 探针现在
带上当时的 `endSpace`——上一版正是因为这两个数对 harness 不可见，才一路怀疑到 MVCP 头上。

修法在 `patches/react-native-keyboard-controller@1.21.13.patch`：库里本来就有一条「键盘变矮
时夹到当下的合法区间」的分支（`clamp(scroll, 0, maxScroll)`），只是只给 `never` 模式用；把
我们用的 `whenAtEnd` 一并纳入即可。两条路只在上面那一个情形下不同：

| 情形 | 回退（旧） | 夹取（新） | |
| --- | --- | --- | --- |
| 普通收键盘（预留空白 0，贴底） | `2762 − 310 = 2452` | `min(2762, 3326−874) = 2452` | 相同 |
| 本缺陷（预留空白 512） | `2452` | `min(2762, 3068) = 2762` | **零位移** |
| 不在末端 | 不进分支，保位 | 同左 | 相同 |

修后 `offset-reversal` 峰值 310 → **24**，与「根本不收键盘」那次判别实验逐点同解。

被否决的两条：**改在发送那一刻收键盘**——那时预留空白还是 0，收键盘本身确实无声，但内容
仍会掉回 2452，钉顶动画要走 616px，判据照样红，只是位移与键盘同帧因而不刺眼；
**`keyboardLiftBehavior` 改 `persistent`**——它的收起分支就是上面那条夹取，但抬起分支恒抬且
收起时保住抬升量，在历史区反复聚焦/失焦会像棘轮一样把列表一格格推到底。
更早还试过「先钉顶、动画结束再收键盘」：位移搬到动画终点还要被尾随滚动再拉一次，
反转从 1 处 310px 变 2 处 334px，更差。

Android 走另一套逐帧实现（`useChatKeyboard/index.ts`），同一个「按记录量回退」的毛病在，但
它跟着键盘动画逐帧发生，观感远没有 iOS 突兀，本次未动。补丁值得给上游提 PR；升
`react-native-keyboard-controller` 时 hunk 必须跟走，升完必须重跑 `follow-up-turn`。

## 确定性

同一 commit 连跑三轮（全场景）的结果，用来判断哪些数字可以当基线、哪些只是噪声：

| 指标 | send-anchor | stream-scroll | follow-up-turn |
| --- | --- | --- | --- |
| `estimate-collapse` 修正 | 252 / 252 / 252 | 252 / 252 / 252 | **5 / 5 / 5** |
| `offset-reversal` 峰值 | 0 / 24 / 40 | 40 / 64 / 24 | **40 / 13 / 18** |
| `gesture-conflict` 窗口 | 0 / 0 / 0 | 1 / 2 / 2 | 0 / 0 / 0 |
| `viewport-blank` 峰值 | 59 / 59 / 50 | 50 / 53 / 27 | 45 / 54 / 58 |

结论：非交互期位移噪声在 0-64px 之间，`offsetReversalPx=100` 的阈值余量不宽，改判据前先
重跑三轮看这一档。`follow-up-turn` 那一栏在修键盘缺陷前是逐像素可复现的 **310 / 310 / 310**
——确定性缺陷长这样，噪声不会三轮同值。

这轮也逼出了一个判据自身的缺陷：`scroll-button-chatter` 在 stream-scroll 上三轮报 2/4/2 次
翻转，第二轮变红。原因是一次上滑天然会翻两次（离开底部→显示、惯性回底→隐藏），前后各带
一次就压在「1 秒 4 次」的边界上。**会自己 flake 的判据当不了回归基线**，现已排除手势窗口
（及 `interactionEchoMs` 的惯性余波）内的翻转，三轮回放稳定为 `toggles=1`，方差全部落到
`userDrivenToggles`（1/3/1）这个只作记录、不参与判定的指标上。

每轮开头都会先 `ensureDevClientAttached` 重新接回 Metro：dev client 被重启或断连后会停在
自己的服务器列表页，此后所有坐标点击都打在启动页上，最后以一句无从诊断的 XCTest 失败收场。
顺带把冷启动固定成每轮起点，跨轮对比才有可比性。Metro 地址用 `LAYOUT_BENCH_METRO_URL` 覆盖。

## 用录像做交叉验证

判据只看得到 offset 数字，而 offset 与「画面动了多少」不是一回事——注意**不是**「底部 inset
同时缩掉同样的量就抵消了」：`contentInset` 不参与内容的屏幕位置，它只决定 offset 的合法上界，
offset 掉多少内容就往下走多少。让位移「看不见」的是**参照物同帧同向移动**（收键盘时键盘和
输入框一起退场，内容跟着下来就是正常观感）。所以凡是要下「用户看得见」的结论，都得回到像素：

```bash
agent-device record start out.mp4 --udid <UDID> --max-size 1200 --quality high --hide-touches
pnpm bench:layout --scenario follow-up-turn
agent-device record stop --udid <UDID>
```

`xcrun simctl io recordVideo` 在**多台模拟器同时开着**时会以
`SimRenderServer.SimulatorError Code=2` 失败，这台机器上常年如此，用 agent-device 的 `record`。

量法不要用逐帧互相关：聊天正文是等行距的重复纹理，互相关会锁到行距的整数倍上（实测大量
corr=0.999 的 +11/+22/+33 假位移）。可靠的做法是**盯住一个可识别的元素**——用户气泡是右对齐
的浅灰圆角块，按「右侧区域连续 ≥12 行落在气泡填充灰、且同高度的左侧区域不命中」就能逐帧
定位它的屏幕位置，得到真正的可见位移曲线。

用这个方法读用户报的那段录像（29fps，逐帧真实时间戳来自 `showinfo`，不要假设 fps），
新气泡顶边轨迹是：

| t | 气泡顶(px) | Δ |
| --- | --- | --- |
| 1.570 | 整屏空白 | — |
| 1.603→1.742 | 759 → 754 | -5 / 139ms |
| 1.777 | 652 | **-102，单帧** |
| 1.845 | 652 | 0 |
| 1.880 | 617 | -35 |
| 1.915 | **214** | **-403，单帧** |

不是动画，是几次跳切，而且开头有整屏空白——这正是 `estimate-collapse` 的形态（先按 3012px
的估值滚进空白区，实测 48px 后内容骤缩近 3000px，位置连着重算几次）。该缺陷已修，修后
harness 里 `viewport-blank` 峰值 35-53%（即设计内的预留空白），整片扫描不再出现 100% 空白帧。
