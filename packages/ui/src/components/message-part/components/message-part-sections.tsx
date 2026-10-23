import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type {
  MessagePartSectionProps,
  MessagePartSectionTitleProps,
  MessagePartTextSectionProps,
  MessagePartValueSectionProps,
} from '../message-part.types';
import { formatMessagePartValue, getMessagePartValueEntries } from '../utils/message-part-value';

export function MessagePartValueSection({
  maxLength = 4000,
  title,
  value,
}: MessagePartValueSectionProps) {
  const entries = getMessagePartValueEntries(value);
  if (entries.length === 0) return null;

  return (
    <MessagePartSection title={title}>
      <MessagePartSectionBody>
        <View className="gap-4">
          {entries.map(([key, entryValue]) => {
            const isStructured = typeof entryValue === 'object' && entryValue !== null;
            const text = formatMessagePartValue(entryValue, maxLength);
            // Longer values need the sheet's full width. Short rows can still wrap at large text sizes.
            const isStacked = isStructured || text.length > 60 || /[\r\n]/.test(text);

            return (
              <View
                className={
                  isStacked ? 'gap-2' : 'flex-row flex-wrap items-baseline gap-x-6 gap-y-1'
                }
                key={key}
              >
                <Text
                  className={
                    isStacked
                      ? 'text-muted-foreground text-xs'
                      : 'min-w-24 flex-1 text-muted-foreground text-xs'
                  }
                  selectable
                >
                  {key}
                </Text>
                <Text
                  className={
                    isStructured
                      ? 'font-mono text-foreground text-sm'
                      : isStacked
                        ? 'text-foreground text-sm'
                        : 'max-w-full shrink text-right text-foreground text-sm tabular-nums'
                  }
                  selectable
                >
                  {text}
                </Text>
              </View>
            );
          })}
        </View>
      </MessagePartSectionBody>
    </MessagePartSection>
  );
}

export function MessagePartTextSection({
  title,
  tone,
  value,
  variant = 'body',
}: MessagePartTextSectionProps) {
  return (
    <MessagePartSection title={title} tone={tone}>
      <MessagePartSectionBody>
        <Text
          className={
            variant === 'code' ? 'font-mono text-foreground text-sm' : 'text-base text-foreground'
          }
          selectable
        >
          {value}
        </Text>
      </MessagePartSectionBody>
    </MessagePartSection>
  );
}

export function MessagePartSection({ action, children, title, tone }: MessagePartSectionProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        {tone === 'danger' ? (
          <CircleAlertIcon accessible={false} className="size-4 shrink-0 text-error" />
        ) : null}
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-muted-foreground text-sm"
          selectable
        >
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function MessagePartSectionBody({ children }: { children: ReactNode }) {
  return <View className="rounded-xl bg-code-block p-4">{children}</View>;
}

export function MessagePartSectionTitle({ title }: MessagePartSectionTitleProps) {
  return (
    <Text accessibilityRole="header" className="font-medium text-foreground text-sm" selectable>
      {title}
    </Text>
  );
}
