import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { AgentFailureReason } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

type ErrorPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-error' }>;
};

const AGENT_FAILURE_TITLE_KEYS = {
  auth: 'chat.errorPart.reason.auth',
  permission: 'chat.errorPart.reason.permission',
  region: 'chat.errorPart.reason.region',
  model_not_found: 'chat.errorPart.reason.modelNotFound',
  quota: 'chat.errorPart.reason.quota',
  rate_limit: 'chat.errorPart.reason.rateLimit',
  context_length: 'chat.errorPart.reason.contextLength',
  payload_too_large: 'chat.errorPart.reason.payloadTooLarge',
  network: 'chat.errorPart.reason.network',
  proxy_tls: 'chat.errorPart.reason.proxyTls',
  stream_interrupted: 'chat.errorPart.reason.streamInterrupted',
  content_filter: 'chat.errorPart.reason.contentFilter',
  provider_unavailable: 'chat.errorPart.reason.providerUnavailable',
  timeout: 'chat.errorPart.reason.timeout',
  invalid_input: 'chat.errorPart.reason.invalidInput',
  tool_limit: 'chat.errorPart.reason.toolLimit',
  tool_failed: 'chat.errorPart.reason.toolFailed',
  mcp: 'chat.errorPart.reason.mcp',
  parse: 'chat.errorPart.reason.parse',
  internal: 'chat.errorPart.reason.internal',
  unknown: 'chat.errorPart.reason.unknown',
} as const satisfies Record<AgentFailureReason, string>;

function isAgentFailureReason(value: unknown): value is AgentFailureReason {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(AGENT_FAILURE_TITLE_KEYS, value)
  );
}

/**
 * Only provider text is shown verbatim: it is third-party diagnostic detail
 * the user can act on and no translation exists for it. Every other layer is
 * app-owned, so its `message` stays diagnostic and the copy comes from the
 * protocol code instead.
 */
function readProviderDetail(data: ErrorPartProps['part']['data']): string | undefined {
  const source = data.source;
  const layer =
    source && typeof source === 'object' && !Array.isArray(source)
      ? (source as { layer?: unknown }).layer
      : undefined;
  if (layer !== 'provider' || typeof data.message !== 'string') {
    return undefined;
  }
  const detail = data.message.trim();
  return detail.length > 0 ? detail : undefined;
}

export function ErrorPart({ part }: ErrorPartProps) {
  const { t } = useTranslation();
  const { code, reasonCode, retryable } = part.data;

  if (code === 'INTERRUPTED') {
    return (
      <MessagePart.Error
        message={t('chat.errorPart.interrupted.message')}
        title={t('chat.errorPart.interrupted.title')}
      />
    );
  }

  const title = isAgentFailureReason(reasonCode)
    ? t(AGENT_FAILURE_TITLE_KEYS[reasonCode])
    : t('chat.errorPart.title');
  const message =
    readProviderDetail(part.data) ??
    t(retryable === true ? 'chat.errorPart.retryable' : 'chat.errorPart.message');

  return <MessagePart.Error message={message} title={title} />;
}
