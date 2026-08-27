import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/provider-registry';

import {
  resolveProviderConnection,
  type ResolvedProviderConnection,
} from '@/backend/ai/provider/providerConnection';
import {
  resolveProviderLanguageTransportPolicy,
  type ProviderLanguageTransportPolicy,
} from '@/backend/ai/provider/providerTransport';
import type { Model } from '@/shared/data/types/model';
import type { AuthType, Provider, ProviderAuthMethod } from '@/shared/data/types/provider';

const PI_LANGUAGE_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
] as const;

const NON_STANDARD_PI_ADAPTER_FAMILIES = new Set([
  'azure',
  'azure-responses',
  'bedrock',
  'google-vertex',
  'google-vertex-anthropic',
]);

export type PiLanguageEndpointType = (typeof PI_LANGUAGE_ENDPOINT_TYPES)[number];

export type LanguageServingCompatibilityCode =
  | 'custom-endpoint-path'
  | 'missing-base-url'
  | 'unsupported-adapter-family'
  | 'unsupported-auth-flow'
  | 'unsupported-auth-type'
  | 'unsupported-endpoint';

export interface LanguageServingCompatibilityIssue {
  binding: 'pi';
  code: LanguageServingCompatibilityCode;
  message: string;
}

export type PiLanguageBinding =
  | {
      endpointType: PiLanguageEndpointType;
      status: 'supported';
    }
  | {
      issue: LanguageServingCompatibilityIssue;
      status: 'unsupported';
    };

export interface LanguageServingPlan {
  auth: {
    declaredMethods: readonly ProviderAuthMethod[] | undefined;
    type: AuthType;
  };
  bindings: {
    pi: PiLanguageBinding;
  };
  connection: ResolvedProviderConnection;
  transportPolicy: ProviderLanguageTransportPolicy | undefined;
}

interface ResolveLanguageServingPlanOptions {
  resolvedConnection?: ResolvedProviderConnection;
}

/**
 * Resolve language-serving facts before projecting them into Pi or AI SDK objects.
 *
 * The result is intentionally credential-selection-free. It may contain sensitive
 * configured headers through `connection`, so it remains ephemeral and must not be
 * persisted or logged.
 */
export function resolveLanguageServingPlan(
  provider: Provider,
  model: Model,
  options: ResolveLanguageServingPlanOptions = {},
): LanguageServingPlan {
  const connection = options.resolvedConnection ?? resolveProviderConnection(provider, model);

  return {
    auth: {
      declaredMethods: provider.authMethods ? [...provider.authMethods] : undefined,
      type: provider.authType,
    },
    bindings: {
      pi: resolvePiLanguageBinding(provider, connection),
    },
    connection,
    transportPolicy: resolveProviderLanguageTransportPolicy(provider),
  };
}

export class LanguageServingCompatibilityError extends Error {
  readonly binding: LanguageServingCompatibilityIssue['binding'];
  readonly code: LanguageServingCompatibilityCode;

  constructor(issue: LanguageServingCompatibilityIssue) {
    super(issue.message);
    this.name = 'LanguageServingCompatibilityError';
    this.binding = issue.binding;
    this.code = issue.code;
  }
}

export function requirePiLanguageBinding(
  plan: LanguageServingPlan,
): Extract<PiLanguageBinding, { status: 'supported' }> {
  if (plan.bindings.pi.status === 'unsupported') {
    throw new LanguageServingCompatibilityError(plan.bindings.pi.issue);
  }
  return plan.bindings.pi;
}

function resolvePiLanguageBinding(
  provider: Provider,
  connection: ResolvedProviderConnection,
): PiLanguageBinding {
  if (connection.adapterFamily && NON_STANDARD_PI_ADAPTER_FAMILIES.has(connection.adapterFamily)) {
    return unsupported(
      'unsupported-adapter-family',
      `Pi Runtime does not support provider adapter family: ${connection.adapterFamily}.`,
    );
  }

  if (!isPiLanguageEndpointType(connection.endpointType)) {
    return unsupported(
      'unsupported-endpoint',
      `Pi Runtime does not support the selected endpoint: ${connection.endpointType ?? 'unknown'}.`,
    );
  }

  if (provider.authType !== 'api-key') {
    return unsupported(
      'unsupported-auth-type',
      `Pi Runtime does not support provider authentication type: ${provider.authType}.`,
    );
  }

  if (provider.authMethods?.length && !provider.authMethods.includes('api-key')) {
    return unsupported(
      'unsupported-auth-flow',
      'Pi Runtime does not support this provider authentication flow.',
    );
  }

  const configuredBaseUrl = connection.baseUrl.trim();
  if (!configuredBaseUrl) {
    return unsupported(
      'missing-base-url',
      'Pi Runtime requires a base URL from the selected provider.',
    );
  }

  if (configuredBaseUrl.endsWith('#')) {
    return unsupported(
      'custom-endpoint-path',
      'Pi Runtime does not support a separate custom endpoint path.',
    );
  }

  return { endpointType: connection.endpointType, status: 'supported' };
}

function isPiLanguageEndpointType(
  endpointType: EndpointType | undefined,
): endpointType is PiLanguageEndpointType {
  return PI_LANGUAGE_ENDPOINT_TYPES.some((supported) => supported === endpointType);
}

function unsupported(code: LanguageServingCompatibilityCode, message: string): PiLanguageBinding {
  return { issue: { binding: 'pi', code, message }, status: 'unsupported' };
}
