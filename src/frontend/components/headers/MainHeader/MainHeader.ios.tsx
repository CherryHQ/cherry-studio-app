import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { MainHeaderAssistantButton, useMainHeaderAssistant } from './MainHeaderAssistantButton';

export function MainHeader() {
  const { t } = useTranslation();
  const { assistant, openAssistant, openNewTopic } = useMainHeaderAssistant();

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: '',
          title: '',
          headerTransparent: true,
        }}
      />
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
