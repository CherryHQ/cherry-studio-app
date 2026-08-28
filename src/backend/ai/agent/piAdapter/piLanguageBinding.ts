import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/provider-registry';

import {
  resolveProviderConnection,
  type ResolvedProviderConnection,
} from '@/backend/ai/provider/providerConnection';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

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

/**
 * Decide whether Pi can serve one provider connection.
 *
 * This is Pi's own compatibility policy over runtime-agnostic connection
 * facts; the provider layer supplies the facts and never sees this decision.
 */
export function resolvePiLanguageBinding(
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

/** Whether Pi can serve one configured model. The language half of system model support. */
export function supportsPiLanguageModel(provider: Provider, model: Model): boolean {
  return (
    resolvePiLanguageBinding(provider, resolveProviderConnection(provider, model)).status ===
    'supported'
  );
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
  binding: PiLanguageBinding,
): Extract<PiLanguageBinding, { status: 'supported' }> {
  if (binding.status === 'unsupported') {
    throw new LanguageServingCompatibilityError(binding.issue);
  }
  return binding;
}

function isPiLanguageEndpointType(
  endpointType: EndpointType | undefined,
): endpointType is PiLanguageEndpointType {
  return PI_LANGUAGE_ENDPOINT_TYPES.some((supported) => supported === endpointType);
}

function unsupported(code: LanguageServingCompatibilityCode, message: string): PiLanguageBinding {
  return { issue: { binding: 'pi', code, message }, status: 'unsupported' };
}
