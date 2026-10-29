import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Surface, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { AgentQueuedInput } from '@/shared/contracts/agent';

import { messageQuoteLine } from '../../../quotes/MessageQuotePreview';
import { useAgentChatClient, useAgentQueuedInputs } from '../../../runtime';

export function ChatInputQueue({ sessionId }: { sessionId?: string }) {
  const inputs = useAgentQueuedInputs(sessionId);
  if (!sessionId || inputs.length === 0) return null;
  return (
    <Surface testID="chat-input-queue">
      <View className="py-1 pl-4 pr-2">
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
  const text = input.userMessage.parts
    .flatMap((part) => (part.type === 'text' ? [part.text.slice(0, 240)] : []))
    .join('\n')
    .slice(0, 240)
    .trim();
  const attachments = input.userMessage.parts
    .flatMap((part) => (part.type === 'file' ? [part.filename ?? t('chat.queue.message')] : []))
    .join(' · ');
  const quote = input.userMessage.parts.flatMap((part) => {
    const line = part.type === 'text' ? messageQuoteLine(part, t) : undefined;
    return line ? [line] : [];
  })[0];
  // One quiet line under the request: what it carries besides its own words.
  const detail = [text ? attachments : '', quote].filter(Boolean).join(' · ');
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
    <View className="min-h-10 flex-row items-center gap-2">
      {/* Sending order: the first row is the next to run. */}
      <Text className="min-w-3 self-start py-2.5 text-sm tabular-nums text-muted-foreground">
        {position}
      </Text>
      <View className="min-w-0 flex-1 py-2.5">
        <Text className="text-sm text-foreground" numberOfLines={1}>
          {text || attachments || t('chat.queue.message')}
        </Text>
        {detail ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {detail}
          </Text>
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
