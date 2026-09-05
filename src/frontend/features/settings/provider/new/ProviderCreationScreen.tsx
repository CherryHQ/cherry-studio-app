import { ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type ProviderSetupIntent,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import { ProviderBrandAvatar } from '@/frontend/components/Avatar';

import { useProviderApiServiceSheetClose } from '../apiService';
import { isFullyCustomProvider } from '../apiService/utils/providerApiServiceEndpointRules';
import { providerFormAvatarSize } from '../components/ProviderForm';
import {
  ProviderNewFormContent,
  useImportedProviderForm,
  useNewProviderForm,
} from './components/ProviderCreationForm';
import {
  ProviderSetupCustomFields,
  ProviderSetupFormContent,
  ProviderSetupPresetFields,
} from './components/ProviderSetupFormContent';

export default function ProviderCreationScreen({
  setupIntent,
}: { setupIntent?: ProviderSetupIntent } = {}) {
  const {
    providerId,
    providerName,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<
    ProviderSetupRouteParamsInput & {
      providerId?: string;
      providerName?: string;
    }
  >();
  const returnTo = readProviderSetupReturnTo(rawReturnTo) ?? '/settings/provider';
  const intent = setupIntent;

  return providerId ? (
    <ImportedProviderCreationScreen
      intent={intent}
      providerId={providerId}
      providerName={providerName}
      returnTo={returnTo}
    />
  ) : (
    <CustomProviderCreationScreen intent={intent} returnTo={returnTo} />
  );
}

function CustomProviderCreationScreen({
  intent,
  returnTo,
}: {
  intent?: ProviderSetupIntent;
  returnTo: string;
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

      if (intent === 'chat') {
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
          providerId: createdProvider.providerId,
          providerName: createdProvider.providerName,
          returnTo,
        },
      });
    });
  }, [allowNavigation, intent, returnTo, router, saveNewProvider]);

  return (
    <>
      <RouteHeader onBack={requestClose} title={t('settings.provider.add.title')} />
      {intent === 'chat' ? (
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
  intent,
  providerId,
  providerName,
  returnTo,
}: {
  intent?: ProviderSetupIntent;
  providerId: string;
  providerName?: string;
  returnTo: string;
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

      if (intent === 'chat') {
        importedProviderForm.form.actions.reset(importedProviderForm.form.state);
        router.push({
          pathname: '/onboarding/model',
          params: { providerId: configuredProvider.providerId },
        });
        return;
      }

      allowNavigation();
      router.replace({
        pathname: '/settings/provider/[providerId]/model-add',
        params: {
          mode: 'sync',
          providerId: configuredProvider.providerId,
          providerName: configuredProvider.providerName,
          returnTo,
        },
      });
    });
  }, [allowNavigation, importedProviderForm.form, intent, returnTo, router, saveImportedProvider]);
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
      ) : intent === 'chat' ? (
        <ProviderSetupFormContent
          canSave={importedProviderForm.canSubmit}
          form={importedProviderForm.form}
          onSave={handleSave}
        >
          {isFullyCustomProvider(importedProviderForm.provider) ? (
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
