import { isWebSearchError } from '@cherrystudio/web-search';
import { getJinaHostCandidates } from '@cherrystudio/web-search/providers/jina';

import { isDeviceRegionMainlandChina } from '@/backend/services/device';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { WebSearchCapability, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { resolveProviderApiHost } from '../../utils/provider';
import { RemoteWebSearchProvider } from '../base/RemoteWebSearchProvider';

const logger = loggerService.withContext('JinaProvider');

export class JinaProvider extends RemoteWebSearchProvider {
  override searchKeywords(input: string, config: WebSearchExecutionConfig, options?: RequestInit) {
    return this.requestOnEitherHost('searchKeywords', input.trim(), config, options);
  }

  override fetchUrls(input: string, config: WebSearchExecutionConfig, options?: RequestInit) {
    return this.requestOnEitherHost('fetchUrls', input, config, options);
  }

  private async requestOnEitherHost(
    capability: WebSearchCapability,
    input: string,
    config: WebSearchExecutionConfig,
    options?: RequestInit,
  ) {
    const configuredHost = resolveProviderApiHost(this.provider, capability).replace(/\/+$/, '');
    const [apiHost, alternateHost] = getJinaHostCandidates(
      configuredHost,
      isDeviceRegionMainlandChina() ? 'mainland-china' : 'global',
    );
    const credentials = this.credentials(capability);
    try {
      return await this.executeRemote(capability, input, config, options, { apiHost, credentials });
    } catch (error) {
      if (
        !isWebSearchError(error) ||
        error.kind !== 'network' ||
        !alternateHost ||
        options?.signal?.aborted
      ) {
        throw error;
      }
      logger.warn('Jina host unreachable; retrying its alternate built-in host', {
        error: error.message,
      });
      return this.executeRemote(capability, input, config, options, {
        apiHost: alternateHost,
        credentials,
      });
    }
  }
}
