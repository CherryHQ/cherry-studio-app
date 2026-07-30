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
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { BackgroundReplyActivityProps, BackgroundReplyPhase } from './backgroundReplyTypes';

const BRAND_COLOR = '#F65D5D';

const phaseSymbols = {
  'awaiting-approval': 'exclamationmark.bubble.fill',
  cancelled: 'xmark.circle.fill',
  completed: 'checkmark.circle.fill',
  failed: 'exclamationmark.triangle.fill',
  preparing: 'hourglass',
  responding: 'ellipsis.bubble.fill',
  thinking: 'brain.head.profile',
  'using-tool': 'wrench.and.screwdriver.fill',
} satisfies Record<BackgroundReplyPhase, SFSymbol>;

function AssistantActivity(
  props: BackgroundReplyActivityProps,
  environment: LiveActivityEnvironment,
) {
  'widget';
  const foreground = environment.colorScheme === 'dark' ? '#FFFFFF' : '#151515';
  const secondary = environment.colorScheme === 'dark' ? '#C7C7CC' : '#5E5E63';
  const background = environment.colorScheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const finishedAt = props.finishedAtEpochMs ? new Date(props.finishedAtEpochMs) : undefined;
  const timer = (
    <Text
      date={new Date(props.startedAtEpochMs)}
      dateStyle="timer"
      pauseTime={finishedAt}
      modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(secondary)]}
    />
  );
  const phaseIcon = <Image color={BRAND_COLOR} size={16} systemName={phaseSymbols[props.phase]} />;

  return {
    banner: (
      <HStack
        alignment="center"
        spacing={10}
        modifiers={[activityBackgroundTint(background), padding({ all: 14 })]}
      >
        {props.logoUri ? (
          <Image
            uiImage={props.logoUri}
            modifiers={[resizable(), frame({ height: 36, width: 36 }), cornerRadius(8)]}
          />
        ) : (
          <Image color={BRAND_COLOR} size={24} systemName="ellipsis.bubble.fill" />
        )}
        <VStack alignment="leading" spacing={3} modifiers={[frame({ maxWidth: Infinity })]}>
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
            {phaseIcon}
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
        {timer}
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
    compactTrailing:
      props.phase === 'completed' || props.phase === 'failed' || props.phase === 'cancelled'
        ? phaseIcon
        : timer,
    minimal: phaseIcon,
    expandedLeading: (
      <HStack spacing={8} modifiers={[padding({ leading: 12, top: 10 })]}>
        {props.logoUri ? (
          <Image
            uiImage={props.logoUri}
            modifiers={[resizable(), frame({ height: 28, width: 28 }), cornerRadius(6)]}
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
    expandedTrailing: <HStack modifiers={[padding({ top: 10, trailing: 12 })]}>{timer}</HStack>,
    expandedCenter: (
      <HStack spacing={6} modifiers={[padding({ horizontal: 12, top: 6 })]}>
        {phaseIcon}
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
