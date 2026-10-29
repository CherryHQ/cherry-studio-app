import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Surface, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { AgentQueuedInput } from '@/shared/contracts/agent';

import { MessageQuotePreview } from '../../../quotes/MessageQuotePreview';
import { useAgentChatClient, useAgentQueuedInputs } from '../../../runtime';

export function ChatInputQueue({ sessionId }: { sessionId?: string }) {
  const inputs = useAgentQueuedInputs(sessionId);
  const { t } = useTranslation();
  if (!sessionId || inputs.length === 0) return null;
  return (
    <Surface testID="chat-input-queue">
      <View className="px-3 pb-1 pt-3">
        <View className="flex-row items-center gap-2 px-1 pb-1">
          <Text accessibilityRole="header" className="text-xs font-medium text-muted-foreground">
            {t('chat.queue.title')}
          </Text>
          <View className="min-w-5 items-center rounded-full bg-secondary px-1.5">
            <Text className="text-xs font-medium tabular-nums text-muted-foreground">
              {inputs.length}
            </Text>
          </View>
        </View>
        {/* Native scrolling owns drags; only each remove button is a tap target. */}
        <ScrollView className="max-h-40" keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {inputs.map((input, index) => (
            <QueuedInputRow
              key={input.turnId}
              input={input}
              position={index + 1}
              sessionId={sessionId}
            />
          ))}
        </ScrollView>
      </View>
    </Surface>
  );
}

function QueuedInputRow({
  input,
  position,
  sessionId,
}: {
  input: AgentQueuedInput;
  position: number;
  sessionId: string;
}) {
  const { client } = useAgentChatClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isRemoving, setIsRemoving] = useState(false);
  const quote = input.userMessage.parts.find((part) => part.type === 'text' && part.quotes);
  const text = input.userMessage.parts
    .flatMap((part) => (part.type === 'text' ? [part.text.slice(0, 240)] : []))
    .join('\n')
    .slice(0, 240)
    .trim();
  const attachments = input.userMessage.parts
    .flatMap((part) => (part.type === 'file' ? [part.filename ?? t('chat.queue.message')] : []))
    .join(' · ');
  const remove = async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      const result = await client.cancelQueuedInput(sessionId, input.turnId);
      if (result === 'already-started') toast.show({ label: t('chat.queue.alreadyStarted') });
    } catch {
      toast.show({ label: t('chat.queue.removeFailed'), variant: 'danger' });
    } finally {
      setIsRemoving(false);
    }
  };
  return (
    <View
      className={`min-h-10 flex-row items-center gap-3 px-1 py-1.5 ${position > 1 ? 'border-t border-border-subtle' : ''}`}
    >
      <Text className="min-w-4 text-center text-xs tabular-nums text-muted-foreground">
        {position}
      </Text>
      <View className="min-w-0 flex-1 items-start gap-1">
        <View className="self-stretch">
          <Text className="text-sm text-foreground" numberOfLines={1}>
            {text || attachments || t('chat.queue.message')}
          </Text>
          {text && attachments ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {attachments}
            </Text>
          ) : null}
        </View>
        {quote?.type === 'text' && quote.quotes ? (
          <MessageQuotePreview fields={quote} numberOfLines={1} />
        ) : null}
      </View>
      <Button
        accessibilityLabel={t('chat.queue.remove', { position })}
        disabled={isRemoving}
        icon={<XIcon className="text-muted-foreground" />}
        loading={isRemoving}
        onPress={() => void remove()}
        shape="pill"
        size="xs"
        variant="ghost"
        testID={`chat-input-queue-remove-${input.turnId}`}
      />
    </View>
  );
}
