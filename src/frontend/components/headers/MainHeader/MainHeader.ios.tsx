import { MenuIcon, SquarePenIcon } from '@cherrystudio/app-icons';
import { Stack, useIsPreview } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderAction } from '../components/HeaderAction';
import { headerScreenOptions } from '../headerScreenOptions';
import { useOpenDrawer } from '../useOpenDrawer';
import { MainHeaderAssistantButton, useMainHeaderAssistant } from './MainHeaderAssistantButton';

export function MainHeader() {
  const isPreview = useIsPreview();
  const { t } = useTranslation();
  const openDrawer = useOpenDrawer();
  const { assistant, openAssistant, openNewTopic } = useMainHeaderAssistant();

  if (isPreview) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...headerScreenOptions,
          headerTitle: '',
          title: '',
          headerTransparent: true,
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <HeaderAction
            action={{
              accessibilityLabel: t('navigation.openMenu'),
              icon: MenuIcon,
              key: 'open-drawer',
              onPress: openDrawer,
              type: 'icon',
            }}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View hidesSharedBackground>
          <HeaderAction
            action={{
              accessibilityLabel: t('navigation.newChat'),
              icon: SquarePenIcon,
              key: 'new-chat',
              onPress: openNewTopic,
              type: 'icon',
            }}
          />
        </Stack.Toolbar.View>
        {assistant ? (
          <Stack.Toolbar.View hidesSharedBackground>
            <MainHeaderAssistantButton assistant={assistant} onPress={openAssistant} />
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
    </>
  );
}
