import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import SettingsIcon from '@cherrystudio/app-icons/icons/settings';
import { Button } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ProviderBrandAvatar } from '@/frontend/components/Avatar';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

/** Localized operation diagrams: illustrations, rather than screenshots of a user's account. */
export function DeepseekExportGuide() {
  const { t } = useTranslation();
  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          {t('settings.data.deepseek.guide.title')}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {t('settings.data.deepseek.guide.intro')}
        </Text>
      </View>
      <GuideStep
        number={1}
        title={t('settings.data.deepseek.guide.open.title')}
        description={t('settings.data.deepseek.guide.open.description')}
      >
        <View className="flex-row items-center gap-2 border-b border-border pb-3">
          <GlobeIcon className="size-4 text-muted-foreground" />
          <Text className="flex-1 font-mono text-sm text-muted-foreground">chat.deepseek.com</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <ProviderBrandAvatar providerId="deepseek" providerName="DeepSeek" size={28} />
          <Text className="text-base font-medium text-foreground">DeepSeek</Text>
        </View>
        <View className="flex-row items-center gap-3 rounded-lg bg-secondary px-3 py-3">
          <SettingsIcon className="size-5 text-foreground" />
          <Text className="flex-1 text-base text-foreground">{t('settings.title')}</Text>
          <ChevronRightIcon className="size-4 text-foreground" />
        </View>
      </GuideStep>
      <GuideStep
        number={2}
        title={t('settings.data.deepseek.guide.export.title')}
        description={t('settings.data.deepseek.guide.export.description')}
      >
        <Text className="text-sm text-muted-foreground">{t('settings.title')}</Text>
        <Text className="text-base font-medium text-foreground">
          {t('settings.data.deepseek.guide.data')}
        </Text>
        <View className="flex-row items-center gap-3 rounded-lg bg-secondary px-3 py-3">
          <DownloadIcon className="size-5 text-foreground" />
          <Text className="flex-1 text-base text-foreground">
            {t('settings.data.deepseek.guide.exportAction')}
          </Text>
        </View>
      </GuideStep>
      <GuideStep
        number={3}
        title={t('settings.data.deepseek.guide.copy.title')}
        description={t('settings.data.deepseek.guide.copy.description')}
      >
        <View className="flex-row items-center gap-3">
          <GlobeIcon className="size-8 text-muted-foreground" />
          <View className="flex-1 gap-1">
            <Text className="font-mono text-sm text-foreground">https://…/….zip?…</Text>
            <Text className="text-sm text-muted-foreground">
              {t('settings.data.deepseek.guide.completeLink')}
            </Text>
          </View>
          <CopyIcon className="size-5 text-muted-foreground" />
        </View>
      </GuideStep>
      <Button variant="text" onPress={() => void openExternalUrl('https://chat.deepseek.com/')}>
        {t('settings.data.deepseek.guide.openWebsite')}
      </Button>
    </View>
  );
}

function GuideStep({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="min-h-8 min-w-8 items-center justify-center rounded-full bg-secondary px-2">
          <Text className="text-sm font-medium text-foreground">{number}</Text>
        </View>
        <Text accessibilityRole="header" className="flex-1 text-base font-medium text-foreground">
          {title}
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">{description}</Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('settings.data.deepseek.guide.illustration', { step: number, title })}
        className="gap-3 rounded-xl border border-border bg-card p-4"
      >
        {children}
      </View>
    </View>
  );
}
