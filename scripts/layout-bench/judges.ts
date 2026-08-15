/**
 * 布局判据集。
 *
 * 每条判据都能指出「哪一帧、什么量、超了多少」，而不是给一个笼统的通过/失败——诊断形态和
 * 回归形态共用同一份输出。阈值全部集中在 THRESHOLDS，且注释里写清它是怎么量出来的：拍脑袋
 * 定的阈值会让整套断言失去说服力。
 */

import type { ProbeEvent, ScrollSample, TailFollowPhase, Trace } from './probe';

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
   * 尾随期一次位移多大算「跃过」。正文按整行阶跃长高（行高 20px），两行是肉眼能分辨出
   * 「刚才跳了一段」而不是「一直在走」的下限。尾随若真在匀速推进，单次采样间隔（实测约
   * 两帧）内只会走 25px 上下，够不到这个门。
   */
  followStepPx: 40,
  /**
   * 「跃过」承担了多少比例的总位移。这是本判据的主断言，因为它在三场景、三轮之间最稳：
   * 恒等跟随（`scrollToEnd` 逐次贴死底部）实测 67/68/72/82%，逐帧逼近实测 3/5/7%，
   * 中间空出一整个数量级。逐帧位移的百分位同样能分开两者（p50 从 0px 变成 5-11px），
   * 但它依赖 rAF 当时被 JS 线程挤成什么样，轮与轮之间浮动更大，只适合做诊断。
   * 留 30% 是给手势暂停后回底的追赶和稀疏采样的余量。
   */
  followBigStepSharePercent: 30,
  /**
   * 少于这么多个尾随样本就只出 metrics 不断言。百分位在个位数样本上没有意义，而尾随
   * 时长本就随模型吐字速度浮动，短轨迹变红只会是噪声。
   */
  followMinSamples: 12,
  /**
   * 进入尾随后这段时间不计入节奏统计。锚定期结束的那一刻列表未必已经贴底——预留空白刚
   * 耗尽、内容第一次超出视口——逼近器要先把这段欠账追平。实测 `stream-scroll` 一轮里三次
   * ≥40px 的位移全部落在进入 following 后 36/73/137ms，对应 160~230px 的欠账，形状是标准的
   * 指数收敛而不是阶跃。**这是接管，不是跟随的节奏**，判据问的是追平之后走得匀不匀。
   * 300ms 足够追平这个量级（每帧 30%、实测采样 ~50Hz），又短到抓得住稳态里的跳——贴死底部
   * 那版的 34 次跃过散布在整整 3 秒里，扣掉头 300ms 依然满屏。
   */
  followWarmupMs: 300,
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
  /**
   * 视口里既没有内容、也不由钉顶预留空白解释的比例上限（`blankFraction` 已扣掉 endSpace，
   * 见 `probe.ts`）。79 条历史轨迹重放后健康带是 0–10%，取 2 倍余量；唯一越界的样本是键盘
   * 补丁前的 `exp2/follow-up-turn`，峰值 35%＝310px——正是那次补丁修掉的量。
   */
  viewportBlankFraction: 0.2,
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

function percentile(ascending: number[], fraction: number): number {
  if (ascending.length === 0) {
    return 0;
  }

  return ascending[Math.min(ascending.length - 1, Math.floor(ascending.length * fraction))];
}

/** 切分尾随连续段的空档下限。尾随期正常采样间隔在 25~33ms，这么长的缝只会是相位切换留的。 */
const FOLLOW_SEGMENT_GAP_MS = 100;

export type FollowStep = {
  atMs: number;
  /** 这一步算不算进 follow-cadence 的统计。 */
  counted: boolean;
  dy: number;
  fromMs: number;
  /** 两端任一落在手势窗口内。手指拉出来的负位移不是「列表自己往回弹」。 */
  inInteraction: boolean;
};

/**
 * 相邻两次滚动采样之间的位移，附带「这一步算不算数」。
 *
 * 判据只吃 `counted` 的那些；轨迹图两种都画，否则回答不了「这根柱子这么高，判据怎么没红」。
 * 两边共用同一份筛选，图上的柱子和摘要里的数字才不会各说各话。
 */
