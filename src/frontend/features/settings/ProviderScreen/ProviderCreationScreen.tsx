import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { RouteHeader } from '@/frontend/components/headers';

import { useProviderApiServiceSheetClose } from './apiService';
import { ProviderNewFormContent, useNewProviderForm } from './ProviderCreationForm';

export default function ProviderCreationScreen() {
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
          returnToProviderList: 'true',
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
