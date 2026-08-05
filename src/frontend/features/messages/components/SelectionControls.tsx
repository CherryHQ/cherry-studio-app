import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';
import {
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionSource,
  useMessageSelectionState,
} from '@/frontend/components/messageTabs';
import { SelectionToolbar } from '@/frontend/components/messageTabs/SelectionToolbar/SelectionToolbar';

export function SelectionControls() {
  const { t } = useTranslation();
  const { showConfirmation, showMessage } = useAppAlert();
  const { scope } = useMessageScope();
  const source = useMessageSelectionSource(scope);
  const { exitEditing, toggleAll } = useMessageSelectionActions();
  const { isEditing, selectedIds } = useMessageSelectionState();
  const selectedCount = selectedIds.size;

  const handleToggleAll = useCallback(() => {
    toggleAll(source?.getAllIds() ?? []);
  }, [source, toggleAll]);

  const requestDelete = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0 || !source) {
      return;
    }

    showConfirmation({
      confirmLabel: t('common.delete'),
      description: t(source.copy.deleteMessage, { count: ids.length }),
      onConfirm: () => {
        exitEditing();
        void source.deleteSelected(ids).catch(() => {
          showMessage({ title: t(source.copy.deleteFailed) });
        });
      },
      role: 'destructive',
      title: t(source.copy.deleteTitle),
    });
  }, [exitEditing, selectedIds, showConfirmation, showMessage, source, t]);

  return (
    <>
      {isEditing ? (
        <SelectionToolbar
          isDeleting={false}
          onDelete={requestDelete}
          onToggleAll={handleToggleAll}
          selectedCount={selectedCount}
        />
      ) : null}
    </>
  );
}
