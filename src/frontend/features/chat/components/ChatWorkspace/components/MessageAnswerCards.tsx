import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import {
  BackgroundPressExclusion,
  ContentState,
  ContextMenu,
  ContextMenuExclusion,
  ShimmerText,
  Skeleton,
  Spinner,
} from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type Ref, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { ModelAvatar } from '@/frontend/components/Avatar';
import { MarkdownText } from '@/frontend/components/MarkdownText';
import type { MessageListItem } from '@/frontend/components/Message';
import { type ModelPickerModelItem, useModelPickerData } from '@/frontend/components/ModelPicker';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { useChatQuoteActions } from '../../../quotes/ChatQuoteContext';
import { useAgentAnswers } from '../../../runtime';
import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { useChatSessionId } from '../context/ChatSessionContext';
import { measureFrame, useExpandAnswer } from '../context/ExpandAnswerContext';
import { answerPreview } from '../utils/answerPreview';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';

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
 * answer shown. A long answer folds to its opening; tapping any card opens that answer in full.
 */
export const MessageAnswerCards = memo(function MessageAnswerCards({
  message,
}: {
  message: MessageListItem;
}) {
  const { t } = useTranslation();
  const { selectBranch } = useAssistantMessageActions();
  const expand = useExpandAnswer();
  const cardRefs = useRef(new Map<string, ViewInstance>());
  const measure = useCallback((id: string) => measureFrame(cardRefs.current.get(id)), []);
  const sessionId = useChatSessionId();
  const branchSiblings = message.branch?.siblings;
  const ids = useMemo(() => (branchSiblings ?? []).map((sibling) => sibling.id), [branchSiblings]);
  const { answers, isError, refetch } = useAgentAnswers(sessionId, ids);
  const group = useAnswerGroup(message, answers);
  const { siblings } = group;
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // Once horizontal scrolling wins, the drawer must not take over the same touch.
  const scrollGesture = useMemo(() => Gesture.Native().disallowInterruption(true), []);
  const placement = useRef<{ id: string; offset: number }>(undefined);
  const selection = useRef<{ id: string; result: Promise<boolean> }>(undefined);
  // The card moves on release; the answer itself follows once the transcript is read again.
  const [choice, setChoice] = useState<{ from: string; to: string }>();
  // Spent once the row shows it; kept, it would redirect the row's next return to `from`.
  if (choice && choice.to === message.id) setChoice(undefined);
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

  // Layout and programmatic scrolls also end; only the reader's own swipe chooses an answer.
  const isSwiping = useRef(false);
  const handleScrollEnd = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isSwiping.current) return;
    isSwiping.current = false;
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
            description={t('chat.history.loadFailed')}
            layout="leading"
            primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
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
              onScrollBeginDrag={() => {
                isSwiping.current = true;
              }}
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
                  onPress={() => {
                    place(index, true);
                    const selection = show(index);
                    expand?.({ id: sibling.id, measure, selection });
                  }}
                  ref={(card) => {
                    if (card) cardRefs.current.set(sibling.id, card);
                    else cardRefs.current.delete(sibling.id);
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
  onPress,
  ref,
  status,
  testID,
  width,
}: {
  answer: MessageListItem | undefined;
  bodyHeight: number;
  isShown: boolean;
  model: Answers['models'][number];
  name: string;
  onPress: () => void;
  ref: Ref<ViewInstance>;
  status: MessageListItem['status'];
  testID: string;
  width: number;
}) {
  const { t, i18n } = useTranslation();
  const quoteActions = useChatQuoteActions();
  const actions = useAssistantMessageActions();
  const reply =
    answer && quoteActions?.canReply(answer) && actions.replyToMessage
      ? () => void actions.replyToMessage?.({ messageId: answer.id })
      : undefined;
  const cardColor = useThemeColor('card');
  const { backgroundColor: transparentCardColor } = useResolveClassNames('bg-card/0');
  const preview = useMemo(() => answerPreview(answer?.data.parts), [answer?.data.parts]);
  const [contentHeight, setContentHeight] = useState(0);
  const isFolded = preview.isTruncated || contentHeight > bodyHeight;
  const isRunning = status === 'pending';

  const card = (
    <Pressable
      accessibilityActions={reply ? [{ name: 'reply', label: t('chat.quote.reply') }] : undefined}
      onAccessibilityAction={
        reply
          ? (event) => {
              if (event.nativeEvent.actionName === 'reply') reply();
            }
          : undefined
      }
      accessibilityHint={t('chat.branch.read')}
      accessibilityLabel={name}
      accessibilityRole="button"
      accessibilityState={{ selected: isShown }}
      className="gap-2 rounded-2xl border border-border-subtle bg-card px-3.5 pt-3 pb-3.5 active:opacity-80"
      onPress={onPress}
      ref={ref}
      style={{ width }}
      testID={testID}
    >
      <View className="flex-row items-center gap-1.5">
        {model ? <ModelAvatar model={model.model} provider={model.provider} size={16} /> : null}
        <Text className="min-w-0 flex-1 font-semibold text-foreground text-sm" numberOfLines={1}>
          {name}
        </Text>
        {isRunning || status === 'error' ? (
          <AnswerStatus status={status} />
        ) : isFolded ? (
          <View className="flex-row items-center">
            <Text className="text-foreground-tertiary text-xs">
              {t('chat.branch.length', {
                length: preview.length.toLocaleString(i18n.resolvedLanguage ?? i18n.language),
              })}
            </Text>
            <ChevronRightIcon className="size-3.5 text-foreground-tertiary" />
          </View>
        ) : null}
      </View>
      {/* Keep streaming content out of a native mask, which can expose its black bitmap on mount. */}
      <View
        className="overflow-hidden"
        // Preview gestures belong to the cards; links, tables and code are interactive in full view.
        pointerEvents="none"
        style={{ height: contentHeight ? Math.min(contentHeight, bodyHeight) : bodyHeight }}
      >
        {/* Text measures no taller than its parent, so the body lays out free of the fold and
            the fold takes its height up to the cap. */}
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
        {isFolded ? (
          <LinearGradient
            colors={[transparentCardColor ?? 'transparent', cardColor]}
            style={{
              bottom: 0,
              height: Math.min(FADE_HEIGHT, bodyHeight),
              left: 0,
              position: 'absolute',
              right: 0,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
  if (!reply || !answer) return card;
  const text = copyAssistantMessageText(answer.data.parts ?? []);
  return (
    <ContextMenuExclusion>
      <ContextMenu
        items={[
          { id: 'reply', label: t('chat.quote.reply'), onPress: reply },
          {
            id: 'copy',
            label: t('common.copy'),
            disabled: !text,
            onPress: () => actions.copyAssistantMessage({ messageId: answer.id, text }),
          },
          {
            id: 'share',
            label: t('chat.share.title'),
            onPress: () => actions.shareAssistantMessage({ messageId: answer.id }),
          },
        ]}
      >
        {card}
      </ContextMenu>
    </ContextMenuExclusion>
  );
});

export function AnswerStatus({ status }: { status: MessageListItem['status'] | undefined }) {
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
