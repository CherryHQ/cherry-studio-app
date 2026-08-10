import {
  BracesIcon,
  FileIcon,
  FileTextIcon,
  SquareArrowOutUpRightIcon,
  VideoIcon,
  WrenchIcon,
} from 'lucide-uniwind/png';
import { Pressable, Text, View } from 'react-native';

export type PartPlaceholderIcon = 'data' | 'document' | 'file' | 'link' | 'tool' | 'video';

type PartPlaceholderProps = {
  description?: string;
  icon: PartPlaceholderIcon;
  label: string;
  onPress?: () => void;
};

export function PartPlaceholder({ description, icon, label, onPress }: PartPlaceholderProps) {
  const hasDescription = Boolean(description);
  const iconClassName = `${hasDescription ? 'mt-0.5 ' : ''}size-4 text-foreground`;
  const containerClassName = `flex-row gap-2 rounded-lg border border-border bg-secondary p-3 ${
    hasDescription ? '' : 'items-center'
  }`;
  const iconElement =
    icon === 'data' ? (
      <BracesIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'document' ? (
      <FileTextIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'file' ? (
      <FileIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'link' ? (
      <SquareArrowOutUpRightIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'tool' ? (
      <WrenchIcon className={iconClassName} strokeWidth={2} />
    ) : (
      <VideoIcon className={iconClassName} strokeWidth={2} />
    );

  const content = (
    <>
      {iconElement}
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold text-foreground text-base" selectable>
          {label}
        </Text>
        {description ? (
          <Text className="text-foreground text-base" selectable>
            {description}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="link"
        className={`${containerClassName} active:opacity-70`}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View className={containerClassName}>{content}</View>;
}
