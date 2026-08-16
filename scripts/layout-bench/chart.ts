/**
 * 把一条轨迹渲染成自包含的 SVG。
 *
 * 判据只回答「红还是绿」，回答不了「这一段动得顺不顺」——同样零违规的两条轨迹，一条可以是
 * 单调爬升，另一条可以是在阈值底下反复搓动。位移曲线加逐样本增量能一眼分开这两者：抖动在
 * 增量泳道上表现为负值柱，而正常的钉顶/尾随只有正向柱。
 *
 * 手写 SVG 而不引绘图库：产物要能进 artifacts 直接用浏览器打开，也要能 diff。
 */

import type { Violation } from './judges';
import type { ScrollSample, Trace } from './probe';

const WIDTH = 1240;
const LANE_HEIGHT = 168;
const LANE_GAP = 30;
const PAD_LEFT = 74;
const PAD_RIGHT = 20;
const PAD_TOP = 74;
const PAD_BOTTOM = 34;
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT;

const PHASE_FILL: Record<string, string> = {
  anchoring: '#fff3e0',
  following: '#e9f3ff',
  paused: '#ededed',
};

// 程序化滚动按来源分色：混在一起就看不出「这一串滚动是谁发的」，而那恰恰是 ready gate
// 越界那次的关键线索（整段流式里全是 readyGate 而非 tailFollow）。
const SOURCE_STROKE: Record<string, string> = {
  anchorReady: '#7c3aed',
  button: '#0891b2',
  readyGate: '#d62728',
  tailFollow: '#16a34a',
};

type LanePoint = {
  atMs: number;
  /** 该点落在用户手势窗口内。手势期的位移由手指决定，不能按「列表自己动了」去读。 */
  inInteraction?: boolean;
  value: number;
};

