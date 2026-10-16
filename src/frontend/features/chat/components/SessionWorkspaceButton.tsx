import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { Button, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { FileFolderPicker } from '@/frontend/components/FileFolderPicker';
import { useMutation, useQuery } from '@/frontend/data/hooks';

export function SessionWorkspaceButton({
  sessionId,
  disabled,
}: {
  sessionId: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const workspace = useQuery('/files/workspace', { query: { sessionId } });
  const change = useMutation('PATCH', '/files/workspace/:id', {
    refresh: ['/files/workspace'],
  });
  const select = async (folderId: string | null) => {
    try {
      await change.trigger({ params: { id: sessionId }, body: { folderId } });
      setIsOpen(false);
    } catch {
      toast.show({ label: t('library.actionFailed'), variant: 'danger' });
    }
  };
  return (
    <View className="max-w-full items-start gap-2">
      <Button
        variant="tonal"
        shape="pill"
        size="xs"
        icon={<FolderIcon />}
        disabled={disabled || change.isLoading || workspace.isLoading}
        onPress={() => setIsOpen(true)}
        accessibilityLabel={
          workspace.data
            ? t('workspace.named', { name: workspace.data.name })
            : t('workspace.choose')
        }
        testID="session-workspace-button"
      >
        <Button.Label numberOfLines={1}>
          {workspace.data ? workspace.data.name : t('workspace.choose')}
        </Button.Label>
        <ChevronDownIcon className="size-3 text-muted-foreground" />
      </Button>
      {workspace.data?.deletedAt !== null && workspace.data ? (
        <Text className="text-sm text-warning">{t('workspace.unavailable')}</Text>
      ) : null}
      {workspace.error ? (
        <Text className="text-sm text-muted-foreground">{t('library.loadFailed')}</Text>
      ) : null}
      {isOpen ? (
        <FileFolderPicker
          title={t('workspace.choose')}
          rootOption={t('workspace.none')}
          selectedFolderId={workspace.data?.id ?? null}
          isSaving={change.isLoading}
          onClose={() => setIsOpen(false)}
          onSelect={(folderId) => void select(folderId)}
        />
      ) : null}
    </View>
  );
}
