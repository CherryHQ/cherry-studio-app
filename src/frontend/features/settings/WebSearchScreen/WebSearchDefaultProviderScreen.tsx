import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { CheckIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';

import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';
import { resolveWebSearchProviderIcon } from './utils/providerIcons';

export default function WebSearchDefaultProviderScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  const { searchKeywords } = useWebSearchProviderPreferences();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <BackHeader title={t('settings.websearch.provider.selection')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section>
          {searchKeywords.options.map((option) => {
            const selected = option.value === searchKeywords.value;
            const imageSource = resolveWebSearchProviderIcon(option.value)?.[iconTheme];

            return (
              <Section.Item
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.value}
                label={option.label}
                leading={
                  imageSource ? (
                    <Image
                      cachePolicy="memory-disk"
                      className="size-5"
                      contentFit="contain"
                      recyclingKey={option.value}
                      source={imageSource}
                    />
                  ) : null
                }
                onPress={() => {
                  if (!selected) {
                    searchKeywords.onValueChange(option.value);
                    router.back();
                  }
                }}
                showChevron={false}
                trailing={
                  selected ? <CheckIcon className="size-5 text-primary" strokeWidth={2.5} /> : null
                }
              />
            );
          })}
        </Section>
      </ScrollView>
    </>
  );
}
