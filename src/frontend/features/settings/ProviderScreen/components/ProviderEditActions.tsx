import SaveIcon from '@cherrystudio/app-icons/icons/save';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const actionButtonHeight = 48;
const actionBarMinBottomInset = 16;

/** What the form has to scroll clear of, so the last field stays reachable. */
export const providerEditActionsClearance = actionButtonHeight + actionBarMinBottomInset * 2;

export function ProviderEditActions({
  isDeleteDisabled,
  isSaveDisabled,
  isSaving,
  onDelete,
  onSave,
}: {
  isDeleteDisabled: boolean;
  isSaveDisabled: boolean;
  isSaving: boolean;
  onDelete: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute right-0 bottom-0 left-0 flex-row gap-3 px-6"
      pointerEvents="box-none"
      style={{ paddingBottom: Math.max(insets.bottom, actionBarMinBottomInset) }}
    >
      <Button
        className="h-12 flex-1 rounded-full"
        disabled={isDeleteDisabled}
        icon={<Trash2Icon />}
        onPress={onDelete}
        variant="destructive"
      >
        {t('settings.provider.deleteProvider')}
      </Button>
      <Button
        className="h-12 flex-1 rounded-full"
        disabled={isSaveDisabled}
        icon={<SaveIcon />}
        loading={isSaving}
        onPress={onSave}
      >
        {t('common.save')}
      </Button>
    </View>
  );
}
