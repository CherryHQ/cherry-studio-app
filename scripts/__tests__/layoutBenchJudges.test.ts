import { runJudges } from '../layout-bench/judges';
import { buildTrace, parseProbeLog, type ProbeEvent } from '../layout-bench/probe';

// 探针的时间戳是 Date.now()，这里用一个固定原点让断言里的相对时间可读。
const T0 = 1_700_000_000_000;

function at(offsetMs: number) {
  return T0 + offsetMs;
}

function judge(events: ProbeEvent[], name: string) {
  const report = runJudges(buildTrace(events)).find((entry) => entry.judge === name);
  if (!report) {
    throw new Error(`没有名为 ${name} 的判据`);
  }
  return report;
}

describe('parseProbeLog', () => {
  it('从设备日志里捞出探针行，也吃自己落盘的裸 JSON', () => {
    const deviceLog = [
      '2026-08-13 18:36:28.224 I  CherryStudio[1:2] [js] \'%c<info>\', \'color: red\', \'[LBP] {"e":"armed","t":2}\'',
      '2026-08-13 18:36:28.100 I  CherryStudio[1:2] [js] 无关的一行',
      '{"e":"scroll","t":1,"y":10}',
    ].join('\n');

    // 行尾那个引号是 RN console 桥加的，解析器不能锚定行尾；顺带验证按时间排序。
    expect(parseProbeLog(deviceLog)).toEqual([
      { e: 'scroll', t: 1, y: 10 },
      { e: 'armed', t: 2 },
    ]);
  });
});

describe('gesture-conflict', () => {
  const programmaticScroll = (offsetMs: number): ProbeEvent => ({
    e: 'progScroll',
    src: 'tailFollow',
    t: at(offsetMs),
  });

  it('忽略没有配对 begin 的 momentum end', () => {
    // 原生 ScrollView 在每次程序化滚动后都会发一次 onMomentumScrollEnd。把它当关窗信号，
    // 会用陈旧的 start 拼出覆盖整条轨迹的假窗口，于是每一次程序化滚动都被报成手势冲突。
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'following', t: at(0) },
      programmaticScroll(10),
      { e: 'interaction', kind: 'momentum', state: 'end', t: at(20) },
      programmaticScroll(30),
      { e: 'interaction', kind: 'momentum', state: 'end', t: at(40) },
      programmaticScroll(50),
    ];

    const report = judge(events, 'gesture-conflict');
    expect(report.metrics).toMatchObject({ interactionWindows: 0, programmaticScrolls: 3 });
    expect(report.violations).toHaveLength(0);
  });

  it('把嵌套的 touch/drag/momentum 合成一个窗口并抓出窗口内的程序化滚动', () => {
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'paused', t: at(0) },
      { e: 'interaction', kind: 'touch', state: 'begin', t: at(10) },
      { e: 'interaction', kind: 'drag', state: 'begin', t: at(20) },
      { e: 'interaction', kind: 'drag', state: 'end', t: at(30) },
      programmaticScroll(40),
      { e: 'interaction', kind: 'touch', state: 'end', t: at(50) },
      programmaticScroll(60),
    ];

    const report = judge(events, 'gesture-conflict');
    expect(report.metrics).toMatchObject({ interactionWindows: 1 });
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].atMs).toBe(40);
  });
});

describe('scroll-button-phase', () => {
  it('只在 app 驱动滚动的相位里显示才算缺陷', () => {
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'anchoring', t: at(0) },
      // 翻转成隐藏本就是这个相位的期望状态。
      { e: 'button', t: at(10), visible: false },
      { e: 'button', t: at(20), visible: true },
      { e: 'phase', phase: 'paused', t: at(30) },
      // paused 时用户自己离开了底部，按钮就该出现。
      { e: 'button', t: at(40), visible: true },
    ];

    const report = judge(events, 'scroll-button-phase');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({ atMs: 20, phase: 'anchoring' });
  });
});