export function collectFollowSteps(trace: Trace): FollowStep[] {
  // 惯性余波里的位移是上一次手势的后果，速度天然远高于尾随；不排除掉，判据量的就是甩动
  // 的手感而不是跟随的节奏。
  const isUserDriven = (atMs: number) =>
    trace.interactionWindows.some(
      (window) => atMs >= window.start && atMs <= window.end + THRESHOLDS.interactionEchoMs,
    );

  // 每次进入尾随都要重新追平一次（一轮里可能有多次：手势暂停后回到底部也算）。
  const followStartsMs = trace.events
    .filter((event) => event.e === 'phase' && event.phase === 'following')
    .map((event) => event.t - trace.originMs);
  const isWarmingUp = (atMs: number) =>
    followStartsMs.some((startMs) => atMs >= startMs && atMs < startMs + THRESHOLDS.followWarmupMs);

  const steps: FollowStep[] = [];

  for (let index = 1; index < trace.samples.length; index += 1) {
    const previous = trace.samples[index - 1];
    const current = trace.samples[index];
    const dy = current.y - previous.y;

    steps.push({
      atMs: current.atMs,
      // 只统计尾随期向下追的那一半：回退归 offset-reversal 管，混进来会把分布压平。
      counted:
        previous.phase === 'following' &&
        current.phase === 'following' &&
        current.atMs > previous.atMs &&
        dy > 0 &&
        !isUserDriven(previous.atMs) &&
        !isWarmingUp(previous.atMs),
      dy,
      fromMs: previous.atMs,
      inInteraction: previous.inInteraction || current.inInteraction,
    });
  }

  return steps;
}

/**
 * 尾随期的位移该不该匀速——「流式很顺，但滚动一顿一顿」的可量化形态。
 *
 * 别的判据问的都是「有没有走错地方」（往回弹、滚进空白、内容塌陷），这条问的是**同一段
 * 正确的位移走得匀不匀**。两者会同时全绿又同时不好看：恒等跟随的落点每一帧都正确，只是
 * 把内容的阶跃原样复制成了滚动。
 *
 * 量在**实际 offset 轨迹**（scroll 探针）上，而不是跟随调用的落点：落点是实现细节，换一种
 * 跟随策略语义就变了，A/B 两侧不可比；offset 是用户真正看到的东西，两侧定义完全相同。
 *
 * 断言的是「跃过承担了多少位移」这个**份额**，因为它是这里唯一不受采样率影响的量。
 *
 * 这条判据的全部难处都在采样率上：`scroll` 探针经 `runOnJS` 回抛，采样率因此被 JS 线程钳住，
 * 实测三代实现分别只有 30 / 37 / 41Hz——显示是 120Hz，探针一次都没够到过。于是
 *
 * - 速度百分位**反着动**：采得越密 Δt 越小，`Δy/Δt` 被时间戳量化噪声顶爆（贴死底部 1600px/s、
 *   逐帧逼近 3200px/s，越改越"差"）。
 * - 逐帧栅格更糟：按 120Hz 铺开算"静止帧占比"，量到的其实是探针漏了多少帧，三代实现分别
 *   81 / 65 / 68%——UI 线程版明明每个显示帧都在动，数字却和 JS 版一样。**探针跑在被测量的
 *   那条线程上，它测不了自己**。两个指标都已删掉，别再加回来。
 *
 * 份额是相对量，采样疏密同时作用于分子分母，因此留得住：三代实现 67~82% → 0~13% → 0%。
 * `maxStepPx` 与 `p90StepPx` 有偏（采得越密值越小）但方向没错，留作诊断，跨版本读它们时
 * 必须连 `sampleRateHz` 一起看。
 */
