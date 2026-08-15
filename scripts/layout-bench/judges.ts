/**
 * 布局判据集。
 *
 * 每条判据都能指出「哪一帧、什么量、超了多少」，而不是给一个笼统的通过/失败——诊断形态和
 * 回归形态共用同一份输出。阈值全部集中在 THRESHOLDS，且注释里写清它是怎么量出来的：拍脑袋
 * 定的阈值会让整套断言失去说服力。
 */

import type { ProbeEvent, TailFollowPhase, Trace } from './probe';

export type Violation = {
  atMs: number;
  detail: Record<string, number | string | boolean>;
  judge: string;
  message: string;
  phase: TailFollowPhase;
};

export type JudgeReport = {
  description: string;
  judge: string;
  /** 判据本身能给出的统计量，即使零违规也值得记录（用于 A/B 对比）。 */
  metrics: Record<string, number>;
  violations: Violation[];
};

export const THRESHOLDS = {
  /** 内容总高回缩多少像素算「内容塌陷」。实测正常流式只增不减，8px 留给取整噪声。 */
  contentShrinkPx: 8,
  /**
   * 单行「估算高度 → 实测高度」的修正上限。pending 助手行曾按 assistant 均值估成 3012px
   * 实测只有 48px（差 2964px），一帧内内容少掉近 3000px。400px 足以放过正常的流式增长
   * 批次（实测单批最大 93px）而抓住估值级别的错位。
   */
  estimateCorrectionPx: 400,
  /**
   * 切分单调段时忽略多大的回撤。动画收尾会在目标值附近来回蹭几像素（实测 5-6px），
   * 不过滤就会把一整段爬升切成碎片，「两腿取短」随即取到碎片长度而不是真正的返程。
   */
  offsetNoisePx: 8,
  /** 位移方向反转的振幅下限。实测非交互期的正常噪声在 ±19px 内，100px 给足余量。 */
  offsetReversalPx: 100,
  /**
   * 手势结束后仍算「用户造成的」余波时长。松手后惯性还要跑一段，位移与随之而来的按钮显隐
   * 都是这次手势的后果。实测一次上滑的惯性在 600ms 内收敛。
   */
  interactionEchoMs: 800,
  /** 单行高度回缩下限，同 contentShrinkPx。 */
  rowShrinkPx: 8,
  /** 「滚动到底部」按钮在 1 秒窗口内允许的最大显隐翻转次数。 */
  scrollButtonTogglesPerSecond: 2,
  /** 视口落在内容之外的比例上限。预留空白按设计最多占一屏，实测钉顶后稳态为 40%。 */
  viewportBlankFraction: 0.6,
  /** 视口空白超限需持续多久才算可见缺陷（毫秒）。单帧过冲不计。 */
  viewportBlankSustainMs: 100,
} as const;

