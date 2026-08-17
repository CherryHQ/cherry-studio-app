/**
 * 把一条轨迹渲染成一张不用读代码也看得懂的 SVG。
 *
 * 两张图分别回答「列表位置有没有在流式期间自行变化」和「内容与预留空间如何变化」。程序化
 * 滚动按来源画在 offset 图顶边，用户手势窗口铺灰底；两者都是允许列表移动的直接解释。
 *
 * 手写 SVG 而不引绘图库：产物要能进 artifacts 直接用浏览器打开，也要能 diff。
 */

import { type JudgeReport, type Violation } from './judges';
import type { Trace } from './probe';

const WIDTH = 1120;
const PAD_LEFT = 62;
const PAD_RIGHT = 18;
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT;
const HEADER_HEIGHT = 96;
const LANE_HEAD_HEIGHT = 44;
const LANE_GAP = 22;
const AXIS_HEIGHT = 28;
const OFFSET_PLOT_HEIGHT = 176;
const SIZE_PLOT_HEIGHT = 126;

const COLOR = {
  axis: '#64748b',
  content: '#0f766e',
  endSpace: '#8b5cf6',
  grid: '#e2e8f0',
  ink: '#1e293b',
  muted: '#64748b',
  offset: '#0b62d6',
  ok: '#16a34a',
  reversal: '#dc2626',
} as const;

const SOURCE_STROKE: Record<string, string> = {
  anchorReady: '#7c3aed',
  button: '#0891b2',
  readyGate: '#d62728',
};

type Point = { atMs: number; value: number };

type Series = {
  color: string;
  dashed?: boolean;
  points: Point[];
};

type Lane = {
  id: 'offset' | 'sizes';
  legend: LegendEntry[];
  plotHeight: number;
  question: string;
  series: Series[];
  values: number[];
};

type LegendEntry = {
  color: string;
  dashed?: boolean;
  shape: 'line' | 'swatch';
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
  const step = [1, 2, 5, 10].map((multiple) => multiple * magnitude).find((value) => value >= raw);
  const interval = step ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / interval) * interval; value <= max; value += interval) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

/** 内容总高与预留空间取原始事件；它们在列表尚未产生 scroll 样本时也会变化。 */
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
    } else {
      parts.push(
        `<line x1="${cursor}" y1="${y - 3}" x2="${cursor + 12}" y2="${y - 3}" stroke="${entry.color}" stroke-width="2"${entry.dashed ? ' stroke-dasharray="4 3"' : ''}/>`,
      );
    }

    parts.push(
      `<text x="${cursor + 16}" y="${y}" font-size="10.5" fill="${COLOR.muted}">${escapeXml(entry.text)}</text>`,
    );
    cursor +=
      22 +
      [...entry.text].reduce((sum, character) => sum + (character.charCodeAt(0) > 255 ? 11 : 6), 0);
  }

  return parts;
}

