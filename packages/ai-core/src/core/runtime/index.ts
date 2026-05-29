/**
 * Runtime 模块导出
 * 专注于运行时插件化AI调用处理
 */

// 主要的运行时执行器
export { RuntimeExecutor } from './executor';

// 导出类型
export type { EmbedManyParams, EmbedManyResult, RuntimeConfig } from './types';

// === 便捷工厂函数 ===

export { createExecutor } from './createExecutor';
import { type AiPlugin } from '../plugins';
import { extensionRegistry } from '../providers';
import { type CoreProviderSettingsMap, type StringKeys } from '../providers/types';
import { createExecutor } from './createExecutor';
import { RuntimeExecutor } from './executor';

/**
 * 直接流式文本生成
 */
export async function streamText<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>,
>(
  providerId: T,
  options: TSettingsMap[T],
  params: Parameters<RuntimeExecutor<TSettingsMap, T>['streamText']>[0],
  plugins?: AiPlugin[],
): Promise<ReturnType<RuntimeExecutor<TSettingsMap, T>['streamText']>> {
  const executor = await createExecutor<TSettingsMap, T>(providerId, options, plugins);
  return executor.streamText(params);
}

/**
 * 直接生成文本
 */
export async function generateText<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>,
>(
  providerId: T,
  options: TSettingsMap[T],
  params: Parameters<RuntimeExecutor<TSettingsMap, T>['generateText']>[0],
  plugins?: AiPlugin[],
): Promise<ReturnType<RuntimeExecutor<TSettingsMap, T>['generateText']>> {
  const executor = await createExecutor<TSettingsMap, T>(providerId, options, plugins);
  return executor.generateText(params);
}

/**
 * 直接生成图像 - 支持middlewares
 */
export async function generateImage<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>,
>(
  providerId: T,
  options: TSettingsMap[T],
  params: Parameters<RuntimeExecutor<TSettingsMap, T>['generateImage']>[0],
  plugins?: AiPlugin[],
): Promise<ReturnType<RuntimeExecutor<TSettingsMap, T>['generateImage']>> {
  const executor = await createExecutor<TSettingsMap, T>(providerId, options, plugins);
  return executor.generateImage(params);
}

/**
 * 直接批量嵌入文本
 * AI SDK v6 只有 embedMany，没有 embed
 */
export async function embedMany<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>,
>(
  providerId: T,
  options: TSettingsMap[T],
  params: Parameters<RuntimeExecutor<TSettingsMap, T>['embedMany']>[0],
  plugins?: AiPlugin[],
): Promise<ReturnType<RuntimeExecutor<TSettingsMap, T>['embedMany']>> {
  const executor = await createExecutor<TSettingsMap, T>(providerId, options, plugins);
  return executor.embedMany(params);
}

/**
 * 创建 OpenAI Compatible 执行器
 */
export async function createOpenAICompatibleExecutor(
  options: CoreProviderSettingsMap['openai-compatible'],
  plugins?: AiPlugin[],
): Promise<RuntimeExecutor<CoreProviderSettingsMap, 'openai-compatible'>> {
  const provider = await extensionRegistry.createProvider('openai-compatible', options);

  return RuntimeExecutor.createOpenAICompatible(provider, options, plugins);
}

// === Agent ===
export { createAgent, type CreateAgentOptions } from '../agents';
