import type { LucideIconProps } from '@cherrystudio/app-icons';
import BrainIcon from '@cherrystudio/app-icons/icons/brain';
import CircleCheckIcon from '@cherrystudio/app-icons/icons/circle-check';
import CircleXIcon from '@cherrystudio/app-icons/icons/circle-x';
import HourglassIcon from '@cherrystudio/app-icons/icons/hourglass';
import MessageCircleMoreIcon from '@cherrystudio/app-icons/icons/message-circle-more';
import MessageCircleWarningIcon from '@cherrystudio/app-icons/icons/message-circle-warning';
import PaintbrushIcon from '@cherrystudio/app-icons/icons/paintbrush';
import TriangleAlertIcon from '@cherrystudio/app-icons/icons/triangle-alert';
import WrenchIcon from '@cherrystudio/app-icons/icons/wrench';
import { Image } from 'expo-image';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import type {
  BackgroundActivityIcon,
  BackgroundActivityPresentation,
} from './background-activity.types';
import { CHERRY_ACTIVITY_LOGO_BASE64 } from './logo';

const BRAND_COLOR = '#F65D5D';

export type BackgroundActivityPreviewProps = Omit<
  BackgroundActivityPresentation,
  'finishedAtEpochMs' | 'startedAtEpochMs'
> & {
  elapsedSeconds: number;
  levelOfDetail: 'default' | 'simplified';
  liveTimer: boolean;
  showLogo: boolean;
  theme: 'dark' | 'light';
};

const ICONS: Record<BackgroundActivityIcon, ComponentType<LucideIconProps>> = {
  brain: BrainIcon,
  'bubble-ellipsis': MessageCircleMoreIcon,
  'bubble-exclamation': MessageCircleWarningIcon,
  'check-circle': CircleCheckIcon,
  hourglass: HourglassIcon,
  paintbrush: PaintbrushIcon,
  'warning-triangle': TriangleAlertIcon,
  wrench: WrenchIcon,
  'x-circle': CircleXIcon,
};

export function BackgroundActivityPreview(props: BackgroundActivityPreviewProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(props.elapsedSeconds);

  useEffect(() => {
    if (!props.liveTimer || props.compactLabel !== undefined) return;

    const timer = setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [props.compactLabel, props.liveTimer]);

  const elapsed = formatElapsedTime(elapsedSeconds);
  const colors =
    props.theme === 'dark'
      ? {
          canvas: '#2C2C2E',
          foreground: '#FFFFFF',
          label: '#C7C7CC',
          secondary: '#C7C7CC',
          surface: '#1C1C1E',
        }
      : {
          canvas: '#ECECF0',
          foreground: '#151515',
          label: '#5E5E63',
          secondary: '#5E5E63',
          surface: '#FFFFFF',
        };

  return (
    <ScrollView
      contentContainerStyle={{
        alignItems: 'center',
        backgroundColor: colors.canvas,
        gap: 24,
        padding: 16,
      }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    >
      <PreviewSurface label="Lock Screen / Banner" labelColor={colors.label}>
        <BannerPreview colors={colors} elapsed={elapsed} {...props} />
      </PreviewSurface>

      <PreviewSurface label="Dynamic Island / Compact" labelColor={colors.label}>
        <CompactPreview elapsed={elapsed} {...props} />
      </PreviewSurface>

      <PreviewSurface label="Dynamic Island / Expanded" labelColor={colors.label}>
        <ExpandedPreview elapsed={elapsed} {...props} />
      </PreviewSurface>

      <PreviewSurface label="Dynamic Island / Minimal" labelColor={colors.label}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: '#000000',
            borderCurve: 'continuous',
            borderRadius: 22,
            height: 44,
            justifyContent: 'center',
            width: 44,
          }}
        >
          <ActivityIcon icon={props.icon} size={17} />
        </View>
      </PreviewSurface>
    </ScrollView>
  );
}

