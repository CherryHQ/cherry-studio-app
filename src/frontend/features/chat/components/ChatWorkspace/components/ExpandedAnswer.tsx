import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  BackgroundPressExclusion,
  Button,
  ContextMenuExclusion,
  Skeleton,
} from '@cherrystudio/ui/components';
import { duration, easing, spring } from '@cherrystudio/ui/motion';
import {
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import { ModelAvatar } from '@/frontend/components/Avatar';
import { AssistantMessage, type MessageListItem } from '@/frontend/components/Message';

import { useAgentAnswers } from '../../../runtime';
import {
  ConversationAttachments,
  ConversationMessageContent,
} from '../../ConversationMessageContent';
import { useFullScreenLayer, useFullScreenLayerProgress } from '../../FullScreenLayer';
import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { useChatMessageRow } from '../context/ChatMessageRowContext';
import { useChatSessionId } from '../context/ChatSessionContext';
import {
  type AnswerFrame,
  ExpandAnswerContextProvider,
  type ExpandAnswerRequest,
  measureFrame,
} from '../context/ExpandAnswerContext';
import { MessageTranslationContent } from '../translation/MessageTranslation';
import { AssistantMessageToolbar } from './AssistantMessageToolbar';
import { AnswerDots, AnswerStatus, useAnswerGroup } from './MessageAnswerCards';

/** A card's corner radius, which the layer grows from and shrinks back to. */
const CARD_RADIUS = 16;
/**
 * Past this point of growing the layer covers the header and composer, and shrinking back below
 * it returns them, so they come and go inside the motion instead of after it.
 */
const COVER_PROGRESS = 0.5;
/**
 * Android draws its header and composer in the app, so the layer covers them from the start: the
 * header fades and the composer dims under it, and nothing re-lays out mid-motion.
 */
const COVERS_FROM_START = Platform.OS === 'android';
/** How far past the top an iOS reader pulls before letting go closes the layer. */
const PULL_CLOSE_DISTANCE = 72;
/** Within this distance of the end, a running answer keeps its newest text in view. */
const FOLLOW_SLOP = 24;

/**
 * Hosts the answer opened from a card. The layer sits beside the transcript inside the
 * workspace's providers, so the answer renders with the same actions, attachments and
 * translations as its row; the screen hides its header and raises this region above the
 * composer while it is shown.
 */
export function ExpandedAnswerProvider({
  children,
  messages,
  renderUsage,
}: PropsWithChildren<{
  messages: readonly MessageListItem[];
  renderUsage: ((message: MessageListItem) => ReactNode) | undefined;
}>) {
  const [request, setRequest] = useState<ExpandAnswerRequest>();
  // The region grows over the composer while an answer is open; the transcript keeps its size so
  // nothing under the layer moves.
  const [transcriptHeight, setTranscriptHeight] = useState<number>();
  const expand = useCallback((next: ExpandAnswerRequest) => {
    Keyboard.dismiss();
    setRequest((current) => current ?? next);
  }, []);
  const close = useCallback(() => setRequest(undefined), []);
  return (
    <ExpandAnswerContextProvider value={expand}>
      {/* The transcript under an open answer leaves the accessibility tree. */}
      <View
        accessibilityElementsHidden={Boolean(request)}
        importantForAccessibility={request ? 'no-hide-descendants' : 'auto'}
        onLayout={(event) => {
          if (!request) setTranscriptHeight(event.nativeEvent.layout.height);
        }}
        // A style alone, since a class would win over the fixed height.
        style={request && transcriptHeight ? { height: transcriptHeight } : fillStyle}
      >
        {children}
      </View>
      {request ? (
        <ExpandedAnswer
          messages={messages}
          onClosed={close}
          renderUsage={renderUsage}
          request={request}
        />
      ) : null}
    </ExpandAnswerContextProvider>
  );
}

/**
 * The opened answer, grown from its card to cover the screen. Its model and place among the
 * answers stay at the top and its actions at the bottom; swiping across moves to another answer,
 * which then becomes the one the next message continues. Closing shrinks it back onto the card
 * now shown.
 */
function ExpandedAnswer({
  messages,
  onClosed,
  renderUsage,
  request,
}: {
  messages: readonly MessageListItem[];
  onClosed: () => void;
  renderUsage: ((message: MessageListItem) => ReactNode) | undefined;
  request: ExpandAnswerRequest;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { selectBranch } = useAssistantMessageActions();
  const sessionId = useChatSessionId();
  // The opened answer finds its row, whichever answer of the group the row shows.
  const row = useMemo(
    () =>
      messages.find(
        (message) =>
          message.role === 'assistant' &&
          message.branch?.siblings.some((sibling) => sibling.id === request.id),
      ),
    [messages, request.id],
  );
  const siblings = row?.branch?.siblings;
  const ids = useMemo(() => (siblings ?? []).map((sibling) => sibling.id), [siblings]);
  const { answers } = useAgentAnswers(sessionId, ids);
  const group = useAnswerGroup(row ?? emptyRow, answers);
  // The page moves on release; the row follows once the selection is read back.
  const [choice, setChoice] = useState(() =>
    row && row.id !== request.id ? { from: row.id, to: request.id } : undefined,
  );
  // Spent once the row shows it; kept, it would redirect the row's next return to `from`.
  if (row && choice && choice.to === row.id) setChoice(undefined);
  const shownId = row && choice?.from === row.id ? choice.to : row?.id;
  const shownIndex = Math.max(0, ids.indexOf(shownId ?? ''));
  const shown = shownId === row?.id ? row : shownId ? answers.get(shownId) : undefined;

  const { height: windowHeight } = useWindowDimensions();
  const [host, setHost] = useState<AnswerFrame>();
  // The region reaches over the composer only while covered; the layer keeps the screen's height
  // throughout so its content never re-lays out mid-motion.
  const size = host ? { height: windowHeight - host.top, width: host.width } : undefined;
  const [isSettled, setIsSettled] = useState(false);
  const localProgress = useSharedValue(0);
  const progress = useFullScreenLayerProgress() ?? localProgress;
  const origin = useSharedValue<AnswerFrame | null>(null);
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const isClosing = useRef(false);
  const rootRef = useRef<ViewInstance>(null);
  const pagerRef = useRef<ScrollViewInstance>(null);
  const [isCovering, setIsCovering] = useState(COVERS_FROM_START);
  const [isClosed, setIsClosed] = useState(false);
  useFullScreenLayer(isCovering && !isClosed);
  useAnimatedReaction(
    () => COVERS_FROM_START || progress.get() > COVER_PROGRESS,
    (covering, previous) => {
      if (covering !== previous) runOnJS(setIsCovering)(covering);
    },
  );

  const select = useCallback(
    (targetId: string) => {
      if (!row || !selectBranch) return;
      const from = row.id;
      setChoice({ from, to: targetId });
      void selectBranch({ messageId: from, targetId }).then((applied) => {
        if (!applied)
          setChoice((current) =>
            current?.from === from && current.to === targetId ? undefined : current,
          );
      });
    },
    [row, selectBranch],
  );
  // A card for another answer opened it while its selection was still on the way.
  useEffect(() => {
    void request.selection?.then((applied) => {
      if (!applied) setChoice((current) => (current?.to === request.id ? undefined : current));
    });
  }, [request]);

  const measureCard = useCallback(
    async (id: string): Promise<AnswerFrame | undefined> => {
      const [root, card] = await Promise.all([measureFrame(rootRef.current), request.measure(id)]);
      return root && card
        ? {
            height: card.height,
            left: card.left - root.left,
            top: card.top - root.top,
            width: card.width,
          }
        : undefined;
    },
    [request],
  );

  const close = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    const shrink = (frame: AnswerFrame | undefined) => {
      origin.set(frame ?? null);
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(setIsClosed)(true);
      };
      progress.set(
        frame
          ? withSpring(0, spring.settle, done)
          : withTiming(0, { duration: duration.fast, easing: easing.settle }, done),
      );
    };
    if (reduceMotion || !shownId) shrink(undefined);
    else void measureCard(shownId).then(shrink);
  }, [measureCard, origin, progress, reduceMotion, shownId]);
  // The screen is released before the layer goes, so its region shrinks back under a layer that has
  // already finished; together they would show the transcript out of place for a frame.
  useEffect(() => {
    if (!isClosed) return;
    const frame = requestAnimationFrame(onClosed);
    return () => cancelAnimationFrame(frame);
  }, [isClosed, onClosed]);

  // The screen's chrome follows the progress; a layer removed mid-motion must not leave it hidden.
  useEffect(() => () => progress.set(0), [progress]);

  // The group is gone once its turn is deleted or the Session changes underneath.
  useEffect(() => {
    if (!row?.branch) onClosed();
  }, [onClosed, row?.branch]);

  // A route pushed over the chat keeps back for itself; the layer stays open underneath.
  useFocusedBackPress(close);

  const openDuration = useRef<number>(undefined);
  const handleHostLayout = () => {
    const isOpening = !host;
    void Promise.all([
      measureFrame(rootRef.current),
      isOpening && !reduceMotion ? measureCard(request.id) : undefined,
    ]).then(([frame, card]) => {
      if (!frame) return;
      setHost(frame);
      if (!isOpening) return;
      origin.set(card ?? null);
      openDuration.current = card ? duration.slow : duration.fast;
    });
  };
  // Grows once the answer has laid out, so mounting it does not use up the motion's first frames.
  const handleContentLayout = () => {
    const ms = openDuration.current;
    if (ms === undefined) return;
    openDuration.current = undefined;
    progress.set(
      withTiming(1, { duration: ms, easing: easing.settle }, (finished) => {
        if (finished) runOnJS(setIsSettled)(true);
      }),
    );
  };

  // The shown answer's page stays in view: after a new answer, a refused selection or a rotation.
  useEffect(() => {
    if (width) pagerRef.current?.scrollTo({ animated: false, x: shownIndex * width });
  }, [shownIndex, width]);

  const frameStyle = useAnimatedStyle(() => {
    const from = origin.get();
    const value = progress.get();
    if (!from) return { borderRadius: 0, height, left: 0, opacity: value, top: 0, width };
    return {
      borderRadius: interpolate(value, [0, 1], [CARD_RADIUS, 0], Extrapolation.CLAMP),
      height: interpolate(value, [0, 1], [from.height, height], Extrapolation.CLAMP),
      left: interpolate(value, [0, 1], [from.left, 0], Extrapolation.CLAMP),
      // Blends with the card it leaves and lands on, so the card's own text shows through.
      opacity: interpolate(value, [0, 0.3], [0, 1], Extrapolation.CLAMP),
      top: interpolate(value, [0, 1], [from.top, 0], Extrapolation.CLAMP),
      width: interpolate(value, [0, 1], [from.width, width], Extrapolation.CLAMP),
    };
  });
  const contentStyle = useAnimatedStyle(() => ({
    opacity: origin.get() ? interpolate(progress.get(), [0.2, 1], [0, 1], Extrapolation.CLAMP) : 1,
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  // Once a horizontal swipe wins, the drawer must not take over the same touch.
  const pagerGesture = useMemo(() => Gesture.Native().disallowInterruption(true), []);

  // Layout and programmatic scrolls also end; only the reader's own swipe changes the answer.
  const isSwiping = useRef(false);
  const handlePageEnd = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isSwiping.current || !width) return;
    isSwiping.current = false;
    const target = siblings?.[Math.round(nativeEvent.contentOffset.x / width)];
    if (target && target.id !== shownId) select(target.id);
  };
  const showPage = (index: number) => {
    const target = siblings?.[index];
    if (!target || !width) return;
    pagerRef.current?.scrollTo({ animated: !reduceMotion, x: index * width });
    if (target.id !== shownId) select(target.id);
  };

  const model = group.models[shownIndex];
  return (
    <>
      {/* Measures the region the layer covers from. */}
      <View
        className="absolute inset-0"
        onLayout={handleHostLayout}
        pointerEvents="none"
        ref={rootRef}
      />
      {size ? (
        <View
          accessibilityViewIsModal
          className="absolute top-0 left-0"
          onAccessibilityEscape={close}
          style={size}
          testID="expanded-answer"
        >
          <Animated.View className="absolute inset-0 bg-scrim" style={scrimStyle} />
          {row && siblings ? (
            <BackgroundPressExclusion className="absolute inset-0">
              <Animated.View className="absolute overflow-hidden bg-card" style={frameStyle}>
                {/* Laid out at the final size, so growing clips the layer instead of re-laying it out. */}
                <Animated.View
                  onLayout={handleContentLayout}
                  style={[{ height, width }, contentStyle]}
                >
                  <View
                    className="flex-row items-center gap-2 px-4 pb-1"
                    style={{ paddingTop: insets.top + 4 }}
                  >
                    {model ? (
                      <ModelAvatar model={model.model} provider={model.provider} size={20} />
                    ) : null}
                    <Text
                      accessibilityRole="header"
                      className="min-w-0 shrink font-semibold text-base text-foreground"
                      numberOfLines={1}
                    >
                      {group.names[shownIndex]}
                    </Text>
                    <AnswerStatus status={siblings[shownIndex]?.status} />
                    <View className="ml-1 min-w-0 flex-1 items-start">
                      <AnswerDots
                        count={siblings.length}
                        index={shownIndex}
                        names={group.names}
                        onSelect={showPage}
                      />
                    </View>
                    <Button
                      accessibilityLabel={t('common.close')}
                      icon={<XIcon />}
                      onPress={close}
                      shape="pill"
                      size="sm"
                      testID="expanded-answer-close"
                      variant="ghost"
                    />
                  </View>
                  <GestureDetector gesture={pagerGesture}>
                    <ScrollView
                      accessibilityLabel={t('chat.branch.answers')}
                      className="flex-1"
                      contentOffset={{ x: shownIndex * width, y: 0 }}
                      horizontal
                      keyboardShouldPersistTaps="handled"
                      onMomentumScrollEnd={handlePageEnd}
                      onScrollBeginDrag={() => {
                        isSwiping.current = true;
                      }}
                      pagingEnabled
                      ref={pagerRef}
                      showsHorizontalScrollIndicator={false}
                    >
                      {siblings.map((sibling, index) => (
                        <View key={sibling.id} style={{ width }}>
                          {/* Neighbours lay out after the layer has grown, so opening pays for one answer. */}
                          {index === shownIndex ||
                          (isSettled && Math.abs(index - shownIndex) <= 1) ? (
                            <AnswerPage
                              answer={sibling.id === row.id ? row : answers.get(sibling.id)}
                              onPullClose={close}
                            />
                          ) : null}
                        </View>
                      ))}
                    </ScrollView>
                  </GestureDetector>
                  <View
                    className="min-h-12 flex-row items-center gap-3 px-4 pt-1"
                    style={{ paddingBottom: Math.max(insets.bottom, 12) }}
                  >
                    {shown && shown.status !== 'pending' ? (
                      <ContextMenuExclusion className="w-full flex-row flex-wrap items-center gap-x-3 gap-y-1">
                        <AssistantMessageToolbar message={shown} onReply={onClosed} />
                        <View className="min-w-0 max-w-full flex-1 items-end">
                          {renderUsage?.(shown)}
                        </View>
                      </ContextMenuExclusion>
                    ) : null}
                  </View>
                </Animated.View>
              </Animated.View>
            </BackgroundPressExclusion>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/** One answer read in full, with its attachments and translation, in its own scroll. */
function AnswerPage({
  answer,
  onPullClose,
}: {
  answer: MessageListItem | undefined;
  onPullClose: () => void;
}) {
  const row = useChatMessageRow(answer?.id ?? '');
  const scrollRef = useRef<ScrollViewInstance>(null);
  const isAtEnd = useRef(true);
  const isRunning = answer?.status === 'pending';

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    isAtEnd.current =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - FOLLOW_SLOP;
  };
  return (
    <ScrollView
      contentContainerClassName="px-4 pt-3 pb-6"
      onContentSizeChange={() => {
        if (isRunning && isAtEnd.current) scrollRef.current?.scrollToEnd({ animated: false });
      }}
      onScroll={handleScroll}
      onScrollEndDrag={({ nativeEvent }) => {
        if (nativeEvent.contentOffset.y < -PULL_CLOSE_DISTANCE) onPullClose();
      }}
      ref={scrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {answer ? (
        <ConversationMessageContent messageState={row.messageState} tools={row.tools}>
          <AssistantMessage message={answer}>
            {row.attachments?.length ? (
              <View className="w-full gap-2">
                <ConversationAttachments attachments={row.attachments} />
              </View>
            ) : null}
            <MessageTranslationContent message={answer} />
          </AssistantMessage>
        </ConversationMessageContent>
      ) : (
        <View className="gap-2 py-1">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-11/12 rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </View>
      )}
    </ScrollView>
  );
}

const fillStyle = { flex: 1 } as const;
const emptyRow: MessageListItem = { data: {}, id: '', role: 'assistant', status: 'success' };
