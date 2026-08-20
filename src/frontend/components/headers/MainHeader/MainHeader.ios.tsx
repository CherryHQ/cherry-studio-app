import { Stack, useIsPreview } from 'expo-router';
import { useTranslation } from 'react-i18next';

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
          headerTitle: '',
          title: '',
          headerTransparent: true,
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t('navigation.openMenu')}
          icon="line.3.horizontal"
          onPress={openDrawer}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t('navigation.newChat')}
          icon="square.and.pencil"
          onPress={openNewTopic}
        />
        {assistant ? (
          <Stack.Toolbar.View>
            <MainHeaderAssistantButton assistant={assistant} onPress={openAssistant} />
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
    </>
  );
}
