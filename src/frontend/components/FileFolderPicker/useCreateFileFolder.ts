import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@/frontend/data/hooks';
import { ErrorCode, isDataApiError } from '@/shared/data/api/errors';

export function useCreateFileFolder(parentId: string | null) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const create = useMutation('POST', '/files/folders');

  function requestCreate() {
    alert.prompt({
      title: t('library.folders.create'),
      confirmLabel: t('common.save'),
      input: { accessibilityLabel: t('library.folders.name'), maxLength: 255, autoFocus: true },
      onConfirm: (name) => {
        if (!name.trim()) return;
        void create.trigger({ body: { parentId, name } }).catch((error: unknown) => {
          toast.show({
            label: t(
              isDataApiError(error) && error.code === ErrorCode.CONFLICT
                ? 'library.nameConflict'
                : 'library.actionFailed',
            ),
            variant: 'danger',
          });
        });
      },
    });
  }

  return { requestCreate, isCreating: create.isLoading };
}
