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
    src: 'readyGate',
    t: at(offsetMs),
  });

  it('忽略没有配对 begin 的 momentum end', () => {
    const events: ProbeEvent[] = [
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
    expect(report.violations[0].atMs).toBe(30);
  });
});

describe('scroll-button-visibility', () => {
  it('预留空间耗尽后，内容再次增长时要求按钮及时出现', () => {
    const events: ProbeEvent[] = [
      { e: 'endSpace', size: 300, t: at(0) },
      { e: 'endSpace', size: 0, t: at(100) },
      { e: 'content', h: 1_200, ready: true, t: at(120) },
      { e: 'button', t: at(150), visible: true },
    ];

    const report = judge(events, 'scroll-button-visibility');
    expect(report.metrics).toMatchObject({ expectedShows: 1, observedDelayMs: 30 });
    expect(report.violations).toHaveLength(0);

    const delayed = judge(
      [...events.slice(0, -1), { e: 'button', t: at(500), visible: true }],
      'scroll-button-visibility',
    );
    expect(delayed.violations).toHaveLength(1);
    expect(delayed.violations[0]).toMatchObject({ atMs: 120 });
  });

  it('预留空间尚未耗尽时不要求按钮出现', () => {
    const report = judge(
      [
        { e: 'endSpace', size: 300, t: at(0) },
        { e: 'content', h: 900, ready: true, t: at(100) },
      ],
      'scroll-button-visibility',
    );
    expect(report.metrics.expectedShows).toBe(0);
    expect(report.violations).toHaveLength(0);
  });
});

describe('streaming manual scroll contract', () => {
  it('只允许初始定位、发送钉顶与按钮点击发起程序化滚动', () => {
    const events: ProbeEvent[] = [
      { e: 'progScroll', src: 'readyGate', t: at(0) },
      { e: 'progScroll', src: 'anchorReady', t: at(100) },
      { e: 'progScroll', src: 'button', t: at(200) },
      { e: 'progScroll', src: 'continuousFollow', t: at(300) },
    ];

    const report = judge(events, 'stream-programmatic-scroll');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({ atMs: 300 });
    expect(report.metrics).toMatchObject({ programmaticScrolls: 4, unexpectedScrolls: 1 });
  });

  it('预留空间耗尽后的非交互位移算违规，手势造成的位移不算', () => {
    const events: ProbeEvent[] = [
      { e: 'endSpace', size: 300, t: at(0) },
      { e: 'endSpace', size: 0, t: at(100) },
      { e: 'content', h: 1_200, ready: true, t: at(120) },
      { e: 'scroll', t: at(130), y: 100 },
      { e: 'scroll', t: at(160), y: 132 },
    ];

    const report = judge(events, 'stream-position-stability');
    expect(report.metrics).toMatchObject({ maxStepPx: 32, stationaryWindow: 1 });
    expect(report.violations).toHaveLength(1);

    const userDriven = judge(
      [
        ...events.slice(0, -1),
        { e: 'interaction', kind: 'drag', state: 'begin', t: at(140) },
        { e: 'scroll', t: at(160), y: 132 },
        { e: 'interaction', kind: 'drag', state: 'end', t: at(180) },
      ],
      'stream-position-stability',
    );
    expect(userDriven.violations).toHaveLength(0);
  });
});

describe('scroll-button-chatter', () => {
  it('不把手势与其惯性余波里的翻转算成抖动', () => {
    const events: ProbeEvent[] = [
      { e: 'button', t: at(100), visible: false },
      { e: 'interaction', kind: 'drag', state: 'begin', t: at(200) },
      { e: 'button', t: at(250), visible: true },
      { e: 'interaction', kind: 'drag', state: 'end', t: at(300) },
      { e: 'button', t: at(700), visible: false },
      { e: 'button', t: at(900), visible: true },
    ];

    const report = judge(events, 'scroll-button-chatter');
    expect(report.metrics).toMatchObject({ toggles: 1, userDrivenToggles: 3 });
    expect(report.violations).toHaveLength(0);
  });

  it('照抓没有手势解释的连续脉动', () => {
    const events: ProbeEvent[] = [
      { e: 'button', t: at(100), visible: true },
      { e: 'button', t: at(133), visible: false },
      { e: 'button', t: at(166), visible: true },
      { e: 'button', t: at(200), visible: false },
    ];

    const report = judge(events, 'scroll-button-chatter');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toMatchObject({ count: 4 });
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
      contentHeight(1, 5_000),
      scrollTo(10, 2_400),
      scrollTo(20, 2_700),
      scrollTo(30, 3_000),
      scrollTo(40, 2_995),
    ];

    const report = judge(events, 'offset-reversal');
    expect(report.metrics.maxBouncePx).toBe(0);
    expect(report.violations).toHaveLength(0);
  });

  it('爬升途中的微抖动不得把返程切碎', () => {
    const events: ProbeEvent[] = [
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
      { e: 'viewport', h: 800, t: at(1) },
      { e: 'content', h: 1_000, ready: true, t: at(2) },
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