type Lane = {
  kind: 'bar' | 'line';
  label: string;
  points: LanePoint[];
  stroke: string;
  /** 强制包含进 y 轴范围的值，用来把 0 基线钉进增量泳道。 */
  includeZero?: boolean;
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

function buildLanes(trace: Trace, samples: ScrollSample[]): Lane[] {
  const offset: LanePoint[] = samples.map((sample) => ({
    atMs: sample.atMs,
    inInteraction: sample.inInteraction,
    value: sample.y,
  }));

  // 增量取「相邻两次采样之间」，落在手势窗口内的那一段跟着标记走：用户上滑本来就会连出一整
  // 片负增量，把它和非交互期的反向弹动画成同一个颜色，等于把这张图变成误报机器。
  const deltas: LanePoint[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    deltas.push({
      atMs: samples[index].atMs,
      inInteraction: samples[index].inInteraction || samples[index - 1].inInteraction,
      value: samples[index].y - samples[index - 1].y,
    });
  }

  // 预留空白和内容高度取原始事件而不是 samples：samples 只在 scroll 事件上生成，而钉顶最关键
  // 的那一段（预留空白 512 → 0）大半发生在列表还没滚动之前，跟着 samples 走会把它整段丢掉。
  const seriesOf = (eventName: string, key: string): LanePoint[] => {
    const points: LanePoint[] = [];
    for (const event of trace.events) {
      const value = event[key];
      if (event.e === eventName && typeof value === 'number') {
        points.push({ atMs: event.t - trace.originMs, value });
      }
    }
    return points;
  };

  return [
    { kind: 'line', label: '位移 scroll offset (px)', points: offset, stroke: '#0b62d6' },
    {
      includeZero: true,
      kind: 'bar',
      label: '逐样本增量 Δoffset (px) — 只有非交互期（无灰底）的负值才是反向弹动',
      points: deltas,
      stroke: '#0b62d6',
    },
    {
      includeZero: true,
      kind: 'line',
      label: '预留空白 endSpace (px)',
      points: seriesOf('endSpace', 'size'),
      stroke: '#8b5cf6',
    },
    {
      kind: 'line',
      label: '内容总高 content height (px)',
      points: seriesOf('content', 'h'),
      stroke: '#0f766e',
    },
  ];
}

export function renderTraceSvg(
  trace: Trace,
  { scenario, violations }: { scenario: string; violations: Violation[] },
): string {
  const samples = trace.samples;
  if (samples.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="80"><text x="16" y="44" font-family="system-ui" font-size="14">${escapeXml(scenario)}：轨迹没有滚动采样，无从作图</text></svg>`;
  }

  const lanes = buildLanes(trace, samples);
  const height = PAD_TOP + lanes.length * (LANE_HEIGHT + LANE_GAP) + PAD_BOTTOM;
  // 时间轴要覆盖所有画得出来的东西，不能只看滚动采样：程序化滚动与预留空白/内容高度都可能
  // 晚于最后一次滚动（尾随停了内容还在长），只按 samples 定标会把它们画到画布外面去。
  const maxMs = Math.max(
    ...samples.map((sample) => sample.atMs),
    ...lanes.flatMap((lane) => lane.points.map((point) => point.atMs)),
    ...trace.events.map((event) => event.t - trace.originMs),
    1,
  );
  const xOf = (atMs: number) => PAD_LEFT + Math.min(1, Math.max(0, atMs / maxMs)) * PLOT_WIDTH;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="system-ui, -apple-system, sans-serif">`,
    `<rect width="${WIDTH}" height="${height}" fill="#ffffff"/>`,
    `<text x="${PAD_LEFT}" y="26" font-size="15" font-weight="600">${escapeXml(scenario)}</text>`,
  ];

  // 图例：相位底色 + 程序化滚动来源，两者都是读图的前提。
  const legend: string[] = [];
  let legendX = PAD_LEFT;
  for (const [phase, fill] of Object.entries(PHASE_FILL)) {
    legend.push(
      `<rect x="${legendX}" y="36" width="11" height="11" fill="${fill}" stroke="#cbd5e1"/>`,
      `<text x="${legendX + 15}" y="45" font-size="11" fill="#475569">${phase}</text>`,
    );
    legendX += 22 + phase.length * 7;
  }
  for (const [source, stroke] of Object.entries(SOURCE_STROKE)) {
    legend.push(
      `<line x1="${legendX}" y1="36" x2="${legendX}" y2="47" stroke="${stroke}" stroke-width="2"/>`,
      `<text x="${legendX + 6}" y="45" font-size="11" fill="#475569">${source}</text>`,
    );
    legendX += 16 + source.length * 7;
  }
  parts.push(...legend);

  lanes.forEach((lane, laneIndex) => {
    const top = PAD_TOP + laneIndex * (LANE_HEIGHT + LANE_GAP);
    if (lane.points.length === 0) {
      parts.push(
        `<rect x="${PAD_LEFT}" y="${top}" width="${PLOT_WIDTH}" height="${LANE_HEIGHT}" fill="none" stroke="#cbd5e1"/>`,
        `<text x="${PAD_LEFT + 6}" y="${top - 6}" font-size="11.5" font-weight="600" fill="#334155">${escapeXml(lane.label)}</text>`,
        `<text x="${PAD_LEFT + PLOT_WIDTH / 2}" y="${top + LANE_HEIGHT / 2}" font-size="11" fill="#94a3b8" text-anchor="middle">这一轮没有采到该信号</text>`,
      );
      return;
    }
    const bottom = top + LANE_HEIGHT;
    const values = lane.points.map((point) => point.value);
    const rawMin = Math.min(...values, lane.includeZero ? 0 : Infinity);
    const rawMax = Math.max(...values, lane.includeZero ? 0 : -Infinity);
    const span = rawMax - rawMin || 1;
    const min = rawMin - span * 0.08;
    const max = rawMax + span * 0.08;
    const yOf = (value: number) => bottom - ((value - min) / (max - min)) * LANE_HEIGHT;

    // 相位底色：同一条位移曲线在钉顶期该静止、在尾随期该跟随，不铺相位就没法判断该不该动。
    let phaseStart = 0;
    let phase = trace.phaseAt(0);
    const paintPhase = (endMs: number) => {
      const x = xOf(phaseStart);
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${top}" width="${Math.max(0, xOf(endMs) - x).toFixed(1)}" height="${LANE_HEIGHT}" fill="${PHASE_FILL[phase] ?? '#ffffff'}"/>`,
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
        `<rect x="${x.toFixed(1)}" y="${top}" width="${Math.max(1, xOf(window.end) - x).toFixed(1)}" height="${LANE_HEIGHT}" fill="#64748b" opacity="0.16"/>`,
      );
    }

    for (const tick of niceTicks(min, max, 4)) {
      const y = yOf(tick);
      parts.push(
        `<line x1="${PAD_LEFT}" y1="${y.toFixed(1)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`,
        `<text x="${PAD_LEFT - 8}" y="${(y + 3.5).toFixed(1)}" font-size="10" fill="#64748b" text-anchor="end">${Math.round(tick)}</text>`,
      );
    }

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
        `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}" stroke="${stroke}" stroke-width="1" opacity="0.3"/>`,
      );
    }

    if (lane.kind === 'line') {
      const d = lane.points
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'}${xOf(point.atMs).toFixed(1)} ${yOf(point.value).toFixed(1)}`,
        )
        .join(' ');
      parts.push(`<path d="${d}" fill="none" stroke="${lane.stroke}" stroke-width="1.6"/>`);
    } else {
      const zero = yOf(0);
      parts.push(
        `<line x1="${PAD_LEFT}" y1="${zero.toFixed(1)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${zero.toFixed(1)}" stroke="#334155" stroke-width="1"/>`,
      );
      for (const point of lane.points) {
        const y = yOf(point.value);
        // 手势期一律中性色：那段负增量是手指拉出来的，不该和列表自己弹回去撞同一个红。
        const fill = point.inInteraction ? '#94a3b8' : point.value < 0 ? '#dc2626' : lane.stroke;
        parts.push(
          `<rect x="${(xOf(point.atMs) - 1).toFixed(1)}" y="${Math.min(y, zero).toFixed(1)}" width="2.4" height="${Math.max(0.8, Math.abs(zero - y)).toFixed(1)}" fill="${fill}"/>`,
        );
      }
    }

    // 违规只标在第一条泳道，标满四条会把曲线埋掉。
    if (laneIndex === 0) {
      for (const violation of violations) {
        const x = xOf(violation.atMs);
        parts.push(
          `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4 3"/>`,
          `<text x="${(x + 4).toFixed(1)}" y="${top + 12}" font-size="10" fill="#dc2626">${escapeXml(violation.judge)}</text>`,
        );
      }
    }

    parts.push(
      `<rect x="${PAD_LEFT}" y="${top}" width="${PLOT_WIDTH}" height="${LANE_HEIGHT}" fill="none" stroke="#cbd5e1"/>`,
      `<text x="${PAD_LEFT + 6}" y="${top - 6}" font-size="11.5" font-weight="600" fill="#334155">${escapeXml(lane.label)}</text>`,
    );
  });

  const lastBottom = PAD_TOP + lanes.length * (LANE_HEIGHT + LANE_GAP) - LANE_GAP;
  for (const tick of niceTicks(0, maxMs, 8)) {
    parts.push(
      `<text x="${xOf(tick).toFixed(1)}" y="${lastBottom + 18}" font-size="10" fill="#64748b" text-anchor="middle">${(tick / 1000).toFixed(1)}s</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}
