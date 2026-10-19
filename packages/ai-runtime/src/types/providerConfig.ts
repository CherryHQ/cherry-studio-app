import type { StringKeys } from '@cherrystudio/ai-core/provider';

import type { AppProviderSettingsMap } from './merged';

/**
 * Provider 配置
 * 用于构建 provider 实例的基础配置
 */
export type ProviderConfig<
  T extends StringKeys<AppProviderSettingsMap> = StringKeys<AppProviderSettingsMap>,
> = {
  providerId: T;
  providerSettings: AppProviderSettingsMap[T];
  /**
   * API endpoint path extracted from baseURL
   * Used for identifying image generation endpoints and other special cases
   * @example 'chat/completions', 'images/generations', 'predict'
   */
  endpoint?: string;
};
