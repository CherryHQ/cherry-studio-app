import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelPickerScreen, type ModelPickerModelItem } from '@/frontend/components/modelPicker';

/**
 * The model an assistant answers with, picked on the same pushed screen the
 * model settings use.
 *
 * The editor below is an unsaved form, so the choice cannot be written anywhere
 * on the way out: it travels back as a route param and the editor folds it into
 * its form state. `dismissTo` rather than `back` because only a navigation
 * carries params, and both editor routes — the create screen and the edit
 * screen — are one push below this one.
 */
export default function AssistantModelSelectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { assistantId, modelId } = useLocalSearchParams<{
    assistantId?: string;
    modelId?: string;
  }>();
  const handleSelect = useCallback(
    (item: ModelPickerModelItem) => {
      router.dismissTo(
        assistantId
          ? {
              params: { assistantId, modelId: item.modelId },
              pathname: '/assistants/[assistantId]/edit',
            }
          : { params: { modelId: item.modelId }, pathname: '/assistants/new' },
      );
    },
    [assistantId, router],
  );

  return (
    <ModelPickerScreen
      onSelect={handleSelect}
      selectedModelId={modelId ?? null}
      title={t('assistant.form.modelSelect')}
    />
  );
}
