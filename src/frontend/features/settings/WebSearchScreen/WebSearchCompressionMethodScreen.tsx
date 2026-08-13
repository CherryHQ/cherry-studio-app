import { CheckIcon } from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';

export default function WebSearchCompressionMethodScreen() {
  const { t } = useTranslation();
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
              <Section.Item
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.value}
                label={option.label}
                onPress={() => {
                  if (!selected) {
                    compressionMethod.onValueChange(option.value);
                  }
                }}
                showChevron={false}
                trailing={selected ? <CheckIcon className="size-5 text-primary" /> : null}
              />
            );
          })}
        </Section>
      </ScrollView>
    </>
  );
}
