import { AnthropicVertex, type ClientOptions } from '@anthropic-ai/vertex-sdk';
import type { Model, SimpleStreamOptions, TranscriptContext } from '@earendil-works/pi-ai';
import { stream, type AnthropicOptions } from '@earendil-works/pi-ai/api/anthropic-messages';
import { buildBaseOptions } from '@earendil-works/pi-ai/api/simple-options';
import { providerHeadersToRecord } from '@earendil-works/pi-ai/utils/headers';
import { getIdentityHeaders } from '@earendil-works/pi-ai/utils/identity';

export type VertexAnthropicOptions = SimpleStreamOptions & {
  accessToken?: string;
  vertex?: { projectId: string; location: string };
};

/** Pi owns messages and streaming; Anthropic's SDK owns the Vertex URL and request body. */
export function streamVertexAnthropic(
  model: Model<'anthropic-messages'>,
  context: TranscriptContext,
  options?: VertexAnthropicOptions,
) {
  const { accessToken, vertex } = options ?? {};
  if (!accessToken || !vertex) throw new Error('Vertex service-account credentials are required.');

  const headers = new Headers(
    providerHeadersToRecord(
      getIdentityHeaders(model, options?.identity),
      model.headers,
      options?.headers,
    ),
  );
  for (const name of ['authorization', 'x-goog-api-key', 'x-api-key', 'api-key'])
    headers.delete(name);
  // The SDK only consumes these two AuthClient members; token acquisition remains host-owned.
  const authClient = {
    projectId: vertex.projectId,
    getRequestHeaders: async () => new Headers({ Authorization: `Bearer ${accessToken}` }),
  } satisfies Pick<NonNullable<ClientOptions['authClient']>, 'projectId' | 'getRequestHeaders'>;
  const client = new AnthropicVertex({
    baseURL: model.baseUrl,
    projectId: vertex.projectId,
    region: vertex.location,
    authClient: authClient as NonNullable<ClientOptions['authClient']>,
    defaultHeaders: headers,
    fetch: options?.fetch,
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
  });

  return stream(model, context, {
    ...buildBaseOptions(model, context, options),
    // Pi consumes beta.messages.create; Vertex intentionally omits the unrelated batch APIs.
    client: client as unknown as AnthropicOptions['client'],
    toolChoice: options?.toolChoice,
    // Cherry's existing onPayload mapping owns the exact reasoning parameters. This flag also
    // lets Pi select the appropriate thinking beta headers without duplicating its converter.
    thinkingEnabled: options?.reasoning !== undefined && options.reasoning !== 'off',
  });
}
