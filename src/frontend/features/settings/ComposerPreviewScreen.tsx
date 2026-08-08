import { Composer, type ComposerAttachment, Section, Switch } from '@cherrystudio/ui/components';
import { CameraIcon, FileIcon, GlobeIcon, ImagesIcon } from 'lucide-uniwind/png';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/frontend/components/headers';

type SentMessage = {
  attachmentCount: number;
  id: string;
  text: string;
};

/**
 * Live preview of `@cherrystudio/ui`'s `Composer` on device: the Storybook
 * stories run in Expo Go, which can't show how the bar behaves against the real
 * keyboard, safe area, and photo picker.
 */
export default function ComposerPreviewScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<readonly ComposerAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasStatusRow, setHasStatusRow] = useState(false);
  const [sentMessages, setSentMessages] = useState<readonly SentMessage[]>([]);

  // The picker is deliberately not wired up yet — this screen is here to judge
  // the morph and the menu's hit targets, so each item just records what it was.
  const recordMenuChoice = useCallback((choice: string) => {
    setSentMessages((current) => [
      { attachmentCount: 0, id: `menu-${current.length}`, text: choice },
      ...current,
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }, []);

  const send = useCallback(() => {
    setSentMessages((current) => [
      { attachmentCount: attachments.length, id: `${current.length}`, text: draft.trim() },
      ...current,
    ]);
    setDraft('');
    setAttachments([]);
  }, [attachments.length, draft]);

  return (
    <>
      <BackHeader title={t('settings.items.composerPreview')} />
      <View className="flex-1">
        <ScrollView
          alwaysBounceVertical={false}
          className="flex-1"
          contentContainerClassName="gap-6 px-4 py-5"
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Section footer={t('settings.composerPreview.description')}>
            <Section.Item
              label={t('settings.composerPreview.streaming')}
              trailing={
                <Switch
                  accessibilityLabel={t('settings.composerPreview.streaming')}
                  onValueChange={setIsStreaming}
                  value={isStreaming}
                />
              }
            />
            {/* The picker is not wired up, so this is the only way to watch the
                surface swell and shrink by hand on a device. */}
            <Section.Item
              label={t('settings.composerPreview.statusRow')}
              trailing={
                <Switch
                  accessibilityLabel={t('settings.composerPreview.statusRow')}
                  onValueChange={setHasStatusRow}
                  value={hasStatusRow}
                />
              }
            />
          </Section>

          <Section title={t('settings.composerPreview.sentMessages')}>
            {sentMessages.length === 0 ? (
              <Section.Item label={t('settings.composerPreview.noMessages')} />
            ) : (
              sentMessages.map((message) => (
                <Section.Item
                  description={
                    message.attachmentCount > 0
                      ? t('settings.composerPreview.attachmentCount', {
                          count: message.attachmentCount,
                        })
                      : undefined
                  }
                  key={message.id}
                  label={message.text || t('settings.composerPreview.noText')}
                />
              ))
            )}
          </Section>
        </ScrollView>

        {/* With the keyboard open the safe-area padding is already covered by
            the keyboard itself, so the sticky offset cancels it out. */}
        <KeyboardStickyView offset={{ opened: insets.bottom }}>
          <View className="px-3 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
            <Composer
              attachments={attachments}
              labels={{
                removeAttachment: t('common.remove'),
                send: t('chat.input.action.sendMessage'),
                stop: t('chat.input.action.stopGenerating'),
              }}
              onAttachmentRemove={removeAttachment}
              onChangeText={setDraft}
              onSend={send}
              onStop={() => setIsStreaming(false)}
              streaming={isStreaming}
              testID="composer"
              value={draft}
            >
              <Composer.Collapsible testID="composer-status">
                {hasStatusRow ? (
                  <View className="flex-row items-center gap-2 self-start rounded-full bg-primary/10 px-3 py-1.5">
                    <GlobeIcon className="size-4 text-primary" strokeWidth={2} />
                    <Text className="text-sm text-primary">
                      {t('settings.composerPreview.statusRowText')}
                    </Text>
                  </View>
                ) : null}
              </Composer.Collapsible>
              <Composer.Attachments />
              <Composer.Input placeholder={t('chat.inputPlaceholder')} testID="composer-input" />
              {/* The tools are the caller's: nothing but the field is built in,
                  and the send button pins itself right however many are added. */}
              <Composer.Toolbar>
                <Composer.Menu
                  accessibilityLabel={t('chat.media.photos')}
                  testID="composer-morph-menu"
                >
                  <Composer.Menu.Item
                    icon={<CameraIcon className="size-5 text-foreground" strokeWidth={2} />}
                    label={t('chat.media.camera')}
                    onPress={() => recordMenuChoice(t('chat.media.camera'))}
                  />
                  <Composer.Menu.Item
                    icon={<ImagesIcon className="size-5 text-foreground" strokeWidth={2} />}
                    label={t('chat.media.photos')}
                    onPress={() => recordMenuChoice(t('chat.media.photos'))}
                  />
                  <Composer.Menu.Item
                    icon={<FileIcon className="size-5 text-foreground" strokeWidth={2} />}
                    label={t('chat.media.file')}
                    onPress={() => recordMenuChoice(t('chat.media.file'))}
                  />
                </Composer.Menu>
                <Composer.Send testID="composer-send" />
              </Composer.Toolbar>
            </Composer>
          </View>
        </KeyboardStickyView>
      </View>
    </>
  );
}
