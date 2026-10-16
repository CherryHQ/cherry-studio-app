import { Composer, Image, useComposerExpansion } from '@cherrystudio/ui/components';
import { type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  ComposerAttachmentStrip,
  ComposerEditor,
  ComposerEditorAccessories,
  useComposerMeta,
  useComposerPresentationState,
  useComposerState,
} from '@/frontend/components/Composer';
import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';

/** Reference images stay compact until editing, then use the ordinary attachment area. */
export function PaintingWorkspaceEditor({
  attachments,
  children,
  onAttachmentRemove,
  placeholder,
}: PropsWithChildren<{
  attachments: readonly ComposerAttachmentDraft[];
  onAttachmentRemove: (id: string) => void;
  placeholder: string;
}>) {
  const { draft } = useComposerState();
  const { isEditing } = useComposerPresentationState();
  const { inputRef } = useComposerMeta();
  const expansion = useComposerExpansion();
  // The board automatically attaches its focus; attachments alone must not open the editor.
  const active = isEditing || draft.length > 0 || (expansion?.state.isExpanded ?? false);
  const first = attachments[0];

  return (
    <>
      <ComposerEditorAccessories testID="painting-composer">
        {active && attachments.length > 0 ? (
          <Composer.Collapsible style={attachmentRowStyle}>
            <ComposerAttachmentStrip
              attachments={attachments}
              onAttachmentRemove={onAttachmentRemove}
            />
          </Composer.Collapsible>
        ) : null}
      </ComposerEditorAccessories>
      <ComposerEditor
        active={active}
        compactAccessory={
          first ? (
            <Pressable
              accessibilityLabel={first.name}
              accessibilityRole="button"
              className="size-8 overflow-hidden rounded-md bg-secondary active:opacity-70"
              hitSlop={6}
              onPress={() => inputRef.current?.focus()}
              testID="painting-composer-reference"
            >
              {first.status === 'ready' && first.uri ? (
                <Image
                  contentFit="cover"
                  source={first.uri}
                  style={{ height: '100%', width: '100%' }}
                />
              ) : null}
              {attachments.length > 1 ? (
                <View className="absolute right-0 bottom-0 min-w-4 items-center rounded-tl-sm bg-foreground px-1">
                  <Text className="font-semibold text-[10px] text-background">
                    {attachments.length}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : undefined
        }
        placeholder={placeholder}
        testID="painting-composer"
      >
        {children}
        <View className="ml-auto">
          <Composer.Send testID="painting-composer-send" />
        </View>
      </ComposerEditor>
    </>
  );
}

const attachmentRowStyle = { paddingBottom: 8, paddingTop: 2 } as const;