function readNumber(event: ProbeEvent, key: string): number | undefined {
  const value = event[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * 「滚动到底部」只在用户自己离开底部时才该出现。钉顶与尾随两个相位由 app 主动把列表推向
 * 底部，此时 isAtEnd 会随内容增长逐帧翻转，按钮跟着脉动即为缺陷。
 */
function judgeScrollButtonPhase(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  const toggles = trace.events.filter((event) => event.e === 'button');

  for (const event of toggles) {
    const atMs = event.t - trace.originMs;
    const phase = trace.phaseAt(atMs);
    // 只有「不该出现时出现」是缺陷；翻转成隐藏本就是这两个相位的期望状态。
    if (phase === 'paused' || event.visible !== true) {
      continue;
    }

    violations.push({
      atMs,
      detail: { phase },
      judge: 'scroll-button-phase',
      message: `按钮在 ${phase} 相位显示出来；该相位由 app 驱动滚动，按钮应始终隐藏`,
      phase,
    });
  }

  return {
    description: '「滚动到底部」按钮只允许在 paused 相位改变显隐',
    judge: 'scroll-button-phase',
    metrics: { toggles: toggles.length },
    violations,
  };
}

/**
 * 「以帧为周期脉动」才是缺陷；用户自己拖动引发的显隐不是。
 *
 * 一次上滑天然会翻两次（离开底部→显示、惯性回到底部→隐藏），滑动前后各带一次就到 4 次，
 * 正好压在 1 秒窗口的边界上——同一 commit 连跑三轮实测到 2/4/2 次，判据因此间歇性变红。
 * 一个会自己 flake 的判据当不了回归基线：把手势窗口（及其惯性余波）内的翻转排除掉，
 * 剩下的才是「app 自己在抖」。
 */
function judgeScrollButtonChatter(trace: Trace): JudgeReport {
  const isUserDriven = (atMs: number) =>
    trace.interactionWindows.some(
      (window) => atMs >= window.start && atMs <= window.end + THRESHOLDS.interactionEchoMs,
    );

  const violations: Violation[] = [];
  const all = trace.events
    .filter((event) => event.e === 'button')
    .map((event) => event.t - trace.originMs);
  const toggles = all.filter((at) => !isUserDriven(at));

  for (let index = 0; index < toggles.length; index += 1) {
    const windowEnd = toggles[index] + 1000;
    const inWindow = toggles.filter((at) => at >= toggles[index] && at <= windowEnd);
    if (inWindow.length <= THRESHOLDS.scrollButtonTogglesPerSecond) {
      continue;
    }

    violations.push({
      atMs: toggles[index],
      detail: { count: inWindow.length, windowMs: 1000 },
      judge: 'scroll-button-chatter',
      message: `1 秒内按钮翻转 ${inWindow.length} 次，超过 ${THRESHOLDS.scrollButtonTogglesPerSecond} 次上限`,
      phase: trace.phaseAt(toggles[index]),
    });
    // 同一簇抖动只报一次。
    break;
  }

  return {
    description: '按钮显隐不得以帧为周期脉动',
    judge: 'scroll-button-chatter',
    // 两个数都留：只报净值时看不出「这一轮到底有没有手势」，跨轮对比会莫名其妙。
    metrics: { toggles: toggles.length, userDrivenToggles: all.length - toggles.length },
    violations,
  };
}

/** 手势期间列表完全交给用户，任何程序化滚动都是竞态。按钮自身触发的滚动不算。 */
function judgeGestureConflict(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  let programmaticScrolls = 0;

  for (const event of trace.events) {
    if (event.e !== 'progScroll' || event.src === 'button') {
      continue;
    }

    programmaticScrolls += 1;
    const atMs = event.t - trace.originMs;
    const window = trace.interactionWindows.find(
      (candidate) => atMs >= candidate.start && atMs <= candidate.end,
    );
    if (!window) {
      continue;
    }

    violations.push({
      atMs,
      detail: {
        src: typeof event.src === 'string' ? event.src : 'unknown',
        windowStartMs: window.start,
      },
      judge: 'gesture-conflict',
      message: `手势窗口内出现程序化滚动（${String(event.src)}）`,
      phase: trace.phaseAt(atMs),
    });
  }

  return {
    description: '用户手势窗口内不得有程序化滚动',
    judge: 'gesture-conflict',
    metrics: {
      interactionWindows: trace.interactionWindows.length,
      programmaticScrolls,
    },
    violations,
  };
}

type MonotoneRun = {
  amplitude: number;
  endMs: number;
  inInteraction: boolean;
  startMs: number;
};

/**
 * 把位移轨迹切成同向的单调段，段的振幅是这一段走过的净距离。
 *
 * 换向必须超过 `offsetNoisePx` 才算换向，否则动画收尾在目标值附近蹭的那几像素会把一整段
 * 爬升切成碎片。这不是理论洁癖：实测一次 616px 的钉顶爬升被中途一个 5px 的回撤切开，
 * 「两腿取短」于是拿到 88px，前面那条 310px 的突跳就此被判成合格——判据漏掉了自己被造
 * 出来要抓的那个缺陷。
 */
function toMonotoneRuns(trace: Trace): MonotoneRun[] {
  const runs: MonotoneRun[] = [];
  const [first] = trace.samples;
  if (!first) {
    return runs;
  }

  let direction = 0;
  let start = first;
  // 当前段走到过的最远点。换向幅度按「离开极值多远」算，而不是按逐帧 delta——后者无法
  // 区分「连着三帧各退 3px」（累计 9px 的真回撤）与「单帧抖 3px」。
  let extreme = first;
  let inInteraction = first.inInteraction;

  for (const sample of trace.samples.slice(1)) {
    inInteraction ||= sample.inInteraction;
    const delta = sample.y - extreme.y;

    if (direction === 0) {
      if (Math.abs(delta) >= THRESHOLDS.offsetNoisePx) {
        direction = delta > 0 ? 1 : -1;
        extreme = sample;
      }
      continue;
    }

    if (Math.sign(delta) === direction) {
      extreme = sample;
      continue;
    }

    if (Math.abs(delta) < THRESHOLDS.offsetNoisePx) {
      continue;
    }

    runs.push({
      amplitude: extreme.y - start.y,
      endMs: extreme.atMs,
      inInteraction,
      startMs: start.atMs,
    });
    start = extreme;
    direction = -direction;
    extreme = sample;
    inInteraction = sample.inInteraction;
  }

  if (direction !== 0) {
    runs.push({
      amplitude: extreme.y - start.y,
      endMs: extreme.atMs,
      inInteraction,
      startMs: start.atMs,
    });
  }

  return runs;
}

/**
 * 非交互期的「往返」= 用户没动手，画面先走一段又自己弹回来，也就是肉眼说的跳动。
 *
 * 判据取**两腿中较短的那一条**作为跳动幅度，而不是反转前那一段的长度：钉顶动画本身就是
 * 一段几百像素的单调位移，若拿它的长度当幅度，正常动画末尾几像素的回弹也会被报成几百
 * 像素的跳动。较短腿才是「多走了又收回来」的那部分。
 */
function judgeOffsetReversal(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  const runs = toMonotoneRuns(trace);
  let maxBounce = 0;

  for (let index = 1; index < runs.length; index += 1) {
    const first = runs[index - 1];
    const second = runs[index];
    if (first.inInteraction || second.inInteraction) {
      continue;
    }

    const bounce = Math.min(Math.abs(first.amplitude), Math.abs(second.amplitude));
    maxBounce = Math.max(maxBounce, bounce);
    if (bounce < THRESHOLDS.offsetReversalPx) {
      continue;
    }

    violations.push({
      atMs: second.startMs,
      detail: {
        backPx: Math.round(Math.abs(second.amplitude)),
        bouncePx: Math.round(bounce),
        durationMs: Math.round(second.endMs - first.startMs),
        outPx: Math.round(Math.abs(first.amplitude)),
      },
      judge: 'offset-reversal',
      message: `非交互期位移往返 ${Math.round(bounce)}px（去 ${Math.round(Math.abs(first.amplitude))}px / 回 ${Math.round(Math.abs(second.amplitude))}px）`,
      phase: trace.phaseAt(second.startMs),
    });
  }

  return {
    description: '用户未操作时列表不得自行反向弹动',
    judge: 'offset-reversal',
    metrics: { maxBouncePx: Math.round(maxBounce), samples: trace.samples.length },
    violations,
  };
}

/**
 * 视口落在内容末端之外的比例。钉顶设计本就会露出预留空白（实测稳态 40%），但整屏空白
 * 意味着列表滚过了没有渲染内容的区域——这正是「发送后内容消失一下」的可量化形态。
 */
function judgeViewportBlank(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  let maxBlank = 0;
  let breachStart: number | undefined;

  for (const sample of trace.samples) {
    maxBlank = Math.max(maxBlank, sample.blankFraction);

    if (sample.blankFraction > THRESHOLDS.viewportBlankFraction) {
      breachStart ??= sample.atMs;
      continue;
    }

    if (breachStart !== undefined) {
      const durationMs = sample.atMs - breachStart;
      if (durationMs >= THRESHOLDS.viewportBlankSustainMs) {
        violations.push({
          atMs: breachStart,
          detail: { durationMs: Math.round(durationMs), peakFraction: Number(maxBlank.toFixed(2)) },
          judge: 'viewport-blank',
          message: `视口有超过 ${Math.round(THRESHOLDS.viewportBlankFraction * 100)}% 落在内容之外，持续 ${Math.round(durationMs)}ms`,
          phase: sample.phase,
        });
      }
      breachStart = undefined;
    }
  }

  return {
    description: '视口不得长时间停在内容之外',
    judge: 'viewport-blank',
    metrics: { maxBlankPercent: Math.round(maxBlank * 100) },
    violations,
  };
}

function judgeContentShrink(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  let previousHeight: number | undefined;
  let shrinks = 0;

  for (const event of trace.events) {
    if (event.e !== 'content') {
      continue;
    }

    const height = readNumber(event, 'h');
    if (height === undefined) {
      continue;
    }

    if (previousHeight !== undefined && previousHeight - height > THRESHOLDS.contentShrinkPx) {
      shrinks += 1;
      const atMs = event.t - trace.originMs;
      violations.push({
        atMs,
        detail: { fromPx: previousHeight, shrinkPx: previousHeight - height, toPx: height },
        judge: 'content-shrink',
        message: `内容总高回缩 ${previousHeight - height}px`,
        phase: trace.phaseAt(atMs),
      });
    }

    previousHeight = height;
  }

  return {
    description: '流式期间内容总高只应增长',
    judge: 'content-shrink',
    metrics: { shrinks },
    violations,
  };
}

function judgeRowShrink(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  const measured = new Set<string>();
  let shrinks = 0;

  for (const event of trace.events) {
    if (event.e !== 'itemSize') {
      continue;
    }

    const previous = readNumber(event, 'prev');
    const size = readNumber(event, 'size');
    const key = typeof event.key === 'string' ? event.key : '';
    if (previous === undefined || size === undefined) {
      continue;
    }

    // 某行的第一条 itemSize 是「估算 → 首次实测」，prev 是估算值不是量出来的高度，
    // 拿它算「行变矮」必然误报（estimatedItemSize=300 的行首测 48px 就是一例）。
    // 估值错位归 estimate-collapse 判据管。
    const firstMeasurement = !measured.has(key);
    measured.add(key);
    if (firstMeasurement) {
      continue;
    }

    const drop = previous - size;
    if (drop <= THRESHOLDS.rowShrinkPx) {
      continue;
    }

    shrinks += 1;
    const atMs = event.t - trace.originMs;
    violations.push({
      atMs,
      detail: { index: readNumber(event, 'index') ?? -1, shrinkPx: drop },
      judge: 'row-shrink',
      message: `消息行高度回缩 ${drop}px`,
      phase: trace.phaseAt(atMs),
    });
  }

  return {
    description: '消息行高度不应在流式期间变矮',
    judge: 'row-shrink',
    metrics: { shrinks },
    violations,
  };
}

/**
 * 估值崩塌：列表先按同类行的尺寸均值给新行占位，实测后一次性修正掉几百上千像素。
 * 这类修正发生在贴底时会把列表推离末端并触发补偿滚动，是发送瞬间跳动的直接来源。
 */
function judgeEstimateCollapse(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  const measured = new Set<string>();
  let maxCorrection = 0;

  for (const event of trace.events) {
    if (event.e !== 'itemSize') {
      continue;
    }

    const previous = readNumber(event, 'prev');
    const size = readNumber(event, 'size');
    const key = typeof event.key === 'string' ? event.key : '';
    if (previous === undefined || size === undefined) {
      continue;
    }

    // 只看每行的首次实测：那一刻的 prev 才是列表用来占位的估算值。之后的变化是内容
    // 真的在长，不是估错了。
    const firstMeasurement = !measured.has(key);
    measured.add(key);
    if (!firstMeasurement) {
      continue;
    }

    const correction = Math.abs(previous - size);
    maxCorrection = Math.max(maxCorrection, correction);
    if (correction < THRESHOLDS.estimateCorrectionPx) {
      continue;
    }

    const atMs = event.t - trace.originMs;
    violations.push({
      atMs,
      detail: {
        correctionPx: correction,
        estimatedPx: previous,
        index: readNumber(event, 'index') ?? -1,
        measuredPx: size,
      },
      judge: 'estimate-collapse',
      message: `行高从估算的 ${previous}px 修正到实测 ${size}px（差 ${correction}px）`,
      phase: trace.phaseAt(atMs),
    });
  }

  return {
    description: '新行的估算高度不得与实测高度相差过大',
    judge: 'estimate-collapse',
    metrics: { maxCorrectionPx: maxCorrection },
    violations,
  };
}

/**
 * 发送后的可见位移由入场行自身的 transform 提供，不是滚动，所以 `scroll` 轨迹对它是平的。
 * 这条判据盯的是这段运动的两个真实失效形态：
 *
 * - **装填了却没开火**：行被预置在起飞点后要等钉顶落位才收敛，那一刻若永远不来，消息就
 *   永久停在输入框上方、既不在落点也不跟随内容。
 * - **起飞距离为零**：入场从此看不见。这正是重构前第一条消息的老毛病（可滚动距离恒为 0，
 *   滚动动画演不出任何东西），换成 transform 之后若几何算错就会原样复发。
 */
function judgeSlideInFlight(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  const armedAtMs: number[] = [];
  let launches = 0;
  let settles = 0;
  let maxTravel = 0;
  let maxArmToLaunchMs = 0;

  for (const event of trace.events) {
    if (event.e !== 'slideIn') {
      continue;
    }

    const atMs = event.t - trace.originMs;

    if (event.phase === 'arm') {
      maxTravel = Math.max(maxTravel, readNumber(event, 'travel') ?? 0);
      armedAtMs.push(atMs);
      continue;
    }

    // 起飞距离在 launch 上判而不是在 arm 上：探针由假模型在构造时打开，而那晚于装填，
    // 首轮的 arm 事件因此根本收不到。只认 arm 的话这条判据在 send-anchor 场景里恒绿。
    if (event.phase === 'launch') {
      const travel = readNumber(event, 'travel') ?? 0;
      maxTravel = Math.max(maxTravel, travel);
      launches += 1;

      const pendingArmAtMs = armedAtMs.shift();
      if (pendingArmAtMs !== undefined) {
        maxArmToLaunchMs = Math.max(maxArmToLaunchMs, atMs - pendingArmAtMs);
      }

      if (travel <= 0) {
        violations.push({
          atMs,
          detail: { travelPx: travel },
          judge: 'slide-in-flight',
          message: '入场行起飞距离为 0，这一条不会有可见的入场动画',
          phase: trace.phaseAt(atMs),
        });
      }

      continue;
    }

    if (event.phase === 'settle') {
      settles += 1;
    }
  }

  for (const atMs of armedAtMs) {
    violations.push({
      atMs,
      detail: { armedAtMs: atMs },
      judge: 'slide-in-flight',
      message: '入场行装填后没有开火，消息会停在输入框上方',
      phase: trace.phaseAt(atMs),
    });
  }

  return {
    description: '每条入场消息都要装填、开火，且起飞距离非零',
    judge: 'slide-in-flight',
    // settles 只做记录不设断言：连发时上一次弹簧被新的一次取消是正常的。
    metrics: { launches, maxArmToLaunchMs, maxTravelPx: maxTravel, settles },
    violations,
  };
}

export function runJudges(trace: Trace): JudgeReport[] {
  return [
    judgeScrollButtonPhase(trace),
    judgeScrollButtonChatter(trace),
    judgeGestureConflict(trace),
    judgeOffsetReversal(trace),
    judgeViewportBlank(trace),
    judgeContentShrink(trace),
    judgeRowShrink(trace),
    judgeEstimateCollapse(trace),
    judgeSlideInFlight(trace),
  ];
}
