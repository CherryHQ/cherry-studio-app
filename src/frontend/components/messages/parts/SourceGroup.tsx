import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import { MessagePart } from '@cherrystudio/ui/components';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { resolveCitationWebSources } from './webSource';
import { WebSourceCard } from './WebSourceCard';

type SourceGroupProps = {
  parts: readonly CherryMessagePart[];
};

export function SourceGroup({ parts }: SourceGroupProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const sources = useMemo(() => resolveCitationWebSources(parts), [parts]);
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
        <MessagePart.Detail
          onClose={() => setIsOpen(false)}
          title={t('chat.webSearch.detailTitle', { count: sources.length })}
        >
          <View className="gap-3">
            {sources.map((source) => (
              <WebSourceCard key={source.url} source={source} />
            ))}
          </View>
        </MessagePart.Detail>
      ) : null}
    </>
  );
}
