import { join } from 'node:path';
import sharp from 'sharp';
import { resolveModelProviderIcon, resolveModelToProviderIcon } from '../../icons';
import { GENERAL_ICONS } from '../general';
import { PROVIDER_ICONS, resolveProviderIcon } from '../providers';

describe('provider WebP icon registry', () => {
  test('resolves provider icons by id', () => {
    expect(resolveProviderIcon('openai')).toBe(PROVIDER_ICONS.openai);
    expect(resolveProviderIcon('radeon-cloud')).toBe(PROVIDER_ICONS['radeon-cloud']);
  });

  test('resolves provider aliases', () => {
    expect(resolveProviderIcon('azure-openai')).toBe(resolveProviderIcon('azureai'));
  });

  test('adapts the desktop virtual opencode provider to the general glyph', () => {
    expect(resolveProviderIcon('opencode')).toBe(GENERAL_ICONS['open-code']);
  });

  test('resolves kebab-case provider asset ids', () => {
    expect(resolveProviderIcon('arcee-ai')).toBe(PROVIDER_ICONS['arcee-ai']);
    expect(resolveProviderIcon('github-copilot')).toBe(PROVIDER_ICONS['github-copilot']);
    expect(resolveProviderIcon('githubCopilot')).toBe(PROVIDER_ICONS['github-copilot']);
    expect(resolveProviderIcon('openai-codex')).toBe(PROVIDER_ICONS.openai);
    expect(resolveProviderIcon('grok-cli')).toBe(PROVIDER_ICONS.grok);
    expect(resolveProviderIcon('tokenhub')).toBe(PROVIDER_ICONS['tencent-cloud-ti']);
  });

  test('resolves provider icons inferred from model ids', () => {
    expect(resolveModelToProviderIcon('llama-3.1-70b')).toBe(PROVIDER_ICONS.meta);
    expect(resolveModelToProviderIcon('runway-gen-4')).toBe(PROVIDER_ICONS.runway);
    expect(resolveModelToProviderIcon('arcee-ai/spotlight')).toBe(PROVIDER_ICONS['arcee-ai']);
    expect(resolveModelToProviderIcon('dolphin-2.9')).toBe(PROVIDER_ICONS['dolphin-ai']);
  });

  test('falls back to provider id when model id has no provider match', () => {
    expect(resolveModelProviderIcon('custom-chat-model', 'azure-openai')).toBe(
      PROVIDER_ICONS.azureai,
    );
  });

  test('preserves full-bleed provider backgrounds', async () => {
    const cherryInPath = join(
      process.cwd(),
      'packages/ui/src/icons-webp/providers/light/cherryin.webp',
    );
    const { data, info } = await sharp(cherryInPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const corners = [
      0,
      (info.width - 1) * info.channels,
      (info.height - 1) * info.width * info.channels,
      (info.width * info.height - 1) * info.channels,
    ].map((offset) => [...data.subarray(offset, offset + info.channels)]);

    expect(corners).toEqual(Array.from({ length: 4 }, () => [255, 95, 95, 255]));
  });
});
