import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginAuthorizationDefinition, PluginDefinition } from '../pluginDefinition';
import { createOfficialMcpClient } from '../transport/createOfficialMcpClient';
import { GenericOAuthAuthorizationRuntime } from './genericOauth/GenericOAuthAuthorizationRuntime';
import { McpOAuthCredentialSchema } from './genericOauth/mcpOauthCredentials';
import type { McpCatalogAuth, McpCatalogEntry } from './mcpServerCatalog';

const TokenCredentialSchema = z.object({
  version: z.literal(1),
  token: z.string().min(1).max(16_384).regex(/^\S+$/),
});

const EmptyCredentialSchema = z.object({ version: z.literal(1) });

const bearerPrefix = (header: string) => (header === 'Authorization' ? 'Bearer ' : '');

function credentialsMethod(
  entry: McpCatalogEntry,
  auth: Extract<McpCatalogAuth, { kind: 'bearer' | 'api-key' | 'none' }>,
): PluginAuthorizationDefinition {
  if (auth.kind === 'none') {
    return {
      id: 'none',
      kind: 'credentials',
      label: `Connect to ${entry.name}`,
      setup: `${entry.name} needs no credential; connect to start using it.`,
      fields: [],
      encodeCredentials: () => ({ version: 1 }),
      createRequestAuthorization: () => ({
        apply(credential) {
          // No credential is sent; validating the empty shape keeps parity with token methods.
          if (!EmptyCredentialSchema.safeParse(credential).success)
            throw new PluginError('authorization', `${entry.name} requires no credential.`);
        },
      }),
    };
  }

  const header = auth.kind === 'api-key' ? auth.header : 'Authorization';
  const prefix = bearerPrefix(header);
  return {
    id: auth.kind === 'api-key' ? 'api_key' : 'bearer',
    kind: 'credentials',
    requiresDisconnect: true,
    label: auth.label,
    setup: `Enter your ${auth.label} for ${entry.name}. It is stored on this device only.`,
    fields: [
      {
        id: 'token',
        secret: true,
        maxLength: 4096,
        pattern: '^\\S+$',
        label: auth.label,
        errorLabel: 'Enter a valid credential without spaces or line breaks.',
      },
    ],
    encodeCredentials: (fields) => ({ version: 1, token: fields.token }),
    createRequestAuthorization: () => ({
      apply(credential, { headers }) {
        const parsed = TokenCredentialSchema.safeParse(credential);
        if (!parsed.success)
          throw new PluginError('authorization', `The ${entry.name} credential is invalid.`);
        headers.set(header, `${prefix}${parsed.data.token}`);
      },
    }),
  };
}

function oauthMethod(entry: McpCatalogEntry): PluginAuthorizationDefinition {
  return {
    id: 'oauth',
    kind: 'interactive',
    interaction: 'callback',
    stages: ['user', 'account'],
    label: 'Sign in with OAuth',
    setup: `Authorize Cherry Studio to access ${entry.name} through your browser. The token is stored on this device only.`,
    permissions: `${entry.name} shares only the data its tools request, subject to your account permissions.`,
    createRuntime: (store) =>
      new GenericOAuthAuthorizationRuntime(store, {
        pluginId: entry.id,
        resourceUrl: entry.endpointUrl,
        serverName: entry.name,
      }),
    createRequestAuthorization: () => ({
      apply(credential, { headers }) {
        const parsed = McpOAuthCredentialSchema.safeParse(credential);
        if (!parsed.success || parsed.data.rejected)
          throw new PluginError('authorization', `Reconnect ${entry.name} to authorize again.`);
        headers.set('Authorization', `Bearer ${parsed.data.tokens.accessToken}`);
      },
    }),
  };
}

function credentialsLink(entry: McpCatalogEntry): string {
  for (const auth of entry.auth) {
    if (auth.kind === 'bearer' || auth.kind === 'api-key') return auth.credentialsUrl;
  }
  return entry.website;
}

/**
 * Turn one catalog entry into a registered plugin. Every hosted server shares
 * the same fixed-endpoint HTTP mechanics; only its endpoint, credential shape
 * and authorization methods differ, so the definition is derived, not authored
 * per server.
 */
export function createCatalogPlugin(entry: McpCatalogEntry): PluginDefinition {
  return {
    serverName: entry.name,
    catalog: {
      id: entry.id,
      ...(entry.icon ? { icon: entry.icon } : {}),
      name: entry.name,
      summary: entry.summary,
      category: entry.category,
      description: entry.summary,
      credentialLink: 'Get a credential',
      links: {
        credentials: credentialsLink(entry),
        website: entry.website,
        privacy: entry.privacy,
      },
    },
    tools: {},
    // Discovered tools are admitted as writes: the catalog cannot enumerate a
    // hosted server's evolving tool set, so every call is approval-gated.
    acceptsDiscoveredTool: () => true,
    authMethods: entry.auth.map((auth) =>
      auth.kind === 'oauth' ? oauthMethod(entry) : credentialsMethod(entry, auth),
    ),
    createClient: (context) =>
      createOfficialMcpClient(context, {
        url: entry.endpointUrl,
        // The catalog cannot enumerate a hosted server's evolving tool set, so
        // any tool the server reports is admitted as a write (approval-gated).
        admitTool: () => 'write',
      }),
    validation: {
      accountLabel: () => entry.name,
    },
  };
}
