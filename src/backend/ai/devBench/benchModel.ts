/**
 * 布局基准用的假语言模型：按 `bench:` 指令回放确定性夹具，不发任何网络请求。
 *
 * 本地回放而不是本地 mock server，是因为基准要的是**可复现的渲染负载**：网络抖动会污染
 * 位移轨迹，而 chunk 速率必须可编程才能分档对比。代价是绕过了真实的 fetch/SSE 解码，这部分
 * 开销在 A/B 两侧都缺席，不影响对比结论。
 */

import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';

import { armLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import { chunkText, parseBenchRequest } from './benchRequest';
import { BENCH_FIXTURE_IDS, BENCH_FIXTURES } from './fixtures';

export const BENCH_MODEL_PROVIDER = 'layout-bench';

const HELP_TEXT = `这是布局基准的 mock provider，不会发起真实请求。

发送 \`bench:<fixture>[@<chunksPerSecond>][+<pendingMs>[+<reasoningMs>]]\` 来回放确定性夹具，例如：

- \`bench:text\`——长中文段落（行高基线对照组）
- \`bench:code@20\`——代码块，每秒 20 个 chunk
- \`bench:mixed@40\`——复合长回复，用于压满视口触发尾随阶段
- \`bench:mixed@40+2000+2000\`——待生成占位停 2 秒、思考块再写 2 秒，然后才进正文

可用夹具：${BENCH_FIXTURE_IDS.join('、')}`;

const BENCH_USAGE: LanguageModelV3Usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 8, total: 8 },
  outputTokens: { reasoning: 0, text: 256, total: 256 },
};

/** 取最后一条用户消息的纯文本，`bench:` 指令就写在这里。 */
function extractLatestUserText(prompt: LanguageModelV3Prompt): string {
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    const message = prompt[index];
    if (message.role !== 'user') {
      continue;
    }

    return message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }

  return '';
}

/** 一个流式分片，外加它**自己**送出之前要等多久。 */
type PacedStreamPart = { delayInMs: number; part: LanguageModelV3StreamPart };

/**
 * 按分片自带的延迟回放。
 *
 * 不用 ai-sdk 的 `simulateReadableStream`：它只认一个全局 `chunkDelayInMs`，而基准要分别
 * 控制「待生成占位 → 思考块 → 正文」三段的时长。这三段在界面上是三种不同的状态，各自停留
 * 了多久正是要被看见的东西，混成一个速率就没法分别调了。
 */
function createPacedStream(parts: PacedStreamPart[]): ReadableStream<LanguageModelV3StreamPart> {
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      const next = parts[index];
      if (!next) {
        controller.close();
        return;
      }

      index += 1;
      if (next.delayInMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, next.delayInMs));
      }
      controller.enqueue(next.part);
    },
  });
}

function buildStreamParts(prompt: LanguageModelV3Prompt): PacedStreamPart[] {
  const request = parseBenchRequest(extractLatestUserText(prompt));
  const parts: PacedStreamPart[] = [{ delayInMs: 0, part: { type: 'stream-start', warnings: [] } }];

  if (!request) {
    // 不是 bench 指令时回显用法，而不是静默返回空回复——空回复会让基准失败的原因看起来
    // 像布局问题，实际却只是指令拼错了。
    parts.push(
      { delayInMs: 0, part: { id: 'help', type: 'text-start' } },
      { delayInMs: 0, part: { delta: HELP_TEXT, id: 'help', type: 'text-delta' } },
      { delayInMs: 0, part: { id: 'help', type: 'text-end' } },
      {
        delayInMs: 0,
        part: {
          finishReason: { raw: 'stop', unified: 'stop' },
          type: 'finish',
          usage: BENCH_USAGE,
        },
      },
    );

    return parts;
  }

  const fixture = BENCH_FIXTURES[request.fixtureId];
  // 待生成占位的时长挂在**第一个有内容的分片**上：在它到达之前助手行里什么都没有，界面停在
  // 「待生成」占位上，这段等待因此就是那个状态的可见时长。
  let leadingDelayInMs = request.pendingDelayInMs;

  if (fixture.reasoning) {
    const reasoningDeltas = chunkText(fixture.reasoning);
    // 思考块给的是总时长，分片数由夹具决定，所以单片延迟得现算——换夹具时思考块停留的时间
    // 不该跟着文案长度漂。
    const reasoningChunkDelayInMs = Math.round(
      request.reasoningDurationInMs / Math.max(reasoningDeltas.length, 1),
    );

    parts.push({
      delayInMs: leadingDelayInMs,
      part: { id: 'reasoning-1', type: 'reasoning-start' },
    });
    leadingDelayInMs = 0;
    for (const delta of reasoningDeltas) {
      parts.push({
        delayInMs: reasoningChunkDelayInMs,
        part: { delta, id: 'reasoning-1', type: 'reasoning-delta' },
      });
    }
    parts.push({ delayInMs: 0, part: { id: 'reasoning-1', type: 'reasoning-end' } });
  }

  parts.push({ delayInMs: leadingDelayInMs, part: { id: 'text-1', type: 'text-start' } });
  for (const delta of chunkText(fixture.text)) {
    parts.push({
      delayInMs: request.chunkDelayInMs,
      part: { delta, id: 'text-1', type: 'text-delta' },
    });
  }
  parts.push(
    { delayInMs: 0, part: { id: 'text-1', type: 'text-end' } },
    {
      delayInMs: 0,
      part: { finishReason: { raw: 'stop', unified: 'stop' }, type: 'finish', usage: BENCH_USAGE },
    },
  );

  return parts;
}

export function createBenchLanguageModel(modelId: string): LanguageModelV3 {
  // 兜底 arm：正常路径由聊天屏在 harness 的入口深链接上 arm（早得多），这里只覆盖「手动选了
  // 基准模型、没走那个深链接」的情形。**不能**只靠这里——模型直到 streamText 才被构造，而
  // 入场动画的装填与开火在那之前，首轮会一条都记不到。
  armLayoutBenchProbe();

  return new MockLanguageModelV3({
    doGenerate: async ({ prompt }: LanguageModelV3CallOptions) => {
      const request = parseBenchRequest(extractLatestUserText(prompt));
      const text = request ? BENCH_FIXTURES[request.fixtureId].text : HELP_TEXT;

      return {
        content: [{ text, type: 'text' as const }],
        finishReason: { raw: 'stop' as const, unified: 'stop' as const },
        usage: BENCH_USAGE,
        warnings: [],
      };
    },
    doStream: async ({ prompt }: LanguageModelV3CallOptions) => ({
      stream: createPacedStream(buildStreamParts(prompt)),
    }),
    modelId,
    provider: BENCH_MODEL_PROVIDER,
  });
}
