import XIcon from '@cherrystudio/app-icons/icons/x';
import { BottomSheet, Button, useToast } from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ConversationFailure } from '@/frontend/appShell/conversation';
import type {
  ConversationInput,
  UndeliveredMessage,
} from '@/frontend/appShell/conversation/remote';
import { useComposerPresentationActions } from '@/frontend/components/Composer';

import { conversationFailureKey } from '../runtime/conversationFailure';

const DELIVERED_MS = 2000;
const REASON_KEYS = {
  changed: 'remoteAgent.undelivered.reason.changed',
  agentUnavailable: 'remoteAgent.undelivered.reason.agentUnavailable',
  interrupted: 'remoteAgent.undelivered.reason.interrupted',
  connection: 'remoteAgent.undelivered.reason.connection',
  invalid: 'remoteAgent.undelivered.reason.invalid',
  deleted: 'remoteAgent.undelivered.reason.deleted',
  failed: 'remoteAgent.undelivered.reason.failed',
} as const;

/** One reason per failure family; `edit` marks failures that resending the same text cannot fix. */
function describe(message: UndeliveredMessage): {
  reason: keyof typeof REASON_KEYS;
  edit: boolean;
} {
  if (message.state === 'interrupted') return { reason: 'interrupted', edit: false };
  switch (message.failure?.code) {
    case 'conflict':
    case 'version-expired':
      return { reason: 'changed', edit: false };
    case 'target-unavailable':
      return { reason: 'agentUnavailable', edit: false };
    case 'offline':
    case 'not-authorized':
    case 'needs-repair':
    case 'retired':
    case 'upgrade-required':
      return { reason: 'connection', edit: false };
    case 'invalid-input':
    case 'unsupported':
    case 'idempotency-conflict':
      return { reason: 'invalid', edit: true };
    case 'not-found':
      return { reason: 'deleted', edit: true };
    default:
      return { reason: 'failed', edit: false };
  }
}

function messageText(message: UndeliveredMessage) {
  return message.input.parts
    .flatMap((part) =>
      part.type === 'text'
        ? [part.text]
        : part.type === 'file'
          ? [part.name ?? part.fileEntryId]
          : [],
    )
    .join('\n');
}

/**
 * The conversation's one undelivered message: why it was not delivered and the action that can
 * deliver it. Pending work is recovered silently by the journal and never appears here.
 */
export function UndeliveredMessageRow({
  message,
  onEdit,
}: {
  message?: UndeliveredMessage;
  onEdit(input: ConversationInput): void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { runInputReplacement } = useComposerPresentationActions();
  // A resend replaces the record as soon as it is admitted; keep showing it until the outcome.
  const [resending, setResending] = useState<UndeliveredMessage>();
  const [delivered, setDelivered] = useState(false);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    if (!delivered) return;
    const timer = setTimeout(() => setDelivered(false), DELIVERED_MS);
    return () => clearTimeout(timer);
  }, [delivered]);

  const shown = resending ?? message;
  if (!shown) {
    return delivered ? (
      <View className="min-h-8 flex-row items-center gap-2 px-4">
        <View className="size-2 rounded-full bg-success" />
        <Text className="text-sm text-muted-foreground">
          {t('remoteAgent.undelivered.delivered')}
        </Text>
      </View>
    ) : null;
  }
  const { reason, edit } = describe(shown);
  const summary = t('remoteAgent.undelivered.summary', { reason: t(REASON_KEYS[reason]) });
  const text = messageText(shown);
  const resend = async () => {
    setDelivered(false);
    setResending(shown);
    const result = await shown.resend.execute(undefined).finally(() => setResending(undefined));
    if (result.state === 'applied') setDelivered(true);
    // Not admitted, so the original stays; a recorded rejection replaces it instead.
    else if (result.state === 'rejected' && !result.operationId)
      toast.show({ label: t(conversationFailureKey(result.failure)), variant: 'danger' });
  };
  const editText = async () => {
    try {
      await onEdit(shown.input);
      shown.discard();
      setDetails(false);
    } catch {
      toast.show({ label: t('remoteAgent.loadFailed'), variant: 'danger' });
    }
  };
  const discard = () => {
    setDetails(false);
    shown.discard();
  };

  return (
    <>
      <View className="min-h-8 flex-row items-center gap-2 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('remoteAgent.details')}
          className="min-w-0 flex-1 flex-row items-center gap-2 py-1.5"
          onPress={() => void runInputReplacement(() => setDetails(true))}
          testID="undelivered-message"
        >
          <View className="size-2 rounded-full bg-destructive" />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-foreground">
            {summary}
          </Text>
        </Pressable>
        {edit ? (
          <Button size="xs" variant="ghost" onPress={editText}>
            {t('common.edit')}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            disabled={shown.resend.availability.state !== 'enabled' || !!resending}
            loading={!!resending}
            onPress={() => void resend()}
            testID="undelivered-message-resend"
          >
            {t('remoteAgent.undelivered.resend')}
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          accessibilityLabel={t('remoteAgent.undelivered.discard')}
          disabled={!!resending}
          icon={<XIcon className="text-muted-foreground" />}
          onPress={discard}
        />
      </View>
      {details ? (
        <BottomSheet
          open
          onClose={() => setDetails(false)}
          title={t('remoteAgent.undelivered.title')}
          size="medium"
          footer={
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button variant="secondary" onPress={discard}>
                  {t('remoteAgent.undelivered.discard')}
                </Button>
              </View>
              <View className="flex-1">
                <Button onPress={editText}>{t('common.edit')}</Button>
              </View>
            </View>
          }
        >
          <ScrollView contentContainerClassName="gap-3 px-4 pb-4">
            <Text selectable className="text-base text-foreground">
              {text}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {shown.failure
                ? t(conversationFailureKey(shown.failure))
                : t('remoteAgent.undelivered.interruptedDetail')}
            </Text>
            <FailureDetail failure={shown.failure} />
          </ScrollView>
        </BottomSheet>
      ) : null}
    </>
  );
}

/** Desktop diagnostics are shown verbatim only here, where the user asked for them. */
function FailureDetail({ failure }: { failure?: ConversationFailure }) {
  if (!failure?.detail) return null;
  return (
    <Text selectable className="font-mono text-xs text-muted-foreground">
      {[failure.detail.code, failure.detail.message].filter(Boolean).join('\n')}
    </Text>
  );
}
