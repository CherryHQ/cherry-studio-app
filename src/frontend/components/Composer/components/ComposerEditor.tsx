import { Composer, type ComposerInputProps } from '@cherrystudio/ui/components';
import { type PropsWithChildren, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StyleProp, TextStyle } from 'react-native';

import { useComposerPresentationState } from '../context/ComposerProvider';
import { ComposerField } from './ComposerField';

/** Connects the shared editor layout to the app's field, paste handling and labels. */
export function ComposerEditor({
  active,
  attachmentMode = 'images',
  children,
  compactAccessory,
  fieldStyle,
  onLinkPress,
  onReturnSubmit,
  placeholder,
  submitOnReturn,
  testID,
}: PropsWithChildren<{
  active: boolean;
  attachmentMode?: 'images' | 'text-only';
  compactAccessory?: ReactNode;
  fieldStyle?: StyleProp<TextStyle>;
  onLinkPress?: ComposerInputProps['onLinkPress'];
  onReturnSubmit?: (markdown: string) => void;
  placeholder?: string;
  submitOnReturn?: boolean;
  testID: string;
}>) {
  const { t } = useTranslation();
  // Set inside this field's keyboard start, so the editor changes shape with the keyboard.
  const { keyboardTracking } = useComposerPresentationState();
  return (
    <Composer.Editor
      active={active}
      activeSignal={keyboardTracking}
      compactAccessory={compactAccessory}
      expandLabel={t('chat.input.action.expandEditor')}
      field={
        <ComposerField
          attachmentMode={attachmentMode}
          onLinkPress={onLinkPress}
          onReturnSubmit={onReturnSubmit}
          placeholder={placeholder}
          style={fieldStyle}
          submitOnReturn={submitOnReturn}
          testID={`${testID}-input`}
        />
      }
      testID={`${testID}-expand`}
    >
      {children}
    </Composer.Editor>
  );
}

export function ComposerEditorAccessories({
  children,
  testID,
}: PropsWithChildren<{ testID: string }>) {
  const { t } = useTranslation();
  return (
    <Composer.EditorAccessories
      collapseLabel={t('chat.input.action.collapseEditor')}
      testID={`${testID}-collapse`}
    >
      {children}
    </Composer.EditorAccessories>
  );
}
