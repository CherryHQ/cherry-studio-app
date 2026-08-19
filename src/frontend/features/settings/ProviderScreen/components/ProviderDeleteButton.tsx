import { Trash2Icon } from '@cherrystudio/app-icons';
import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const deleteButtonHeight = 48;
const deleteButtonMinBottomInset = 16;

/** What the form has to scroll clear of, so the last field stays reachable. */
export const providerDeleteButtonClearance = deleteButtonHeight + deleteButtonMinBottomInset * 2;

/**
 * Deleting the provider, floating over the settings form the way the sidebar's
 * new-chat button floats over the topic list: a pill centred at the bottom of
 * the screen, with the form scrolling underneath it.
 *
 * It lives here rather than in the detail page's bottom bar because this is the
 * screen about the provider itself — the detail page's bar is about its models.
 */
export function ProviderDeleteButton({
  isDisabled,
  onPress,
}: {
  isDisabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute right-0 bottom-0 left-0 items-center"
      pointerEvents="box-none"
      style={{ paddingBottom: Math.max(insets.bottom, deleteButtonMinBottomInset) }}
    >
      <Button
        className="h-12 rounded-full px-6 android:shadow-lg"
        disabled={isDisabled}
        icon={<Trash2Icon />}
        onPress={onPress}
        variant="destructive"
      >
        {t('settings.provider.deleteProvider')}
      </Button>
    </View>
  );
}
