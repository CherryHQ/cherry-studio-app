import { ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import { ProviderBrandAvatar } from '@/frontend/components/Avatar';
import type { ProviderConfigurationIssue } from '@/shared/contracts';

import { useProviderApiServiceSheetClose } from '../apiService';
import { providerFormAvatarSize } from '../components/ProviderForm';
import { useProviderSetup, type ProviderSetupIntent } from '../hooks/useProviderSetup';
import {
  ProviderNewFormContent,
  useImportedProviderForm,
  useNewProviderForm,
} from './components/ProviderCreationForm';

export default function ProviderCreationScreen() {
  const {
    providerId,
    providerName,
    intent,
    issue,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<
    ProviderSetupRouteParamsInput & {
      providerId?: string;
      providerName?: string;
      intent?: string;
      issue?: ProviderConfigurationIssue;
    }
  >();
  const returnTo = readProviderSetupReturnTo(rawReturnTo) ?? '/settings/provider';

  return providerId ? (
    <ImportedProviderCreationScreen
      providerId={providerId}
      providerName={providerName}
      returnTo={returnTo}
      intent={intent === 'sync' ? 'sync' : 'enable'}
      issue={issue}
    />
  ) : (
    <CustomProviderCreationScreen returnTo={returnTo} />
  );
}

function CustomProviderCreationScreen({ returnTo }: { returnTo: string }) {
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
          enableProvider: 'true',
          providerId: createdProvider.providerId,
          providerName: createdProvider.providerName,
          returnTo,
        },
      });
    });
  }, [allowNavigation, returnTo, router, saveNewProvider]);

  return (
    <>
      <RouteHeader onBack={requestClose} title={t('settings.provider.add.title')} />
      <ProviderNewFormContent
        canSave={newProviderForm.canSubmit}
        endpointMode="custom-text"
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
  returnTo,
  intent,
  issue,
}: {
  providerId: string;
  providerName?: string;
  returnTo: string;
  intent: ProviderSetupIntent;
  issue?: ProviderConfigurationIssue;
}) {
  const { t } = useTranslation();
  const { isPreparing, openSetup } = useProviderSetup();
  const importedProviderForm = useImportedProviderForm(providerId);
  const saveImportedProvider = importedProviderForm.handleSave;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: importedProviderForm.form.meta.isDirty,
    isSaving: importedProviderForm.isSaving || isPreparing,
  });
  const handleSave = useCallback(() => {
    void saveImportedProvider().then((configuredProvider) => {
      if (!configuredProvider) {
        return;
      }

      void openSetup(configuredProvider.providerId, returnTo, intent, true, allowNavigation);
    });
  }, [allowNavigation, intent, openSetup, returnTo, saveImportedProvider]);
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
        <View className="flex-1 justify-center px-6 py-10">
          <ContentState.Error
            primaryAction={{ children: t('common.back'), onPress: requestClose }}
            title={t('settings.provider.setup.loadFailed')}
          />
        </View>
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
          canSave={importedProviderForm.canSubmit && !isPreparing}
          issue={
            issue ??
            (importedProviderForm.requiresApiKey && !importedProviderForm.form.state.apiKey.trim()
              ? 'missing-api-key'
              : undefined)
          }
          disabledKeys={importedProviderForm.disabledKeys}
          onEnableKeys={importedProviderForm.enableKeys}
          endpointMode={importedProviderForm.isCustomProvider ? 'custom-text' : 'primary'}
          form={importedProviderForm.form}
          isSaving={importedProviderForm.isSaving || isPreparing}
          onSave={handleSave}
          showApiKey={importedProviderForm.showApiKey}
        />
      )}
    </>
  );
}
