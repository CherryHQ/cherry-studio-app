import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '../../../utils';
import type { FilePreviewFile, FilePreviewVariant } from '../file-preview.types';
import { fileDisplayStem, fileVisualPreset } from '../utils/file-presentation';

/** Shared document artwork; FilePreview delegates the press to its caller. */
export function FileCardPreview({
  badge,
  file,
  variant,
}: {
  badge?: ReactNode;
  file: FilePreviewFile;
  variant: Exclude<FilePreviewVariant, 'thumbnail'>;
}) {
  const { icon: Icon, iconClassName } = fileVisualPreset(file);
  const filename = (
    <Text
      className={cn('w-full shrink text-foreground', variant === 'card' ? 'text-base' : 'text-sm')}
      ellipsizeMode="tail"
      numberOfLines={3}
    >
      {fileDisplayStem(file.displayName)}
    </Text>
  );
  const icon = (
    <View className="w-full shrink-0 flex-row items-center justify-between gap-2">
      <Icon className={cn('shrink-0', iconClassName, variant === 'card' ? 'size-7' : 'size-6')} />
      {badge ? <View className="min-w-0 shrink">{badge}</View> : null}
    </View>
  );

  return (
    <View
      className={cn(
        'flex-1 items-start justify-between gap-1',
        variant === 'card' ? 'bg-card p-4' : 'bg-secondary p-3',
      )}
    >
      {variant === 'card' ? filename : icon}
      {variant === 'card' ? icon : filename}
    </View>
  );
}
