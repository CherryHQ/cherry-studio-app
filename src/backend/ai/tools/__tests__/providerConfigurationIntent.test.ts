import type { ToolSet, UIMessage } from 'ai';

import { resolveProviderConfigurationToolName } from '../providerConfigurationIntent';

const providers = [
  { id: 'gemini', name: 'Gemini' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'cherryin', name: 'CherryIN' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'zai', name: 'zai' },
];
const tools = {
  configure_builtin_provider: {} as never,
  create_custom_provider: {} as never,
} satisfies ToolSet;

describe('resolveProviderConfigurationToolName', () => {
  test.each([
    '帮我配置服务商',
    '帮我配置 Gemini',
    '帮我配置openai',
    '请更新 CherryIN 服务商',
    '配置 Anthropic',
    'please configure OpenAI',
  ])('routes built-in provider configuration: %s', (text) => {
    expect(resolve(text)).toBe('configure_builtin_provider');
  });

  test.each(['帮我拉取模型', '同步 OpenRouter 模型', '帮我添加模型', 'refresh models'])(
    'routes built-in provider model management: %s',
    (text) => {
      expect(resolve(text)).toBe('configure_builtin_provider');
    },
  );

  test.each(['帮我创建一个服务商', '新建 provider', '请添加一个服务商', 'create a new provider'])(
    'routes explicit provider creation: %s',
    (text) => {
      expect(resolve(text)).toBe('create_custom_provider');
    },
  );

  test.each([
    '介绍一下 Gemini',
    'Gemini 有哪些模型',
    '写一份 Gemini SDK 配置教程',
    '帮我创建一个模型',
    'explain this amazing setup',
  ])('leaves ordinary questions on automatic tool selection: %s', (text) => {
    expect(resolve(text)).toBeUndefined();
  });

  test('does not route when the selected tool is unavailable', () => {
    expect(resolve('帮我配置 Gemini', {})).toBeUndefined();
    expect(
      resolve('帮我创建一个服务商', { configure_builtin_provider: {} as never }),
    ).toBeUndefined();
  });

  test('does not reroute an approval continuation ending in an assistant message', () => {
    expect(
      resolveProviderConfigurationToolName({
        messages: [message('user', '帮我配置 Gemini'), message('assistant', '')],
        providers,
        tools,
      }),
    ).toBeUndefined();
  });

  test('ignores non-UI message shapes used by generateText', () => {
    expect(
      resolveProviderConfigurationToolName({
        messages: [{ content: '帮我配置 Gemini', role: 'user' } as never],
        providers,
        tools,
      }),
    ).toBeUndefined();
  });
});

function resolve(text: string, availableTools: ToolSet = tools) {
  return resolveProviderConfigurationToolName({
    messages: [message('user', text)],
    providers,
    tools: availableTools,
  });
}

function message(role: 'assistant' | 'user', text: string): UIMessage {
  return { id: `${role}-message`, parts: [{ text, type: 'text' }], role };
}
