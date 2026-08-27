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

export function ErrorPart({ part }: ErrorPartProps) {
  const { t } = useTranslation();
  const reasonCode = part.data.reasonCode;
  const title = isAgentFailureReason(reasonCode)
    ? t(AGENT_FAILURE_TITLE_KEYS[reasonCode])
    : (part.data.name ?? part.data.code ?? t('chat.errorPart.title'));
  const message = part.data.message ?? t('chat.errorPart.message');

  return <MessagePart.Error message={message} title={title} />;
}