export function formatElapsedTime(elapsedSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type PreviewColors = {
  foreground: string;
  secondary: string;
  surface: string;
};

function BannerPreview({
  attribution,
  colors,
  compactLabel,
  detail,
  elapsed,
  icon,
  levelOfDetail,
  preview,
  showLogo,
  title,
}: BackgroundActivityPreviewProps & { colors: PreviewColors; elapsed: string }) {
  const summary = preview && levelOfDetail !== 'simplified' ? preview : title;

  return (
    <View
      style={{
        alignItems: 'center',
        alignSelf: 'stretch',
        backgroundColor: colors.surface,
        borderCurve: 'continuous',
        borderRadius: 24,
        flexDirection: 'row',
        gap: 10,
        minHeight: 60,
        padding: 12,
      }}
    >
      {showLogo ? <CherryLogo size={32} /> : <ActivityIcon icon={icon} size={24} />}
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.foreground,
              flexShrink: 1,
              fontSize: 14,
              fontWeight: '600',
              letterSpacing: 0,
            }}
          >
            {detail}
          </Text>
          {attribution ? (
            <Text
              numberOfLines={1}
              style={{
                color: colors.secondary,
                flexShrink: 2,
                fontSize: 12,
                fontWeight: '500',
                letterSpacing: 0,
              }}
            >
              {attribution}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {compactLabel === undefined ? (
            <Text
              style={{
                color: colors.secondary,
                fontSize: 12,
                fontVariant: ['tabular-nums'],
                fontWeight: '500',
                letterSpacing: 0,
              }}
            >
              {elapsed}
            </Text>
          ) : null}
        </View>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={{ color: colors.secondary, fontSize: 12, letterSpacing: 0 }}
        >
          {summary}
        </Text>
      </View>
    </View>
  );
}

function CompactPreview({
  compactIcon,
  compactLabel,
  elapsed,
}: BackgroundActivityPreviewProps & { elapsed: string }) {
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: '#000000',
        borderRadius: 24,
        flexDirection: 'row',
        height: 46,
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        width: 280,
      }}
    >
      <ActivityIcon icon={compactIcon} size={16} />
      {compactLabel !== undefined ? (
        <Text
          numberOfLines={1}
          style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', letterSpacing: 0 }}
        >
          {compactLabel}
        </Text>
      ) : (
        <Timer elapsed={elapsed} />
      )}
    </View>
  );
}

function Timer({ elapsed }: { elapsed: string }) {
  return (
    <Text
      style={{
        color: '#FFFFFF',
        fontSize: 13,
        fontVariant: ['tabular-nums'],
        fontWeight: '500',
        letterSpacing: 0,
        minWidth: 44,
        textAlign: 'right',
      }}
    >
      {elapsed}
    </Text>
  );
}

function ExpandedPreview({
  compactLabel,
  detail,
  elapsed,
  levelOfDetail,
  preview,
  showLogo,
  title,
}: BackgroundActivityPreviewProps & { elapsed: string }) {
  const content = preview && levelOfDetail !== 'simplified' ? preview : detail;

  return (
    <View
      style={{
        alignSelf: 'stretch',
        backgroundColor: '#000000',
        borderCurve: 'continuous',
        borderRadius: 42,
        gap: 6,
        minHeight: 104,
        paddingBottom: 14,
        paddingHorizontal: 12,
        paddingTop: 10,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
        {showLogo ? <CherryLogo size={24} /> : <View style={{ height: 24, width: 24 }} />}
        <Text
          numberOfLines={1}
          style={{
            color: '#FFFFFF',
            flex: 1,
            fontSize: 14,
            fontWeight: '600',
            letterSpacing: 0,
          }}
        >
          {title}
        </Text>
        {compactLabel !== undefined ? (
          <Text
            numberOfLines={1}
            style={{
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 0,
            }}
          >
            {compactLabel}
          </Text>
        ) : (
          <Timer elapsed={elapsed} />
        )}
      </View>
      <Text
        ellipsizeMode="tail"
        numberOfLines={levelOfDetail === 'simplified' ? 1 : 2}
        style={{ color: '#C7C7CC', fontSize: 13, letterSpacing: 0, lineHeight: 17 }}
      >
        {content}
      </Text>
    </View>
  );
}

function PreviewSurface({
  children,
  label,
  labelColor,
}: {
  children: React.ReactNode;
  label: string;
  labelColor: string;
}) {
  return (
    <View style={{ gap: 8, maxWidth: 410, width: '100%' }}>
      <Text style={{ color: labelColor, fontSize: 12, fontWeight: '600', letterSpacing: 0 }}>
        {label}
      </Text>
      <View style={{ alignItems: 'center' }}>{children}</View>
    </View>
  );
}

function ActivityIcon({ icon, size }: { icon: BackgroundActivityIcon; size: number }) {
  const Icon = ICONS[icon];
  return <Icon color={BRAND_COLOR} size={size} />;
}

function CherryLogo({ size }: { size: number }) {
  return (
    <Image
      contentFit="contain"
      source={{ uri: `data:image/png;base64,${CHERRY_ACTIVITY_LOGO_BASE64}` }}
      style={{ height: size, width: size }}
    />
  );
}
