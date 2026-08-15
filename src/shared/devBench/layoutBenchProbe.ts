/**
 * 布局基准的探针通道：把聊天列表的位移、相位与调度事件发成可机器解析的单行 JSON。
 *
 * 为什么不复用 `MessageList` 里已有的 `[SCROLL]` 埋点：那些走 `logger.debug`，而
 * `LoggerService` 的 debug 落到 `console.debug`——实测 `console.debug` **不进 os_log**
 * （同一时刻 info 级正常出现），所以任何基于设备日志采集的 harness 都读不到它们。
 * 探针必须发在 info 级才能被 `agent-device logs` 收走。
 *
 * 为什么默认关闭：`onScroll` 按 `scrollEventThrottle={16}` 每帧一条，正常开发时会把
 * Metro 控制台淹掉。arm 由 `createBenchLanguageModel` 在假模型被创建时触发——basically
 * 「只有跑基准时才开」，且不需要深链接（深链接会被 expo-router 当路由处理，有跳到
 * not-found 的风险）或任何 UI 开关。
 *
 * 载荷刻意压成一行 JSON 而不是走 logger 的结构化参数：harness 用固定前缀正则提取，
 * 多行或对象展开都会让解析变脆。
 */

import { loggerService } from '@/shared/core/logger/LoggerService';

/**
 * harness 按这个前缀从设备日志里捞探针行。前缀由 `withContext` 提供（logger 会把模块名
 * 渲染成 `[LBP] `），所以载荷里不要再重复拼一次。
 */
export const LAYOUT_BENCH_PROBE_PREFIX = '[LBP]';

export type LayoutBenchProbeEvent =
  /** 内容总高变化；`ready` 为真表示遮罩已撤，此后的高度修正会泄漏成可见跳动。 */
  | 'content'
  /** 锚点下方预留空白的实测尺寸。它决定钉顶落点，也是发送瞬间位移突变的第一嫌疑。 */
  | 'endSpace'
  /**
   * 键盘收放。它移动内容却不留下 `content` 或 `viewport` 事件，是唯一无法从其它探针
   * 反推出来的位移来源。带上当时的 `endSpace`：键盘造成**净**位移的充要条件就是「抬起
   * 与收起两次之间预留空白变了」，只记事件不记这个数就判不出来。
   */
  | 'keyboard'
  /**
   * 发送时对键盘驱动的位移补偿所设的闸门（`useKeyboardScrollToEnd` 的 freeze）。
   * 它是 shared value，JS 写入要跨线程才落地，与键盘收起谁先谁后必须能对时才说得清。
   */
  | 'freeze'
  /** 用户交互窗口边界（拖动/惯性/触摸），据此判定「手势期间是否有程序化滚动」。 */
  | 'interaction'
  /** 列表视口尺寸；没有它就无法把 contentLength 换算成「距底还有多远」。 */
  | 'viewport'
  /** 单行尺寸变化，用于统计行高振荡。 */
  | 'itemSize'
  /** 尾随状态机相位切换；不知道相位就无法判定同一条轨迹是合格还是缺陷。 */
  | 'phase'
  /** 程序化滚动的调用点。 */
  | 'progScroll'
  /** 每帧滚动位移轨迹。 */
  | 'scroll'
  /** 「滚动到底部」按钮显隐（值由 UI 线程的 shared value 驱动）。 */
  | 'button'
  /**
   * 入场用户行的飞行：装填（起飞距离）、开火、落定。发送时的可见位移由行自身的 transform
   * 提供而不是靠滚动，所以缺了这条，`scroll` 轨迹在 send-anchor 场景里会平得像什么都没
   * 发生——harness 会对它本来就是为了量的那段运动完全失明。
   */
  | 'slideIn';

type ProbePayload = Record<string, boolean | number | string | undefined>;

const logger = loggerService.withContext('LBP');

let armed = false;

/** 由假模型在创建时调用；一旦 arm 就保持到进程结束。 */
export function armLayoutBenchProbe(): void {
  if (armed) {
    return;
  }

  armed = true;
  logger.info(JSON.stringify({ e: 'armed', t: Date.now() }));
}

export function isLayoutBenchProbeArmed(): boolean {
  return armed;
}

export function emitLayoutBenchProbe(event: LayoutBenchProbeEvent, payload?: ProbePayload): void {
  if (!armed) {
    return;
  }

  logger.info(JSON.stringify({ e: event, t: Date.now(), ...payload }));
}
