/**
 * 把布局基准的假 provider 接进运行时的 provider extension 注册表（仅 `__DEV__`）。
 *
 * 注入方式是**委托**而不是替换：包一层 `openai-compatible` extension，只在 settings.name
 * 命中基准 provider 时返回假 provider，其余一律透传给原实现。这样做的两个理由：
 *
 * 1. extension 是按 `providerId` 字符串选取的，而 `providerId` 由 `config.ts` 里一张硬编码
 *    的 builder 表决定。要让一个新 id 走通，得改动那张表和它的类型约束——那是生产代码路径。
 *    委托方案让 `config.ts` 保持零改动。
 * 2. 选择通道因此退化成一行数据：基准 provider 的行 id。`buildOpenAICompatibleConfig` 会把
 *    `provider.id` 原样写进 `providerSettings.name`，所以种子里的 id 就是这里的哨兵，不依赖
 *    baseUrl 的格式化行为（后者会被 `formatBaseURL` 追加 API 版本）。
 *
 * 于是日常开发用的真实 provider 完全不受影响，也不需要任何全局开关。
 */

import type { ProviderV3 } from '@ai-sdk/provider';
import { ProviderExtension, extensionRegistry } from '@cherrystudio/ai-core/provider';
import { registerProviderExtensions } from '@cherrystudio/ai-runtime/provider';

import { LAYOUT_BENCH_PROVIDER_ID } from '@/backend/data/fixtures/layoutBench';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { createBenchLanguageModel } from './benchModel';

const OPENAI_COMPATIBLE_ID = 'openai-compatible';

const logger = loggerService.withContext('LayoutBenchProvider');

let installed = false;

function unsupportedModel(kind: string) {
  return () => {
    throw new Error(`Layout bench mock provider exposes no ${kind} model`);
  };
}

function createBenchProvider(): ProviderV3 {
  return {
    embeddingModel: unsupportedModel('embedding'),
    imageModel: unsupportedModel('image'),
    languageModel: createBenchLanguageModel,
    specificationVersion: 'v3',
  };
}

function isBenchSettings(settings: unknown): boolean {
  return (
    typeof settings === 'object' &&
    settings !== null &&
    (settings as { name?: unknown }).name === LAYOUT_BENCH_PROVIDER_ID
  );
}

export function installBenchMockProvider(): void {
  if (installed) {
    return;
  }

  // 基础 extension 由 ai-runtime 在模块加载时注册；这里再调一次（内部有 has 守卫）以保证
  // 无论本模块的加载顺序如何，下面都能取到原始的 openai-compatible extension。
  registerProviderExtensions();

  const original = extensionRegistry.get(OPENAI_COMPATIBLE_ID);
  if (!original) {
    logger.warn('Missing openai-compatible extension; layout bench provider not installed');
    return;
  }

  installed = true;
  const benchProvider = createBenchProvider();

  extensionRegistry.unregister(OPENAI_COMPATIBLE_ID);
  extensionRegistry.register(
    ProviderExtension.create({
      ...original.config,
      create: (settings: unknown) =>
        isBenchSettings(settings) ? benchProvider : original.createProvider(settings),
      import: undefined,
      creatorFunctionName: undefined,
    }),
  );

  logger.info('Layout bench mock provider installed', { providerId: LAYOUT_BENCH_PROVIDER_ID });
}
