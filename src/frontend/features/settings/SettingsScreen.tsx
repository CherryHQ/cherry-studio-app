import BellIcon from '@cherrystudio/app-icons/icons/bell';
import CircleUserRoundIcon from '@cherrystudio/app-icons/icons/circle-user-round';
import CloudIcon from '@cherrystudio/app-icons/icons/cloud';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import LockIcon from '@cherrystudio/app-icons/icons/lock';
import PaletteIcon from '@cherrystudio/app-icons/icons/palette';
import SparklesIcon from '@cherrystudio/app-icons/icons/sparkles';
import { Image, Section } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { RouteHeader } from '@/frontend/components/headers';
import { usePreference, usePrefetchInfiniteQuery } from '@/frontend/data/hooks';

import { ProfileHero } from './profileHero';
import { PROVIDER_LIST_PAGE_SIZE, PROVIDER_LIST_STALE_TIME } from './providerListQuery';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const [userName] = usePreference('app.user.name');
  const prefetchInfiniteQuery = usePrefetchInfiniteQuery();
  const mcpIcon = resolveProviderIcon('mcp')?.[theme === 'dark' ? 'dark' : 'light'];

  const openProfileSettings = useCallback(() => {
    router.push('/settings/profile');
  }, [router]);
  const prepareProviderSettings = useCallback(() => {
    router.prefetch('/settings/provider');
    void prefetchInfiniteQuery('/providers/page', {
      limit: PROVIDER_LIST_PAGE_SIZE,
      staleTime: PROVIDER_LIST_STALE_TIME,
    });
  }, [prefetchInfiniteQuery, router]);
  const openProviderSettings = useCallback(() => {
    prepareProviderSettings();
    router.push('/settings/provider');
  }, [prepareProviderSettings, router]);

  const contentContainerStyle = useMemo(() => ({ paddingBottom: insets.bottom }), [insets.bottom]);

  return (
    <View className="flex-1 bg-grouped-background">
      <RouteHeader />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <ProfileHero onPress={openProfileSettings} userName={userName} />
        <View className="gap-6 px-2 pt-2">
          <Section>
            <Section.Item
              label={t('settings.items.profile')}
              leading={<CircleUserRoundIcon className="size-5 text-foreground" />}
              onPress={openProfileSettings}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.items.modelService')}
              leading={<CloudIcon className="size-5 text-foreground" />}
              onPress={openProviderSettings}
              onPressIn={prepareProviderSettings}
            />
            <Section.Item
              label={t('settings.items.defaultModel')}
              leading={<SparklesIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/model')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.items.webSearch')}
              leading={<GlobeIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/websearch')}
            />
            <Section.Item
              label={t('settings.items.mcp')}
              leading={
                mcpIcon ? (
                  <Image
                    cachePolicy="memory-disk"
                    className="size-5"
                    contentFit="contain"
                    source={mcpIcon}
                  />
                ) : null
              }
              onPress={() => router.push('/settings/mcp')}
            />
          </Section>
          <Section>
            {Platform.OS === 'ios' ? (
              <Section.Item
                label={t('settings.items.notifications')}
                leading={<BellIcon className="size-5 text-foreground" />}
                onPress={() => router.push('/settings/notifications')}
              />
            ) : null}
            <Section.Item
              label={t('settings.items.permissions')}
              leading={<LockIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/permissions')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.appearance.title')}
              leading={<PaletteIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/appearance')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.items.aboutUs')}
              leading={<InfoIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/about')}
            />
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}
