import { isWebSearchError } from '@cherrystudio/web-search';
import { getJinaHostCandidates, JINA_MIRROR_HOSTS } from '@cherrystudio/web-search/providers/jina';

import { application } from '@/backend/core/application/Application';
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
    options?.signal?.throwIfAborted();
    const configuredHost = resolveProviderApiHost(this.provider, capability).replace(/\/+$/, '');
    const country = Object.hasOwn(JINA_MIRROR_HOSTS, configuredHost)
      ? ((await application.get('RegionService').getCountry()) ?? 'CN')
      : undefined;
    options?.signal?.throwIfAborted();
    const [apiHost, alternateHost] = getJinaHostCandidates(
      configuredHost,
      country === 'CN' ? 'mainland-china' : 'global',
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
