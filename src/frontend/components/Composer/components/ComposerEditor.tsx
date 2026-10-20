import { Composer } from '@cherrystudio/ui/components';
import { type PropsWithChildren, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StyleProp, TextStyle } from 'react-native';

import { ComposerField } from './ComposerField';

/** Connects the shared editor layout to the app's field, paste handling and labels. */
export function ComposerEditor({
  active,
  attachmentMode = 'images',
  children,
  compactAccessory,
  fieldStyle,
  placeholder,
  testID,
}: PropsWithChildren<{
  active: boolean;
  attachmentMode?: 'images' | 'text-only';
  compactAccessory?: ReactNode;
  fieldStyle?: StyleProp<TextStyle>;
  placeholder?: string;
  testID: string;
}>) {
  const { t } = useTranslation();
  return (
    <Composer.Editor
      active={active}
      compactAccessory={compactAccessory}
      expandLabel={t('chat.input.action.expandEditor')}
      field={
        <ComposerField
          attachmentMode={attachmentMode}
          placeholder={placeholder}
          style={fieldStyle}
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
