import type {
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3Message,
} from '@ai-sdk/provider';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { transformAnthropicCacheParams } from '../anthropicCache';

function makeProvider(cacheControl?: Provider['settings']['cacheControl']): Provider {
  return {
    id: 'anthropic',
    settings: cacheControl === undefined ? {} : { cacheControl },
  } as Provider;
}

function textMessage(role: 'assistant' | 'system' | 'user', text: string): LanguageModelV3Message {
  if (role === 'system') return { content: text, role };
  return { content: [{ text, type: 'text' }], role };
}

function makeTool(name: string, descriptionChars = 10): LanguageModelV3FunctionTool {
  return {
    description: 'd'.repeat(descriptionChars),
    inputSchema: {
      properties: {
        value: { description: 'x'.repeat(descriptionChars), type: 'string' },
      },
      type: 'object',
    },
    name,
    type: 'function',
  };
}

function hasCacheControl(value: { providerOptions?: unknown }): boolean {
  return Boolean(
    (value.providerOptions as { anthropic?: { cacheControl?: unknown } } | undefined)?.anthropic
      ?.cacheControl,
  );
}

function countCacheMarkers(params: LanguageModelV3CallOptions): number {
  let count = 0;
  for (const tool of params.tools ?? []) {
    if ('providerOptions' in tool && hasCacheControl(tool)) count++;
  }
  for (const message of params.prompt) {
    if (hasCacheControl(message)) count++;
    if (typeof message.content !== 'string') {
      for (const part of message.content) {
        if ('providerOptions' in part && hasCacheControl(part)) count++;
      }
    }
  }
  return count;
}

async function transform(
  input: Partial<LanguageModelV3CallOptions>,
  provider = makeProvider(),
  assistant?: Assistant,
): Promise<LanguageModelV3CallOptions> {
  return transformAnthropicCacheParams(
    {
      prompt: [textMessage('system', 'system'), textMessage('user', 'hello')],
      ...input,
    } as LanguageModelV3CallOptions,
    provider,
    assistant,
  );
}

describe('transformAnthropicCacheParams', () => {
  it('does not emit markers when explicitly disabled', async () => {
    const output = await transform(
      { prompt: [textMessage('system', 'x '.repeat(3000))] },
      makeProvider({ enabled: false, tokenThreshold: 1024 }),
    );
    expect(countCacheMarkers(output)).toBe(0);
  });

  it('does not emit markers for migrated threshold-zero providers', async () => {
    const output = await transform(
      {
        prompt: [textMessage('system', 'x '.repeat(3000)), textMessage('user', 'u '.repeat(3000))],
        tools: [makeTool('mcp_tool', 6000)],
      },
      makeProvider({ enabled: true, tokenThreshold: 0 }),
    );
    expect(countCacheMarkers(output)).toBe(0);
  });

  it('does not emit markers below the default prefix threshold', async () => {
    const output = await transform({ prompt: [textMessage('system', 'short')] });
    expect(countCacheMarkers(output)).toBe(0);
  });

  it('uses the configured threshold without local model guesses', async () => {
    const output = await transform(
      { prompt: [textMessage('system', 'x '.repeat(1500))] },
      makeProvider({ enabled: true, tokenThreshold: 1024 }),
    );
    expect(countCacheMarkers(output)).toBe(1);
  });

  it('uses tool definitions in the cumulative system-prefix gate', async () => {
    const output = await transform({
      prompt: [textMessage('system', 'short')],
      tools: [makeTool('mcp_tool', 6000)],
    });

    expect(hasCacheControl(output.prompt[0])).toBe(true);
    expect(
      output.tools?.filter((tool) => 'providerOptions' in tool && hasCacheControl(tool)),
    ).toHaveLength(1);
  });

  it('keeps the total marker count under the four-breakpoint ceiling', async () => {
    const output = await transform(
      {
        prompt: [
          textMessage('system', 'x '.repeat(3000)),
          textMessage('user', 'u '.repeat(3000)),
          textMessage('assistant', 'a '.repeat(3000)),
          textMessage('user', 'u '.repeat(3000)),
          textMessage('assistant', 'a '.repeat(3000)),
          textMessage('user', 'u '.repeat(3000)),
        ],
        tools: [makeTool('z_tool', 5000), makeTool('a_tool', 5000)],
      },
      makeProvider({ enabled: true, tokenThreshold: 1024, cacheLastNMessages: 6 }),
    );

    expect(countCacheMarkers(output)).toBe(4);
    expect(hasCacheControl(output.prompt[0])).toBe(true);
    expect(
      output.tools?.filter((tool) => 'providerOptions' in tool && hasCacheControl(tool)),
    ).toHaveLength(1);
  });

  it('sorts inline tools and marks one deterministic definition', async () => {
    const output = await transform({
      prompt: [textMessage('system', 'short')],
      tools: [makeTool('z_tool', 6000), makeTool('a_tool', 6000)],
    });

    expect(output.tools?.map((tool) => tool.name)).toEqual(['a_tool', 'z_tool']);
    expect(
      output.tools?.filter((tool) => 'providerOptions' in tool && hasCacheControl(tool)),
    ).toHaveLength(1);
    expect(hasCacheControl(output.tools?.at(-1) as LanguageModelV3FunctionTool)).toBe(true);
  });

  it('serializes the selected tool set identically regardless of input order', async () => {
    const first = await transform({
      prompt: [textMessage('system', 'short')],
      tools: [makeTool('z_tool', 2000), makeTool('a_tool', 2000)],
    });
    const second = await transform({
      prompt: [textMessage('system', 'short')],
      tools: [makeTool('a_tool', 2000), makeTool('z_tool', 2000)],
    });

    expect(JSON.stringify(first.tools)).toBe(JSON.stringify(second.tools));
  });

  it('counts tool-result payloads for trailing cache breakpoints', async () => {
    const output = await transform({
      prompt: [
        textMessage('system', 'short'),
        {
          content: [
            {
              output: { type: 'text', value: 'tool output '.repeat(3000) },
              toolCallId: 'call-1',
              toolName: 'large_mcp_tool',
              type: 'tool-result',
            },
          ],
          role: 'assistant',
        },
      ],
    });
    expect(countCacheMarkers(output)).toBe(1);
  });

  it('skips prompt markers for volatile time variables but keeps the stable tool marker', async () => {
    const output = await transform(
      {
        prompt: [
          textMessage('system', 'x '.repeat(3000)),
          textMessage('user', 'u '.repeat(3000)),
          textMessage('assistant', 'a '.repeat(3000)),
        ],
        tools: [makeTool('mcp_tool', 6000)],
      },
      makeProvider({ enabled: true, tokenThreshold: 1024, cacheLastNMessages: 2 }),
      { id: 'assistant-1', prompt: 'Current time: {{time}}' } as Assistant,
    );

    expect(hasCacheControl(output.prompt[0])).toBe(false);
    expect(
      output.tools?.filter((tool) => 'providerOptions' in tool && hasCacheControl(tool)),
    ).toHaveLength(1);
    expect(countCacheMarkers({ ...output, tools: undefined })).toBe(0);
  });

  it('merges cache metadata with existing provider options', async () => {
    const message = {
      ...textMessage('system', 'x '.repeat(3000)),
      providerOptions: { anthropic: { existing: true }, custom: { retained: true } },
    };
    const output = await transform({ prompt: [message] });

    expect(output.prompt[0].providerOptions).toMatchObject({
      anthropic: { cacheControl: { type: 'ephemeral' }, existing: true },
      custom: { retained: true },
    });
  });
});
