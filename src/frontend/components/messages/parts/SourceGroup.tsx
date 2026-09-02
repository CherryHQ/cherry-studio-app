import { MessagePart } from '@cherrystudio/ui/components';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { resolveCitationWebSources } from './webSource';
import { WebSourceCard, WebSourceFavicon } from './WebSourceCard';

type SourceGroupProps = {
  parts: readonly CherryMessagePart[];
};

export function SourceGroup({ parts }: SourceGroupProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const sources = useMemo(() => resolveCitationWebSources(parts), [parts]);
  const label = t('chat.sources.count', { count: sources.length });

  if (sources.length === 0) {
    return null;
  }

  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className="-mx-2 min-h-10 self-start flex-row items-center gap-2 rounded-lg px-2 active:bg-secondary-active active:opacity-80"
        hitSlop={4}
        onPress={() => setIsOpen(true)}
      >
        <View className="flex-row items-center">
          {sources.slice(0, 3).map((source, index) => (
            <View key={source.url} style={{ marginLeft: index === 0 ? 0 : -4, zIndex: 3 - index }}>
              <WebSourceFavicon source={source} />
            </View>
          ))}
        </View>
        <Text className="font-medium text-foreground-tertiary text-sm">{label}</Text>
      </Pressable>
      {isOpen ? (
        <MessagePart.Detail
          onClose={() => setIsOpen(false)}
          title={t('chat.webSearch.detailTitle', { count: sources.length })}
          variant="source-list"
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
