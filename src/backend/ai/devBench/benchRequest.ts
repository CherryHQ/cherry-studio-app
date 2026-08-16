/**
 * `bench:` 指令的解析与 chunk 切分。
 *
 * 布局基准的场景选择走「魔法 prompt」而不是 app 内的开关面板：测试脚本发什么消息，就决定
 * 回什么夹具、以什么速率流式返回。好处是场景控制完全落在 harness 一侧，app 不需要任何额外
 * 配置界面或全局状态，日常开发使用这个 provider 也不会被影响。
 *
 * 语法：`bench:<fixture>[@<chunksPerSecond>][+<pendingMs>[+<reasoningMs>]]`，
 * 例如 `bench:code@20`、`bench:mixed@40+2000+2000`。
 *
 * 两个 `+` 段按顺序对应「待生成占位」和「思考块」两段的**可见时长**。它们是时长而不是速率：
 * 这两段在界面上是两种独立状态，要被看见的正是它们各自停留了多久；正文那段关心的才是生长
 * 速率，所以仍用 `@<chunksPerSecond>`。
 */

import { type BenchFixtureId, isBenchFixtureId } from './fixtures';

/**
 * 每个 chunk 的码点数。固定值而非按词切分：切分必须与文案内容无关才能保证任意夹具都得到
 * 可复现的 chunk 序列。按码点（而非 UTF-16 码元）切分，避免把代理对劈成半个字符。
 */
const CHARS_PER_CHUNK = 24;

const DEFAULT_CHUNKS_PER_SECOND = 20;
const MIN_CHUNKS_PER_SECOND = 1;
const MAX_CHUNKS_PER_SECOND = 1000;

/**
 * 首个流式分片之前的默认延迟，模拟真实请求的首 token 等待。默认值只求「别把待生成占位一闪
 * 而过」，真要看清那段状态请在指令里显式给时长——日常开发用这个 provider 时不该被迫等两秒。
 */
const DEFAULT_PENDING_DELAY_MS = 120;

/** 夹具带思考块但指令没给时长时，思考块的默认可见时长。 */
const DEFAULT_REASONING_DURATION_MS = 400;

const MAX_PHASE_DURATION_MS = 60_000;

const BENCH_PATTERN = /^bench:([a-z]+)(?:@(\d+))?(?:\+(\d+))?(?:\+(\d+))?$/i;

export type BenchRequest = {
  chunkDelayInMs: number;
  fixtureId: BenchFixtureId;
  /** 送出第一个流式分片前的等待，等同于界面上「待生成占位」的可见时长。 */
  pendingDelayInMs: number;
  /** 思考块从出现到写完的总时长；分片数由夹具决定，所以这里存总时长而非单片延迟。 */
  reasoningDurationInMs: number;
};

function clampDuration(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

  return Math.min(Number(raw), MAX_PHASE_DURATION_MS);
}

/**
 * 从用户输入解析 bench 指令。返回 null 表示这不是一条 bench 指令——调用方据此回退到
 * 「回显帮助文本」，而不是静默返回空回复。
 */
export function parseBenchRequest(text: string): BenchRequest | null {
  const match = BENCH_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }

  const [, rawFixture, rawRate, rawPending, rawReasoning] = match;
  const fixtureId = rawFixture.toLowerCase();
  if (!isBenchFixtureId(fixtureId)) {
    return null;
  }

  const rate = rawRate ? Number(rawRate) : DEFAULT_CHUNKS_PER_SECOND;
  const clampedRate = Math.min(Math.max(rate, MIN_CHUNKS_PER_SECOND), MAX_CHUNKS_PER_SECOND);

  return {
    chunkDelayInMs: Math.round(1000 / clampedRate),
    fixtureId,
    pendingDelayInMs: clampDuration(rawPending, DEFAULT_PENDING_DELAY_MS),
    reasoningDurationInMs: clampDuration(rawReasoning, DEFAULT_REASONING_DURATION_MS),
  };
}

/** 按固定码点数切分，保证同一文本永远得到同一 chunk 序列。 */
export function chunkText(text: string): string[] {
  const codePoints = Array.from(text);
  const chunks: string[] = [];

  for (let index = 0; index < codePoints.length; index += CHARS_PER_CHUNK) {
    chunks.push(codePoints.slice(index, index + CHARS_PER_CHUNK).join(''));
  }

  return chunks;
}
