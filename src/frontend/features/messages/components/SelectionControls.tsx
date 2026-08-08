import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useAlert } from '@/frontend/components/AlertProvider';
import {
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionSource,
  useMessageSelectionState,
} from '@/frontend/components/messageTabs';
import { SelectionToolbar } from '@/frontend/components/messageTabs/SelectionToolbar/SelectionToolbar';

export function SelectionControls() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { scope } = useMessageScope();
  const source = useMessageSelectionSource(scope);
  const { beginDeletion, finishDeletion, toggleAll } = useMessageSelectionActions();
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
