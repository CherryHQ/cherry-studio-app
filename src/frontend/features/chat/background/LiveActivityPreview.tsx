import { Image } from 'expo-image';
import {
  BrainIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  HourglassIcon,
  MessageCircleIcon,
  PaintbrushIcon,
  WrenchIcon,
  type PngIconProps,
} from 'lucide-uniwind/png';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { BackgroundReplyPhase } from '@/shared/backgroundActivities/chatReply';
import { CHERRY_ACTIVITY_LOGO_BASE64 } from '@/shared/backgroundActivities/logo';
import type { PaintingActivityPhase } from '@/shared/backgroundActivities/painting';

const BRAND_COLOR = '#F65D5D';

export type LiveActivityPreviewPhase = BackgroundReplyPhase | PaintingActivityPhase;

export type LiveActivityPreviewProps = {
  compactLabel: string;
  detail: string;
  elapsedSeconds: number;
  liveTimer: boolean;
  phase: LiveActivityPreviewPhase;
  preview: string;
  showLogo: boolean;
  theme: 'dark' | 'light';
  title: string;
};

type PhasePresentation = {
  icon: ComponentType<PngIconProps>;
  terminal: boolean;
};

const PHASE_PRESENTATIONS: Record<LiveActivityPreviewPhase, PhasePresentation> = {
  'awaiting-approval': { icon: CircleAlertIcon, terminal: false },
  cancelled: { icon: CircleXIcon, terminal: true },
  completed: { icon: CircleCheckIcon, terminal: true },
  failed: { icon: CircleAlertIcon, terminal: true },
  generating: { icon: PaintbrushIcon, terminal: false },
  preparing: { icon: HourglassIcon, terminal: false },
  responding: { icon: MessageCircleIcon, terminal: false },
  thinking: { icon: BrainIcon, terminal: false },
  'using-tool': { icon: WrenchIcon, terminal: false },
};

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

export function isTerminalPhase(phase: LiveActivityPreviewPhase): boolean {
  return PHASE_PRESENTATIONS[phase].terminal;
}

export function LiveActivityPreview(props: LiveActivityPreviewProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(props.elapsedSeconds);
  const presentation = PHASE_PRESENTATIONS[props.phase];

  useEffect(() => {
    if (!props.liveTimer || presentation.terminal) return;

    const timer = setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [presentation.terminal, props.liveTimer]);

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
        <BannerPreview colors={colors} elapsed={elapsed} presentation={presentation} {...props} />
      </PreviewSurface>

      <PreviewSurface label="Dynamic Island / Compact" labelColor={colors.label}>
        <CompactPreview elapsed={elapsed} presentation={presentation} {...props} />
      </PreviewSurface>

      <PreviewSurface label="Dynamic Island / Expanded" labelColor={colors.label}>
        <ExpandedPreview elapsed={elapsed} presentation={presentation} {...props} />
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
          <PhaseIcon color={BRAND_COLOR} presentation={presentation} size={17} />
        </View>
      </PreviewSurface>
    </ScrollView>
  );
}

type PreviewColors = {
  foreground: string;
  secondary: string;
  surface: string;
};

type SurfacePreviewProps = LiveActivityPreviewProps & {
  elapsed: string;
  presentation: PhasePresentation;
};

function BannerPreview({
  colors,
  detail,
  elapsed,
  presentation,
  showLogo,
  title,
}: SurfacePreviewProps & { colors: PreviewColors }) {
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
        minHeight: 64,
        padding: 14,
      }}
    >
      {showLogo ? <CherryLogo size={36} /> : <MessageCircleIcon color={BRAND_COLOR} size={24} />}
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.foreground, fontSize: 15, fontWeight: '600', letterSpacing: 0 }}
        >
          {title}
        </Text>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
          <PhaseIcon color={BRAND_COLOR} presentation={presentation} size={16} />
          <Text
            numberOfLines={1}
            style={{ color: colors.secondary, flex: 1, fontSize: 13, letterSpacing: 0 }}
          >
            {detail}
          </Text>
        </View>
      </View>
      <Timer color={colors.secondary} elapsed={elapsed} />
    </View>
  );
}

function CompactPreview({ compactLabel, elapsed, presentation }: SurfacePreviewProps) {
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
      <Text
        numberOfLines={1}
        style={{
          color: '#FFFFFF',
          flexShrink: 1,
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: 0,
        }}
      >
        {compactLabel}
      </Text>
      {presentation.terminal ? (
        <PhaseIcon color={BRAND_COLOR} presentation={presentation} size={16} />
      ) : (
        <Timer color="#FFFFFF" elapsed={elapsed} />
      )}
    </View>
  );
}

function ExpandedPreview({
  detail,
  elapsed,
  presentation,
  preview,
  showLogo,
  title,
}: SurfacePreviewProps) {
  return (
    <View
      style={{
        alignSelf: 'stretch',
        backgroundColor: '#000000',
        borderCurve: 'continuous',
        borderRadius: 42,
        gap: 10,
        minHeight: preview ? 142 : 110,
        paddingBottom: 16,
        paddingHorizontal: 14,
        paddingTop: 12,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
        {showLogo ? <CherryLogo size={28} /> : null}
        <Text
          numberOfLines={1}
          style={{ color: '#FFFFFF', flex: 1, fontSize: 14, fontWeight: '600', letterSpacing: 0 }}
        >
          {title}
        </Text>
        <Timer color="#C7C7CC" elapsed={elapsed} />
      </View>
      <View
        style={{ alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center' }}
      >
        <PhaseIcon color={BRAND_COLOR} presentation={presentation} size={16} />
        <Text
          numberOfLines={1}
          style={{
            color: '#FFFFFF',
            flexShrink: 1,
            fontSize: 14,
            fontWeight: '500',
            letterSpacing: 0,
          }}
        >
          {detail}
        </Text>
      </View>
      {preview ? (
        <Text
          numberOfLines={2}
          style={{ color: '#C7C7CC', fontSize: 13, letterSpacing: 0, lineHeight: 18 }}
        >
          {preview}
        </Text>
      ) : null}
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

function Timer({ color, elapsed }: { color: string; elapsed: string }) {
  return (
    <Text
      style={{
        color,
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

function PhaseIcon({
  color,
  presentation,
  size,
}: {
  color: string;
  presentation: PhasePresentation;
  size: number;
}) {
  const Icon = presentation.icon;
  return <Icon color={color} size={size} />;
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
