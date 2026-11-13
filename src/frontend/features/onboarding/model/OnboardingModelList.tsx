import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { cn } from '@cherrystudio/ui/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';

import { useInlineSearch } from '@/frontend/components/InlineSearch';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { OnboardingField, OnboardingMessage } from '../components/OnboardingPage';

/** The same search and single selection for configured providers and account models. */
export function OnboardingModelList({
  children,
  disabled,
  models,
  onSelect,
  providers,
  selectedId,
}: {
  children?: ReactNode;
  disabled: boolean;
  models: Model[];
  onSelect: (model: Model) => void;
  providers?: Pick<Provider, 'id' | 'name'>[];
  selectedId?: string;
}) {
  const { t } = useTranslation();
  const { query, results, setQuery } = useInlineSearch({
    fields: (model: Model) => [model.name, model.modelId],
    items: models,
  });

  return (
    <>
      <OnboardingField
        label={t('onboarding.search')}
        onChangeText={setQuery}
        testID="onboarding-model-search"
        value={query}
      />
      {children}
      <FlatList
        data={results}
        extraData={{ disabled, selectedId }}
        keyExtractor={(model) => model.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <OnboardingMessage>{t('onboarding.model.noResults')}</OnboardingMessage>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: item.id === selectedId, disabled }}
            className="min-h-20 flex-row items-center gap-4 border-b border-border-subtle py-4 active:opacity-70"
            disabled={disabled}
            onPress={() => onSelect(item)}
            testID={`onboarding-model-${item.id}`}
          >
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-medium text-base text-foreground">{item.name}</Text>
              <Text className="text-sm text-muted-foreground">
                {providers
                  ? (providers.find((provider) => provider.id === item.providerId)?.name ??
                    item.providerId)
                  : item.modelId}
              </Text>
            </View>
            <View
              className={cn(
                'size-6 items-center justify-center rounded-full border',
                item.id === selectedId ? 'border-foreground bg-foreground' : 'border-border-strong',
              )}
            >
              {item.id === selectedId ? <CheckIcon className="size-4 text-background" /> : null}
            </View>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        testID="onboarding-model-list"
      />
    </>
  );
}
