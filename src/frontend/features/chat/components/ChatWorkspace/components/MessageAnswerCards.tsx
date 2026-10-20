import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import {
  BackgroundPressExclusion,
  Button,
  ContentState,
  ShimmerText,
  Skeleton,
  Spinner,
} from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';

import { ModelAvatar } from '@/frontend/components/Avatar';
import { MarkdownText } from '@/frontend/components/MarkdownText';
import type { MessageListItem } from '@/frontend/components/Message';
import { type ModelPickerModelItem, useModelPickerData } from '@/frontend/components/ModelPicker';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { useAgentAnswers } from '../../../runtime';
import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { useChatSessionId } from '../context/ChatSessionContext';
import { answerPreview } from '../utils/answerPreview';

const CARD_GAP = 8;
/** How much of the next card shows beside the current one. */
const CARD_PEEK = 20;
/** A folded card's body height as a share of the window, so every card is one height. */
const FOLDED_BODY_SHARE = 0.36;
const FADE_HEIGHT = 48;

type AnswerModel = Readonly<{
  model: NonNullable<MessageListItem['model']>;
  provider?: ModelPickerModelItem['provider'];
}>;

type Answers = Readonly<{
  /** Each answer's display name, numbered where one model answered more than once. */
  names: readonly string[];
  models: readonly (AnswerModel | undefined)[];
  siblings: NonNullable<MessageListItem['branch']>['siblings'];
}>;

/**
 * One question's answers in order, named by model. A removed model still names an answer from
 * that answer's own snapshot, once it has been read.
 */
export function useAnswerGroup(
  message: MessageListItem,
  answers?: ReadonlyMap<string, MessageListItem>,
): Answers {
  const { t } = useTranslation();
  const { getModelItem } = useModelPickerData({ modelType: 'all' });
  const siblings = message.branch?.siblings ?? [];
  const models = siblings.map((sibling): AnswerModel | undefined => {
    const item = getModelItem(sibling.modelId);
    if (item) return item;
    const own = (sibling.id === message.id ? message : answers?.get(sibling.id))?.model;
    return own ? { model: own } : undefined;
  });
  const bare = siblings.map(
    (_, index) => models[index]?.model.name ?? t('chat.branch.unknownModel'),
  );
  const names = bare.map((name, index) =>
    bare.filter((other) => other === name).length > 1
      ? t('chat.branch.repeatedModel', {
          index: bare.filter((other, before) => other === name && before <= index).length,
          model: name,
        })
      : name,
  );
  return { models, names, siblings };
}

/**
 * One question's answers as a row of equal cards: the shown one in full width and the next
 * peeking beside it. Swiping settles on an answer and shows it; the next question follows the
 * answer shown. A long answer folds to its opening, and reading it in full is `onExpand`.
 */
