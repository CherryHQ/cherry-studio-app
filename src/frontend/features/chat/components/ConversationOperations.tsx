import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, useAlert } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type {
  ConversationInput,
  ConversationOperation,
} from '@/frontend/appShell/conversation/remote';

import { conversationFailureKey } from '../runtime/conversationFailure';

const STATUS_KEYS = {
  pending: 'remoteAgent.operation.confirming',
  applied: 'remoteAgent.actionReceived',
  interrupted: 'remoteAgent.operation.interrupted',
  rejected: 'remoteAgent.operation.failed',
} as const;

/**
 * One quiet line per outcome discovered after its submission returned; the failure reason lives
 * behind details. The journal recovers uncertain work automatically, so no row resubmits it.
 */
export function ConversationOperations({
  operations,
  onRestore,
}: {
  operations: readonly ConversationOperation[];
  onRestore(input: ConversationInput): void;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  return (
    <View className="px-4">
      {operations
        .filter((operation) => operation.state !== 'applied' || operation.kind === 'start')
        .map((operation) => {
          const failed = operation.state === 'rejected' || operation.state === 'interrupted';
          const preview = operation.input?.parts
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join(' ');
          return (
            <View key={operation.id} className="min-h-8 flex-row items-center gap-2">
              <Text
                className={`shrink-0 text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {t(STATUS_KEYS[operation.state])}
              </Text>
              <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-foreground">
                {preview}
              </Text>
              {operation.state === 'rejected' && operation.input ? (
                <Button size="xs" variant="ghost" onPress={() => onRestore(operation.input!)}>
                  {t('common.edit')}
                </Button>
              ) : null}
              {failed ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onPress={() =>
                    alert.show({
                      title: t('remoteAgent.error'),
                      description: [
                        t(
                          operation.failure
                            ? conversationFailureKey(operation.failure)
                            : 'remoteAgent.actionFailed',
                        ),
                        operation.failure?.detail?.code,
                        operation.failure?.detail?.message,
                      ]
                        .filter(Boolean)
                        .join('\n'),
                    })
                  }
                >
                  {t('remoteAgent.details')}
                </Button>
              ) : null}
              {operation.dismiss ? (
                <Button
                  size="xs"
                  variant="ghost"
                  accessibilityLabel={t('common.close')}
                  icon={<XIcon className="text-muted-foreground" />}
                  onPress={operation.dismiss}
                />
              ) : null}
            </View>
          );
        })}
    </View>
  );
}
