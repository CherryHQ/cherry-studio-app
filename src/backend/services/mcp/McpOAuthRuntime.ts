import {
  checkResourceAllowed,
  computeScopeUnion,
  discoverOAuthServerInfo,
  exchangeAuthorization,
  OAuthError,
  extractWWWAuthenticateParams,
  refreshAuthorization,
  registerClient,
  validateAuthorizationResponseIssuer,
  validateClientMetadataUrl,
  type AuthorizationServerMetadata,
  type FetchLike,
  type OAuthClientInformation,
  type OAuthTokens,
} from '@modelcontextprotocol/client';
import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
  randomUUID,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import * as z from 'zod';

import { isHttpError } from '@/backend/services/http';
import {
  McpAuthorizationError,
  type McpConnectionConfig,
  type McpOAuthStartInput,
} from '@/shared/contracts/mcp';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { assertMcpOAuthUrl, createMcpOAuthFetch } from './mcpOAuthFetch';

const STORAGE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
const secretKey = (id: string) => `mcp-oauth.${z.uuidv4().parse(id)}`;
const secret = z.string().min(1).max(65_536).regex(/^\S+$/);

const GrantSchema = z.object({
  version: z.literal(1),
  endpointUrl: z.url(),
  resource: z.url(),
  client: z.object({ client_id: z.string().min(1), client_secret: secret.optional() }),
  // Keep only fields used after discovery. Both OAuth and OIDC discovery are handled by the SDK.
  metadata: z.object({
    issuer: z.url(),
    authorization_endpoint: z.url(),
    token_endpoint: z.url(),
    response_types_supported: z.array(z.string()),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
    authorization_response_iss_parameter_supported: z.boolean().optional(),
  }),
  tokens: z.object({
    access_token: secret,
    refresh_token: secret.optional(),
    token_type: z.string().refine((value) => value.toLowerCase() === 'bearer'),
    scope: z.string().optional(),
  }),
  expiresAt: z.number().finite().optional(),
  rejected: z.boolean().optional(),
  requiredScope: z.string().optional(),
});
type Grant = z.infer<typeof GrantSchema>;
type Attempt = {
  abort: AbortController;
  expiresAt: number;
  input: McpOAuthStartInput;
  previous?: McpServer;
  state: string;
  verifier: string;
  redirectUrl: string;
  metadata: AuthorizationServerMetadata;
  resource: string;
  client: OAuthClientInformation;
  completing: boolean;
  scope?: string;
};

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

function callbackUrl(): string {
  const configured = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(configured) ? configured[0] : configured;
  if (!['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'].includes(scheme ?? '')) {
    throw new McpAuthorizationError('unavailable');
  }
  return `${scheme}://plugins/mcp/oauth-callback`;
}

