import { ContentState, Section, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { useToolTitle, type ToolMessagePart } from '@/frontend/components/Message';
import { useBackendModule } from '@/frontend/data';
import { useQuery } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { AgentMessageView } from '@/shared/contracts/agent';

import { getSendErrorLabelKey } from '../components/ChatInput/utils/sendErrorLabel';
import type { EditReplyTarget } from './editReplyRoute';
import { type ReplyEditorText, replyEditorItems } from './replyEditorItems';

/** Loads the answer once; the editor keeps its own drafts while the transcript moves on. */
export function EditReplyScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ sessionId?: string; messageId?: string }>();
  const sessionId = getSingleRouteParam(params.sessionId);
  const messageId = getSingleRouteParam(params.messageId);
  const { data, isLoading, isError, refetch } = useQuery('/agent-sessions/:sessionId/messages', {
    enabled: Boolean(sessionId && messageId),
    params: { sessionId: sessionId ?? '' },
    query: { ids: messageId ? [messageId] : undefined },
  });
  const [message, setMessage] = useState<AgentMessageView>();
  const loaded = data?.items[0];
  if (!message && loaded) setMessage(loaded);
  const title = t('chat.messageActions.edit');

  if (!message && isLoading)
    return (
      <>
        <RouteHeader title={title} />
        <View className="p-4">
          <ContentState.Loading title={t('chat.history.loading')} />
        </View>
      </>
    );
  if (!message || !sessionId || !messageId)
    return (
      <>
        <RouteHeader title={title} />
        <View className="p-4">
          <ContentState.Error
            {...(isError
              ? { primaryAction: { children: t('common.retry'), onPress: () => void refetch() } }
              : {})}
            title={t(isError ? 'chat.history.loadFailed' : 'chat.messageActions.editUnavailable')}
          />
        </View>
      </>
    );
  return <ReplyEditor message={message} target={{ sessionId, messageId }} />;
}

function ReplyEditor({ message, target }: { message: AgentMessageView; target: EditReplyTarget }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const agent = useBackendModule('agent');
  const insets = useSafeAreaInsets();
  const { answer, process } = useMemo(() => replyEditorItems(message), [message]);
  const texts = useMemo(
    () => [...process, ...answer].filter((item): item is ReplyEditorText => item.kind === 'text'),
    [answer, process],
  );
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const changed = texts.flatMap((item) => {
    const draft = drafts[item.key];
    return draft === undefined || draft === item.text
      ? []
      : [{ id: item.key, expectedText: item.text, text: draft }];
  });
  const canSave = changed.length > 0 && changed.every((part) => part.text.trim().length > 0);

  const save = async () => {
    if (!canSave || saving) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      await agent.editMessage({ ...target, parts: changed });
      toast.show({ label: t('chat.messageActions.editSaved'), variant: 'success' });
      router.back();
    } catch (error) {
      toast.show({
        label: t(getSendErrorLabelKey(error) ?? 'chat.messageActions.editFailed'),
        variant: 'danger',
      });
      setSaving(false);
    }
  };
  const actions: HeaderToolbarAction[] = [
    {
      disabled: !canSave || saving,
      key: 'save',
      label: t(saving ? 'common.saving' : 'common.save'),
      onPress: () => void save(),
      testID: 'edit-reply-save',
      type: 'label',
    },
  ];
  const segment = (item: ReplyEditorText) => (
    <ReplySegment
      editable={!saving}
      key={item.key}
      onChange={(text) => setDrafts((current) => ({ ...current, [item.key]: text }))}
      value={drafts[item.key] ?? item.text}
    />
  );

  return (
    <>
      <RouteHeader rightActions={actions} title={t('chat.messageActions.edit')} />
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
      >
        <Text className="px-1 pb-2 text-muted-foreground text-xs">
          {t('chat.messageActions.editDescription')}
        </Text>
        {process.length > 0 ? (
          <View className="gap-2 border-border-subtle border-b pb-4">
            {process.map((item) =>
              item.kind === 'text' ? (
                segment(item)
              ) : item.kind === 'tools' ? (
                <ToolsRow key={item.key} tools={item.tools} />
              ) : (
                <ProcessRow key={item.key} label={t('chat.reasoningStatus.thought')} />
              ),
            )}
          </View>
        ) : null}
        {process.length > 0 && answer.length > 0 ? (
          <Text className="px-1 pt-3 pb-1 text-muted-foreground text-xs">
            {t('chat.messageActions.editAnswer')}
          </Text>
        ) : null}
        {answer.map(segment)}
      </KeyboardAwareScrollView>
    </>
  );
}

/** One prose part, edited where it appears; the focused card is outlined. */
function ReplySegment({
  editable,
  onChange,
  value,
}: {
  editable: boolean;
  onChange: (text: string) => void;
  value: string;
}) {
  const { t } = useTranslation();
  const mutedForegroundColor = useThemeColor('muted-foreground');
  const [focused, setFocused] = useState(false);
  return (
    <Section
      contentClassName={
        focused ? 'border-[1.5px] border-foreground' : 'border-[1.5px] border-transparent'
      }
    >
      <TextInput
        accessibilityLabel={t('chat.messageActions.edit')}
        autoCorrect
        className="min-h-12 px-4 py-3 text-base text-foreground"
        cursorColor={mutedForegroundColor}
        editable={editable}
        multiline
        onBlur={() => setFocused(false)}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        scrollEnabled={false}
        selectionColor={mutedForegroundColor}
        textAlignVertical="top"
        value={value}
      />
    </Section>
  );
}

/** Reasoning and tool records stay as the transcript shows them collapsed: read-only. */
function ProcessRow({ label }: { label: string }) {
  return (
    <View className="min-h-7 justify-center px-1">
      <Text className="text-foreground-tertiary text-sm" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ToolsRow({ tools }: { tools: readonly ToolMessagePart[] }) {
  const { t } = useTranslation();
  const getTitle = useToolTitle();
  const titles = [...new Set(tools.map(getTitle))];
  return (
    <ProcessRow
      label={
        titles.length === 1
          ? titles[0]!
          : titles.length === 2
            ? t('chat.toolGroup.activities', { first: titles[0], second: titles[1] })
            : t('chat.toolGroup.activity')
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  scroll: { flex: 1 },
});