function judgeFollowCadence(trace: Trace): JudgeReport {
  const steps = collectFollowSteps(trace).filter((step) => step.counted);

  const violations: Violation[] = [];
  const stepPixels = steps.map((step) => step.dy).sort((left, right) => left - right);
  // 采样率＝min(offset 真正变了多少次, JS 线程回抛得过来多少)。贴死底部时是前者卡着
  // （offset 只在内容变化时跳），逐帧逼近时是后者卡着。它是读上面两个位移量的前提。
  const gaps = steps
    .map((step) => step.atMs - step.fromMs)
    .filter((gap) => gap > 0 && gap < FOLLOW_SEGMENT_GAP_MS);
  const meanGapMs = gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  const totalPx = steps.reduce((sum, step) => sum + step.dy, 0);
  const bigSteps = steps.filter((step) => step.dy >= THRESHOLDS.followStepPx);
  const bigStepPx = bigSteps.reduce((sum, step) => sum + step.dy, 0);
  const biggest = steps.reduce<(typeof steps)[number] | undefined>(
    (best, step) => (best === undefined || step.dy > best.dy ? step : best),
    undefined,
  );
  const sharePercent = totalPx > 0 ? Math.round((bigStepPx / totalPx) * 100) : 0;

  if (
    steps.length >= THRESHOLDS.followMinSamples &&
    sharePercent > THRESHOLDS.followBigStepSharePercent
  ) {
    const atMs = biggest?.atMs ?? steps[0].atMs;
    violations.push({
      atMs,
      detail: {
        bigStepSharePercent: sharePercent,
        bigSteps: bigSteps.length,
        maxStepPx: Math.round(biggest?.dy ?? 0),
        p90StepPx: Math.round(percentile(stepPixels, 0.9)),
        samples: steps.length,
      },
      judge: 'follow-cadence',
      message: `${bigSteps.length}/${steps.length} 次位移 ≥${THRESHOLDS.followStepPx}px，承担了尾随总位移的 ${sharePercent}%（最大单次 ${Math.round(biggest?.dy ?? 0)}px，p90 ${Math.round(percentile(stepPixels, 0.9))}px）`,
      phase: trace.phaseAt(atMs),
    });
  }

  return {
    description: '尾随期的位移要匀速推进，而不是把内容的整行阶跃原样复制成滚动',
    judge: 'follow-cadence',
    metrics: {
      bigStepCount: bigSteps.length,
      bigStepSharePercent: sharePercent,
      followSamples: steps.length,
      maxStepPx: Math.round(percentile(stepPixels, 1)),
      p90StepPx: Math.round(percentile(stepPixels, 0.9)),
      sampleRateHz: meanGapMs > 0 ? Math.round(1000 / meanGapMs) : 0,
    },
    violations,
  };
}

/**
 * 视口里有多少既没有内容、也不由钉顶预留空白解释——也就是「列表滚到了什么都没有的地方」，
 * 「发送后内容消失一下」的可量化形态。
 *
 * 预留空白在 `probe.ts` 里就扣掉了，别在这里再判一次：钉顶设计本就要露出那一段，把它算进来
 * 等于让判据去量设计本身，稳态直接吃掉近 60% 的余量。
 */
function judgeViewportBlank(trace: Trace): JudgeReport {
  const violations: Violation[] = [];
  let maxBlank = 0;
  let breachStart: number | undefined;

  const closeBreach = (sample: ScrollSample) => {
    if (breachStart === undefined) {
      return;
    }

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
  };

  for (const sample of trace.samples) {
    maxBlank = Math.max(maxBlank, sample.blankFraction);

    if (sample.blankFraction > THRESHOLDS.viewportBlankFraction) {
      breachStart ??= sample.atMs;
      continue;
    }

    closeBreach(sample);
  }

  // 轨迹结束时仍在越界 = 空白**再没恢复过**，也就是最严重的那种。只在「跌回阈值以下」时结算
  // 的话，判据恰好会对它唯一沉默：实测键盘补丁前的 exp2 从 t=5233ms 一路 310px 空白到收尾，
  // 65/93 个样本超限，报告却是全绿的。
  const lastSample = trace.samples.at(-1);
  if (lastSample) {
    closeBreach(lastSample);
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
  // 总行程里由钉顶滚动分走的那一段。只作记录：它是 0（新话题）还是几百（已有话题）取决于
  // 有多少旧内容要让位，两种都合法；要判的是**两段加起来**够不够，那看 travel。
  let maxScrollAssist = 0;

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
      const scrollAssist = readNumber(event, 'scroll') ?? 0;
      maxTravel = Math.max(maxTravel, travel);
      maxScrollAssist = Math.max(maxScrollAssist, scrollAssist);
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
    metrics: {
      launches,
      maxArmToLaunchMs,
      maxScrollAssistPx: maxScrollAssist,
      maxTravelPx: maxTravel,
      settles,
    },
    violations,
  };
}

export function runJudges(trace: Trace): JudgeReport[] {
  return [
    judgeScrollButtonPhase(trace),
    judgeScrollButtonChatter(trace),
    judgeGestureConflict(trace),
    judgeOffsetReversal(trace),
    judgeFollowCadence(trace),
    judgeViewportBlank(trace),
    judgeContentShrink(trace),
    judgeRowShrink(trace),
    judgeEstimateCollapse(trace),
    judgeSlideInFlight(trace),
  ];
}
