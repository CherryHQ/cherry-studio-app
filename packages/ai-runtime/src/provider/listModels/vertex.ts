import type { AuthConfig, Provider } from '@cherrystudio/universal/data/types/provider';

import { getBaseUrl } from '../../utils/provider';
import { emitProviderRuntimeDiagnostic, type ProviderRuntimeDiagnostics } from '../diagnostics';
import { normalizeVertexCredentials, resolveVertexUrls } from '../vertex';

export const DEFAULT_VERTEX_MODEL_PUBLISHERS = [
  'google',
  'openai',
  'meta',
  'qwen',
  'deepseek-ai',
  'moonshotai',
  'zai-org',
] as const;

export type VertexModelListRequest = {
  baseUrl: string;
  headers: Record<string, string>;
};

export interface VertexModelListContext {
  appHeaders?: Readonly<Record<string, string>>;
  diagnostics?: ProviderRuntimeDiagnostics;
  getAuthConfig?: (providerId: string) => AuthConfig | Promise<AuthConfig | undefined> | undefined;
  getVertexAccessToken?: (
    input: {
      projectId: string;
      serviceAccount: { clientEmail: string; privateKey: string };
    },
    signal?: AbortSignal,
  ) => Promise<string>;
}

const EXCLUDED_VERTEX_PUBLISHER_MODEL_KEYWORDS = ['tts', 'audio'] as const;

const SUPPORTED_VERTEX_PUBLISHER_MODEL_PATTERNS = [
  /^gemini[\w.@-]*$/i,
  /^learnlm[\w.@-]*$/i,
  /^gemma[\w.@-]*$/i,
  /^(?:text(?:-multilingual)?-embedding|gemini-embedding|multimodalembedding|textembedding-gecko(?:-multilingual)?|embedding-gecko(?:-multilingual)?)[\w.@-]*$/i,
  /^deepseek[\w.@-]*$/i,
  /^kimi[\w.@-]*$/i,
  /^glm[\w.@-]*$/i,
  /^gpt[\w.@-]*$/i,
  /^llama[\w.@-]*$/i,
  /^qwen[\w.@-]*$/i,
] as const;

export async function createVertexModelListRequest(
  provider: Provider,
  context: VertexModelListContext,
  options?: { throwOnError?: boolean; signal?: AbortSignal },
): Promise<VertexModelListRequest | undefined> {
  const failOrSkip = (reason: string): undefined => {
    if (options?.throwOnError) {
      throw new Error(`Vertex AI model listing failed: ${reason}`);
    }
    emitProviderRuntimeDiagnostic(context.diagnostics, {
      code: 'vertex-config-invalid',
      error: new Error(reason),
      providerId: provider.id,
    });
    return undefined;
  };

  if (!context.getAuthConfig || !context.getVertexAccessToken) {
    return failOrSkip('authentication adapters are unavailable');
  }

  const authConfig = await context.getAuthConfig(provider.id);
  if (authConfig?.type !== 'iam-gcp') {
    return failOrSkip('provider is not configured with iam-gcp auth');
  }

  const project = authConfig.project.trim();
  const location = authConfig.location.trim();
  const { credentials } = authConfig;
  const { privateKey, clientEmail } = normalizeVertexCredentials(credentials);

  const missing: string[] = [];
  if (!project) missing.push('project');
  if (!location) missing.push('location');
  if (!privateKey) missing.push('privateKey');
  if (!clientEmail) missing.push('clientEmail');

  if (missing.length > 0) {
    return failOrSkip(`missing required service-account fields: ${missing.join(', ')}`);
  }

  let baseUrl: string;
  try {
    baseUrl = resolveVertexUrls(getBaseUrl(provider), project, location).serviceUrl;
  } catch {
    return failOrSkip('project, location or base URL is invalid');
  }

  let accessToken: string;
  try {
    accessToken = await context.getVertexAccessToken(
      {
        projectId: project,
        serviceAccount: { privateKey: privateKey!, clientEmail: clientEmail! },
      },
      options?.signal,
    );
  } catch (error) {
    if (options?.throwOnError || options?.signal?.aborted) {
      throw error;
    }
    emitProviderRuntimeDiagnostic(context.diagnostics, {
      code: 'vertex-auth-failed',
      providerId: provider.id,
      error,
    });
    return undefined;
  }

  const headers: Record<string, string> = {
    ...context.appHeaders,
    ...provider.settings?.extraHeaders,
  };
  for (const name of Object.keys(headers)) {
    if (['authorization', 'x-goog-api-key', 'x-api-key', 'api-key'].includes(name.toLowerCase()))
      delete headers[name];
  }
  return {
    baseUrl,
    headers: {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export function getVertexModelId(name: string): string {
  const marker = '/models/';
  const markerIndex = name.lastIndexOf(marker);

  if (markerIndex >= 0) {
    return name.slice(markerIndex + marker.length);
  }

  return name.split('/').pop() || name;
}

export function getVertexModelPublisher(name: string): string {
  const marker = 'publishers/';
  const markerIndex = name.indexOf(marker);

  if (markerIndex < 0) {
    return 'google';
  }

  const publisher = name.slice(markerIndex + marker.length).split('/')[0];
  return publisher || 'google';
}

export function isSupportedVertexPublisherModel(modelId: string): boolean {
  // MaaS ids arrive publisher-prefixed (`meta/llama-4-…-maas`); the support patterns are
  // anchored to the bare model name, so match against the segment after the publisher.
  const normalizedModelId = (modelId.split('/').pop() ?? modelId).trim().toLowerCase();

  if (
    EXCLUDED_VERTEX_PUBLISHER_MODEL_KEYWORDS.some((keyword) => normalizedModelId.includes(keyword))
  ) {
    return false;
  }

  return SUPPORTED_VERTEX_PUBLISHER_MODEL_PATTERNS.some((pattern) =>
    pattern.test(normalizedModelId),
  );
}
