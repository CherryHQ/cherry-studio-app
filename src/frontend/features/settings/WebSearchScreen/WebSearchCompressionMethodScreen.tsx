import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';

export default function WebSearchCompressionMethodScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { compressionMethod } = useWebSearchProviderPreferences();

  return (
    <>
      <BackHeader title={t('settings.websearch.compressionMethod')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section>
          {compressionMethod.options.map((option) => {
            const selected = option.value === compressionMethod.value;

            return (
              <Section.RadioItem
                key={option.value}
                label={option.label}
                onPress={() => {
                  if (!selected) {
                    compressionMethod.onValueChange(option.value);
                    router.back();
                  }
                }}
                selected={selected}
              />
            );
          })}
        </Section>
      </ScrollView>
    </>
  );
}
