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
  /** 位移方向反转的振幅下限。实测非交互期的正常噪声在 ±19px 内，100px 给足余量。 */
  offsetReversalPx: 100,
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

function judgeScrollButtonChatter(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  const toggles = trace.events
    .filter((event) => event.e === 'button')
    .map((event) => event.t - trace.originMs);

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
    metrics: { toggles: toggles.length },
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

/** 把位移轨迹切成同向的单调段，段的振幅是这一段走过的净距离。 */
function toMonotoneRuns(trace: Trace): MonotoneRun[] {
  const runs: MonotoneRun[] = [];
  let direction = 0;
  let current: MonotoneRun | undefined;

  for (let index = 1; index < trace.samples.length; index += 1) {
    const previous = trace.samples[index - 1];
    const sample = trace.samples[index];
    const delta = sample.y - previous.y;
    if (delta === 0) {
      continue;
    }

    const nextDirection = delta > 0 ? 1 : -1;
    if (!current || nextDirection !== direction) {
      current = {
        amplitude: 0,
        endMs: sample.atMs,
        inInteraction: false,
        startMs: previous.atMs,
      };
      runs.push(current);
      direction = nextDirection;
    }

    current.amplitude += delta;
    current.endMs = sample.atMs;
    current.inInteraction ||= sample.inInteraction || previous.inInteraction;
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
  ];
}
