import SquarePenIcon from '@cherrystudio/app-icons/icons/square-pen';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderAction } from '../components/HeaderAction';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';
import { MainHeaderAssistantButton, useMainHeaderAssistant } from './MainHeaderAssistantButton';

export function MainHeader() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const leadingAction = useRouteHeaderLeadingAction();
  const { assistant, openAssistant, openNewTopic } = useMainHeaderAssistant();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="bg-background-subtle">
        <View style={{ height: insets.top }} />
        <View className="h-11 flex-row items-center justify-between px-4">
          {/* The chat route is currently a drawer root, so the route policy
              resolves this leading action to the sidebar button. */}
          <HeaderAction action={leadingAction} />
          <View className="flex-row items-center gap-2">
            <HeaderAction
              action={{
                accessibilityLabel: t('navigation.newChat'),
                icon: SquarePenIcon,
                key: 'new-chat',
                onPress: openNewTopic,
                type: 'icon',
              }}
            />
            {assistant ? (
              <MainHeaderAssistantButton assistant={assistant} onPress={openAssistant} />
            ) : null}
          </View>
        </View>
      </View>
    </>
  );
}