/** Native credentials and interactive attempts, owned and disposed by the MCP runtime. */
export class McpOAuthRuntime {
  private readonly lifetime = new AbortController();
  private readonly fetchOAuth = createMcpOAuthFetch();
  private readonly attempts = new Map<string, Attempt>();
  private readonly revoked = new Set<string>();
  private readonly refreshes = new Map<string, Promise<Grant>>();
  private storageTail: Promise<unknown> = Promise.resolve();

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageTail.catch(() => undefined).then(operation);
    this.storageTail = result;
    return result;
  }

  private async read(id: string): Promise<Grant> {
    if (this.revoked.has(id) || this.lifetime.signal.aborted)
      throw new McpAuthorizationError('reauthorize');
    const value = await SecureStore.getItemAsync(secretKey(id), STORAGE_OPTIONS);
    if (!value) throw new McpAuthorizationError('reauthorize');
    const parsed = GrantSchema.safeParse(JSON.parse(value));
    if (!parsed.success) throw new McpAuthorizationError('reauthorize');
    return parsed.data;
  }

  private async write(id: string, grant: Grant): Promise<void> {
    if (this.revoked.has(id) || this.lifetime.signal.aborted)
      throw new McpAuthorizationError('cancelled');
    await SecureStore.setItemAsync(
      secretKey(id),
      JSON.stringify(GrantSchema.parse(grant)),
      STORAGE_OPTIONS,
    );
  }

  /** Bound an OAuth network operation, including body reads; browser waiting has its own lifetime. */
  private async network<T>(
    signal: AbortSignal,
    operation: (fetchFn: FetchLike) => Promise<T>,
  ): Promise<T> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 30_000);
    const combined = AbortSignal.any([signal, abort.signal, this.lifetime.signal]);
    const fetchFn: FetchLike = async (input, init) => {
      const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return this.fetchOAuth(input, {
        ...init,
        signal: requestSignal ? AbortSignal.any([combined, requestSignal]) : combined,
      });
    };
    try {
      combined.throwIfAborted();
      return await operation(fetchFn);
    } catch (error) {
      if (signal.aborted || this.lifetime.signal.aborted)
        throw new McpAuthorizationError('cancelled');
      if (error instanceof McpAuthorizationError) throw error;
      if (isHttpError(error) && error.kind === 'invalid_response')
        throw new McpAuthorizationError('invalid_response');
      if (
        error instanceof OAuthError &&
        ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(error.code)
      ) {
        throw new McpAuthorizationError('reauthorize');
      }
      // SDK and HTTP errors may contain tokens, metadata, or attacker-controlled callback text.
      throw new McpAuthorizationError('network');
    } finally {
      clearTimeout(timer);
    }
  }

  async begin(input: McpOAuthStartInput, previous?: McpServer) {
    assertMcpOAuthUrl(input.endpointUrl);
    if (
      !input.name.trim() ||
      Object.keys(input.headers ?? {}).some((key) => key.toLowerCase() === 'authorization')
    ) {
      throw new McpAuthorizationError('configuration');
    }
    for (const [id, attempt] of this.attempts) {
      if (attempt.expiresAt <= Date.now() || attempt.input.serverId === input.serverId)
        this.cancel(id);
    }
    if (this.attempts.size >= 4) throw new McpAuthorizationError('unavailable');
    const abort = new AbortController();
    const redirectUrl = callbackUrl();
    const state = randomValue();
    const verifier = randomValue();
    const challenge = base64Url(
      await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: CryptoEncoding.BASE64,
      }),
    );
    const prior =
      previous?.origin !== 'builtin' && previous?.oauth
        ? await this.read(previous.oauth.authorizationId).catch(() => undefined)
        : undefined;
    const discovered = await this.network(abort.signal, async (fetchFn) => {
      // This read-only probe obtains RFC 9728 challenge routing and operation scopes. Never send a token here.
      const probeAbort = new AbortController();
      const probeTimer = setTimeout(() => probeAbort.abort(), 15_000);
      let challengeParams: ReturnType<typeof extractWWWAuthenticateParams> = {};
      try {
        // The MCP endpoint can return an open SSE stream. Read only challenge headers here;
        // metadata, registration, and token requests below use the shared HTTP transport.
        const response = await expoFetch(input.endpointUrl, {
          method: 'GET',
          redirect: 'error',
          headers: { ...input.headers, Accept: 'application/json, text/event-stream' },
          signal: AbortSignal.any([abort.signal, probeAbort.signal, this.lifetime.signal]),
        });
        if (response.status === 401 || response.status === 403)
          challengeParams = extractWWWAuthenticateParams(response);
        await response.body?.cancel().catch(() => undefined);
      } finally {
        clearTimeout(probeTimer);
      }
      const info = await discoverOAuthServerInfo(input.endpointUrl, {
        resourceMetadataUrl: challengeParams.resourceMetadataUrl,
        fetchFn,
      });
      const metadata = info.authorizationServerMetadata;
      const resource = info.resourceMetadata?.resource;
      if (
        !metadata ||
        !resource ||
        !checkResourceAllowed({
          requestedResource: input.endpointUrl,
          configuredResource: resource,
        })
      ) {
        throw new McpAuthorizationError('configuration');
      }
      assertMcpOAuthUrl(metadata.issuer);
      assertMcpOAuthUrl(metadata.authorization_endpoint);
      assertMcpOAuthUrl(metadata.token_endpoint);
      if (
        !metadata.response_types_supported.includes('code') ||
        !metadata.code_challenge_methods_supported?.includes('S256')
      )
        throw new McpAuthorizationError('configuration');
      const scope = computeScopeUnion(
        challengeParams.scope ?? info.resourceMetadata?.scopes_supported?.join(' '),
        prior?.tokens.scope,
        prior?.requiredScope,
      );
      let client: OAuthClientInformation;
      if (input.clientId?.trim()) {
        const clientId = input.clientId.trim();
        if (prior?.client.client_id === clientId && prior.metadata.issuer !== metadata.issuer) {
          throw new McpAuthorizationError('configuration');
        }
        if (clientId.startsWith('https://')) validateClientMetadataUrl(clientId);
        client = { client_id: clientId };
      } else {
        if (!metadata.registration_endpoint) throw new McpAuthorizationError('configuration');
        const registration = await registerClient(info.authorizationServerUrl, {
          metadata,
          scope,
          fetchFn,
          clientMetadata: {
            client_name: 'Cherry Studio',
            client_uri: 'https://github.com/CherryHQ/cherry-studio-app',
            redirect_uris: [redirectUrl],
            response_types: ['code'],
            grant_types: ['authorization_code', 'refresh_token'],
            application_type: 'native',
            token_endpoint_auth_method: 'none',
          },
        });
        if (
          registration.token_endpoint_auth_method &&
          registration.token_endpoint_auth_method !== 'none'
        ) {
          throw new McpAuthorizationError('configuration');
        }
        client = { client_id: registration.client_id };
      }
      return { metadata, resource, client, scope };
    });
    this.lifetime.signal.throwIfAborted();
    const url = new URL(discovered.metadata.authorization_endpoint);
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: discovered.client.client_id,
      redirect_uri: redirectUrl,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: discovered.resource,
      ...(discovered.scope && { scope: discovered.scope }),
    }))
      url.searchParams.set(key, value);
    const attemptId = randomUUID();
    this.attempts.set(attemptId, {
      abort,
      input: { ...input, headers: { ...input.headers } },
      previous,
      state,
      verifier,
      redirectUrl,
      ...discovered,
      expiresAt: Date.now() + ATTEMPT_LIFETIME_MS,
      completing: false,
    });
    return { attemptId, authorizationUrl: url.href, redirectUrl };
  }

  async complete(attemptId: string, callback: string) {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.completing || attempt.expiresAt <= Date.now())
      throw new McpAuthorizationError('cancelled');
    let url: URL;
    const expected = new URL(attempt.redirectUrl);
    try {
      url = new URL(callback);
      if (
        url.protocol !== expected.protocol ||
        url.host !== expected.host ||
        url.pathname !== expected.pathname ||
        url.hash ||
        url.searchParams.getAll('state').length !== 1 ||
        url.searchParams.get('state') !== attempt.state ||
        url.searchParams.getAll('iss').length > 1 ||
        url.searchParams.getAll('code').length > 1
      ) {
        throw new McpAuthorizationError('invalid_response');
      }
      validateAuthorizationResponseIssuer({
        iss: url.searchParams.get('iss') ?? undefined,
        expectedIssuer: attempt.metadata.issuer,
        issParameterSupported:
          attempt.metadata.authorization_response_iss_parameter_supported === true,
      });
      if (url.searchParams.has('error') || !url.searchParams.get('code'))
        throw new McpAuthorizationError('cancelled');
    } catch (error) {
      this.cancel(attemptId);
      throw error instanceof McpAuthorizationError
        ? error
        : new McpAuthorizationError('invalid_response');
    }
    attempt.completing = true;
    try {
      const startedAt = Date.now();
      const tokens = await this.network(attempt.abort.signal, (fetchFn) =>
        exchangeAuthorization(attempt.metadata.issuer, {
          metadata: attempt.metadata,
          clientInformation: attempt.client,
          authorizationCode: url.searchParams.get('code')!,
          iss: url.searchParams.get('iss') ?? undefined,
          codeVerifier: attempt.verifier,
          redirectUri: attempt.redirectUrl,
          resource: attempt.resource,
          fetchFn,
        }),
      );
      attempt.abort.signal.throwIfAborted();
      const authorizationId = randomUUID();
      const grant = this.withTokens(
        {
          version: 1,
          endpointUrl: attempt.input.endpointUrl,
          resource: attempt.resource,
          metadata: attempt.metadata,
          client: attempt.client,
          tokens,
        },
        { ...tokens, scope: tokens.scope ?? attempt.scope },
        startedAt,
      );
      await this.serialize(() => this.write(authorizationId, grant));
      if (attempt.abort.signal.aborted) {
        await this.remove(authorizationId);
        throw new McpAuthorizationError('cancelled');
      }
      return {
        authorizationId,
        clientId: attempt.client.client_id,
        input: attempt.input,
        previous: attempt.previous,
      };
    } finally {
      this.attempts.delete(attemptId);
    }
  }

  cancel(attemptId: string): void {
    this.attempts.get(attemptId)?.abort.abort();
    this.attempts.delete(attemptId);
  }

  findAttempt(callback: string): string | undefined {
    let state: string | null;
    try {
      state = new URL(callback).searchParams.get('state');
    } catch {
      return undefined;
    }
    for (const [id, attempt] of this.attempts) if (attempt.state === state) return id;
    return undefined;
  }

  private withTokens(grant: Grant, tokens: OAuthTokens, startedAt: number): Grant {
    return GrantSchema.parse({
      ...grant,
      tokens: { ...tokens, scope: tokens.scope ?? grant.tokens.scope },
      rejected: false,
      expiresAt: tokens.expires_in === undefined ? undefined : startedAt + tokens.expires_in * 1000,
    });
  }

  async token(config: McpConnectionConfig, signal: AbortSignal): Promise<string | undefined> {
    const id = config.oauth?.authorizationId;
    if (!id) return undefined;
    let grant = await this.read(id);
    if (grant.endpointUrl !== config.endpointUrl || grant.rejected)
      throw new McpAuthorizationError('reauthorize');
    if (grant.expiresAt !== undefined && grant.expiresAt <= Date.now() + 30_000) {
      let refresh = this.refreshes.get(id);
      if (!refresh) {
        refresh = this.refresh(id, grant).finally(() => {
          this.refreshes.delete(id);
        });
        this.refreshes.set(id, refresh);
      }
      grant = await refresh;
    }
    signal.throwIfAborted();
    if (this.revoked.has(id)) throw new McpAuthorizationError('reauthorize');
    return grant.tokens.access_token;
  }

  private async refresh(id: string, grant: Grant): Promise<Grant> {
    if (!grant.tokens.refresh_token) throw new McpAuthorizationError('reauthorize');
    try {
      const startedAt = Date.now();
      const tokens = await this.network(this.lifetime.signal, (fetchFn) =>
        refreshAuthorization(grant.metadata.issuer, {
          metadata: grant.metadata,
          clientInformation: grant.client,
          refreshToken: grant.tokens.refresh_token!,
          resource: grant.resource,
          fetchFn,
        }),
      );
      const next = this.withTokens(grant, tokens, startedAt);
      await this.serialize(() => this.write(id, next));
      return next;
    } catch (error) {
      if (!(error instanceof McpAuthorizationError) || error.code !== 'reauthorize') throw error;
      await this.serialize(async () => {
        if (!this.revoked.has(id) && !this.lifetime.signal.aborted)
          await this.write(id, { ...grant, rejected: true });
      });
      throw new McpAuthorizationError('reauthorize');
    }
  }

  async rejected(config: McpConnectionConfig, token: string, response: Response): Promise<void> {
    const id = config.oauth?.authorizationId;
    if (!id) return;
    const challenge = extractWWWAuthenticateParams(response);
    await this.serialize(async () => {
      const current = await this.read(id);
      if (current.tokens.access_token === token)
        await this.write(id, {
          ...current,
          rejected: true,
          requiredScope: computeScopeUnion(current.requiredScope, challenge.scope),
        });
    });
  }

  remove(id: string): Promise<void> {
    this.revoked.add(id);
    return this.serialize(() => SecureStore.deleteItemAsync(secretKey(id), STORAGE_OPTIONS));
  }

  async stop(): Promise<void> {
    this.lifetime.abort();
    for (const id of this.attempts.keys()) this.cancel(id);
    await Promise.allSettled(this.refreshes.values());
    await this.storageTail.catch(() => undefined);
  }
}
