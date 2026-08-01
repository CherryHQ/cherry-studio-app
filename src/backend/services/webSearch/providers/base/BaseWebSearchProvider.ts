import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import type {
  WebSearchCapability,
  WebSearchProvider,
} from '@cherrystudio/universal/data/preference';
import type { ApiKeyRotationState } from '../../utils/provider';
import { resolveProviderApiHost } from '../../utils/provider';
import { withoutTrailingSlash } from '../../utils/url';

const MAX_HTTP_ERROR_TEXT_LENGTH = 500;

export abstract class BaseWebSearchProvider {
  constructor(
    protected readonly provider: WebSearchProvider,
    private readonly apiKeyRotationState: ApiKeyRotationState,
  ) {}

  protected resolveApiUrl(capability: WebSearchCapability, path: string): string {
    const apiHost = resolveProviderApiHost(this.provider, capability);
    const normalizedBaseUrl = `${withoutTrailingSlash(apiHost)}/`;
    const normalizedPath = path.replace(/^\//, '');
    return new URL(normalizedPath, normalizedBaseUrl).toString();
  }

  protected resolveApiKey(required = true): string {
    return this.apiKeyRotationState.resolve(this.provider, required);
  }

  protected buildHeaders(headers?: HeadersInit): Headers {
    const resolvedHeaders = new Headers(defaultAppHeaders());
    const extraHeaders = new Headers(headers);

    extraHeaders.forEach((value, key) => {
      resolvedHeaders.set(key, value);
    });

    return resolvedHeaders;
  }

  protected async parseJsonResponse<T>(
    response: Response,
    validate: (payload: unknown) => T,
    context: {
      operation: string;
      requestUrl: string;
    },
  ): Promise<T> {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(
        `${this.provider.id} ${context.operation} returned invalid JSON from ${context.requestUrl}`,
        {
          cause: error,
        },
      );
    }

    try {
      return validate(payload);
    } catch (error) {
      throw new Error(
        `${this.provider.id} ${context.operation} response validation failed for ${context.requestUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  protected async throwHttpError(message: string, response: Response): Promise<never> {
    const errorText = (await response.text()).trim();

    if (!errorText) {
      throw new Error(`${message}: HTTP ${response.status}`);
    }

    const truncatedErrorText =
      errorText.length > MAX_HTTP_ERROR_TEXT_LENGTH
        ? `${errorText.slice(0, MAX_HTTP_ERROR_TEXT_LENGTH)}... [truncated]`
        : errorText;

    throw new Error(`${message}: HTTP ${response.status} ${truncatedErrorText}`);
  }
}
