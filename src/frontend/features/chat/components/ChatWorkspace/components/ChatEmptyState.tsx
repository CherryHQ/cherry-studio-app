import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';

type ChatEmptyStateProps = {
  contentBottomInset: number;
};

/** Empty chat surface shown until the user selects an Agent or opens a Session. */
export function ChatEmptyState({ contentBottomInset }: ChatEmptyStateProps) {
  const { t } = useTranslation();
  const openProviderSetup = useOpenProviderSetup('/agents/new');

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ paddingBottom: contentBottomInset }}
    >
      <Text className="text-center font-semibold text-foreground text-lg">
        {t('chat.newSession.title')}
      </Text>
      <Text className="mt-2 text-center text-foreground text-sm" numberOfLines={3}>
        {t('chat.newSession.description')}
      </Text>
      <Button className="mt-5" onPress={openProviderSetup}>
        {t('modelPicker.addProvider')}
      </Button>
    </View>
  );
}
