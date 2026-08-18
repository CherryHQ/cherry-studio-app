import type { AppIconProps } from '@cherrystudio/app-icons';
import { MessagePart } from '@cherrystudio/ui/components';
import type { ImageSource } from 'expo-image';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type ToolPartDisclosureProps = {
  children: ReactNode;
  icon?: ComponentType<AppIconProps>;
  imageSource?: ImageSource | number;
  isRunning: boolean;
  statusText?: string;
  statusTone?: 'danger' | 'default' | 'warning';
  testIDPrefix: string;
  title: string;
};

export function ToolPartDisclosure({
  children,
  icon,
  imageSource,
  isRunning,
  statusText,
  statusTone,
  testIDPrefix,
  title,
}: ToolPartDisclosureProps) {
  const { t } = useTranslation();

  return (
    <MessagePart.Tool
      closeAccessibilityLabel={t('common.close')}
      icon={icon}
      imageSource={imageSource}
      state={isRunning ? 'running' : 'complete'}
      statusText={statusText}
      statusTone={statusTone}
      testID={testIDPrefix}
      title={title}
    >
      {children}
    </MessagePart.Tool>
  );
}
