import type { AppIconProps } from '@cherrystudio/app-icons';
import type { ImageSource } from 'expo-image';
import { type ComponentType, type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { ToolPartSheet, ToolPartTrigger } from './ToolPartSheet';

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View className="gap-1.5">
      <ToolPartTrigger
        icon={icon}
        imageSource={imageSource}
        isRunning={isRunning}
        onPress={() => setIsOpen(true)}
        statusText={statusText}
        statusTone={statusTone}
        testID={`${testIDPrefix}-trigger`}
        title={title}
      />
      {isOpen ? (
        <ToolPartSheet
          onClose={() => setIsOpen(false)}
          testID={`${testIDPrefix}-detail`}
          title={title}
        >
          {children}
        </ToolPartSheet>
      ) : null}
    </View>
  );
}
