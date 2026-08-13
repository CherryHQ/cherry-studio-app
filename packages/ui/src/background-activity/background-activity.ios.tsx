import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  resizable,
  truncationMode,
  widgetAccentedRenderingMode,
} from '@expo/ui/swift-ui/modifiers';
import type { LiveActivityComponent } from 'expo-widgets';

import type { BackgroundActivityPresentation } from './background-activity.types';

export const renderBackgroundActivity: LiveActivityComponent<BackgroundActivityPresentation> = (
  props,
  environment,
) => {
  'widget';
  // Widget layouts execute as isolated function strings, so runtime values must be local.
  const brandColor = '#F65D5D';
  const colorScheme = props.colorScheme ?? environment.colorScheme;
  const foreground = colorScheme === 'dark' ? '#FFFFFF' : '#151515';
  const secondary = colorScheme === 'dark' ? '#C7C7CC' : '#5E5E63';
  const background = colorScheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const hasCompactLabel = props.compactLabel !== undefined;
  const timerInterval = {
    lower: new Date(props.startedAtEpochMs),
    upper: new Date(props.finishedAtEpochMs ?? props.startedAtEpochMs + 24 * 60 * 60 * 1000),
  };
  const iconSymbol =
    props.icon === 'brain'
      ? 'brain.head.profile'
      : props.icon === 'bubble-ellipsis'
        ? 'ellipsis.bubble.fill'
        : props.icon === 'bubble-exclamation'
          ? 'exclamationmark.bubble.fill'
          : props.icon === 'check-circle'
            ? 'checkmark.circle.fill'
            : props.icon === 'hourglass'
              ? 'hourglass'
              : props.icon === 'paintbrush'
                ? 'paintbrush.pointed.fill'
                : props.icon === 'warning-triangle'
                  ? 'exclamationmark.triangle.fill'
                  : props.icon === 'wrench'
                    ? 'wrench.and.screwdriver.fill'
                    : 'xmark.circle.fill';
  const compactIconSymbol =
    props.compactIcon === 'brain'
      ? 'brain.head.profile'
      : props.compactIcon === 'bubble-ellipsis'
        ? 'ellipsis.bubble.fill'
        : props.compactIcon === 'bubble-exclamation'
          ? 'exclamationmark.bubble.fill'
          : props.compactIcon === 'check-circle'
            ? 'checkmark.circle.fill'
            : props.compactIcon === 'hourglass'
              ? 'hourglass'
              : props.compactIcon === 'paintbrush'
                ? 'paintbrush.pointed.fill'
                : props.compactIcon === 'warning-triangle'
                  ? 'exclamationmark.triangle.fill'
                  : props.compactIcon === 'wrench'
                    ? 'wrench.and.screwdriver.fill'
                    : 'xmark.circle.fill';

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
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : (
          <Image color={brandColor} size={24} systemName={iconSymbol} />
        )}
        <VStack
          alignment="leading"
          spacing={3}
          modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
        >
          <HStack spacing={8}>
            <Text
              modifiers={[
                font({ size: 15, weight: 'semibold' }),
                foregroundStyle(foreground),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {props.title}
            </Text>
            {props.attribution ? <Spacer /> : null}
            {props.attribution ? (
              <Text
                modifiers={[
                  font({ size: 12, weight: 'medium' }),
                  foregroundStyle(secondary),
                  lineLimit(1),
                  truncationMode('tail'),
                ]}
              >
                {props.attribution}
              </Text>
            ) : null}
          </HStack>
          <HStack alignment="bottom" spacing={8}>
            {props.preview ? (
              <Text
                modifiers={[
                  font({ size: 12 }),
                  foregroundStyle(secondary),
                  lineLimit(1),
                  multilineTextAlignment('leading'),
                  truncationMode('head'),
                ]}
              >
                {props.preview}
              </Text>
            ) : null}
            <Spacer />
            {hasCompactLabel ? (
              <Text
                modifiers={[
                  font({ size: 12, weight: 'medium' }),
                  foregroundStyle(secondary),
                  lineLimit(1),
                  truncationMode('tail'),
                ]}
              >
                {props.compactLabel}
              </Text>
            ) : (
              <Text
                countsDown={false}
                timerInterval={timerInterval}
                modifiers={[
                  font({ size: 12, weight: 'medium' }),
                  monospacedDigit(),
                  foregroundStyle(secondary),
                ]}
              />
            )}
          </HStack>
        </VStack>
      </HStack>
    ),
    compactLeading: <Image color={brandColor} size={16} systemName={compactIconSymbol} />,
    compactTrailing: hasCompactLabel ? (
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
    ) : (
      <Text
        countsDown={false}
        timerInterval={timerInterval}
        modifiers={[
          font({ size: 13, weight: 'medium' }),
          monospacedDigit(),
          foregroundStyle('#FFFFFF'),
        ]}
      />
    ),
    minimal: <Image color={brandColor} size={16} systemName={iconSymbol} />,
    expandedLeading: (
      <HStack spacing={8} modifiers={[padding({ leading: 12, top: 10 })]}>
        {props.logoUri ? (
          <Image
            uiImage={props.logoUri}
            modifiers={[
              resizable(),
              frame({ height: 28, width: 28 }),
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
          {props.title}
        </Text>
      </HStack>
    ),
    expandedTrailing: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'medium' }),
          foregroundStyle('#C7C7CC'),
          lineLimit(1),
          truncationMode('tail'),
          padding({ trailing: 12, top: 10 }),
        ]}
      >
        {props.attribution}
      </Text>
    ),
    expandedCenter: null,
    expandedBottom: (
      <HStack
        alignment="bottom"
        spacing={8}
        modifiers={[padding({ bottom: 12, horizontal: 12, top: 6 })]}
      >
        {props.preview ? (
          <Text
            modifiers={[
              font({ size: 13 }),
              foregroundStyle('#C7C7CC'),
              lineLimit(3),
              multilineTextAlignment('leading'),
              truncationMode('head'),
            ]}
          >
            {props.preview}
          </Text>
        ) : null}
        <Spacer />
        {hasCompactLabel ? (
          <Text
            modifiers={[
              font({ size: 12, weight: 'medium' }),
              foregroundStyle('#C7C7CC'),
              lineLimit(1),
              truncationMode('tail'),
            ]}
          >
            {props.compactLabel}
          </Text>
        ) : (
          <Text
            countsDown={false}
            timerInterval={timerInterval}
            modifiers={[
              font({ size: 12, weight: 'medium' }),
              monospacedDigit(),
              foregroundStyle('#C7C7CC'),
            ]}
          />
        )}
      </HStack>
    ),
  };
};
