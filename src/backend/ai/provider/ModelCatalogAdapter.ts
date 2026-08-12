import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { fetch as expoFetch } from 'expo/fetch';

import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { ModelCatalogApi } from '@/backend/services/models/ModelCatalogService';

import { listModels } from './listModels';
import { VertexAuthClient } from './VertexAuthClient';

@Injectable('ModelCatalogAdapter')
@ServicePhase(Phase.PostReady)
export class ModelCatalogAdapter extends BaseService implements ModelCatalogApi {
  private readonly vertexAuth = new VertexAuthClient({
    fetch: expoFetch as typeof globalThis.fetch,
  });

  getVertexAuthHeaders(
    input: Parameters<ModelCatalogApi['getVertexAuthHeaders']>[0],
  ): Promise<Record<string, string>> {
    return this.vertexAuth.getAuthorizationHeaders(input);
  }

  listApiModels(
    provider: Provider,
    context: Parameters<ModelCatalogApi['listApiModels']>[1],
    signal: AbortSignal,
  ) {
    return listModels(provider, context, signal, { throwOnError: true });
  }
}
