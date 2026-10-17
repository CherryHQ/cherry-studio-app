import { Button } from '@cherrystudio/ui/components';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { ModelPickerDrawer, type ModelPickerModelItem } from '@/frontend/components/ModelPicker';
import type { UniqueModelId } from '@/shared/data/types/model';

import { useChatReplyTarget } from '../ChatReplyTarget';

/** Parallel answers are limited by the Host; more would crowd one question on a phone. */
const MAX_REPLY_MODELS = 8;

/**
 * Chooses the models for the next question, in pick order. One model answers
 * alone without changing the Agent default; several answer in parallel.
 */
export function ChatReplyModelSheet({
  defaultModelId,
  providerSetupReturnTo,
}: {
  defaultModelId: UniqueModelId | null;
  providerSetupReturnTo: string;
}) {
  const replyTarget = useChatReplyTarget();
  if (!replyTarget?.target.isChoosingModels) return null;
  return (
    <ChatReplyModelSheetContent
      initial={replyTarget.target.models ?? (defaultModelId ? [defaultModelId] : [])}
      onClose={replyTarget.actions.closeModelChoice}
      onConfirm={replyTarget.actions.setModels}
      providerSetupReturnTo={providerSetupReturnTo}
    />
  );
}

function ChatReplyModelSheetContent({
  initial,
  onClose,
  onConfirm,
  providerSetupReturnTo,
}: {
  initial: readonly UniqueModelId[];
  onClose: () => void;
  onConfirm: (models: readonly UniqueModelId[]) => void;
  providerSetupReturnTo: string;
}) {
  const { t } = useTranslation();
  const openProviderSetup = useOpenProviderSetup(providerSetupReturnTo);
  const [selected, setSelected] = useState(initial);
  const toggle = useCallback((item: ModelPickerModelItem) => {
    setSelected((current) =>
      current.includes(item.modelId)
        ? current.filter((modelId) => modelId !== item.modelId)
        : current.length < MAX_REPLY_MODELS
          ? [...current, item.modelId]
          : current,
    );
  }, []);
  return (
    <ModelPickerDrawer
      footer={
        <Button
          disabled={selected.length === 0}
          onPress={() => onConfirm(selected)}
          testID="chat-reply-models-confirm"
          variant="default"
        >
          <Button.Label>{t('chat.multiModel.confirm', { count: selected.length })}</Button.Label>
        </Button>
      }
      modelType="text"
      onAddProvider={() => {
        onClose();
        openProviderSetup();
      }}
      onClose={onClose}
      onSelect={toggle}
      open
      selectedModelId={null}
      selectedModelIds={selected}
      title={t('chat.multiModel.chooseModels')}
      variant="chat"
    />
  );
}
