import { MessagePart } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentFailureReason } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

import { readErrorPartDetail } from './errorPartDetail';

type ErrorPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-error' }>;
};

const DETAIL_SIZES = ['compact', 'large'] as const;

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
  const [isDetailOpen, setIsDetailOpen] = useState(false);
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
  const message = t(
    reasonCode === 'auth'
      ? 'chat.errorPart.message.auth'
      : retryable === true
        ? 'chat.errorPart.retryable'
        : 'chat.errorPart.message',
  );

  return (
    <>
      <MessagePart.Error
        accessibilityHint={t('chat.errorPart.detail.hint')}
        message={message}
        onPress={() => setIsDetailOpen(true)}
        title={title}
      />
      {isDetailOpen ? (
        <ErrorPartDetailSheet data={part.data} onClose={() => setIsDetailOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * Diagnostic detail the user explicitly asked for: the persisted `message`
 * and failure snapshot are shown verbatim here, never inline in the card.
 */
function ErrorPartDetailSheet({
  data,
  onClose,
}: {
  data: ErrorPartProps['part']['data'];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const detail = readErrorPartDetail(data);
  const facts = Object.fromEntries(detail.facts.map((fact) => [t(fact.labelKey), fact.value]));

  return (
    <MessagePart.Detail
      onClose={onClose}
      sizes={DETAIL_SIZES}
      testID="error-part-detail"
      title={t('chat.errorPart.detail.title')}
    >
      {detail.message ? (
        <MessagePart.TextSection
          title={t('chat.errorPart.detail.message')}
          value={detail.message}
        />
      ) : null}
      <MessagePart.ValueSection title={t('chat.errorPart.detail.facts')} value={facts} />
      {detail.responseBody ? (
        <MessagePart.TextSection
          title={t('chat.errorPart.detail.responseBody')}
          value={detail.responseBody}
          variant="code"
        />
      ) : null}
    </MessagePart.Detail>
  );
}
