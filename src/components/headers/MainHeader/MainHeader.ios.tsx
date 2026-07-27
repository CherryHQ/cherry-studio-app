import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { MainHeaderAssistantButton, useMainHeaderAssistant } from './MainHeaderAssistantButton';

export function MainHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const { assistant, openAssistant } = useMainHeaderAssistant();

  const openNewTopic = useCallback(() => {
    router.setParams({ topicId: undefined });
  }, [router]);

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
