import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  buttonBorderShape,
  buttonStyle,
  fixedSize,
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
  privacySensitive,
  resizable,
  tint,
  truncationMode,
  widgetAccentedRenderingMode,
} from '@expo/ui/swift-ui/modifiers';
import type { LiveActivityComponent } from 'expo-widgets';

import type { BackgroundActivityNativePresentation } from './background-activity.types';

export const renderBackgroundActivity: LiveActivityComponent<
  BackgroundActivityNativePresentation
> = (props, environment) => {
  'widget';
  // Widget layouts execute as isolated function strings, so runtime values must be local.
  const brandColor = '#FF5757';
  const bannerLogoUri = props.logoUris?.[environment.colorScheme === 'dark' ? 'dark' : 'light'];
  // The island stays black even when the app or Lock Screen uses the light appearance.
  const islandLogoUri = props.logoUris?.dark;
  const hasCompactLabel = props.compactLabel !== undefined;
  const isSimplified =
    environment.levelOfDetail === 'simplified' || environment.activityFamily === 'small';
  const summary =
    props.actions?.prompt ?? (props.preview && !isSimplified ? props.preview : props.title);
  const expandedContent =
    props.actions?.prompt ?? (props.preview && !isSimplified ? props.preview : props.detail);
  // Neutral-first actions; only a `primary` decision uses the mode-aware `primary` green
  // (green-900) with its `primary-foreground`. The Dynamic Island is always dark.
  const actionButtons = (dark: boolean) =>
    props.actions?.buttons.map((action) => (
      <Button
        key={action.id}
        modifiers={[
          buttonStyle(action.role === 'primary' ? 'borderedProminent' : 'bordered'),
          buttonBorderShape('roundedRectangle', 11.2),
          tint(
            action.role === 'primary'
              ? dark
                ? '#00CA50'
                : '#107D32'
              : { type: 'hierarchical', style: 'primary' },
          ),
        ]}
        target={JSON.stringify({ token: props.actions!.token, actionId: action.id })}
      >
        <Text
          modifiers={[
            font({ size: 14, weight: 'semibold' }),
            privacySensitive(),
            ...(action.role === 'primary' ? [foregroundStyle(dark ? '#000000' : '#FFFFFF')] : []),
            lineLimit(1),
            truncationMode('tail'),
            frame({ maxWidth: Infinity }),
          ]}
        >
          {action.label}
        </Text>
      </Button>
    ));
  const timerInterval = {
    lower: new Date(props.startedAtEpochMs),
    upper: new Date(props.finishedAtEpochMs ?? props.startedAtEpochMs + 24 * 60 * 60 * 1000),
  };
  return {
    banner: (
      <VStack alignment="leading" spacing={8}>
        <HStack
          alignment="center"
          spacing={10}
          modifiers={[
            activityBackgroundTint(null),
            padding({ horizontal: 14, vertical: 12 }),
            frame({ maxWidth: Infinity, alignment: 'leading' }),
          ]}
        >
          {bannerLogoUri ? (
            <Image
              uiImage={bannerLogoUri}
              modifiers={[
                resizable(),
                frame({ height: 32, width: 32 }),
                widgetAccentedRenderingMode('fullColor'),
              ]}
            />
          ) : (
            <Text
              modifiers={[
                font({ size: 18, weight: 'bold' }),
                foregroundStyle(brandColor),
                frame({ height: 32, width: 32, alignment: 'center' }),
              ]}
            >
              C
            </Text>
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
                    privacySensitive(),
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
                privacySensitive(),
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
        {props.actions?.buttons.length ? (
          <HStack spacing={8} modifiers={[padding({ horizontal: 14, bottom: 12 })]}>
            {actionButtons(environment.colorScheme === 'dark')}
          </HStack>
        ) : null}
      </VStack>
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
        {bannerLogoUri ? (
          <Image
            uiImage={bannerLogoUri}
            modifiers={[
              resizable(),
              frame({ height: 24, width: 24 }),
              widgetAccentedRenderingMode('fullColor'),
            ]}
          />
        ) : (
          <Text
            modifiers={[
              font({ size: 15, weight: 'bold' }),
              foregroundStyle(brandColor),
              frame({ height: 24, width: 24, alignment: 'center' }),
            ]}
          >
            C
          </Text>
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
    compactLeading: islandLogoUri ? (
      <Image
        uiImage={islandLogoUri}
        modifiers={[
          resizable(),
          frame({ height: 16, width: 16 }),
          widgetAccentedRenderingMode('fullColor'),
        ]}
      />
    ) : (
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(brandColor)]}>C</Text>
    ),
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
    minimal: islandLogoUri ? (
      <Image
        uiImage={islandLogoUri}
        modifiers={[
          resizable(),
          frame({ height: 16, width: 16 }),
          widgetAccentedRenderingMode('fullColor'),
        ]}
      />
    ) : (
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(brandColor)]}>C</Text>
    ),
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
          {islandLogoUri ? (
            <Image
              uiImage={islandLogoUri}
              modifiers={[
                resizable(),
                frame({ height: 24, width: 24 }),
                fixedSize(),
                widgetAccentedRenderingMode('fullColor'),
              ]}
            />
          ) : (
            <Text
              modifiers={[
                font({ size: 14, weight: 'bold' }),
                foregroundStyle(brandColor),
                frame({ height: 24, width: 24, alignment: 'center' }),
                fixedSize(),
              ]}
            >
              C
            </Text>
          )}
          <Text
            modifiers={[
              font({ size: 14, weight: 'semibold' }),
              privacySensitive(),
              foregroundStyle('#FFFFFF'),
              lineLimit(1),
              truncationMode('tail'),
              frame({ maxWidth: Infinity, alignment: 'leading' }),
            ]}
          >
            {props.title}
          </Text>
          {hasCompactLabel ? (
            <Text
              modifiers={[
                font({ size: 12, weight: 'semibold' }),
                foregroundStyle('#FFFFFF'),
                lineLimit(1),
                truncationMode('tail'),
                fixedSize({ horizontal: true, vertical: false }),
                layoutPriority(1),
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
            privacySensitive(!!props.actions || (!!props.preview && !isSimplified)),
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
        {props.actions?.buttons.length ? <HStack spacing={8}>{actionButtons(true)}</HStack> : null}
      </VStack>
    ),
  };
};
