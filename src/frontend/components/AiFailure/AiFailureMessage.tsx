import { MessagePart } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AiFailureReason } from '@/shared/contracts/aiFailure';

import { readAiFailureDetail, type AiFailureData } from './aiFailureDetail';

const DETAIL_SIZES = ['compact', 'large'] as const;

const AI_FAILURE_TITLE_KEYS = {
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
} as const satisfies Record<AiFailureReason, string>;

function isAiFailureReason(value: unknown): value is AiFailureReason {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(AI_FAILURE_TITLE_KEYS, value)
  );
}

export function AiFailureMessage({
  data,
  title: fallbackTitle,
  message: fallbackMessage,
  detailTestID = 'error-part-detail',
}: {
  data: AiFailureData;
  title?: string;
  message?: string;
  detailTestID?: string;
}) {
  const { t } = useTranslation();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { reasonCode, retryable } = data;

  const title = isAiFailureReason(reasonCode)
    ? t(AI_FAILURE_TITLE_KEYS[reasonCode])
    : (fallbackTitle ?? t('chat.errorPart.title'));
  const message =
    fallbackMessage ??
    t(
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
        <AiFailureDetailSheet
          data={data}
          testID={detailTestID}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Diagnostic detail the user explicitly asked for: the persisted `message`
 * and failure snapshot are shown verbatim here, never inline in the card.
 */
function AiFailureDetailSheet({
  data,
  onClose,
  testID,
}: {
  testID: string;
  data: AiFailureData;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const detail = readAiFailureDetail(data);
  const facts = Object.fromEntries(detail.facts.map((fact) => [t(fact.labelKey), fact.value]));

  return (
    <MessagePart.Detail
      onClose={onClose}
      sizes={DETAIL_SIZES}
      testID={testID}
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
