/**
 * `pnpm bench:layout` —— 聊天列表布局/跳动的本地基准。
 *
 * 形态是「回归基准 + 诊断工具」，不是 CI 门禁：它驱动模拟器跑固定场景，把 app 内探针发出的
 * 轨迹跑一遍相位感知的判据，产出结构化结果、检查点截图与人读摘要。断言默认全绿，已知未修的
 * 问题写进 known-issues.json。
 *
 * 前置条件（缺一不可，脚本会尽量给出可执行的报错）：
 * - dev 构建的 app 已装在目标模拟器上，并已连上 Metro（探针只在 __DEV__ 下发）；
 * - `agent-device` 在 PATH 上；
 * - 目标模拟器唯一在跑，或用 `--udid` / `LAYOUT_BENCH_UDID` 指定。
 *
 * 用法：
 *   pnpm bench:layout
 *   pnpm bench:layout --scenario send-anchor,stream-scroll
 *   pnpm bench:layout --udid <UDID> --out artifacts/layout-bench/baseline
 */

import * as fs from 'fs';
import * as path from 'path';

import { renderTraceSvg } from './chart';
import { Device, resolveUdid } from './device';
import { runJudges } from './judges';
import { buildTrace, parseProbeLog } from './probe';
import {
  loadKnownIssues,
  partitionViolations,
  type RunResult,
  type ScenarioResult,
  writeRun,
} from './report';
import { LAYOUT, SCENARIOS, type Scenario, type Step } from './scenarios';

const ROOT = path.resolve(__dirname, '..', '..');
const KNOWN_ISSUES_FILE = path.join(__dirname, 'known-issues.json');
const METRO_URL = process.env.LAYOUT_BENCH_METRO_URL ?? 'http://localhost:8081';
/** 冷启动到 postReady 的余量；实测本机 ~14s，留一倍。 */
const APP_BOOT_SETTLE_MS = 30_000;

type Options = {
  outputDir: string;
  /** 只对已采集的 trace 重跑判据，不碰设备。 */
  replay?: string;
  scenarios: Scenario[];
  udid?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): Options {
  let udid: string | undefined;
  let outputDir: string | undefined;
  let filter: string | undefined;
  let replay: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--udid') {
      udid = argv[++index];
    } else if (arg === '--out') {
      outputDir = argv[++index];
    } else if (arg === '--scenario') {
      filter = argv[++index];
    } else if (arg === '--replay') {
      replay = argv[++index];
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  const wanted = filter?.split(',').map((entry) => entry.trim());
  const scenarios = wanted
    ? SCENARIOS.filter((scenario) => wanted.includes(scenario.id))
    : SCENARIOS;

  if (scenarios.length === 0) {
    const available = SCENARIOS.map((scenario) => scenario.id).join(', ');
    throw new Error(`没有匹配的场景；可用：${available}`);
  }

  // 时间戳目录：同一 commit 连跑多次要能各自留档，A/B 对比靠两个目录。
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    outputDir: path.resolve(ROOT, outputDir ?? path.join('artifacts', 'layout-bench', stamp)),
    replay,
    scenarios,
    // 重放不碰设备，此时没有模拟器在跑也应当能用。
    udid: replay ? undefined : resolveUdid(udid),
  };
}

async function runStep(
  device: Device,
  step: Step,
  context: { checkpointDir: string; checkpoints: string[] },
): Promise<void> {
  switch (step.kind) {
    case 'checkpoint': {
      const file = path.join(context.checkpointDir, `${step.name}.png`);
      device.screenshot(file);
      device.logsMark(`CHECKPOINT_${step.name}`);
      context.checkpoints.push(step.name);
      return;
    }
    case 'deepLink':
      device.openUrl(step.url);
      return;
    case 'press':
      device.press(step.x, step.y);
      return;
    case 'send':
      device.press(LAYOUT.sendWithKeyboard.x, LAYOUT.sendWithKeyboard.y);
      return;
    case 'swipe':
      device.swipe(step.fromX, step.fromY, step.toX, step.toY);
      return;
    case 'type':
      device.type(step.text);
      return;
    case 'wait':
      await sleep(step.ms);
      return;
  }
}

