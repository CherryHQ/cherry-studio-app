import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import { MessagePart } from '@cherrystudio/ui/components';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { SourceLink } from './SourceLink';

type SourceUrlPart = Extract<CherryMessagePart, { type: 'source-url' }>;

type SourceGroupProps = {
  parts: readonly SourceUrlPart[];
};

export function SourceGroup({ parts }: SourceGroupProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const sources = useMemo(() => {
    const sourcesByUrl = new Map<string, SourceUrlPart>();

    for (const part of parts) {
      if (!sourcesByUrl.has(part.url)) {
        sourcesByUrl.set(part.url, part);
      }
    }

    return [...sourcesByUrl.values()];
  }, [parts]);
  const label = t('chat.sources.count', { count: sources.length });

  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className="min-h-8 self-start flex-row items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 active:bg-secondary-active active:opacity-80"
        hitSlop={6}
        onPress={() => setIsOpen(true)}
      >
        <GlobeIcon className="size-3.5 text-muted-foreground" />
        <Text className="font-medium text-muted-foreground text-xs">{label}</Text>
        <ChevronRightIcon className="size-3.5 text-muted-foreground" />
      </Pressable>
      {isOpen ? (
        <MessagePart.Detail onClose={() => setIsOpen(false)} title={t('chat.sources.title')}>
          <View className="gap-1">
            {sources.map((source) => (
              <SourceLink
                key={source.url}
                label={source.title ?? source.url}
                url={source.url}
                variant="listItem"
              />
            ))}
          </View>
        </MessagePart.Detail>
      ) : null}
    </>
  );
}
