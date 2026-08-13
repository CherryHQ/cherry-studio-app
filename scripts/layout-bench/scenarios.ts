/**
 * 场景定义与坐标表。
 *
 * ## 为什么是硬编码坐标
 * agent-device 读到的无障碍树里，聊天列表与输入框都被 view flattening 抹成匿名节点，
 * `text=` / `id=` 选择器一律 miss（原生导航栏与系统弹窗则正常可见）。所以驱动层只能打坐标。
 * 坐标全部集中在 LAYOUT 里，实测自 iPhone 17 Pro（402×874pt）；换机型必须重量一遍。
 * 若要摆脱坐标，替换 device.ts 为走 RN 组件树的驱动（如 argent）即可，本文件的场景不用动。
 *
 * ## 为什么入口是 deep link
 * 早期版本靠「点话题列表第一行」进入，应用一恢复到别的话题就点空，整轮静默产出零探针。
 * `/topics?assistantId=…` 在没有 topicId 时会落到新建话题界面，并按助手预填模型——于是每轮
 * 都是干净的新话题，且模型必定是基准假模型，不依赖任何既有数据。
 */

export const LAYOUT = {
  /** 输入框（键盘收起时）。 */
  composer: { x: 200, y: 774 },
  /** 发送键（键盘弹起后）。硬件键盘输入也会让软键盘保持弹起，所以位置稳定。 */
  sendWithKeyboard: { x: 358, y: 506 },
  /** 流式期间向下滑动一段，用于制造「手势 vs 程序化滚动」的对抗窗口。 */
  swipeDown: { fromX: 200, fromY: 300, toX: 200, toY: 650 },
} as const;

export const BENCH_ASSISTANT_DEEP_LINK =
  'cherrystudio:///topics?assistantId=layout-bench-assistant';

export type Step =
  | { kind: 'checkpoint'; name: string }
  | { kind: 'deepLink'; url: string }
  | { kind: 'press'; x: number; y: number }
  | { kind: 'send' }
  | { kind: 'swipe'; fromX: number; fromY: number; toX: number; toY: number }
  | { kind: 'type'; text: string }
  | { kind: 'wait'; ms: number };

export type Scenario = {
  description: string;
  id: string;
  /** 被判定的步骤；执行前会清空设备日志。 */
  measure: Step[];
  /** 造场用的步骤，不参与判定。 */
  setup: Step[];
};

function composeAndSend(fixture: string): Step[] {
  return [
    { kind: 'press', ...LAYOUT.composer },
    { kind: 'wait', ms: 1500 },
    { kind: 'type', text: fixture },
    { kind: 'wait', ms: 1200 },
    { kind: 'send' },
  ];
}

function openFreshTopic(): Step[] {
  return [
    { kind: 'deepLink', url: BENCH_ASSISTANT_DEEP_LINK },
    { kind: 'wait', ms: 5000 },
  ];
}

export const SCENARIOS: Scenario[] = [
  {
    description: '空话题里发出第一条消息：钉顶落点、预留空白、slide-in 期间的位移轨迹',
    id: 'send-anchor',
    measure: [
      ...composeAndSend('bench:mixed@40'),
      { kind: 'wait', ms: 1200 },
      { kind: 'checkpoint', name: 'early' },
      { kind: 'wait', ms: 2500 },
      { kind: 'checkpoint', name: 'mid' },
      { kind: 'wait', ms: 6000 },
      { kind: 'checkpoint', name: 'settled' },
    ],
    setup: openFreshTopic(),
  },
  {
    description: '流式过程中用户上滑：手势与尾随滚动的对抗、按钮显隐状态机',
    id: 'stream-scroll',
    measure: [
      ...composeAndSend('bench:mixed@40'),
      { kind: 'wait', ms: 2500 },
      { kind: 'checkpoint', name: 'before-drag' },
      { kind: 'swipe', ...LAYOUT.swipeDown },
      { kind: 'wait', ms: 1500 },
      { kind: 'checkpoint', name: 'after-drag' },
      { kind: 'wait', ms: 5000 },
      { kind: 'checkpoint', name: 'settled' },
    ],
    setup: openFreshTopic(),
  },
  {
    description: '已有长回复的话题里再发一条：新行的估算高度、内容塌陷与钉顶动画的相互作用',
    id: 'follow-up-turn',
    measure: [
      ...composeAndSend('bench:mixed@40'),
      { kind: 'wait', ms: 900 },
      { kind: 'checkpoint', name: 'anchoring' },
      { kind: 'wait', ms: 2000 },
      { kind: 'checkpoint', name: 'streaming' },
      { kind: 'wait', ms: 6000 },
      { kind: 'checkpoint', name: 'settled' },
    ],
    setup: [
      ...openFreshTopic(),
      ...composeAndSend('bench:mixed@40'),
      // 等第一轮完整落地：后一条消息的估算高度取自它，没跑完就发下一条测不出真正的场景。
      { kind: 'wait', ms: 14000 },
    ],
  },
];
