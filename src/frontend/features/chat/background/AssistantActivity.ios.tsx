import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  multilineTextAlignment,
  padding,
  resizable,
  truncationMode,
  widgetAccentedRenderingMode,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivities/chatReply';

function AssistantActivity(
  props: BackgroundReplyActivityProps,
  environment: LiveActivityEnvironment,
) {
  'widget';
  // Widget layouts execute as isolated function strings, so runtime values must be local.
  const brandColor = '#F65D5D';
  const colorScheme = props.colorScheme ?? environment.colorScheme;
  const foreground = colorScheme === 'dark' ? '#FFFFFF' : '#151515';
  const secondary = colorScheme === 'dark' ? '#C7C7CC' : '#5E5E63';
  const background = colorScheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const finishedAt = props.finishedAtEpochMs ? new Date(props.finishedAtEpochMs) : undefined;
  const isTerminal =
    props.phase === 'completed' || props.phase === 'failed' || props.phase === 'cancelled';
  const phaseSymbol =
    props.phase === 'awaiting-approval'
      ? 'exclamationmark.bubble.fill'
      : props.phase === 'cancelled'
        ? 'xmark.circle.fill'
        : props.phase === 'completed'
          ? 'checkmark.circle.fill'
          : props.phase === 'failed'
            ? 'exclamationmark.triangle.fill'
            : props.phase === 'preparing'
              ? 'hourglass'
              : props.phase === 'responding'
                ? 'ellipsis.bubble.fill'
                : props.phase === 'thinking'
                  ? 'brain.head.profile'
                  : 'wrench.and.screwdriver.fill';

  return {
    banner: (
      <HStack
        alignment="center"
        spacing={10}
        modifiers={[
          activityBackgroundTint(background),
          padding({ all: 14 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
        ]}
      >
        {props.logoUri ? (
          <Image
            uiImage={props.logoUri}
            modifiers={[
              resizable(),
              frame({ height: 36, width: 36 }),
              cornerRadius(8),
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : (
          <Image color={brandColor} size={24} systemName="ellipsis.bubble.fill" />
        )}
        <VStack alignment="leading" spacing={3}>
          <Text
            modifiers={[
              font({ size: 15, weight: 'semibold' }),
              foregroundStyle(foreground),
              lineLimit(1),
              truncationMode('tail'),
            ]}
          >
            {props.assistantName}
          </Text>
          <HStack spacing={5}>
            <Image color={brandColor} size={16} systemName={phaseSymbol} />
            <Text
              modifiers={[
                font({ size: 13 }),
                foregroundStyle(secondary),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {props.detail}
            </Text>
          </HStack>
        </VStack>
        <Spacer />
        <Text
          date={new Date(props.startedAtEpochMs)}
          dateStyle="timer"
          pauseTime={finishedAt}
          modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(secondary)]}
        />
      </HStack>
    ),
    compactLeading: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'semibold' }),
          foregroundStyle('#FFFFFF'),
          lineLimit(1),
          truncationMode('tail'),
        ]}
      >
        {props.compactLabel}
      </Text>
    ),
    compactTrailing: isTerminal ? (
      <Image color={brandColor} size={16} systemName={phaseSymbol} />
    ) : (
      <Text
        date={new Date(props.startedAtEpochMs)}
        dateStyle="timer"
        pauseTime={finishedAt}
        modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#FFFFFF')]}
      />
    ),
    minimal: <Image color={brandColor} size={16} systemName={phaseSymbol} />,
    expandedLeading: (
      <HStack spacing={8} modifiers={[padding({ leading: 12, top: 10 })]}>
        {props.logoUri ? (
          <Image
            uiImage={props.logoUri}
            modifiers={[
              resizable(),
              frame({ height: 28, width: 28 }),
              cornerRadius(6),
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : null}
        <Text
          modifiers={[
            font({ size: 14, weight: 'semibold' }),
            foregroundStyle('#FFFFFF'),
            lineLimit(1),
            truncationMode('tail'),
          ]}
        >
          {props.assistantName}
        </Text>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ top: 10, trailing: 12 })]}>
        <Text
          date={new Date(props.startedAtEpochMs)}
          dateStyle="timer"
          pauseTime={finishedAt}
          modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#C7C7CC')]}
        />
      </HStack>
    ),
    expandedCenter: (
      <HStack spacing={6} modifiers={[padding({ horizontal: 12, top: 6 })]}>
        <Image color={brandColor} size={16} systemName={phaseSymbol} />
        <Text
          modifiers={[
            font({ size: 14, weight: 'medium' }),
            foregroundStyle('#FFFFFF'),
            lineLimit(1),
            truncationMode('tail'),
          ]}
        >
          {props.detail}
        </Text>
      </HStack>
    ),
    expandedBottom: props.preview ? (
      <Text
        modifiers={[
          font({ size: 13 }),
          foregroundStyle('#C7C7CC'),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
          lineLimit(2),
          multilineTextAlignment('leading'),
          truncationMode('tail'),
          padding({ bottom: 12, horizontal: 12, top: 6 }),
        ]}
      >
        {props.preview}
      </Text>
    ) : null,
  };
}

export default createLiveActivity<BackgroundReplyActivityProps>(
  'AssistantActivity',
  AssistantActivity,
);
