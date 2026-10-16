import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@/frontend/data/hooks';
import type { TrashItem } from '@/shared/data/api/schemas/trash';

const refresh = ['/trash', '/trash/summary'];

/** Shared user decisions for the trash page and storage settings. */
export function useTrashActions() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const restoreMutation = useMutation('POST', '/trash/:id/restore', { refresh });
  const deleteMutation = useMutation('DELETE', '/trash/:id', { refresh });
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
    return perform(() => restoreMutation.trigger({ params: { id: item.id } }), t('trash.restored'));
  }

  function requestDelete(item: TrashItem) {
    alert.confirm({
      title: t('trash.deleteTitle'),
      description: t('trash.deleteDescription', { name: item.title }),
      confirmLabel: t('trash.deletePermanently'),
      role: 'destructive',
      onConfirm: () => {
        void perform(() => deleteMutation.trigger({ params: { id: item.id } }), t('trash.deleted'));
      },
    });
  }

  function requestEmpty() {
    alert.confirm({
      title: t('trash.emptyAll'),
      description: t('trash.emptyDescription'),
      confirmLabel: t('trash.deletePermanently'),
      role: 'destructive',
      onConfirm: () => {
        void perform(() => emptyMutation.trigger(), t('trash.emptied'));
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
