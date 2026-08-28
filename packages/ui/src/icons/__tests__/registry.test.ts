import { MODEL_ICONS } from '../../icons-webp/models';
import { PROVIDER_ICONS } from '../../icons-webp/providers';
import {
  resolveIcon,
  resolveModelIcon,
  resolveModelProviderIcon,
  resolveModelToProviderIcon,
  resolveProviderIcon,
} from '../registry';

describe('WebP icon registry', () => {
  test('resolves the most specific model icon first', () => {
    expect(resolveModelIcon('gpt-5.1-codex-mini')).toBe(MODEL_ICONS['gpt-5-1-codex-mini']);
  });

  test.each([
    ['openai/gpt-5.6-luna-pro', 'gpt-5-6-luna'],
    ['gpt-5.5-pro', 'gpt-5-5-pro'],
    ['gpt-5.4-mini', 'gpt-5-4-mini'],
    ['gpt-5.3-codex-spark', 'gpt-5-3-codex'],
  ] as const)('keeps desktop GPT routing for %s', (modelId, iconKey) => {
    expect(resolveModelIcon(modelId)).toBe(MODEL_ICONS[iconKey]);
  });

  test('keeps model icon patterns aligned with desktop aliases', () => {
    expect(resolveModelIcon('hunyuan-t1')).toBe(MODEL_ICONS.hunyuan);
    expect(resolveModelIcon('mimo-vl-7b')).toBe(MODEL_ICONS.mimo);
    expect(resolveModelIcon('kimi-k2')).toBe(MODEL_ICONS.kimi);
  });

  test('resolves provider aliases and desktop-style provider asset ids', () => {
    expect(resolveProviderIcon('azure-openai')).toBe(resolveProviderIcon('azureai'));
    expect(resolveProviderIcon('arcee-ai')).toBe(PROVIDER_ICONS['arcee-ai']);
    expect(resolveProviderIcon('github-copilot')).toBe(PROVIDER_ICONS['github-copilot']);
    expect(resolveProviderIcon('githubCopilot')).toBe(PROVIDER_ICONS['github-copilot']);
    expect(resolveProviderIcon('openai-codex')).toBe(PROVIDER_ICONS.openai);
    expect(resolveProviderIcon('grok-cli')).toBe(PROVIDER_ICONS.grok);
    expect(resolveProviderIcon('tokenhub')).toBe(PROVIDER_ICONS['tencent-cloud-ti']);
    expect(resolveProviderIcon('doubao')).toBe(PROVIDER_ICONS.volcengine);
    expect(resolveProviderIcon('dashscope')).toBe(PROVIDER_ICONS.bailian);
    expect(resolveProviderIcon('github-copilot-openai-compatible')).toBe(
      PROVIDER_ICONS['github-copilot'],
    );
  });

  test('keeps broad model family names token-bounded', () => {
    expect(resolveModelIcon('sora')).toBe(MODEL_ICONS.sora);
    expect(resolveModelIcon('pandora')).toBeUndefined();
    expect(resolveModelIcon('wan-2-1')).toBe(MODEL_ICONS.qwen);
    expect(resolveModelIcon('taiwan-llm')).toBeUndefined();
    expect(resolveModelIcon('ling-1t')).toBe(MODEL_ICONS.ling);
    expect(resolveModelIcon('spring-1t')).toBeUndefined();
  });

  test('resolves provider icons inferred from model ids', () => {
    expect(resolveModelToProviderIcon('llama-3.1-70b')).toBe(PROVIDER_ICONS.meta);
    expect(resolveModelToProviderIcon('runway-gen-4')).toBe(PROVIDER_ICONS.runway);
    expect(resolveModelToProviderIcon('arcee-ai/spotlight')).toBe(PROVIDER_ICONS['arcee-ai']);
    expect(resolveModelToProviderIcon('dolphin-2.9')).toBe(PROVIDER_ICONS['dolphin-ai']);
  });

  test('falls back from model to provider icon', () => {
    expect(resolveModelProviderIcon('custom-chat-model', 'azure-openai')).toBe(
      PROVIDER_ICONS.azureai,
    );
  });

  test('resolves the full desktop-style fallback chain', () => {
    expect(resolveIcon('gpt-5.1-codex-mini', 'openai')).toBe(MODEL_ICONS['gpt-5-1-codex-mini']);
    expect(resolveIcon('llama-3.1-70b', 'openai')).toBe(MODEL_ICONS.meta);
    expect(resolveIcon('custom-chat-model', 'azure-openai')).toBe(PROVIDER_ICONS.azureai);
  });

  test('returns undefined when no resolver branch matches', () => {
    expect(resolveIcon('unknown-model', 'unknown-provider')).toBeUndefined();
  });
});
