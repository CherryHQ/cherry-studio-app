/**
 * 布局基准（layout bench）的确定性回复夹具。
 *
 * 每个夹具的正文逐字节固定，配合 `chunkText` 的定长切分，保证同一 `bench:` 指令在任意两次
 * 运行里产生**完全相同的 chunk 序列**——布局断言才能把两次运行的差异归因到代码改动，而不是
 * 模型输出的随机性。改动这里的文案等同于改动基准的输入，会让历史运行不可比。
 *
 * 夹具按「渲染形状」而非「话题」组织：布局缺陷（重叠、行高振荡、超宽溢出）由 markdown 的
 * 结构决定，与语义无关。
 */

export const BENCH_FIXTURE_IDS = [
  'code',
  'emoji',
  'list',
  'longline',
  'mixed',
  'reasoning',
  'table',
  'text',
] as const;

export type BenchFixtureId = (typeof BENCH_FIXTURE_IDS)[number];

export type BenchFixture = {
  /** 思考块正文；仅 reasoning 夹具提供，用于驱动 ReasoningPart 的渐进渲染。 */
  reasoning?: string;
  text: string;
};

// 长中文段落：最常见的正文形状，也是行高估算的基线对照组（无 markdown 结构）。
const TEXT_FIXTURE = `移动端的聊天列表要同时满足两件互相拉扯的事：一是新消息到达时视觉焦点不能乱跳，二是流式生长的回复要始终可读。前者要求列表在锚点确定后保持静止，后者要求列表在内容超出视口时持续跟随底部。这两种诉求分别对应钉顶与尾随两种阶段，任何一次阶段判定失误都会表现为用户眼中的「跳动」。

真实设备上的表现还会被测量时机放大。行高在首帧往往是估算值，等到 markdown 解析完成、字体度量回填之后才会修正为真实值。如果这次修正发生在遮罩撤除之后，用户就会看到内容突然位移一段距离；如果它发生在尾随滚动的同一帧，位移还会与滚动叠加，产生更大的视觉突变。

因此布局基准关注的不是某一帧的绝对位置，而是位置随时间变化的连续性。一条平滑单调的轨迹意味着列表行为可预期，而轨迹上的尖峰、回退或振荡，几乎总能对应到一处具体的测量或调度缺陷。把这条轨迹记录下来并自动比对，就把原本依赖肉眼的判断变成了可回归的断言。

段落之间的间距、标点的换行规则、以及连续中文没有空格可断的特性，都会影响最终的行数与高度。基准用固定的文案覆盖这些情况，确保每次运行面对的排版负载完全一致。`;

// 代码块：渲染负载大户，也是高度估算最容易失准的形状（等宽字体 + 横向滚动 + 语法高亮）。
const CODE_FIXTURE = `下面是尾随滚动的调度逻辑，注意其中的交互锁与 rAF 合并：

\`\`\`typescript
const scheduleTailFollow = useCallback(() => {
  if (
    tailFollowPhaseRef.current !== 'following' ||
    isUserInteractingRef.current ||
    pendingTailFollowFrameRef.current !== null
  ) {
    return;
  }

  pendingTailFollowFrameRef.current = requestAnimationFrame(() => {
    pendingTailFollowFrameRef.current = null;

    // rAF 内重新检查：拖动可能在这一帧之前刚刚开始。
    if (tailFollowPhaseRef.current !== 'following' || isUserInteractingRef.current) {
      return;
    }

    const nativeScrollRef = listRef.current?.getNativeScrollRef();
    nativeScrollRef?.scrollToEnd?.({ animated: false });
  });
}, [listRef]);
\`\`\`

关键在于两次检查：调度时检查一次，执行时再检查一次。只有第一次检查会漏掉「调度后、执行前」这段窗口内开始的手势，而这恰好是最容易产生冲突的时机。

\`\`\`python
def detect_jump(trajectory, threshold=8.0):
    """在滚动轨迹上找出非连续的位移突变。"""
    jumps = []
    for prev, curr in zip(trajectory, trajectory[1:]):
        delta = abs(curr.offset - prev.offset)
        gap = curr.timestamp - prev.timestamp
        if delta > threshold and gap < 34:
            jumps.append((prev.timestamp, delta))
    return jumps
\`\`\`

判定阈值需要区分「一帧内的突变」和「跨越多帧的平滑滚动」，所以时间间隔也要参与判断。`;

// 深嵌套列表：逐级缩进 + 行内代码，考验行高与左侧留白的一致性。
const LIST_FIXTURE = `布局基准覆盖的判据分为两族：

1. **静态判据**——在某一时刻的快照上即可判定
   - 消息气泡两两重叠
     - 常见成因是子视图欠测量，父容器拿到偏小的高度
     - 也可能来自 \`SwiftUI\` 宿主视图的竖向自适应失败
   - 内容被固定装饰遮挡
     - 顶部：导航栏与安全区
     - 底部：输入框、工具栏、标签栏
   - 元素越出容器边界
   - 相邻消息间距异常
2. **动态判据**——需要一段时间序列才能判定
   - 流式期间的位移突变
     - 钉顶阶段：位移应当保持静止
     - 尾随阶段：位移应当单调跟随内容增长
   - 手势与程序化滚动的冲突
   - 悬浮按钮的显隐状态机
     - 距底超过阈值时出现
     - 点击后跳到底部并隐藏
     - 内容继续增长把用户甩离底部后重新出现
3. **两者的边界**
   - 行高振荡既能在快照上看到，也需要时间序列才能确认它在「反复」变化

每一条判据都对应一个可量化的信号，没有任何一条依赖肉眼比对。`;

