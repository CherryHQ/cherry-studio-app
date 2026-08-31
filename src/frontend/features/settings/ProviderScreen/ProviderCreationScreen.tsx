import { ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/components/headers';

import { ProviderBrandAvatar } from '../components/ProviderAvatar';
import { useProviderApiServiceSheetClose } from './apiService';
import {
  ProviderNewFormContent,
  useImportedProviderForm,
  useNewProviderForm,
} from './ProviderCreationForm';
import { providerFormAvatarSize } from './providerForm';

export default function ProviderCreationScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();

  return providerId ? (
    <ImportedProviderCreationScreen providerId={providerId} providerName={providerName} />
  ) : (
    <CustomProviderCreationScreen />
  );
}

function CustomProviderCreationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const newProviderForm = useNewProviderForm();
  const saveNewProvider = newProviderForm.handleSave;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: newProviderForm.form.meta.isDirty,
    isSaving: newProviderForm.isCreating,
  });
  const handleSave = useCallback(() => {
    void saveNewProvider().then((createdProvider) => {
      if (!createdProvider) {
        return;
      }

      allowNavigation();
      router.replace({
        pathname: '/settings/provider/[providerId]/model-add',
        params: {
          mode: 'sync',
          providerId: createdProvider.providerId,
          providerName: createdProvider.providerName,
          setupFlow: 'true',
        },
      });
    });
  }, [allowNavigation, router, saveNewProvider]);

  return (
    <>
      <RouteHeader onBack={requestClose} title={t('settings.provider.add.title')} />
      <ProviderNewFormContent
        canSave={newProviderForm.canSubmit}
        form={newProviderForm.form}
        isSaving={newProviderForm.isCreating}
        onSave={handleSave}
      />
    </>
  );
}

function ImportedProviderCreationScreen({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const importedProviderForm = useImportedProviderForm(providerId);
  const saveImportedProvider = importedProviderForm.handleSave;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: importedProviderForm.form.meta.isDirty,
    isSaving: importedProviderForm.isSaving,
  });
  const handleSave = useCallback(() => {
    void saveImportedProvider().then((configuredProvider) => {
      if (!configuredProvider) {
        return;
      }

      allowNavigation();
      router.replace({
        pathname: '/settings/provider/[providerId]/model-add',
        params: {
          mode: 'sync',
          providerId: configuredProvider.providerId,
          providerName: configuredProvider.providerName,
          setupFlow: 'true',
        },
      });
    });
  }, [allowNavigation, router, saveImportedProvider]);
  const displayedProviderName = importedProviderForm.provider?.name ?? providerName ?? '';

  return (
    <>
      <RouteHeader
        onBack={requestClose}
        title={t('settings.provider.setup.title', { name: displayedProviderName })}
      />
      {importedProviderForm.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner accessibilityLabel={t('settings.provider.loading')} />
        </View>
      ) : importedProviderForm.isError || !importedProviderForm.provider ? (
        <ContentState.Error
          className="flex-1 px-6 py-10"
          primaryAction={{ children: t('common.back'), onPress: requestClose }}
          title={t('settings.provider.setup.loadFailed')}
        />
      ) : (
        <ProviderNewFormContent
          avatar={
            <ProviderBrandAvatar
              presetProviderId={importedProviderForm.provider.presetProviderId}
              providerId={importedProviderForm.provider.id}
              providerName={importedProviderForm.form.state.name}
              shape="circle"
              size={providerFormAvatarSize}
            />
          }
          canSave={importedProviderForm.canSubmit}
          form={importedProviderForm.form}
          isSaving={importedProviderForm.isSaving}
          onSave={handleSave}
          showApiKey={importedProviderForm.showApiKey}
        />
      )}
    </>
  );
}