describe('offset-reversal', () => {
  const scrollTo = (offsetMs: number, y: number): ProbeEvent => ({
    e: 'scroll',
    t: at(offsetMs),
    y,
  });
  const contentHeight = (offsetMs: number, h: number): ProbeEvent => ({
    e: 'content',
    h,
    ready: true,
    t: at(offsetMs),
  });

  it('不把「长距离单调动画 + 几像素收尾回弹」当成跳动', () => {
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'anchoring', t: at(0) },
      contentHeight(1, 5_000),
      scrollTo(10, 2_400),
      scrollTo(20, 2_700),
      scrollTo(30, 3_000),
      scrollTo(40, 2_995),
    ];

    // 5px 的收尾回撤在噪声地板之下，整段算一次单调位移，连「一次往返」都不构成。
    const report = judge(events, 'offset-reversal');
    expect(report.metrics.maxBouncePx).toBe(0);
    expect(report.violations).toHaveLength(0);
  });

  it('爬升途中的微抖动不得把返程切碎', () => {
    // 实测签名：钉顶前突跳 -310px，随后 616px 爬回目标，途中有一次 5px 的回撤。
    // 按逐帧 delta 切段时返程被切成 88px 的碎片，min(310, 88) 落到阈值之下 → 漏报。
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'anchoring', t: at(0) },
      contentHeight(1, 5_000),
      scrollTo(0, 2_762),
      scrollTo(20, 2_452),
      scrollTo(40, 2_540),
      scrollTo(60, 2_535),
      scrollTo(80, 2_800),
      scrollTo(100, 3_068),
    ];

    const report = judge(events, 'offset-reversal');
    expect(report.metrics.maxBouncePx).toBe(310);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toMatchObject({ backPx: 616, bouncePx: 310, outPx: 310 });
  });

  it('抓住去回两腿都很长的往返', () => {
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'anchoring', t: at(0) },
      contentHeight(1, 5_000),
      scrollTo(10, 3_000),
      scrollTo(20, 2_400),
      scrollTo(30, 3_000),
    ];

    const report = judge(events, 'offset-reversal');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toMatchObject({ backPx: 600, bouncePx: 600, outPx: 600 });
  });
});

describe('estimate-collapse 与 row-shrink', () => {
  it('把首次实测算作估值修正，之后的变矮才算行回缩', () => {
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'anchoring', t: at(0) },
      // 新行按同类均值占位 3012px，实测只有 48px：一帧内内容少掉近 3000px。
      { e: 'itemSize', index: 3, key: 'assistant-2', prev: 3012, size: 48, t: at(10) },
      { e: 'itemSize', index: 3, key: 'assistant-2', prev: 48, size: 43, t: at(20) },
      { e: 'itemSize', index: 3, key: 'assistant-2', prev: 400, size: 300, t: at(30) },
    ];

    expect(judge(events, 'estimate-collapse').violations).toHaveLength(1);
    expect(judge(events, 'estimate-collapse').metrics.maxCorrectionPx).toBe(2_964);

    const rowShrink = judge(events, 'row-shrink');
    expect(rowShrink.violations).toHaveLength(1);
    expect(rowShrink.violations[0].detail).toMatchObject({ shrinkPx: 100 });
  });
});

describe('viewport-blank', () => {
  it('按视口越过内容末端的比例判定，并要求持续够久', () => {
    const events: ProbeEvent[] = [
      { e: 'phase', phase: 'anchoring', t: at(0) },
      { e: 'viewport', h: 800, t: at(1) },
      { e: 'content', h: 1_000, ready: true, t: at(2) },
      // 视口 [900, 1700) 里只有 100px 是内容，其余 700/800 = 87.5% 是预留空白。
      { e: 'scroll', t: at(10), y: 900 },
      { e: 'scroll', t: at(200), y: 901 },
      { e: 'scroll', t: at(300), y: 100 },
    ];

    const report = judge(events, 'viewport-blank');
    expect(report.metrics.maxBlankPercent).toBe(88);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toMatchObject({ durationMs: 290 });
  });
});