export const MessageAnswerCards = memo(function MessageAnswerCards({
  message,
  onExpand,
}: {
  message: MessageListItem;
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const { selectBranch } = useAssistantMessageActions();
  const sessionId = useChatSessionId();
  const branchSiblings = message.branch?.siblings;
  const ids = useMemo(() => (branchSiblings ?? []).map((sibling) => sibling.id), [branchSiblings]);
  const { answers, isError, refetch } = useAgentAnswers(sessionId, ids);
  const group = useAnswerGroup(message, answers);
  const { siblings } = group;
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  // Once horizontal scrolling wins, the drawer must not take over the same touch.
  const scrollGesture = useMemo(() => Gesture.Native().disallowInterruption(true), []);
  const placement = useRef<{ id: string; offset: number }>(undefined);
  const selection = useRef<{ id: string; result: Promise<boolean> }>(undefined);
  // The card moves on release; the answer itself follows once the transcript is read again.
  const [choice, setChoice] = useState<{ from: string; to: string }>();
  const shownId = choice?.from === message.id ? choice.to : message.id;
  const shownIndex = Math.max(
    0,
    siblings.findIndex((sibling) => sibling.id === shownId),
  );

  const cardWidth = Math.max(0, width - CARD_PEEK - CARD_GAP);
  const interval = cardWidth + CARD_GAP;
  // The first card starts at the content edge, the last ends there, and the rest are centred.
  const maxOffset = Math.max(0, siblings.length * interval - CARD_GAP - width);
  const offsets = siblings.map((_, index) =>
    Math.min(maxOffset, Math.max(0, index * interval - (CARD_PEEK + CARD_GAP) / 2)),
  );

  const place = (index: number, animated: boolean) =>
    scrollRef.current?.scrollTo({ animated: animated && !reduceMotion, x: offsets[index] ?? 0 });
  const show = (index: number): Promise<boolean> => {
    const target = siblings[index];
    if (!target || !selectBranch) return Promise.resolve(false);
    if (selection.current?.id === target.id) return selection.current.result;
    if (target.id === message.id && !selection.current) return Promise.resolve(true);
    const from = message.id;
    placement.current = { id: target.id, offset: offsets[index] ?? 0 };
    setChoice({ from, to: target.id });
    const result: Promise<boolean> = selectBranch({ messageId: from, targetId: target.id }).then(
      (applied) => {
        if (selection.current?.result !== result) return false;
        selection.current = undefined;
        if (!applied) {
          placement.current = undefined;
          setChoice(undefined);
        }
        return applied;
      },
    );
    selection.current = { id: target.id, result };
    return result;
  };
  const shownOffset = offsets[shownIndex] ?? 0;
  // A remounted row starts at the first card, and an added answer lands at the end.
  useLayoutEffect(() => {
    if (
      width === 0 ||
      (placement.current?.id === shownId && placement.current.offset === shownOffset)
    )
      return;
    placement.current = { id: shownId, offset: shownOffset };
    scrollRef.current?.scrollTo({ animated: false, x: shownOffset });
  }, [shownId, shownOffset, width]);

  const handleScrollEnd = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = nativeEvent.contentOffset.x;
    let nearest = 0;
    offsets.forEach((offset, index) => {
      if (Math.abs(offset - x) < Math.abs(offsets[nearest]! - x)) nearest = index;
    });
    void show(nearest);
  };

  return (
    <BackgroundPressExclusion>
      <View
        className="w-full gap-2.5"
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        {isError ? (
          <ContentState.Error
            action={{ label: t('common.retry'), onPress: () => void refetch() }}
            description={t('chat.history.loadFailed')}
            layout="leading"
          />
        ) : null}
        {width > 0 ? (
          <GestureDetector gesture={scrollGesture}>
            <ScrollView
              accessibilityLabel={t('chat.branch.answers')}
              contentContainerClassName="gap-2"
              decelerationRate="fast"
              horizontal
              keyboardShouldPersistTaps="handled"
              onMomentumScrollEnd={handleScrollEnd}
              ref={scrollRef}
              showsHorizontalScrollIndicator={false}
              snapToOffsets={offsets}
              testID={`message-answers-${message.id}`}
            >
              {siblings.map((sibling, index) => (
                <AnswerCard
                  answer={sibling.id === message.id ? message : answers.get(sibling.id)}
                  bodyHeight={Math.round(windowHeight * FOLDED_BODY_SHARE)}
                  isShown={index === shownIndex}
                  key={sibling.id}
                  model={group.models[index]}
                  name={group.names[index]!}
                  onExpand={() => {
                    void show(index).then((applied) => {
                      if (applied) onExpand();
                    });
                  }}
                  onPress={() => {
                    place(index, true);
                    void show(index);
                  }}
                  status={sibling.status}
                  testID={`message-answer-${sibling.id}`}
                  width={cardWidth}
                />
              ))}
            </ScrollView>
          </GestureDetector>
        ) : null}
        <AnswerDots
          count={siblings.length}
          index={shownIndex}
          names={group.names}
          onSelect={(index) => {
            place(index, true);
            void show(index);
          }}
        />
      </View>
    </BackgroundPressExclusion>
  );
});

