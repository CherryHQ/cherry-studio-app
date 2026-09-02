import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { getFaviconUrls, type WebSource } from './webSource';

type WebSourceCardProps = {
  source: WebSource;
};

export function WebSourceCard({ source }: WebSourceCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityLabel={t('chat.webSearch.openResult', {
        domain: source.siteName,
        title: source.title ?? source.siteName,
      })}
      accessibilityRole="link"
      className="gap-3 rounded-2xl border-continuous bg-background px-4 py-4 active:bg-secondary-active active:opacity-80"
      onPress={() => void openExternalUrl(source.url)}
    >
      <View className="flex-row items-center gap-2">
        <WebSourceFavicon key={source.url} source={source} />
        <Text className="min-w-0 flex-1 font-medium text-foreground text-sm" numberOfLines={1}>
          {source.siteName}
        </Text>
        {source.publishedDate ? (
          <Text className="shrink-0 text-muted-foreground text-sm">{source.publishedDate}</Text>
        ) : null}
      </View>
      <View className="gap-1.5">
        {source.title ? (
          <Text className="font-semibold text-foreground text-base leading-6" numberOfLines={2}>
            {source.title}
          </Text>
        ) : null}
        {source.content ? (
          <Text className="text-muted-foreground text-sm leading-5" numberOfLines={3}>
            {source.content}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type FaviconStatus = 'failed' | 'loaded' | 'loading';

function WebSourceFavicon({ source }: { source: WebSource }) {
  const faviconUrls = getFaviconUrls(source);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [status, setStatus] = useState<FaviconStatus>(
    faviconUrls.length > 0 ? 'loading' : 'failed',
  );
  const faviconUrl = faviconUrls[sourceIndex];
  const fallbackInitial = source.siteName.charAt(0).toUpperCase() || '?';

  const handleError = () => {
    if (sourceIndex < faviconUrls.length - 1) {
      setSourceIndex(sourceIndex + 1);
      setStatus('loading');
      return;
    }

    setStatus('failed');
  };

  return (
    <View
      accessibilityElementsHidden
      className="relative size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border border-continuous bg-secondary"
      importantForAccessibility="no-hide-descendants"
    >
      {status !== 'loaded' ? (
        <Text className="font-semibold text-foreground-tertiary text-xs">{fallbackInitial}</Text>
      ) : null}
      {faviconUrl && status !== 'failed' ? (
        <Image
          accessible={false}
          cachePolicy="memory-disk"
          contentFit="contain"
          onDisplay={() => setStatus('loaded')}
          onError={handleError}
          recyclingKey={faviconUrl}
          source={{ uri: faviconUrl }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}