// 表格：固有宽度可能超出视口，考验横向滚动容器与外层气泡的宽度协商。
const TABLE_FIXTURE = `各阶段的期望行为对照如下：

| 阶段 | 触发条件 | 位移期望 | MVCP | 违规特征 |
| --- | --- | --- | --- | --- |
| anchoring | 新用户消息进入 | 钉顶一次后静止 | 启用（排除 pending 助手行） | 钉顶的用户消息被顶下去 |
| following | 预留空白被回复填满 | 单调跟随内容底部 | 停用 | 该跟未跟，或跟随过冲后回弹 |
| paused | 用户开始拖动或触摸 | 完全由手势决定 | 启用 | 出现程序化滚动，与手势打架 |

补充说明：

| 信号 | 采集点 | 频率 |
| --- | --- | --- |
| 滚动位移 | \`onScroll\` | 每帧（throttle 16） |
| 内容高度 | \`onContentSizeChange\` | 变化时 |
| 阶段切换 | 尾随状态机 | 变化时 |
| 行几何 | \`onLayout\` | 变化时 |

表格的列宽由内容决定，因此这个夹具同时也在测「超出视口宽度时是否横向溢出」。`;

// 超长不可断单行：URL 与连续 token 无处换行，最容易撑破气泡宽度。
const LONGLINE_FIXTURE = `下面这些都是无法在中间断开的长串，用于检验气泡宽度约束：

https://example.com/api/v1/streaming/chat/completions?model=layout-bench-mock&temperature=0&max_tokens=4096&stream=true&trace_id=0123456789abcdef0123456789abcdef&session=aaaaaaaabbbbbbbbccccccccdddddddd

裸 token：ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789

行内代码：\`const veryLongIdentifierThatCannotBeBrokenAcrossLines = createLayoutBenchmarkHarnessConfiguration(options)\`

文件路径：/Users/runner/work/cherry-studio-app/src/frontend/components/messagePresentation/components/ScrollToBottomButton/ScrollToBottomButton.tsx

这些串如果没有被正确约束，会把消息气泡撑到视口之外，表现为整行内容右侧被截断或整个列表出现横向滚动。`;

// emoji 混排：字形高度与基线对齐，容易让同一行的行高在字体回填后发生变化。
const EMOJI_FIXTURE = `测试执行状态 🚀 正在推进中：

- ✅ 钉顶阶段位移静止
- ✅ 尾随阶段单调跟随
- ⚠️ 手势窗口内检测到一次程序化滚动
- ❌ 行高在流式期间振荡了 4 次
- 🔍 悬浮按钮显隐切换 6 次，超过阈值

混排段落：这是中文 🎯 与 emoji 🎨 交替出现的一段文字 🌈 用来检验行高是否稳定 ⚡️ 因为 emoji 的字形度量往往在字体回填之后才确定 🧩 如果此时行高发生变化 📐 整块内容就会向下位移 📉 表现为用户眼中的跳动 💥

组合字形：👨‍👩‍👧‍👦 👩🏽‍💻 🏳️‍🌈 🧑🏻‍🚀 这些由多个码位组成的字形在不同渲染路径下宽度可能不一致 🔬

结尾再放一组 🎉🎊✨🌟💫⭐️🌠 连续 emoji，检验它们是否被当作一个不可断的整体。`;

// 思考块：ReasoningPart 先于正文流入，考验「思考中 → 正文」切换时的高度 settle。
const REASONING_FIXTURE = `综合来看，尾随阶段的位移应当与内容高度的增长保持同步，两条曲线的差值即为「跟随滞后」。当滞后超过阈值时，用户会看到回复的最后一行被输入框遮住；当差值为负时，说明滚动越过了内容底部，回弹会表现为一次明显的抖动。

因此判据应当同时约束滞后的上界和下界，而不是只检查「是否滚到了底部」。`;

const REASONING_THINKING = `先确认当前处于哪个阶段。用户刚发送消息时进入钉顶阶段，此时预留空白还没有被填满，位移应当保持静止。

等到回复的高度超过预留空白，预留空白收缩为零，阶段切换到尾随。这时每一次消息更新都会触发一次滚动到底部。

所以判断「该不该跟随」必须先知道阶段，光看位移轨迹无法区分「钉顶阶段的正确静止」和「尾随阶段的错误停滞」——两者在轨迹上是同一条水平线。

结论：阶段必须作为独立信号记录下来。`;

// 混合夹具：把上述形状串在一条回复里，模拟真实长回复的复合渲染负载。
const MIXED_FIXTURE = `${TEXT_FIXTURE}

${CODE_FIXTURE}

${LIST_FIXTURE}

${TABLE_FIXTURE}`;

export const BENCH_FIXTURES: Record<BenchFixtureId, BenchFixture> = {
  code: { text: CODE_FIXTURE },
  emoji: { text: EMOJI_FIXTURE },
  list: { text: LIST_FIXTURE },
  longline: { text: LONGLINE_FIXTURE },
  mixed: { text: MIXED_FIXTURE },
  reasoning: { reasoning: REASONING_THINKING, text: REASONING_FIXTURE },
  table: { text: TABLE_FIXTURE },
  text: { text: TEXT_FIXTURE },
};

export function isBenchFixtureId(value: string): value is BenchFixtureId {
  return (BENCH_FIXTURE_IDS as readonly string[]).includes(value);
}
