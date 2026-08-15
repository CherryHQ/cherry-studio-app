/**
 * 把一条轨迹渲染成一张不用读代码也看得懂的 SVG。
 *
 * 三张小图各回答一个问题，标题写的就是那个问题本身：
 *
 *   ① 每次移动多远？—— 顺不顺只看这张，柱子越矮越顺。
 *   ② 滚到哪儿了？　—— 位移曲线，看该静止的时候静没静、该跟的时候跟没跟。
 *   ③ 列表长了多少？—— ① 的动因：内容在长、底部预留空白在缩。
 *
 * 上一版把四条等权泳道并排铺开，谁主谁次全靠读者猜，图例散在顶端、和它解释的那条曲线隔着
 * 半张纸。判据已经回答了「红还是绿」，图剩下要回答的只有「不顺在哪、有多不顺」——主次因此
 * 必须写在纸面上：主图更高、排在最前，每张图的图例就贴在自己标题下面。
 *
 * 摘要里的数字直接取判据的 metrics，柱子的明暗直接取判据的筛选（`collectFollowSteps`），
 * 不在这里另算一份：同名的两个数字对不上，比没有这张图更糟。
 *
 * 手写 SVG 而不引绘图库：产物要能进 artifacts 直接用浏览器打开，也要能 diff。
 */

import { collectFollowSteps, type JudgeReport, THRESHOLDS, type Violation } from './judges';
import type { Trace } from './probe';

const WIDTH = 1120;
const PAD_LEFT = 62;
const PAD_RIGHT = 18;
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT;
const HEADER_HEIGHT = 96;
/** 标题 + 图例占的高度，每张图自带。 */
const LANE_HEAD_HEIGHT = 44;
const LANE_GAP = 22;
const AXIS_HEIGHT = 28;
/** 主图（每次移动多远）比另外两张高，一眼就知道该先看哪张。 */
const PRIMARY_PLOT_HEIGHT = 176;
const PLOT_HEIGHT = 126;

const COLOR = {
  axis: '#64748b',
  content: '#0f766e',
  counted: '#1d4ed8',
  endSpace: '#8b5cf6',
  grid: '#e2e8f0',
  ignored: '#cbd5e1',
  ink: '#1e293b',
  muted: '#64748b',
  offset: '#0b62d6',
  ok: '#16a34a',
  reversal: '#dc2626',
  rule: '#b45309',
} as const;

const PHASE_FILL: Record<string, string> = {
  anchoring: '#fff3e0',
  following: '#eef5ff',
  paused: '#f1f5f9',
};

const PHASE_LABEL: Record<string, string> = {
  anchoring: '钉顶',
  following: '跟随',
  paused: '暂停',
};

// 程序化滚动按来源分色：混在一起就看不出「这一串滚动是谁发的」，而那恰恰是 ready gate
// 越界那次的关键线索（整段流式里全是 readyGate 而非 tailFollow）。
const SOURCE_STROKE: Record<string, string> = {
  anchorReady: '#7c3aed',
  button: '#0891b2',
  readyGate: '#d62728',
  tailFollow: '#16a34a',
};

type Point = { atMs: number; value: number };

type Series = {
  color: string;
  dashed?: boolean;
  points: Point[];
};

type LegendEntry = {
  color: string;
  dashed?: boolean;
  shape: 'bar' | 'line' | 'swatch';
  text: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min];
  }

  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

/** 预留空白与内容总高取原始事件而不是 samples：钉顶最关键的那一段发生在列表还没滚动之前。 */
function seriesOf(trace: Trace, eventName: string, key: string): Point[] {
  const points: Point[] = [];
  for (const event of trace.events) {
    const value = event[key];
    if (event.e === eventName && typeof value === 'number') {
      points.push({ atMs: event.t - trace.originMs, value });
    }
  }
  return points;
}

function renderLegend(entries: LegendEntry[], x: number, y: number): string[] {
  const parts: string[] = [];
  let cursor = x;

  for (const entry of entries) {
    if (entry.shape === 'swatch') {
      parts.push(
        `<rect x="${cursor}" y="${y - 8}" width="10" height="10" rx="2" fill="${entry.color}" stroke="#cbd5e1"/>`,
      );
    } else if (entry.shape === 'bar') {
      parts.push(
        `<rect x="${cursor + 3}" y="${y - 9}" width="4" height="11" fill="${entry.color}"/>`,
      );
    } else {
      parts.push(
        `<line x1="${cursor}" y1="${y - 3}" x2="${cursor + 12}" y2="${y - 3}" stroke="${entry.color}" stroke-width="2"${entry.dashed ? ' stroke-dasharray="4 3"' : ''}/>`,
      );
    }

    parts.push(
      `<text x="${cursor + 16}" y="${y}" font-size="10.5" fill="${COLOR.muted}">${escapeXml(entry.text)}</text>`,
    );
    // 中文按 ~10.5px/字、其余按 ~6px/字估宽；只用来排图例，不需要真实排版度量。
    cursor += 22 + [...entry.text].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 11 : 6), 0);
  }

  return parts;
}

