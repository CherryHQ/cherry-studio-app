import { ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type ProviderSetupIntent as FirstUseSetupIntent,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import { ProviderBrandAvatar } from '@/frontend/components/Avatar';
import type { ProviderConfigurationIssue } from '@/shared/contracts';

import { useProviderApiServiceSheetClose, useProviderConfigurationForm } from '../apiService';
import { providerFormAvatarSize } from '../components/ProviderForm';
import { useProviderSetup, type ProviderSetupIntent } from '../hooks/useProviderSetup';
import { ProviderNewFormContent, useNewProviderForm } from './components/ProviderCreationForm';
import {
  ProviderSetupCustomFields,
  ProviderSetupFormContent,
  ProviderSetupPresetFields,
} from './components/ProviderSetupFormContent';

export default function ProviderCreationScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
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
      setupIntent={setupIntent}
    />
  ) : (
    <CustomProviderCreationScreen returnTo={returnTo} setupIntent={setupIntent} />
  );
}

function CustomProviderCreationScreen({
  returnTo,
  setupIntent,
}: {
  returnTo: string;
  setupIntent?: FirstUseSetupIntent;
}) {
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

      if (setupIntent === 'chat') {
        router.setParams({
          providerId: createdProvider.providerId,
          providerName: createdProvider.providerName,
        });
        router.push({
          pathname: '/onboarding/model',
          params: { providerId: createdProvider.providerId },
        });
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
  }, [allowNavigation, returnTo, router, saveNewProvider, setupIntent]);

  return (
    <>
      <RouteHeader onBack={requestClose} title={t('settings.provider.add.title')} />
      {setupIntent === 'chat' ? (
        <ProviderSetupFormContent
          canSave={newProviderForm.canSubmit}
          form={newProviderForm.form}
          onSave={handleSave}
        >
          <ProviderSetupCustomFields />
        </ProviderSetupFormContent>
      ) : (
        <ProviderNewFormContent
          canSave={newProviderForm.canSubmit}
          endpointMode="custom-text"
          form={newProviderForm.form}
          isSaving={newProviderForm.isCreating}
          onSave={handleSave}
        />
      )}
    </>
  );
}

function ImportedProviderCreationScreen({
  providerId,
  providerName,
  returnTo,
  intent,
  issue,
  setupIntent,
}: {
  providerId: string;
  providerName?: string;
  returnTo: string;
  intent: ProviderSetupIntent;
  issue?: ProviderConfigurationIssue;
  setupIntent?: FirstUseSetupIntent;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPreparing, openSetup } = useProviderSetup();
  const importedProviderForm = useProviderConfigurationForm(providerId);
  const saveImportedProvider = importedProviderForm.requestSave;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: importedProviderForm.form.meta.isDirty,
    isSaving: importedProviderForm.isSaving || isPreparing,
  });
  const handleSave = useCallback(() => {
    saveImportedProvider((configuredProvider) => {
      if (setupIntent === 'chat') {
        router.push({
          pathname: '/onboarding/model',
          params: { providerId: configuredProvider.providerId },
        });
        return;
      }

      void openSetup(configuredProvider.providerId, returnTo, intent, true, allowNavigation);
    });
  }, [allowNavigation, intent, openSetup, returnTo, router, saveImportedProvider, setupIntent]);
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
      ) : setupIntent === 'chat' ? (
        <ProviderSetupFormContent
          canSave={importedProviderForm.canCompleteSetup}
          form={importedProviderForm.form}
          onSave={handleSave}
        >
          {importedProviderForm.isCustomProvider ? (
            <ProviderSetupCustomFields />
          ) : (
            <ProviderSetupPresetFields
              provider={importedProviderForm.provider}
              showApiKey={importedProviderForm.showApiKey}
            />
          )}
        </ProviderSetupFormContent>
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
          canSave={importedProviderForm.canCompleteSetup && !isPreparing}
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