function contractSummary(judges: JudgeReport[]): string {
  const stability = judges.find((report) => report.judge === 'stream-position-stability');
  const button = judges.find((report) => report.judge === 'scroll-button-visibility');
  if (!stability || !button) {
    return '';
  }

  const position = stability.metrics.stationaryWindow
    ? `流式静止窗口最大位移 ${stability.metrics.maxStepPx}px`
    : '本轮未形成流式静止窗口';
  const buttonResult = button.metrics.expectedShows
    ? button.metrics.observedDelayMs < 0
      ? '按钮未出现'
      : `按钮出现延迟 ${button.metrics.observedDelayMs}ms`
    : '本轮内容未越过预留空间';
  return `${position}；${buttonResult}`;
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

  const contentPoints = seriesOf(trace, 'content', 'h');
  const endSpacePoints = seriesOf(trace, 'endSpace', 'size');
  const height =
    HEADER_HEIGHT +
    LANE_HEAD_HEIGHT * 2 +
    OFFSET_PLOT_HEIGHT +
    SIZE_PLOT_HEIGHT +
    LANE_GAP +
    AXIS_HEIGHT;
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

  const passed = violations.length === 0;
  parts.push(
    `<rect x="${PAD_LEFT}" y="18" width="${PLOT_WIDTH}" height="62" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>`,
    `<text x="${PAD_LEFT + 16}" y="43" font-size="16" font-weight="700" fill="${COLOR.ink}">${escapeXml(scenario)}</text>`,
    `<rect x="${PAD_LEFT + 16 + scenario.length * 9.5}" y="29" width="${passed ? 74 : 88}" height="19" rx="9.5" fill="${passed ? '#dcfce7' : '#fee2e2'}"/>`,
    `<text x="${PAD_LEFT + 26 + scenario.length * 9.5}" y="43" font-size="11.5" font-weight="600" fill="${passed ? COLOR.ok : COLOR.reversal}">${passed ? '判据全绿' : `${violations.length} 条违规`}</text>`,
    `<text x="${PAD_LEFT + 16}" y="66" font-size="12" fill="${COLOR.muted}">${escapeXml(contractSummary(judges))}</text>`,
  );

  const lanes: Lane[] = [
    {
      id: 'offset',
      legend: [
        { color: COLOR.offset, shape: 'line', text: '列表 offset' },
        { color: '#94a3b8', shape: 'swatch', text: '用户手势窗口' },
        ...Object.entries(SOURCE_STROKE).map(([source, color]) => ({
          color,
          shape: 'line' as const,
          text: source,
        })),
        { color: COLOR.reversal, shape: 'line', text: '未允许的滚动来源' },
      ],
      plotHeight: OFFSET_PLOT_HEIGHT,
      question: '① 列表位置有没有自行变化？顶边短线是一次性滚动命令',
      series: [
        {
          color: COLOR.offset,
          points: samples.map((sample) => ({ atMs: sample.atMs, value: sample.y })),
        },
      ],
      values: samples.map((sample) => sample.y),
    },
    {
      id: 'sizes',
      legend: [
        { color: COLOR.content, shape: 'line', text: '内容总高' },
        { color: COLOR.endSpace, dashed: true, shape: 'line', text: '底部预留空间' },
      ],
      plotHeight: SIZE_PLOT_HEIGHT,
      question: '② 内容长了多少？预留空间耗尽后 offset 应保持不动',
      series: [
        { color: COLOR.content, points: contentPoints },
        { color: COLOR.endSpace, dashed: true, points: endSpacePoints },
      ],
      values: [
        ...contentPoints.map((point) => point.value),
        ...endSpacePoints.map((point) => point.value),
        0,
      ],
    },
  ];

  const secondTicks = niceTicks(0, maxMs, 8);
  let cursorY = HEADER_HEIGHT;

  for (const lane of lanes) {
    const top = cursorY + LANE_HEAD_HEIGHT;
    const bottom = top + lane.plotHeight;
    parts.push(
      `<text x="${PAD_LEFT}" y="${cursorY + 16}" font-size="13.5" font-weight="600" fill="${COLOR.ink}">${escapeXml(lane.question)}</text>`,
      ...renderLegend(lane.legend, PAD_LEFT, cursorY + 34),
      `<rect x="${PAD_LEFT}" y="${top}" width="${PLOT_WIDTH}" height="${lane.plotHeight}" fill="#ffffff"/>`,
    );

    for (const tick of secondTicks) {
      parts.push(
        `<line x1="${xOf(tick).toFixed(1)}" y1="${top}" x2="${xOf(tick).toFixed(1)}" y2="${bottom}" stroke="${COLOR.grid}" stroke-width="1"/>`,
      );
    }

    const rawMin = Math.min(...lane.values);
    const rawMax = Math.max(...lane.values);
    const span = rawMax - rawMin || 1;
    const min = rawMin - span * 0.08;
    const max = rawMax + span * 0.08;
    const yOf = (value: number) => bottom - ((value - min) / (max - min)) * lane.plotHeight;

    if (lane.id === 'offset') {
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

    for (const series of lane.series) {
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

    if (lane.id === 'offset') {
      for (const event of trace.events) {
        if (event.e !== 'progScroll') {
          continue;
        }
        const stroke = SOURCE_STROKE[String(event.src)] ?? COLOR.reversal;
        const x = xOf(event.t - trace.originMs);
        parts.push(
          `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + 8}" stroke="${stroke}" stroke-width="1.6"/>`,
        );
      }

      const labelled = new Set<string>();
      for (const violation of violations) {
        const x = xOf(violation.atMs);
        parts.push(
          `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}" stroke="${COLOR.reversal}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
        );
        if (labelled.has(violation.judge)) {
          continue;
        }
        const count = violations.filter((other) => other.judge === violation.judge).length;
        const label = count > 1 ? `${violation.judge} ×${count}` : violation.judge;
        parts.push(
          `<text x="${PAD_LEFT + 6}" y="${top + 13 + labelled.size * 13}" font-size="10" fill="${COLOR.reversal}">${escapeXml(label)}</text>`,
        );
        labelled.add(violation.judge);
      }
    }

    parts.push(
      `<rect x="${PAD_LEFT}" y="${top}" width="${PLOT_WIDTH}" height="${lane.plotHeight}" fill="none" stroke="#cbd5e1"/>`,
    );
    cursorY = bottom + LANE_GAP;
  }

  for (const tick of secondTicks) {
    parts.push(
      `<text x="${xOf(tick).toFixed(1)}" y="${(cursorY - LANE_GAP + 18).toFixed(1)}" font-size="10" fill="${COLOR.axis}" text-anchor="middle">${(tick / 1000).toFixed(1)}s</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}