function cadenceSummary(judges: JudgeReport[]): string {
  const cadence = judges.find((report) => report.judge === 'follow-cadence');
  if (!cadence) {
    return '';
  }

  const { bigStepSharePercent, followSamples, maxStepPx, p90StepPx, sampleRateHz } =
    cadence.metrics;
  if (!followSamples) {
    return '跟随节奏：这一轮没采到可统计的尾随位移';
  }

  return (
    `跟随节奏：每次移动 p90 ${p90StepPx}px、最大 ${maxStepPx}px；` +
    `≥${THRESHOLDS.followStepPx}px 的大跳占总位移 ${bigStepSharePercent}%` +
    `（${followSamples} 个样本，采样 ${sampleRateHz}Hz）`
  );
}

export function renderTraceSvg(
  trace: Trace,
  {
    judges,
    scenario,
    violations,
  }: { judges: JudgeReport[]; scenario: string; violations: Violation[] },
): string {
  const samples = trace.samples;
  if (samples.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="80"><text x="16" y="44" font-family="system-ui" font-size="14">${escapeXml(scenario)}：轨迹没有滚动采样，无从作图</text></svg>`;
  }

  const steps = collectFollowSteps(trace);
  const contentPoints = seriesOf(trace, 'content', 'h');
  const endSpacePoints = seriesOf(trace, 'endSpace', 'size');

  const height =
    HEADER_HEIGHT +
    LANE_HEAD_HEIGHT * 3 +
    PRIMARY_PLOT_HEIGHT +
    PLOT_HEIGHT * 2 +
    LANE_GAP * 2 +
    AXIS_HEIGHT;

  // 时间轴要覆盖所有画得出来的东西，不能只看滚动采样：预留空白与内容高度都可能晚于最后一次
  // 滚动（尾随停了内容还在长），只按 samples 定标会把它们画到画布外面去。
  const maxMs = Math.max(
    ...samples.map((sample) => sample.atMs),
    ...contentPoints.map((point) => point.atMs),
    ...endSpacePoints.map((point) => point.atMs),
    ...trace.events.map((event) => event.t - trace.originMs),
    1,
  );
  const xOf = (atMs: number) => PAD_LEFT + Math.min(1, Math.max(0, atMs / maxMs)) * PLOT_WIDTH;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="system-ui, -apple-system, sans-serif">`,
    `<rect width="${WIDTH}" height="${height}" fill="#ffffff"/>`,
  ];

  // ── 摘要条：先给结论，再给图 ────────────────────────────────────────────────
  const passed = violations.length === 0;
  parts.push(
    `<rect x="${PAD_LEFT}" y="18" width="${PLOT_WIDTH}" height="62" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>`,
    `<text x="${PAD_LEFT + 16}" y="43" font-size="16" font-weight="700" fill="${COLOR.ink}">${escapeXml(scenario)}</text>`,
    `<rect x="${PAD_LEFT + 16 + scenario.length * 9.5}" y="29" width="${passed ? 74 : 88}" height="19" rx="9.5" fill="${passed ? '#dcfce7' : '#fee2e2'}"/>`,
    `<text x="${PAD_LEFT + 26 + scenario.length * 9.5}" y="43" font-size="11.5" font-weight="600" fill="${passed ? COLOR.ok : COLOR.reversal}">${passed ? '判据全绿' : `${violations.length} 条违规`}</text>`,
    `<text x="${PAD_LEFT + 16}" y="66" font-size="12" fill="${COLOR.muted}">${escapeXml(cadenceSummary(judges))}</text>`,
  );

  type Lane = {
    /** 标题就是这张图回答的问题。 */
    question: string;
    legend: LegendEntry[];
    plotHeight: number;
  };

  const lanes: Lane[] = [
    {
      legend: [
        { color: COLOR.counted, shape: 'bar', text: '跟随期（判据统计的就是这些）' },
        {
          color: COLOR.ignored,
          shape: 'bar',
          text: '不统计：手势期 / 刚进跟随的头 0.3 秒 / 非跟随期',
        },
        { color: COLOR.reversal, shape: 'bar', text: '往回退' },
        {
          color: COLOR.rule,
          dashed: true,
          shape: 'line',
          text: `${THRESHOLDS.followStepPx}px 判据线，越过算一次大跳`,
        },
      ],
      plotHeight: PRIMARY_PLOT_HEIGHT,
      question: '① 每次移动多远？柱子越矮越顺',
    },
    {
      legend: [
        { color: PHASE_FILL.anchoring, shape: 'swatch', text: '钉顶' },
        { color: PHASE_FILL.following, shape: 'swatch', text: '跟随' },
        { color: PHASE_FILL.paused, shape: 'swatch', text: '暂停' },
        { color: '#94a3b8', shape: 'swatch', text: '手指在屏上' },
        ...Object.entries(SOURCE_STROKE).map(([source, color]) => ({
          color,
          shape: 'line' as const,
          text: source,
        })),
      ],
      plotHeight: PLOT_HEIGHT,
      question: '② 滚到哪儿了？顶边的齿是程序化滚动',
    },
    {
      legend: [
        { color: COLOR.content, shape: 'line', text: '内容总高（消息在长）' },
        {
          color: COLOR.endSpace,
          dashed: true,
          shape: 'line',
          text: '底部预留空白（钉顶留的位置在被吃掉）',
        },
      ],
      plotHeight: PLOT_HEIGHT,
      question: '③ 列表长了多少？这是 ① 的动因',
    },
  ];

  const secondTicks = niceTicks(0, maxMs, 8);
  let cursorY = HEADER_HEIGHT;

  lanes.forEach((lane, laneIndex) => {
    const top = cursorY + LANE_HEAD_HEIGHT;
    const bottom = top + lane.plotHeight;

    parts.push(
      `<text x="${PAD_LEFT}" y="${cursorY + 16}" font-size="13.5" font-weight="600" fill="${COLOR.ink}">${escapeXml(lane.question)}</text>`,
      ...renderLegend(lane.legend, PAD_LEFT, cursorY + 34),
      `<rect x="${PAD_LEFT}" y="${top}" width="${PLOT_WIDTH}" height="${lane.plotHeight}" fill="#ffffff"/>`,
    );

    // 三张图共用同一条时间轴，秒线画在每张图里，跨图对齐才读得下来。
    for (const tick of secondTicks) {
      parts.push(
        `<line x1="${xOf(tick).toFixed(1)}" y1="${top}" x2="${xOf(tick).toFixed(1)}" y2="${bottom}" stroke="${COLOR.grid}" stroke-width="1"/>`,
      );
    }

    const values: number[] = [];
    if (laneIndex === 0) {
      // 纵轴至少铺到判据线的两倍：否则自动缩放会把「柱子普遍 24px」和「柱子普遍 90px」画成
      // 一模一样的高度，两轮的图并排放也看不出差别——而看出差别正是这张图存在的理由。
      values.push(...steps.map((step) => step.dy), 0, THRESHOLDS.followStepPx * 2);
    } else if (laneIndex === 1) {
      values.push(...samples.map((sample) => sample.y));
    } else {
      values.push(
        ...contentPoints.map((point) => point.value),
        ...endSpacePoints.map((point) => point.value),
        0,
      );
    }

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || 1;
    const min = rawMin - span * 0.08;
    const max = rawMax + span * 0.08;
    const yOf = (value: number) => bottom - ((value - min) / (max - min)) * lane.plotHeight;

    if (laneIndex === 1) {
      // 相位底色：同一条位移曲线在钉顶期该静止、在尾随期该跟随，不铺相位就没法判断该不该动。
      let phaseStart = 0;
      let phase = trace.phaseAt(0);
      const paintPhase = (endMs: number) => {
        const x = xOf(phaseStart);
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${top}" width="${Math.max(0, xOf(endMs) - x).toFixed(1)}" height="${lane.plotHeight}" fill="${PHASE_FILL[phase] ?? '#ffffff'}"/>`,
          `<text x="${(x + 5).toFixed(1)}" y="${top + 12}" font-size="9.5" fill="#94a3b8">${PHASE_LABEL[phase] ?? phase}</text>`,
        );
      };
      for (const sample of samples) {
        const current = trace.phaseAt(sample.atMs);
        if (current !== phase) {
          paintPhase(sample.atMs);
          phaseStart = sample.atMs;
          phase = current;
        }
      }
      paintPhase(maxMs);

      // 用户手势窗口：窗口内的位移由手指决定，判据和肉眼都不该按「自动滚动」去读。
      for (const window of trace.interactionWindows) {
        const x = xOf(window.start);
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${top}" width="${Math.max(1, xOf(window.end) - x).toFixed(1)}" height="${lane.plotHeight}" fill="#94a3b8" opacity="0.28"/>`,
        );
      }
    }

    for (const tick of niceTicks(min, max, 3)) {
      const y = yOf(tick);
      parts.push(
        `<line x1="${PAD_LEFT}" y1="${y.toFixed(1)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${y.toFixed(1)}" stroke="${COLOR.grid}" stroke-width="1"/>`,
        `<text x="${PAD_LEFT - 8}" y="${(y + 3.5).toFixed(1)}" font-size="10" fill="${COLOR.axis}" text-anchor="end">${Math.round(tick)}</text>`,
      );
    }

    if (laneIndex === 0) {
      const zero = yOf(0);
      const ruleY = yOf(THRESHOLDS.followStepPx);
      parts.push(
        `<line x1="${PAD_LEFT}" y1="${zero.toFixed(1)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${zero.toFixed(1)}" stroke="#334155" stroke-width="1"/>`,
        `<line x1="${PAD_LEFT}" y1="${ruleY.toFixed(1)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${ruleY.toFixed(1)}" stroke="${COLOR.rule}" stroke-width="1.2" stroke-dasharray="5 4"/>`,
        `<text x="${PAD_LEFT + PLOT_WIDTH - 4}" y="${(ruleY - 5).toFixed(1)}" font-size="10" fill="${COLOR.rule}" text-anchor="end">${THRESHOLDS.followStepPx}px</text>`,
      );

      for (const step of steps) {
        const y = yOf(step.dy);
        // 手势期一律中性色：那段负位移是手指拉出来的，不该和列表自己往回弹撞同一个红。
        const fill = step.counted
          ? COLOR.counted
          : step.dy < 0 && !step.inInteraction
            ? COLOR.reversal
            : COLOR.ignored;
        parts.push(
          `<rect x="${(xOf(step.atMs) - 1.2).toFixed(1)}" y="${Math.min(y, zero).toFixed(1)}" width="2.4" height="${Math.max(0.8, Math.abs(zero - y)).toFixed(1)}" fill="${fill}"/>`,
        );
      }

      // 违规只标在主图上：三张图都标会把曲线埋掉，而违规本来就是「哪一刻不顺」的注脚。
      for (const violation of violations) {
        const x = xOf(violation.atMs);
        parts.push(
          `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}" stroke="${COLOR.reversal}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
          `<text x="${(x + 4).toFixed(1)}" y="${top + 12}" font-size="10" fill="${COLOR.reversal}">${escapeXml(violation.judge)}</text>`,
        );
      }
    } else {
      const seriesList: Series[] =
        laneIndex === 1
          ? [{ color: COLOR.offset, points: samples.map((s) => ({ atMs: s.atMs, value: s.y })) }]
          : [
              { color: COLOR.content, points: contentPoints },
              { color: COLOR.endSpace, dashed: true, points: endSpacePoints },
            ];

      for (const series of seriesList) {
        if (series.points.length === 0) {
          continue;
        }
        const d = series.points
          .map(
            (point, index) =>
              `${index === 0 ? 'M' : 'L'}${xOf(point.atMs).toFixed(1)} ${yOf(point.value).toFixed(1)}`,
          )
          .join(' ');
        parts.push(
          `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="1.6"${series.dashed ? ' stroke-dasharray="5 4"' : ''}/>`,
        );
      }

      if (laneIndex === 1) {
        // 程序化滚动画成顶边的短齿而不是贯穿全高的竖线：一轮里有几十次，贯穿线会把曲线盖掉。
        for (const event of trace.events) {
          if (event.e !== 'progScroll') {
            continue;
          }
          const stroke = SOURCE_STROKE[String(event.src)];
          if (!stroke) {
            continue;
          }
          const x = xOf(event.t - trace.originMs);
          parts.push(
            `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + 7}" stroke="${stroke}" stroke-width="1.4"/>`,
          );
        }
      }
    }

    parts.push(
      `<rect x="${PAD_LEFT}" y="${top}" width="${PLOT_WIDTH}" height="${lane.plotHeight}" fill="none" stroke="#cbd5e1"/>`,
    );

    cursorY = bottom + LANE_GAP;
  });

  for (const tick of secondTicks) {
    parts.push(
      `<text x="${xOf(tick).toFixed(1)}" y="${(cursorY - LANE_GAP + 18).toFixed(1)}" font-size="10" fill="${COLOR.axis}" text-anchor="middle">${(tick / 1000).toFixed(1)}s</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}
