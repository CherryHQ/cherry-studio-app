import {
  BracesIcon,
  FileIcon,
  FileTextIcon,
  SquareArrowOutUpRightIcon,
  StepForwardIcon,
  VideoIcon,
  WrenchIcon,
} from 'lucide-uniwind';
import { Text, View } from 'react-native';

export type PartPlaceholderIcon = 'data' | 'document' | 'file' | 'link' | 'step' | 'tool' | 'video';

type PartPlaceholderProps = {
  description?: string;
  icon: PartPlaceholderIcon;
  label: string;
};

export function PartPlaceholder({ description, icon, label }: PartPlaceholderProps) {
  const iconClassName = 'mt-0.5 size-4 text-default-foreground';
  const iconElement =
    icon === 'data' ? (
      <BracesIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'document' ? (
      <FileTextIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'file' ? (
      <FileIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'link' ? (
      <SquareArrowOutUpRightIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'step' ? (
      <StepForwardIcon className={iconClassName} strokeWidth={2} />
    ) : icon === 'tool' ? (
      <WrenchIcon className={iconClassName} strokeWidth={2} />
    ) : (
      <VideoIcon className={iconClassName} strokeWidth={2} />
    );

  return (
    <View className="flex-row gap-2 rounded-lg border border-border bg-surface-secondary p-3">
      {iconElement}
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold text-default-foreground text-sm" selectable>
          {label}
        </Text>
        {description ? (
          <Text className="text-default-foreground text-sm leading-5" selectable>
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
