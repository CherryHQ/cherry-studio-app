import { useAlert } from '@cherrystudio/ui/components';
import type { UpdateProviderInput } from '@cherrystudio/universal/data/api/schemas/providers';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { keyboardBottomOffset } from '@/frontend/utils/constants';

import { ProviderBrandAvatar } from '../components/ProviderAvatar';
import { useProviderAvatar, useProviderAvatarActions } from '../components/providerAvatarStore';
import {
  buildProviderApiServiceEndpointUpdates,
  ProviderApiServiceSaveError,
  useProviderApiServiceQueries,
  useProviderApiServiceSheetClose,
} from './apiService';
import {
  ProviderDeleteButton,
  providerDeleteButtonClearance,
} from './components/ProviderDeleteButton';
import { useProviderDeletion } from './hooks/useProviderDeletion';
import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  ProviderForm,
  providerFormAvatarSize,
  resolveProviderFormEndpointTypes,
  toProviderFormEndpointDraft,
  useProviderFormDraft,
} from './providerForm';

/**
 * Everything about a provider that is not its keys or its models: logo, name,
 * and the URLs it talks to. Reached from the gear in the detail page's header,
 * and composed from the same form as "add provider" minus the API key field —
 * keys are a list with per-key state, managed on the detail page.
 */
export default function ProviderEditScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  const { t } = useTranslation();
  const { alert } = useAlert();
  const providerAvatars = useProviderAvatarActions();
  const [isSaving, setIsSaving] = useState(false);
  const { provider, providerQuery, saveProviderMutation } = useProviderApiServiceQueries(
    providerId ?? '',
  );
  const storedAvatarUri = useProviderAvatar(providerId ?? '');
  const endpointTypes = useMemo(
    () => (provider ? resolveProviderFormEndpointTypes(provider) : []),
    [provider],
  );
  const createInitialValues = useCallback(
    () =>
      provider
        ? createProviderFormValues({ avatarUri: storedAvatarUri ?? null, provider })
        : createEmptyProviderFormValues(),
    [provider, storedAvatarUri],
  );
  const form = useProviderFormDraft({
    createInitialValues,
    endpointTypes,
    isSubmitting: isSaving,
    // The screen mounts before the provider query resolves on a cold cache, so
    // the draft is seeded once the provider lands — and, because the key is the
    // id rather than the record, never again on a background refetch.
    sourceKey: provider?.id ?? '',
  });
  const { meta, state } = form;
  const { closeWithoutPrompt, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: meta.isDirty,
    isSaving,
  });
  const { canDelete, isDeleting, requestDelete } = useProviderDeletion();
  const handleDelete = useCallback(() => {
    if (provider) {
      requestDelete(provider);
    }
  }, [provider, requestDelete]);

  const saveProvider = saveProviderMutation.mutateAsync;
  const handleSave = useCallback(() => {
    if (!provider || !providerId || !meta.canSubmit) {
      return;
    }

    let updates: UpdateProviderInput = { name: state.name.trim() };

    if (endpointTypes.length > 0) {
      try {
        updates = {
          ...updates,
          ...buildProviderApiServiceEndpointUpdates({
            draft: toProviderFormEndpointDraft({ endpointTypes, values: state }),
            provider,
          }),
        };
      } catch (error) {
        alert.show(
          error instanceof ProviderApiServiceSaveError
            ? {
                description: t('settings.provider.apiService.invalidBaseUrlMessage'),
                title: t('settings.provider.apiService.invalidBaseUrlTitle'),
              }
            : { title: t('settings.provider.apiService.saveFailed') },
        );
        return;
      }
    }

    Keyboard.dismiss();
    setIsSaving(true);

    void saveProvider(updates)
      .then(async () => {
        // The avatar is a file on disk rather than a provider field, so it is
        // written after the record lands and only when it actually changed.
        if (state.avatarUri !== (storedAvatarUri ?? null)) {
          if (state.avatarUri) {
            await providerAvatars.persist(providerId, state.avatarUri);
          } else {
            providerAvatars.remove(providerId);
          }
        }

        // Past the guard deliberately: the draft still reads dirty until the
        // provider query refetches, and this close is the saved one.
        closeWithoutPrompt();
      })
      .catch(() => {
        alert.show({ title: t('settings.provider.apiService.saveFailed') });
      })
      .finally(() => setIsSaving(false));
  }, [
    alert,
    closeWithoutPrompt,
    endpointTypes,
    meta.canSubmit,
    provider,
    providerAvatars,
    providerId,
    saveProvider,
    state,
    storedAvatarUri,
    t,
  ]);

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: !meta.canSubmit,
        key: 'save-provider',
        label: t('common.save'),
        onPress: handleSave,
      },
    ],
    [handleSave, meta.canSubmit, t],
  );

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader
        onBack={requestClose}
        rightActions={rightActions}
        title={t('settings.provider.edit.title')}
      />
      {/* One tree from the first frame, loaded or not: mounting the scroll view
          after the push settles leaves it with a zero top content inset. */}
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        className="flex-1"
        // Room for the delete button the form scrolls under.
        contentContainerStyle={{ paddingBottom: providerDeleteButtonClearance }}
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        mode="layout"
        showsVerticalScrollIndicator={false}
      >
        <ProviderForm value={form}>
          <ProviderForm.Avatar>
            {provider ? (
              <ProviderBrandAvatar
                presetProviderId={provider.presetProviderId}
                providerId={provider.id}
                providerName={state.name}
                size={providerFormAvatarSize}
              />
            ) : undefined}
          </ProviderForm.Avatar>
          <ProviderForm.Name />
          <ProviderForm.BaseUrl />
          <ProviderForm.Endpoints />
        </ProviderForm>
      </KeyboardAwareScrollView>
      {canDelete(provider) ? (
        <ProviderDeleteButton isDisabled={isDeleting || isSaving} onPress={handleDelete} />
      ) : null}
    </>
  );
}
