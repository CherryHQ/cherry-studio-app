import { Button, MessagePart } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
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

  const titleKey = aiFailureReasonTitleKey(reasonCode);
  const title = titleKey ? t(titleKey) : (fallbackTitle ?? t('chat.errorPart.title'));
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
          onReport={onReport}
        />
      ) : null}
    </>
  );
}

/**
 * Diagnostic detail the user explicitly asked for: the persisted `message`
 * and failure snapshot remain available beneath the readable explanation.
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
  const titleKey = aiFailureReasonTitleKey(data.reasonCode);

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
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          {t(titleKey ?? 'chat.errorPart.title')}
        </Text>
        <Text className="text-base text-muted-foreground">
          {t(
            data.reasonCode === 'auth'
              ? 'chat.errorPart.message.auth'
              : 'chat.errorPart.detail.guidance',
          )}
        </Text>
      </View>
      {detail.message || detail.facts.length || detail.responseBody ? (
        <MessagePart.ToolGroup
          state="complete"
          testID={`${testID}-technical`}
          title={t('chat.errorPart.detail.technical')}
        >
          <View className="gap-4">
            <MessageDetailText title={t('chat.errorPart.detail.message')} value={detail.message} />
            <MessagePart.ValueSection title={t('chat.errorPart.detail.facts')} value={facts} />
            <MessageDetailText
              title={t('chat.errorPart.detail.responseBody')}
              value={detail.responseBody}
              variant="code"
            />
          </View>
        </MessagePart.ToolGroup>
      ) : null}
    </MessagePart.Detail>
  );
}
