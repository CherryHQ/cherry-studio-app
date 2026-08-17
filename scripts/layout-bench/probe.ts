/**
 * 把设备日志里的 `[LBP]` 探针行解析成一条可判定的轨迹。
 *
 * 探针本身只报「发生了什么」，判定需要的是派生量：是否落在用户手势窗口内、视口有多少比例
 * 落在内容之外。这些都在这里算好，判据只消费结果。
 */

export type ProbeEvent = {
  e: string;
  t: number;
  [key: string]: unknown;
};

export type InteractionWindow = {
  end: number;
  start: number;
};

export type ScrollSample = {
  /** 视口越过内容末端的比例（0=全是内容，1=整屏都是预留空白）。 */
  blankFraction: number;
  contentHeight: number;
  endSpace: number;
  inInteraction: boolean;
  /** 相对轨迹起点的毫秒数。 */
  atMs: number;
  y: number;
};

export type Trace = {
  events: ProbeEvent[];
  interactionWindows: InteractionWindow[];
  /** 事件时间戳原点；所有对外暴露的时间都是相对它的毫秒数。 */
  originMs: number;
  samples: ScrollSample[];
  viewportHeight: number;
};

// RN 的 console 桥会给日志行补一个尾引号，所以正则不能锚定行尾。踩过一次，别改回去。
const PROBE_LINE = /\[LBP\]\s+(\{.*\})/;

/**
 * 两种输入都吃：设备原始日志（探针行混在其它输出里）与本工具自己落盘的 probe.jsonl
 * （每行一个裸 JSON）。后者让 `--replay` 能对旧 trace 重跑判据，不必再连设备。
 */
export function parseProbeLog(raw: string): ProbeEvent[] {
  const events: ProbeEvent[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const payload = trimmed.startsWith('{') ? trimmed : PROBE_LINE.exec(trimmed)?.[1];
    if (!payload) {
      continue;
    }

    try {
      const parsed = JSON.parse(payload) as ProbeEvent;
      if (typeof parsed.e === 'string' && typeof parsed.t === 'number') {
        events.push(parsed);
      }
    } catch {
      // 日志行可能被 os_log 截断；跳过而不是让整轮解析失败。
    }
  }

  return events.sort((left, right) => left.t - right.t);
}

function readNumber(event: ProbeEvent, key: string): number | undefined {
  const value = event[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * 交互窗口按「活跃交互种类的引用计数」开合，而不是见到 begin 就开、见到 end 就关：
 * 一次上滑会依次发出 touch/drag/momentum 三组 begin-end 且互相嵌套，逐条开合会把窗口
 * 切碎，落在缝里的程序化滚动就漏判了。
 *
 * 无配对的 `end` 必须整条忽略：原生 ScrollView 在**每次程序化滚动之后**都会发一次
 * `onMomentumScrollEnd`（实测一轮流式 47 次，全都没有对应的 begin）。把它当关窗信号，
 * 会用一个陈旧的 start 拼出覆盖整条轨迹的假窗口，手势冲突判据随即全线误报。
 */
function buildInteractionWindows(events: ProbeEvent[]): InteractionWindow[] {
  const windows: InteractionWindow[] = [];
  const active = new Set<string>();
  let start = 0;

  for (const event of events) {
    if (event.e !== 'interaction' || typeof event.kind !== 'string') {
      continue;
    }

    if (event.state === 'begin') {
      if (active.size === 0) {
        start = event.t;
      }
      active.add(event.kind);
      continue;
    }

    if (!active.delete(event.kind)) {
      continue;
    }

    if (active.size === 0) {
      windows.push({ end: event.t, start });
    }
  }

  if (active.size > 0 && events.length > 0) {
    windows.push({ end: events[events.length - 1].t, start });
  }

  return windows;
}

const DEFAULT_VIEWPORT_HEIGHT = 874;

export function buildTrace(events: ProbeEvent[]): Trace {
  const originMs = events.length > 0 ? events[0].t : 0;
  let viewportHeight = DEFAULT_VIEWPORT_HEIGHT;

  for (const event of events) {
    if (event.e === 'viewport') {
      viewportHeight = readNumber(event, 'h') ?? viewportHeight;
    }

    // progScroll 顺带带回列表自报的视口长度，比 onLayout 更贴近列表自己的认知。
    if (event.e === 'progScroll') {
      viewportHeight = readNumber(event, 'viewport') ?? viewportHeight;
    }
  }

  const interactionWindows = buildInteractionWindows(events).map((window) => ({
    end: window.end - originMs,
    start: window.start - originMs,
  }));

  const samples: ScrollSample[] = [];
  let contentHeight = 0;
  let endSpace = 0;

  for (const event of events) {
    if (event.e === 'content') {
      contentHeight = readNumber(event, 'h') ?? contentHeight;
      continue;
    }

    if (event.e === 'endSpace') {
      endSpace = readNumber(event, 'size') ?? endSpace;
      continue;
    }

    if (event.e !== 'scroll') {
      continue;
    }

    const y = readNumber(event, 'y');
    if (y === undefined) {
      continue;
    }

    const atMs = event.t - originMs;
    // LegendList 的 contentSize **不含** anchoredEndSpace（实测：空话题里 content=357、
    // viewport=874、endSpace=517，三者严格满足 874-357=517），所以「视口越过内容末端」这个
    // 量把钉顶刻意预留的那段也算了进去。不扣掉的话判据量的是设计本身：稳态就占掉 59%，只剩
    // 1 个百分点留给真正的越界。扣掉之后它问的才是该问的那句——**有没有滚到既没内容、也不是
    // 预留空白的地方去**。
    const past = y + viewportHeight - contentHeight - endSpace;
    samples.push({
      atMs,
      blankFraction: contentHeight > 0 ? Math.min(1, Math.max(0, past / viewportHeight)) : 0,
      contentHeight,
      endSpace,
      inInteraction: interactionWindows.some(
        (window) => atMs >= window.start && atMs <= window.end,
      ),
      y,
    });
  }

  return { events, interactionWindows, originMs, samples, viewportHeight };
}