function judgeEvents(
  scenario: string,
  description: string,
  raw: string,
  chartDir: string,
): ScenarioResult {
  const events = parseProbeLog(raw);
  const trace = buildTrace(events);
  const judges = runJudges(trace);
  const partitioned = partitionViolations(judges, scenario, loadKnownIssues(KNOWN_ISSUES_FILE));

  // 判据给的是「红还是绿」，轨迹图给的是「这一段动得顺不顺」。零违规的轨迹之间仍有好坏之
  // 分（单调爬升 vs 阈值底下反复搓动），跨轮对比时先看图能省掉大半次翻 jsonl。
  fs.mkdirSync(chartDir, { recursive: true });
  fs.writeFileSync(
    path.join(chartDir, 'trace.svg'),
    `${renderTraceSvg(trace, { scenario, violations: partitioned.violations })}\n`,
  );

  for (const judge of judges) {
    const metrics = Object.entries(judge.metrics)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    const mark = judge.violations.length === 0 ? '✓' : `✗ ${judge.violations.length}`;
    process.stdout.write(`  ${mark.padEnd(4)} ${judge.judge.padEnd(24)} ${metrics}\n`);
  }

  return {
    checkpoints: [],
    description,
    durationMs: 0,
    judges,
    probeEvents: events.length,
    scenario,
    ...partitioned,
  };
}

async function runScenario(
  device: Device,
  scenario: Scenario,
  outputDir: string,
): Promise<ScenarioResult> {
  const checkpointDir = path.join(outputDir, scenario.id);
  fs.mkdirSync(checkpointDir, { recursive: true });
  const context = { checkpointDir, checkpoints: [] as string[] };

  process.stdout.write(`\n▶ ${scenario.id} — ${scenario.description}\n`);

  process.stdout.write('  造场…\n');
  for (const step of scenario.setup) {
    await runStep(device, step, context);
  }

  // 日志在造场之后、判定之前清空：这样一轮采集里只有被测的那段流式。
  device.logsClear();
  const startedAt = Date.now();

  process.stdout.write('  采集…\n');
  for (const step of scenario.measure) {
    await runStep(device, step, context);
  }

  const durationMs = Date.now() - startedAt;
  const raw = fs.readFileSync(device.logsPath(), 'utf8');
  const events = parseProbeLog(raw);
  fs.writeFileSync(
    path.join(checkpointDir, 'probe.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );

  if (events.length === 0) {
    throw new Error(
      `场景 ${scenario.id} 没有采到任何探针事件。常见原因：app 没连上 Metro（回到了 dev client 的启动页），` +
        '或这一轮没有真正命中基准假模型（发送坐标失效 / 助手被改过）。' +
        `检查点截图在 ${checkpointDir}。`,
    );
  }

  return {
    ...judgeEvents(scenario.id, scenario.description, raw, checkpointDir),
    checkpoints: context.checkpoints,
    durationMs,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const run: RunResult = {
    scenarios: [],
    startedAt: new Date().toISOString(),
    udid: options.udid ?? 'replay',
  };

  if (options.replay) {
    const file = path.resolve(ROOT, options.replay);
    process.stdout.write(`\n▶ 重放 ${path.relative(ROOT, file)}\n`);
    run.scenarios.push(
      judgeEvents(
        options.scenarios[0].id,
        `重放自 ${path.relative(ROOT, file)}`,
        fs.readFileSync(file, 'utf8'),
        options.outputDir,
      ),
    );
    writeRun(options.outputDir, run);
    const replayViolations = run.scenarios[0].violations.length;
    process.stdout.write(`\n违规 ${replayViolations} 条\n`);
    process.exitCode = replayViolations === 0 ? 0 : 1;
    return;
  }

  const device = new Device(options.udid!);
  device.disableDevMenuFloatingButton();

  // 每轮都从「重新接上 Metro」开始，而不是假定 app 还停在上一轮的状态。dev client 被重启或
  // 断连后会停在自己的服务器列表页，此后每一次坐标点击都打在启动页上，最终以一句无从诊断的
  // XCTest 失败收场。顺带把冷启动固定成每轮的起点，跨轮对比才有可比性。
  process.stdout.write(`\n接回 ${METRO_URL}…\n`);
  device.ensureDevClientAttached(METRO_URL);
  await sleep(APP_BOOT_SETTLE_MS);

  for (const scenario of options.scenarios) {
    run.scenarios.push(await runScenario(device, scenario, options.outputDir));
  }

  writeRun(options.outputDir, run);

  const violations = run.scenarios.reduce((sum, scenario) => sum + scenario.violations.length, 0);
  const known = run.scenarios.reduce((sum, scenario) => sum + scenario.knownViolations.length, 0);
  process.stdout.write(
    `\n产物：${path.relative(ROOT, options.outputDir)}\n违规 ${violations} 条，已知问题 ${known} 条\n`,
  );

  process.exitCode = violations === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