const AnswerCard = memo(function AnswerCard({
  answer,
  bodyHeight,
  isShown,
  model,
  name,
  onExpand,
  onPress,
  status,
  testID,
  width,
}: {
  answer: MessageListItem | undefined;
  bodyHeight: number;
  isShown: boolean;
  model: Answers['models'][number];
  name: string;
  onExpand: () => void;
  onPress: () => void;
  status: MessageListItem['status'];
  testID: string;
  width: number;
}) {
  const { t, i18n } = useTranslation();
  const maskColor = useThemeColor('constant-black');
  const preview = useMemo(() => answerPreview(answer?.data.parts), [answer?.data.parts]);
  const [contentHeight, setContentHeight] = useState(0);
  const isFolded = preview.isTruncated || contentHeight > bodyHeight;
  const isRunning = status === 'pending';

  return (
    <Pressable
      accessible={false}
      accessibilityState={{ selected: isShown }}
      className="gap-2 rounded-2xl border border-border-subtle bg-card px-3.5 pt-3 pb-3.5"
      disabled={isShown}
      onPress={onPress}
      style={{ width }}
      testID={testID}
    >
      <View className="flex-row items-center gap-1.5">
        {model ? <ModelAvatar model={model.model} provider={model.provider} size={16} /> : null}
        <Text className="min-w-0 flex-1 font-semibold text-foreground text-sm">{name}</Text>
        <AnswerStatus status={status} />
      </View>
      {/* Fades the text itself, so the card's surface never picks up a band. */}
      <MaskedView
        maskElement={
          <LinearGradient
            colors={isFolded ? [maskColor, maskColor, 'transparent'] : [maskColor, maskColor]}
            locations={isFolded ? [0, 1 - FADE_HEIGHT / bodyHeight, 1] : [0, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        {/* Text measures no taller than its parent, so the body lays out free of the fold and
            the fold takes its height up to the cap. */}
        <View
          className="overflow-hidden"
          // Preview gestures belong to the cards; links, tables and code are interactive in full view.
          pointerEvents="none"
          style={{ height: contentHeight ? Math.min(contentHeight, bodyHeight) : bodyHeight }}
        >
          <View
            className="absolute top-0 right-0 left-0"
            onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
          >
            {!answer ? (
              <AnswerSkeleton />
            ) : preview.text ? (
              <MarkdownText isStreaming={isRunning} markdown={preview.text} selectable={false} />
            ) : isRunning ? (
              <ShimmerText className="text-base text-muted-foreground">
                {t('chat.branch.answering')}
              </ShimmerText>
            ) : (
              <Text className="text-base text-muted-foreground">
                {t(
                  status === 'error'
                    ? 'chat.branch.failed'
                    : status === 'paused'
                      ? 'chat.message.stopped'
                      : 'chat.branch.noTextPreview',
                )}
              </Text>
            )}
          </View>
        </View>
      </MaskedView>
      {answer ? (
        <View className="self-start">
          <Button
            icon={<ChevronDownIcon />}
            onPress={onExpand}
            size="xs"
            testID={`${testID}-expand`}
            variant="secondary"
          >
            {isFolded
              ? t('chat.branch.expand', {
                  length: preview.length.toLocaleString(i18n.resolvedLanguage ?? i18n.language),
                })
              : t('chat.branch.read')}
          </Button>
        </View>
      ) : null}
    </Pressable>
  );
});

function AnswerStatus({ status }: { status: MessageListItem['status'] }) {
  const { t } = useTranslation();
  if (status === 'pending')
    return (
      <View className="flex-row items-center gap-1">
        <Spinner size="sm" />
        <Text className="text-foreground-tertiary text-xs">{t('chat.branch.answering')}</Text>
      </View>
    );
  if (status === 'error') return <CircleAlertIcon className="size-3.5 text-destructive" />;
  return null;
}

function AnswerSkeleton() {
  return (
    <View className="gap-2 py-1">
      <Skeleton className="h-4 w-full rounded-md" />
      <Skeleton className="h-4 w-11/12 rounded-md" />
      <Skeleton className="h-4 w-2/3 rounded-md" />
    </View>
  );
}

/** Where the shown answer sits among its question's answers; a dot shows that answer. */
export function AnswerDots({
  count,
  index,
  names,
  onSelect,
}: {
  count: number;
  index: number;
  names: readonly string[];
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      {Array.from({ length: count }, (_, dot) => (
        <Pressable
          accessibilityLabel={t('chat.branch.page', {
            index: dot + 1,
            model: names[dot],
            total: count,
          })}
          accessibilityRole="button"
          accessibilityState={{ selected: dot === index }}
          hitSlop={{ bottom: 10, left: 4, right: 4, top: 10 }}
          key={dot}
          onPress={() => onSelect(dot)}
        >
          <View
            className={cn(
              'h-1.5 rounded-full',
              dot === index ? 'w-4.5 bg-foreground' : 'w-1.5 bg-border-strong',
            )}
          />
        </Pressable>
      ))}
    </View>
  );
}

/** Names the answer being read in full, switches to another, and folds back to the cards. */
export function AnswerReadingBar({
  message,
  onCollapse,
  onSelect,
}: {
  message: MessageListItem;
  onCollapse: () => void;
  onSelect: (targetId: string) => void;
}) {
  const { t } = useTranslation();
  const group = useAnswerGroup(message);
  const index = Math.max(
    0,
    group.siblings.findIndex((sibling) => sibling.id === message.id),
  );
  const model = group.models[index];
  return (
    <BackgroundPressExclusion>
      <View className="min-h-11 flex-row items-center gap-2 border-border-subtle border-b bg-chat-background py-1.5">
        {model ? <ModelAvatar model={model.model} provider={model.provider} size={16} /> : null}
        <Text className="min-w-0 flex-1 font-semibold text-foreground text-sm">
          {group.names[index]}
        </Text>
        <AnswerDots
          count={group.siblings.length}
          index={index}
          names={group.names}
          onSelect={(dot) => {
            const target = group.siblings[dot];
            if (target && target.id !== message.id) onSelect(target.id);
          }}
        />
        <Button
          icon={<ChevronUpIcon />}
          onPress={onCollapse}
          size="xs"
          testID={`message-answers-collapse-${message.id}`}
          variant="secondary"
        >
          {t('chat.branch.collapse')}
        </Button>
      </View>
    </BackgroundPressExclusion>
  );
}
