/**
 * 布局基准用的假语言模型：按 `bench:` 指令回放确定性夹具，不发任何网络请求。
 *
 * 走 ai-sdk 的 `simulateReadableStream` 而不是本地 mock server，是因为基准要的是
 * **可复现的渲染负载**：网络抖动会污染位移轨迹，而 chunk 速率必须可编程才能分档对比。
 * 代价是绕过了真实的 fetch/SSE 解码，这部分开销在 A/B 两侧都缺席，不影响对比结论。
 */

import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

import { armLayoutBenchProbe } from '@/shared/devBench/layoutBenchProbe';

import { chunkText, parseBenchRequest } from './benchRequest';
import { BENCH_FIXTURE_IDS, BENCH_FIXTURES } from './fixtures';

export const BENCH_MODEL_PROVIDER = 'layout-bench';

const HELP_TEXT = `这是布局基准的 mock provider，不会发起真实请求。

发送 \`bench:<fixture>[@<chunksPerSecond>]\` 来回放确定性夹具，例如：

- \`bench:text\`——长中文段落（行高基线对照组）
- \`bench:code@20\`——代码块，每秒 20 个 chunk
- \`bench:mixed@40\`——复合长回复，用于压满视口触发尾随阶段

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

function buildStreamParts(prompt: LanguageModelV3Prompt): {
  chunkDelayInMs: number | null;
  initialDelayInMs: number | null;
  parts: LanguageModelV3StreamPart[];
} {
  const request = parseBenchRequest(extractLatestUserText(prompt));
  const parts: LanguageModelV3StreamPart[] = [{ type: 'stream-start', warnings: [] }];

  if (!request) {
    // 不是 bench 指令时回显用法，而不是静默返回空回复——空回复会让基准失败的原因看起来
    // 像布局问题，实际却只是指令拼错了。
    parts.push(
      { id: 'help', type: 'text-start' },
      { delta: HELP_TEXT, id: 'help', type: 'text-delta' },
      { id: 'help', type: 'text-end' },
      { finishReason: { raw: 'stop', unified: 'stop' }, type: 'finish', usage: BENCH_USAGE },
    );

    return { chunkDelayInMs: null, initialDelayInMs: null, parts };
  }

  const fixture = BENCH_FIXTURES[request.fixtureId];

  if (fixture.reasoning) {
    parts.push({ id: 'reasoning-1', type: 'reasoning-start' });
    for (const delta of chunkText(fixture.reasoning)) {
      parts.push({ delta, id: 'reasoning-1', type: 'reasoning-delta' });
    }
    parts.push({ id: 'reasoning-1', type: 'reasoning-end' });
  }

  parts.push({ id: 'text-1', type: 'text-start' });
  for (const delta of chunkText(fixture.text)) {
    parts.push({ delta, id: 'text-1', type: 'text-delta' });
  }
  parts.push(
    { id: 'text-1', type: 'text-end' },
    { finishReason: { raw: 'stop', unified: 'stop' }, type: 'finish', usage: BENCH_USAGE },
  );

  return {
    chunkDelayInMs: request.chunkDelayInMs,
    initialDelayInMs: request.initialDelayInMs,
    parts,
  };
}

export function createBenchLanguageModel(modelId: string): LanguageModelV3 {
  // 在模型被构造时就 arm 探针（而不是等 doStream），这样第一条 bench 消息的钉顶阶段也能
  // 被记录到——Agent 构造发生在助手占位行渲染之前。
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
    doStream: async ({ prompt }: LanguageModelV3CallOptions) => {
      const { chunkDelayInMs, initialDelayInMs, parts } = buildStreamParts(prompt);

      return {
        stream: simulateReadableStream({ chunkDelayInMs, chunks: parts, initialDelayInMs }),
      };
    },
    modelId,
    provider: BENCH_MODEL_PROVIDER,
  });
}
