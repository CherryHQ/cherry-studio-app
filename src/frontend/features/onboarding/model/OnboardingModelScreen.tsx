import { Button, ContentState, Input, Section, TextField } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Keyboard, ScrollView, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { ModelPickerIcon } from '@/frontend/components/ModelPicker';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { Model } from '@/shared/data/types/model';

import { useCompleteOnboarding } from './useCompleteOnboarding';
import { useOnboardingModels } from './useOnboardingModels';

export function OnboardingModelScreen() {
  const params = useLocalSearchParams<{ providerId?: string | string[] }>();
  const providerId = getSingleRouteParam(params.providerId);
  // Changing providers discards the previous provider's selection and manual draft.
  return <OnboardingModelSelection key={providerId ?? 'all'} providerId={providerId} />;
}

function OnboardingModelSelection({ providerId }: { providerId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const data = useOnboardingModels(providerId);
  const { complete, phase, cancel } = useCompleteOnboarding();
  const isBusy = phase !== 'idle';
  const openProviderSetup = () => router.push('/onboarding/provider');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<'catalog' | 'manual'>('catalog');
  const [manualId, setManualId] = useState('');
  const { query, results, setQuery } = useInlineSearch({
    fields: (model: Model) => [model.name, model.modelId],
    items: data.items,
  });
  const selectedModel =
    data.items.find((model) => model.id === selectedId) ??
    (data.items.length === 1 ? data.items[0] : undefined);
  const canStart =
    selectionMode === 'manual' ? Boolean(data.provider && manualId.trim()) : Boolean(selectedModel);
  const shouldEditConnection = Boolean(providerId) && data.loadError?.action === 'editConnection';
  const isShowingLoadError =
    selectionMode === 'catalog' && !data.isLoading && Boolean(data.loadError);

  const editConnection = () => {
    cancel();
    if (router.canGoBack()) router.back();
    else
      router.replace({
        pathname: '/onboarding/connection',
        params: { providerId },
      });
  };
  const start = () => {
    if (!canStart || isBusy || data.isLoading || data.error) return;
    Keyboard.dismiss();
    if (selectionMode === 'manual' && data.provider) {
      const existing = data.localModels.find(
        (model) => model.providerId === providerId && model.modelId === manualId.trim(),
      );
      void complete(
        existing
          ? { kind: 'catalog', model: existing, isLocal: true }
          : { kind: 'manual', modelId: manualId.trim(), provider: data.provider },
      );
    } else if (selectedModel) {
      void complete({
        kind: 'catalog',
        model: selectedModel,
        isLocal: data.localModels.some((model) => model.id === selectedModel.id),
      });
    }
  };

  return (
    <>
      <RouteHeader
        title={t('onboarding.model.title')}
        rightActions={
          providerId && !(isShowingLoadError && shouldEditConnection)
            ? [
                {
                  key: 'edit-connection',
                  type: 'label',
                  label: t('onboarding.connection.edit'),
                  onPress: editConnection,
                  disabled: isBusy,
                },
              ]
            : undefined
        }
      />
      {selectionMode === 'catalog' && data.items.length > 0 ? (
        <InlineSearch onChangeText={setQuery} value={query} />
      ) : null}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={{ flex: 1 }}
      >
        <View className="gap-2 px-4 pt-5 pb-4">
          {providerId ? (
            <Text className="text-xs text-muted-foreground">
              {t('onboarding.step', { current: 3 })}
            </Text>
          ) : null}
          {selectionMode === 'manual' ||
          (!data.isLoading &&
            !data.isRefreshing &&
            !data.loadError &&
            !data.pullError &&
            data.items.length > 0) ? (
            <Text className="text-base text-foreground">{t('onboarding.model.description')}</Text>
          ) : null}
        </View>
        {selectionMode === 'manual' && data.provider ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerClassName="px-4 py-3"
          >
            <TextField disabled={isBusy}>
              <TextField.Label>{t('onboarding.model.manualLabel')}</TextField.Label>
              <Input
                accessibilityLabel={t('onboarding.model.manualLabel')}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setManualId}
                placeholder={t('onboarding.model.manualPlaceholder')}
                returnKeyType="done"
                value={manualId}
                onSubmitEditing={start}
              />
              <TextField.Description>
                {t('onboarding.model.manualDescription')}
              </TextField.Description>
            </TextField>
          </ScrollView>
        ) : data.isLoading ? (
          <View className="flex-1 justify-center px-6">
            <ContentState.Loading title={t('onboarding.model.loading')} />
          </View>
        ) : data.loadError ? (
          <View className="flex-1 justify-center px-6">
            <ContentState.Error
              accessibilityLiveRegion="polite"
              title={t(`onboarding.model.error.${data.loadError.reason}`)}
              primaryAction={{
                children: t(shouldEditConnection ? 'onboarding.connection.edit' : 'common.retry'),
                onPress: shouldEditConnection ? editConnection : data.retry,
              }}
            />
          </View>
        ) : data.items.length === 0 ? (
          <View className="flex-1 justify-center px-6">
            <ContentState.Empty
              title={t(providerId ? 'onboarding.model.empty' : 'onboarding.model.noProvider')}
              primaryAction={
                providerId
                  ? {
                      children: t('onboarding.model.manual'),
                      onPress: () => setSelectionMode('manual'),
                      disabled: !data.provider,
                    }
                  : { children: t('onboarding.welcome.connect'), onPress: openProviderSetup }
              }
            />
          </View>
        ) : (
          <>
            {data.isRefreshing || data.pullError ? (
              <View className="px-4 pb-3" accessibilityLiveRegion="polite">
                {data.isRefreshing ? (
                  <ContentState.Loading layout="row" title={t('onboarding.model.loading')} />
                ) : data.pullError ? (
                  <View className="flex-row items-center gap-3">
                    <Text className="flex-1 text-xs text-muted-foreground">
                      {t('onboarding.model.savedFallback', {
                        reason: t(`onboarding.model.error.${data.pullError.reason}`),
                      })}
                    </Text>
                    <Button
                      disabled={isBusy}
                      onPress={
                        data.pullError.action === 'editConnection' ? editConnection : data.retry
                      }
                      size="inline"
                      variant="link"
                    >
                      {t(
                        data.pullError.action === 'editConnection'
                          ? 'onboarding.connection.edit'
                          : 'common.retry',
                      )}
                    </Button>
                  </View>
                ) : null}
              </View>
            ) : null}
            <FlatList
              data={results}
              extraData={{ isBusy, selectedId: selectedModel?.id }}
              keyExtractor={(model) => model.id}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="px-4 py-8">
                  <ContentState.Empty title={t('onboarding.model.noResults')} />
                </View>
              }
              renderItem={({ item }) => (
                <Section.RadioItem
                  disabled={isBusy}
                  label={item.name}
                  description={
                    providerId
                      ? item.modelId
                      : (data.providers.find((provider) => provider.id === item.providerId)?.name ??
                        item.providerId)
                  }
                  leading={
                    <ModelPickerIcon
                      model={item}
                      provider={data.providers.find((provider) => provider.id === item.providerId)}
                    />
                  }
                  onPress={() => setSelectedId(item.id)}
                  selected={item.id === selectedModel?.id}
                />
              )}
            />
          </>
        )}
        <View className="gap-2 px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
          {selectionMode === 'manual' || data.items.length > 0 ? (
            <>
              <Text className="text-center text-xs text-muted-foreground">
                {t('onboarding.model.checkHint')}
              </Text>
              <Button
                disabled={!canStart || data.isLoading || Boolean(data.error)}
                loading={isBusy}
                onPress={start}
                size="lg"
              >
                {t(
                  phase === 'checking'
                    ? 'onboarding.check.checking'
                    : phase === 'idle'
                      ? 'onboarding.model.start'
                      : 'onboarding.check.saving',
                )}
              </Button>
            </>
          ) : null}
          {isBusy ? (
            <Button onPress={cancel} variant="ghost">
              {t('common.cancel')}
            </Button>
          ) : providerId &&
            (data.items.length > 0 || selectionMode === 'manual' || isShowingLoadError) ? (
            <Button
              disabled={!data.provider || Boolean(data.error)}
              onPress={() => setSelectionMode(selectionMode === 'manual' ? 'catalog' : 'manual')}
              variant="ghost"
            >
              {t(
                selectionMode === 'manual'
                  ? 'onboarding.model.chooseFromList'
                  : 'onboarding.model.manual',
              )}
            </Button>
          ) : providerId && !data.isLoading && data.items.length === 0 ? (
            <Button onPress={data.retry} variant="ghost">
              {t('onboarding.model.reload')}
            </Button>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
