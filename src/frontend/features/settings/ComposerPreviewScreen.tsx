import { Composer, type ComposerAttachment, Section, Switch } from '@cherrystudio/ui/components';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
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
  const [sentMessages, setSentMessages] = useState<readonly SentMessage[]>([]);

  const pickPhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      selectionLimit: 4,
    });

    if (result.canceled) {
      return;
    }

    setAttachments((current) => {
      const seen = new Set(current.map((attachment) => attachment.uri));
      const additions = result.assets
        .filter((asset) => !seen.has(asset.uri))
        .map((asset) => ({
          id: asset.assetId ?? asset.uri,
          name: asset.fileName ?? undefined,
          uri: asset.uri,
        }));

      return [...current, ...additions];
    });
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
                addAttachment: t('chat.media.photos'),
                removeAttachment: t('common.remove'),
                send: t('chat.input.action.sendMessage'),
                stop: t('chat.input.action.stopGenerating'),
              }}
              onAttachmentRemove={removeAttachment}
              onChangeText={setDraft}
              onLeadingPress={pickPhotos}
              onSend={send}
              onStop={() => setIsStreaming(false)}
              placeholder={t('chat.inputPlaceholder')}
              streaming={isStreaming}
              value={draft}
            />
          </View>
        </KeyboardStickyView>
      </View>
    </>
  );
}
