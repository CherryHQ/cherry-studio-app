import { useAlert } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useSelectionActions, useSelectionSource, useSelectionState } from './SelectionProvider';
import { SelectionToolbar } from './SelectionToolbar/SelectionToolbar';

// Ready-made edit-mode toolbar: wires the shared SelectionProvider to the
// visual toolbar for the source registered under `scope`, including the
// confirm-delete dialog.
export function SelectionControls({ scope }: { scope: string }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const source = useSelectionSource(scope);
  const { beginDeletion, finishDeletion, toggleAll } = useSelectionActions();
  const { isEditing, selectedIds } = useSelectionState();
  const selectedCount = selectedIds.size;

  const handleToggleAll = useCallback(() => {
    toggleAll(source?.getAllIds() ?? []);
  }, [source, toggleAll]);

  const requestDelete = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0 || !source) {
      return;
    }

    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t(source.copy.deleteMessage, { count: ids.length }),
      onConfirm: () => {
        beginDeletion(scope, ids);
        void source
          .deleteSelected(ids)
          .catch(() => {
            alert.show({ title: t(source.copy.deleteFailed) });
          })
          .finally(() => finishDeletion(scope, ids));
      },
      role: 'destructive',
      title: t(source.copy.deleteTitle),
    });
  }, [alert, beginDeletion, finishDeletion, scope, selectedIds, source, t]);

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
