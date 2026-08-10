import { extensionRegistry, type ToolCapability } from '@cherrystudio/ai-core/provider';
import { describe, expect, it } from 'vitest';

import { extensions } from '../extensions';

for (const extension of extensions) {
  if (!extensionRegistry.has(extension.config.name)) {
    extensionRegistry.register(extension);
  }
}

const FACTORY_DELIVERY: Record<string, Partial<Record<string, string[]>>> = {
  anthropic: { 'url-context': ['anthropic'], 'web-search': ['anthropic'] },
  'aws-bedrock': { 'url-context': ['bedrock'], 'web-search': ['bedrock'] },
  'azure-openai': {
    'url-context': ['azure-anthropic'],
    'web-search': ['azure', 'azure-responses', 'azure-anthropic'],
  },
  'claude-code': { 'url-context': ['anthropic'] },
  doubao: { 'web-search': ['openai'] },
  gemini: { 'url-context': ['google'], 'web-search': ['google'] },
  grok: { 'web-search': ['xai-responses'] },
  moonshot: { 'web-search': ['moonshot'] },
  openai: { 'web-search': ['openai', 'openai-chat'] },
  openrouter: { 'url-context': ['openrouter'], 'web-search': ['openrouter'] },
  vertexai: {
    'url-context': ['google-vertex'],
    'web-search': ['google-vertex', 'google-vertex-anthropic'],
  },
};

const CAPABILITY: Record<string, ToolCapability> = {
  'url-context': 'urlContext',
  'web-search': 'webSearch',
};

describe('factory-backed server tools have a runtime delivery path', () => {
  it.each(
    Object.entries(FACTORY_DELIVERY).flatMap(([providerId, tools]) =>
      Object.entries(tools).flatMap(([toolId, extensionNames]) =>
        (extensionNames ?? []).map((extensionName) => ({ extensionName, providerId, toolId })),
      ),
    ),
  )('$providerId $toolId resolves a $extensionName toolFactory', ({ extensionName, toolId }) => {
    expect(extensionRegistry.getToolFactory(extensionName, CAPABILITY[toolId])).toBeDefined();
  });
});
