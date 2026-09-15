import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useOpenFileEntry, useShareFile } from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';

export function HtmlConversionResult({ file }: { file: ResolvedFile }) {
  const { t } = useTranslation();
  const { openFileEntry } = useOpenFileEntry();
  const { isSharing, share } = useShareFile(file);
  return (
    <View className="gap-3 px-4 py-3">
      <Text className="text-sm text-foreground" numberOfLines={2}>
        {file.entry.filename}
      </Text>
      <View className="flex-row gap-3">
        <Button onPress={() => openFileEntry(file)} variant="secondary">
          {t('fileViewer.conversion.open')}
        </Button>
        <Button disabled={isSharing} onPress={() => void share()} variant="secondary">
          {t('fileViewer.share')}
        </Button>
      </View>
    </View>
  );
}
