import { Button, Section, useAlert, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { Redirect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, TextInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import {
  AGENT_SYSTEM_PROMPT_PREFERENCES,
  DEFAULT_AGENT_SYSTEM_PROMPTS,
} from '@/shared/data/types/agentSystemPrompt';

import { SYSTEM_PROMPT_OPTIONS, type SystemPromptOption } from './systemPromptOptions';

export function SystemPromptEditScreen() {
  const params = useLocalSearchParams<{ promptId?: string }>();
  const id = getSingleRouteParam(params.promptId);
  const option = SYSTEM_PROMPT_OPTIONS.find((entry) => entry.id === id);

  return option ? (
    <SystemPromptEditor key={option.id} option={option} />
  ) : (
    <Redirect href="/settings/system-prompt" />
  );
}

function SystemPromptEditor({ option }: { option: SystemPromptOption }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const insets = useSafeAreaInsets();
  const mutedForeground = useThemeColor('muted-foreground');
  const [configured, setConfigured] = usePreference(AGENT_SYSTEM_PROMPT_PREFERENCES[option.id]);
  const defaultPrompt = DEFAULT_AGENT_SYSTEM_PROMPTS[option.id];
  const savedPrompt = configured ?? defaultPrompt;
  const [draft, setDraft] = useState(savedPrompt);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dirty = draft !== savedPrompt;

  usePreventRemove(!leaving && (saving || dirty), ({ repeat }) => {
    if (saving) return;
    Keyboard.dismiss();
    alert.confirm({
      confirmLabel: t('common.discard'),
      description: t('settings.systemPrompt.discardMessage'),
      onConfirm: () => {
        setLeaving(true);
        repeat();
      },
      role: 'destructive',
      title: t('settings.systemPrompt.discardTitle'),
    });
  });

  const persist = async (restoreDefault = false) => {
    if (saving || (!restoreDefault && !dirty)) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      const next = restoreDefault || draft === defaultPrompt ? null : draft;
      await setConfigured(next, { optimistic: false });
      setDraft(next ?? defaultPrompt);
      toast.show({
        label: t(
          restoreDefault ? 'settings.systemPrompt.restoredDefault' : 'settings.systemPrompt.saved',
        ),
        variant: 'success',
      });
    } catch {
      toast.show({ label: t('settings.systemPrompt.saveFailed'), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(draft);
      toast.show({ label: t('chat.tool.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('chat.tool.copyFailed'), variant: 'danger' });
    }
  };
  const actions: HeaderToolbarAction[] = [
    {
      key: 'copy-system-prompt',
      label: t('common.copy'),
      onPress: () => void copy(),
      type: 'label',
    },
    {
      disabled: saving || !dirty,
      key: 'save-system-prompt',
      label: t(saving ? 'common.saving' : 'common.save'),
      onPress: () => void persist(),
      testID: 'system-prompt-save',
      type: 'label',
    },
  ];

  return (
    <>
      <RouteHeader rightActions={actions} title={t(option.titleKey)} />
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
      >
        <Text className="px-1 text-muted-foreground text-sm">
          {t('settings.systemPrompt.description')}
        </Text>
        <Section footer={t(option.descriptionKey, { variable: '{{language}}' })}>
          <TextInput
            accessibilityLabel={t(option.titleKey)}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-48 px-4 py-3 text-base text-foreground"
            cursorColor={mutedForeground}
            editable={!saving}
            multiline
            onChangeText={setDraft}
            scrollEnabled={false}
            selectionColor={mutedForeground}
            testID="system-prompt-content"
            textAlignVertical="top"
            value={draft}
          />
        </Section>
        <Text className="px-1 text-muted-foreground text-xs">
          {t('settings.systemPrompt.emptyHint')}
        </Text>
        <Button
          disabled={saving || (configured === null && !dirty)}
          onPress={() => void persist(true)}
          testID="system-prompt-restore-default"
          variant="secondary"
        >
          {t('settings.systemPrompt.restoreDefault')}
        </Button>
      </KeyboardAwareScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: 16, paddingTop: 20 },
  scroll: { flex: 1 },
});
