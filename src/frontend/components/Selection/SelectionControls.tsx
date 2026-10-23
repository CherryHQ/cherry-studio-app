import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { areAllSelected } from './selection';
import { useSelectionActions, useSelectionSource, useSelectionState } from './SelectionProvider';
import { SelectionToolbar } from './SelectionToolbar/SelectionToolbar';
import type { SelectionToolbarAction } from './SelectionToolbar/types';

// Ready-made edit-mode toolbar: wires the shared SelectionProvider to the
// visual toolbar for the source registered under `scope`, including the
// confirm-delete dialog.
export function SelectionControls({
  scope,
  actions,
  isPending = false,
}: {
  scope: string;
  actions?: readonly SelectionToolbarAction[];
  isPending?: boolean;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const source = useSelectionSource(scope);
  const { beginDeletion, finishDeletion, toggleAll } = useSelectionActions();
  const { isEditing, selectedIds } = useSelectionState();
  const selectedCount = selectedIds.size;
  const allIds = source?.getAllIds() ?? [];

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
            toast.show({ label: t(source.copy.deleteFailed), variant: 'danger' });
          })
          .finally(() => finishDeletion(scope, ids));
      },
      role: 'destructive',
      title: t(source.copy.deleteTitle),
    });
  }, [alert, beginDeletion, finishDeletion, scope, selectedIds, source, t, toast]);

  return (
    <>
      {isEditing ? (
        <SelectionToolbar
          actions={actions}
          allSelected={areAllSelected(selectedIds, allIds)}
          isPending={isPending}
          onDelete={requestDelete}
          onToggleAll={handleToggleAll}
          selectedCount={selectedCount}
          selectableCount={allIds.length}
        />
      ) : null}
    </>
  );
}
