import { type AiPlugin } from '../plugins';
import { extensionRegistry } from '../providers';
import { type CoreProviderSettingsMap, type StringKeys } from '../providers/types';
import { RuntimeExecutor } from './executor';

/**
 * 创建运行时执行器 - 支持类型安全的已知provider
 * 自动确保 provider 已初始化
 */
export async function createExecutor<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>,
>(
  providerId: T,
  options: TSettingsMap[T],
  plugins?: AiPlugin[],
): Promise<RuntimeExecutor<TSettingsMap, T>> {
  if (!extensionRegistry.has(providerId)) {
    throw new Error(`Provider extension "${providerId}" not registered`);
  }

  const provider = await extensionRegistry.createProvider(providerId, options || {});

  // Extract model resolver from variant's resolveModel declaration (type-safe at extension level)
  const resolver = extensionRegistry.getModelResolver(providerId as string);
  const modelResolver = resolver ? (modelId: string) => resolver(provider, modelId) : undefined;

  return RuntimeExecutor.create<TSettingsMap, T>(
    providerId,
    provider,
    options,
    plugins,
    modelResolver,
  );
}
