import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import SquareIcon from '@cherrystudio/app-icons/icons/square';
import {
  BackgroundPressExclusion,
  Button,
  ScrollShadow,
  Spinner,
  Tabs,
  type TabsItem,
} from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import type { MessageListItem } from '@/frontend/components/Message';
import { useModelPickerData } from '@/frontend/components/ModelPicker';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { MessageStatus } from '@/shared/data/types/message';

import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';

const STATUS_LABEL_KEYS: Partial<Record<MessageStatus, string>> = {
  error: 'chat.branch.failed',
  paused: 'chat.message.stopped',
  pending: 'chat.branch.answering',
};

/**
 * One question's answers — parallel models, regenerations, and answers added
 * with another model — as one horizontally scrolling segmented group. Choosing
 * an answer shows its own saved continuation, and the next question follows
 * the answer shown. Switching never calls a model.
 */
export const MessageAnswerTabs = memo(function MessageAnswerTabs({
  message,
}: {
  message: MessageListItem;
}) {
  const { t } = useTranslation();
  const { selectBranch } = useAssistantMessageActions();
  const { getModelItem } = useModelPickerData({ modelType: 'all' });
  const fadeColor = useThemeColor('chat-background');
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidth = useRef(0);
  const siblings = message.branch?.siblings;
  if (!siblings || !selectBranch) return null;

  const models = siblings.map((sibling) => getModelItem(sibling.modelId));
  // A removed model still names the shown answer from its own snapshot.
  const names = siblings.map(
    (sibling, index) =>
      models[index]?.model.name ??
      (sibling.id === message.id ? message.model?.name : undefined) ??
      t('chat.branch.unknownModel'),
  );
  // A model that answered more than once is numbered in answer order.
  const items: TabsItem<string>[] = siblings.map((sibling, index) => {
    const repeats = names.filter((name, other) => name === names[index] && other <= index).length;
    const name =
      names.filter((other) => other === names[index]).length > 1
        ? t('chat.branch.repeatedModel', { model: names[index], index: repeats })
        : names[index];
    const statusKey = STATUS_LABEL_KEYS[sibling.status];
    const model = models[index];
    return {
      label: statusKey
        ? t('chat.branch.answerStatus', { model: name, status: t(statusKey) })
        : name,
      testID: `message-answer-${sibling.id}`,
      value: sibling.id,
      children: ({ isSelected }) => (
        <View className="max-w-48 flex-row items-center gap-1.5">
          {model ? <ModelAvatar model={model.model} provider={model.provider} size={16} /> : null}
          <Text
            className={cn(
              'shrink text-xs',
              isSelected ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
            numberOfLines={1}
          >
            {name}
          </Text>
          <AnswerStatusIcon status={sibling.status} />
        </View>
      ),
    };
  });
  const selectedIndex = siblings.findIndex((sibling) => sibling.id === message.id);

  return (
    <BackgroundPressExclusion>
      {/* The group runs to the screen edges; faded ends show there is more to scroll. */}
      <ScrollShadow className="-mx-4" color={fadeColor} size={16}>
        <ScrollView
          contentContainerClassName="px-4"
          horizontal
          // A remounted row starts scrolled to the start; keep the shown answer in view.
          onContentSizeChange={(contentWidth) => {
            const overflow = contentWidth - viewportWidth.current;
            if (overflow > 0 && siblings.length > 1)
              scrollRef.current?.scrollTo({
                animated: false,
                x: (overflow * selectedIndex) / (siblings.length - 1),
              });
          }}
          onLayout={(event) => {
            viewportWidth.current = event.nativeEvent.layout.width;
          }}
          ref={scrollRef}
          showsHorizontalScrollIndicator={false}
          testID={`message-answers-${message.id}`}
        >
          <Tabs
            accessibilityLabel={t('chat.branch.answers')}
            items={items}
            layout="hug"
            onValueChange={(targetId) => selectBranch({ messageId: message.id, targetId })}
            value={message.id}
          />
        </ScrollView>
      </ScrollShadow>
    </BackgroundPressExclusion>
  );
});

function AnswerStatusIcon({ status }: { status: MessageStatus }) {
  if (status === 'pending') return <Spinner size="sm" />;
  if (status === 'error') return <CircleAlertIcon className="size-3.5 text-destructive" />;
  if (status === 'paused') return <SquareIcon className="size-3 text-muted-foreground" />;
  return null;
}

/** Stops the shown parallel answer alone; the composer's stop ends every answer. */
export const MessageAnswerStop = memo(function MessageAnswerStop({
  message,
}: {
  message: MessageListItem;
}) {
  const { t } = useTranslation();
  const { stopAnswer } = useAssistantMessageActions();
  // A single running answer stops with the composer; only parallel ones stop apart.
  const running = message.branch?.siblings.filter((sibling) => sibling.status === 'pending');
  if (!stopAnswer || message.status !== 'pending' || (running?.length ?? 0) < 2) return null;
  return (
    <BackgroundPressExclusion>
      <View className="flex-row">
        <Button
          icon={<SquareIcon className="text-muted-foreground" size={12} />}
          onPress={() => stopAnswer({ messageId: message.id })}
          size="xs"
          testID="message-answer-stop"
          variant="ghost"
        >
          <Button.Label>
            {message.model?.name
              ? t('chat.branch.stopModel', { model: message.model.name })
              : t('chat.branch.stopAnswer')}
          </Button.Label>
        </Button>
      </View>
    </BackgroundPressExclusion>
  );
});
