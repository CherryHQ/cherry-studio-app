import { BackgroundActivityIcon } from '@cherrystudio/ui/background-activity';
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineHeight,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  offset,
  padding,
  resizable,
  truncationMode,
  widgetAccentedRenderingMode,
} from '@expo/ui/swift-ui/modifiers';
import type { LiveActivityComponent } from 'expo-widgets';
import type { SFSymbols7_0 } from 'sf-symbols-typescript';

import type { BackgroundActivityNativePresentation } from './background-activity.types';

const iconSymbolMap: Record<BackgroundActivityIcon, SFSymbols7_0> = {
  brain: 'brain.head.profile',
  'bubble-ellipsis': 'ellipsis.bubble.fill',
  'bubble-exclamation': 'exclamationmark.bubble.fill',
  'check-circle': 'checkmark.circle.fill',
  hourglass: 'hourglass',
  paintbrush: 'paintbrush.pointed.fill',
  'warning-triangle': 'exclamationmark.triangle.fill',
  wrench: 'wrench.and.screwdriver.fill',
  'x-circle': 'xmark.circle.fill',
} as const;

export const renderBackgroundActivity: LiveActivityComponent<
  BackgroundActivityNativePresentation
> = (props, environment) => {
  'widget';
  // Widget layouts execute as isolated function strings, so runtime values must be local.
  const brandColor = '#F65D5D';
  const hasCompactLabel = props.compactLabel !== undefined;
  const isSimplified =
    environment.levelOfDetail === 'simplified' || environment.activityFamily === 'small';
  const summary = props.preview && !isSimplified ? props.preview : props.title;
  const expandedContent = props.preview && !isSimplified ? props.preview : props.detail;
  const timerInterval = {
    lower: new Date(props.startedAtEpochMs),
    upper: new Date(props.finishedAtEpochMs ?? props.startedAtEpochMs + 24 * 60 * 60 * 1000),
  };
  const iconSymbol = iconSymbolMap[props.icon];
  const compactIconSymbol = iconSymbolMap[props.compactIcon];

  return {
    banner: (
      <HStack
        alignment="center"
        spacing={10}
        modifiers={[
          activityBackgroundTint(null),
          padding({ horizontal: 14, vertical: 12 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
        ]}
      >
        {props.logoUri ? (
          <Image
            uiImage={props.logoUri}
            modifiers={[
              resizable(),
              frame({ height: 32, width: 32 }),
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : (
          <Image color={brandColor} size={24} systemName={iconSymbol} />
        )}
        <VStack
          alignment="leading"
          spacing={4}
          modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
        >
          <HStack
            alignment="center"
            spacing={6}
            modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
          >
            <Text
              modifiers={[
                font({ size: 14, weight: 'semibold' }),
                foregroundStyle({ type: 'hierarchical', style: 'primary' }),
                lineLimit(1),
                truncationMode('tail'),
                layoutPriority(1),
              ]}
            >
              {props.detail}
            </Text>
            {props.attribution ? (
              <Text
                modifiers={[
                  font({ size: 12, weight: 'medium' }),
                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  lineLimit(1),
                  truncationMode('tail'),
                ]}
              >
                {props.attribution}
              </Text>
            ) : null}
            <Spacer />
            {!hasCompactLabel ? (
              <Text
                countsDown={false}
                timerInterval={timerInterval}
                modifiers={[
                  font({ size: 12, weight: 'medium' }),
                  monospacedDigit(),
                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                ]}
              />
            ) : null}
          </HStack>
          <Text
            modifiers={[
              font({ size: 12 }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              lineLimit(1),
              multilineTextAlignment('leading'),
              truncationMode('tail'),
              frame({ maxWidth: Infinity, alignment: 'leading' }),
            ]}
          >
            {summary}
          </Text>
        </VStack>
      </HStack>
    ),
    bannerSmall: (
      <HStack
        alignment="center"
        spacing={8}
        modifiers={[
          activityBackgroundTint(null),
          padding({ horizontal: 12, vertical: 10 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
        ]}
      >
        {props.logoUri ? (
          <Image
            uiImage={props.logoUri}
            modifiers={[
              resizable(),
              frame({ height: 24, width: 24 }),
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : (
          <Image color={brandColor} size={20} systemName={iconSymbol} />
        )}
        <Text
          modifiers={[
            font({ size: 13, weight: 'semibold' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            lineLimit(1),
            truncationMode('tail'),
            layoutPriority(1),
          ]}
        >
          {props.detail}
        </Text>
        <Spacer />
        {hasCompactLabel ? (
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
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
              font({ size: 11, weight: 'medium' }),
              monospacedDigit(),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}
          />
        )}
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
          frame({ width: 40, alignment: 'trailing' }),
          offset({ x: 3.5 }),
        ]}
      />
    ),
    minimal: <Image color={brandColor} size={16} systemName={iconSymbol} />,
    expandedLeading: null,
    expandedTrailing: null,
    expandedCenter: null,
    expandedBottom: (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          padding({ bottom: 12, horizontal: 12, top: 6 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
        ]}
      >
        <HStack
          alignment="center"
          spacing={8}
          modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
        >
          {props.logoUri ? (
            <Image
              uiImage={props.logoUri}
              modifiers={[
                resizable(),
                frame({ height: 24, width: 24 }),
                widgetAccentedRenderingMode('fullColor'),
              ]}
            />
          ) : (
            <Image color={brandColor} size={18} systemName={iconSymbol} />
          )}
          <Text
            modifiers={[
              font({ size: 14, weight: 'semibold' }),
              foregroundStyle('#FFFFFF'),
              lineLimit(1),
              truncationMode('tail'),
              layoutPriority(1),
            ]}
          >
            {props.title}
          </Text>
          <Spacer />
          {hasCompactLabel ? (
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
                font({ size: 12, weight: 'medium' }),
                monospacedDigit(),
                foregroundStyle('#FFFFFF'),
                frame({ width: 40, alignment: 'trailing' }),
              ]}
            />
          )}
        </HStack>
        <Text
          modifiers={[
            font({ size: 13 }),
            foregroundStyle('#C7C7CC'),
            lineHeight(17),
            lineLimit(isSimplified ? 1 : 2),
            multilineTextAlignment('leading'),
            truncationMode('tail'),
            frame({ maxWidth: Infinity, alignment: 'leading' }),
          ]}
        >
          {expandedContent}
        </Text>
      </VStack>
    ),
  };
};
