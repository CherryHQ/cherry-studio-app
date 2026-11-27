import { Button, MessagePart } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import { useQuery } from '@/frontend/data';
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

const AI_FAILURE_MESSAGE_KEYS: Readonly<Partial<Record<AiFailureReason, string>>> = {
  auth: 'chat.errorPart.message.auth',
  context_length: 'chat.errorPart.message.contextLength',
  model_not_found: 'chat.errorPart.message.modelNotFound',
  payload_too_large: 'chat.errorPart.message.payloadTooLarge',
  quota: 'chat.errorPart.message.quota',
};

function isAiFailureReason(value: unknown): value is AiFailureReason {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(AI_FAILURE_TITLE_KEYS, value)
  );
}

/** Translation key naming a classified failure reason; undefined for anything else. */
export function aiFailureReasonTitleKey(reasonCode: unknown): string | undefined {
  return isAiFailureReason(reasonCode) ? AI_FAILURE_TITLE_KEYS[reasonCode] : undefined;
}

export function AiFailureMessage({
  data,
  title: fallbackTitle,
  message: fallbackMessage,
  detailTestID = 'error-part-detail',
  onReport,
}: {
  data: AiFailureData;
  title?: string;
  message?: string;
  detailTestID?: string;
  onReport?: (destination?: 'feedback' | 'diagnosis') => void;
}) {
  const { t } = useTranslation();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { reasonCode, retryable } = data;

  const source = data.source;
  const code =
    source && typeof source === 'object' && 'code' in source && typeof source.code === 'string'
      ? source.code.toLowerCase()
      : data.code?.toLowerCase();
  const context = data.context;
  const providerId =
    context && typeof context === 'object' && 'providerId' in context
      ? context.providerId
      : undefined;
  const { data: providers } = useQuery('/providers', {
    enabled: reasonCode === 'quota' && typeof providerId === 'string',
  });
  const providerName =
    reasonCode === 'quota' && typeof providerId === 'string'
      ? providers?.find((provider) => provider.id === providerId)?.name
      : undefined;
  const rejectedRequest =
    reasonCode === 'unknown' &&
    source &&
    typeof source === 'object' &&
    'layer' in source &&
    source.layer === 'provider' &&
    (code === 'upstream_bad_request' ||
      (context &&
        typeof context === 'object' &&
        'statusCode' in context &&
        context.statusCode === 400));
  const streamDisconnected =
    code === 'stream_disconnected' &&
    (reasonCode === 'network' || reasonCode === 'stream_interrupted');
  const streamingRequired = code === 'non_streaming_mode_unsupported';
  const titleKey = streamingRequired
    ? 'chat.errorPart.reason.streamingRequired'
    : rejectedRequest
      ? 'chat.errorPart.reason.requestRejected'
      : streamDisconnected
        ? AI_FAILURE_TITLE_KEYS.stream_interrupted
        : aiFailureReasonTitleKey(reasonCode);
  const title = titleKey ? t(titleKey) : (fallbackTitle ?? t('chat.errorPart.title'));
  const cloudMessage =
    code === 'account_disabled' || code === 'cloud_account_disabled'
      ? 'cloud.accountDisabled'
      : code === 'entitlement_inactive' || code === 'cloud_subscription_required'
        ? 'cloud.planRequired'
        : code === 'cloud_activation_required'
          ? 'cloud.activationRequired'
          : undefined;
  const message = streamingRequired
    ? t('chat.errorPart.message.streamingRequired')
    : cloudMessage
      ? t(cloudMessage)
      : (fallbackMessage ??
        t(
          code === 'amd_activation_required' || code === 'cloud_amd_activation_required'
            ? 'cloud.amd.activationRequired'
            : code === 'amd_credential_invalid'
              ? 'cloud.amd.checkStatus'
              : rejectedRequest
                ? 'chat.errorPart.message.requestRejected'
                : streamDisconnected
                  ? 'chat.errorPart.message.streamInterrupted'
                  : providerName
                    ? 'chat.errorPart.message.providerQuota'
                    : ((isAiFailureReason(reasonCode)
                        ? AI_FAILURE_MESSAGE_KEYS[reasonCode]
                        : undefined) ??
                      (retryable === true ? 'chat.errorPart.retryable' : 'chat.errorPart.message')),
          { provider: providerName },
        ));

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
          onReport={onReport}
        />
      ) : null}
    </>
  );
}

/**
 * Diagnostic detail the user explicitly asked for: the persisted `message`
 * and failure snapshot are shown directly in readable sections.
 */
export function AiFailureDetailSheet({
  data,
  onClose,
  onReport,
  testID,
}: {
  testID: string;
  data: AiFailureData;
  onClose: () => void;
  /** Opening feedback dismisses this sheet through the shared overlay navigation. */
  onReport?: (destination?: 'feedback' | 'diagnosis') => void;
}) {
  const { t } = useTranslation();
  const detail = readAiFailureDetail(data);
  const facts = Object.fromEntries(detail.facts.map((fact) => [t(fact.labelKey), fact.value]));

  return (
    <MessagePart.Detail
      headerAction={
        onReport ? (
          <Button onPress={() => onReport()} size="sm" testID={`${testID}-report`} variant="ghost">
            <Button.Label>{t('settings.about.feedback.reportProblem')}</Button.Label>
          </Button>
        ) : undefined
      }
      footer={
        onReport ? (
          <Button onPress={() => onReport('diagnosis')} testID={`${testID}-diagnose`}>
            <Button.Label>{t('diagnosis.checkProblem')}</Button.Label>
          </Button>
        ) : undefined
      }
      onClose={onClose}
      sizes={DETAIL_SIZES}
      testID={testID}
      title={t('chat.errorPart.detail.title')}
    >
      {detail.message ? (
        <MessageDetailText
          tone="danger"
          title={t('chat.errorPart.detail.message')}
          value={detail.message}
        />
      ) : null}
      <MessagePart.ValueSection title={t('chat.errorPart.detail.facts')} value={facts} />
      {detail.responseBody ? (
        <MessageDetailText
          title={t('chat.errorPart.detail.responseBody')}
          value={detail.responseBody}
          variant="code"
        />
      ) : null}
    </MessagePart.Detail>
  );
}
