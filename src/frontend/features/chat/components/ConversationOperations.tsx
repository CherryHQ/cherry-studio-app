import { Button, useAlert, useToast } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type {
  ConversationInput,
  ConversationOperation,
} from '@/frontend/appShell/conversation/remote';
import { conversationHref } from '@/frontend/appShell/navigation/chat';

import { conversationFailureKey } from '../runtime/conversationFailure';

/** The journal owns uncertain work. This view never allocates or resubmits command IDs. */
export function ConversationOperations({
  operations,
  onRestore,
}: {
  operations: readonly ConversationOperation[];
  onRestore(input: ConversationInput): void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  return (
    <View className="gap-2 px-4">
      {operations
        .filter((operation) => operation.state !== 'applied' || operation.kind === 'start')
        .map((operation) => (
          <View key={operation.id} className="gap-1 py-2">
            <Text className="text-sm text-muted-foreground">
              {t(
                operation.state === 'pending'
                  ? 'remoteAgent.confirming'
                  : operation.state === 'applied'
                    ? 'remoteAgent.actionReceived'
                    : operation.failure
                      ? conversationFailureKey(operation.failure)
                      : 'remoteAgent.actionFailed',
              )}
            </Text>
            {operation.input ? (
              <Text numberOfLines={3} className="text-sm text-foreground">
                {operation.input.parts
                  .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                  .join('\n')}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {operation.failure?.detail ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    alert.show({
                      title: t('remoteAgent.error'),
                      description: [
                        operation.failure!.detail!.code,
                        operation.failure!.detail!.message,
                      ]
                        .filter(Boolean)
                        .join('\n'),
                    })
                  }
                >
                  {t('remoteAgent.details')}
                </Button>
              ) : null}
              {operation.state === 'pending' && operation.recovery ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={operation.recovery.availability.state !== 'enabled'}
                  onPress={() =>
                    void operation.recovery!.execute(undefined).then((outcome) => {
                      if (outcome.state === 'rejected' || outcome.state === 'interrupted')
                        toast.show({
                          label: t(
                            outcome.state === 'rejected'
                              ? conversationFailureKey(outcome.failure)
                              : 'remoteAgent.actionFailed',
                          ),
                          variant: 'danger',
                        });
                    })
                  }
                >
                  {t('common.retry')}
                </Button>
              ) : null}
              {operation.conversation ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => router.replace(conversationHref(operation.conversation!))}
                >
                  {t('remoteAgent.openSession')}
                </Button>
              ) : null}
              {operation.state === 'rejected' && operation.input ? (
                <Button size="sm" variant="ghost" onPress={() => onRestore(operation.input!)}>
                  {t('common.edit')}
                </Button>
              ) : null}
              {operation.dismiss ? (
                <Button size="sm" variant="ghost" onPress={operation.dismiss}>
                  {t('common.close')}
                </Button>
              ) : null}
            </View>
          </View>
        ))}
    </View>
  );
}
