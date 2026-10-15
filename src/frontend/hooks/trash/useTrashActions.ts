import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@/frontend/data/hooks';
import type { TrashFilter, TrashItem } from '@/shared/data/api/schemas/trash';

const refresh = [
  '/trash',
  '/trash/summary',
  '/agent-sessions',
  '/search/entities',
  '/search/contents',
];

/** Shared user decisions for the trash page and storage settings. */
export function useTrashActions() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const restoreMutation = useMutation('POST', '/trash/:kind/:id/restore', { refresh });
  const deleteMutation = useMutation('DELETE', '/trash/:kind/:id', { refresh });
  const emptyMutation = useMutation('DELETE', '/trash', { refresh });

  async function perform(operation: () => Promise<unknown>, success: string) {
    try {
      await operation();
      toast.show({ label: success, variant: 'success' });
    } catch {
      toast.show({ label: t('trash.actionFailed'), variant: 'danger' });
    }
  }

  function restore(item: TrashItem) {
    return perform(
      () => restoreMutation.trigger({ params: { kind: item.kind, id: item.id } }),
      t('trash.restored'),
    );
  }

  function requestDelete(item: TrashItem) {
    alert.confirm({
      title: t('trash.deleteTitle'),
      description: t('trash.deleteDescription', { name: item.title || t('session.list.untitled') }),
      confirmLabel: t('trash.deletePermanently'),
      role: 'destructive',
      onConfirm: () => {
        void perform(
          () => deleteMutation.trigger({ params: { kind: item.kind, id: item.id } }),
          t('trash.deleted'),
        );
      },
    });
  }

  function requestEmpty(kind: TrashFilter) {
    const category = t(
      kind === 'all' ? 'trash.all' : kind === 'file' ? 'trash.files' : 'trash.sessions',
    );
    alert.confirm({
      title: t(kind === 'all' ? 'trash.emptyAll' : 'trash.emptyCategory', { category }),
      description: t('trash.emptyDescription', { category }),
      confirmLabel: t('trash.deletePermanently'),
      role: 'destructive',
      onConfirm: () => {
        void perform(() => emptyMutation.trigger({ query: { kind } }), t('trash.emptied'));
      },
    });
  }

  return {
    restore,
    requestDelete,
    requestEmpty,
    isPending: restoreMutation.isLoading || deleteMutation.isLoading || emptyMutation.isLoading,
  };
}
