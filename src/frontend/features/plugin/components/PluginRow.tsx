import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { Button, Section } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ManagedBadge } from '@/frontend/components/ManagedBadge';

const STATUS_CLASS_NAMES = {
  danger: 'shrink-0 text-sm text-error',
  default: 'shrink-0 text-sm text-muted-foreground',
  success: 'shrink-0 text-sm text-success',
} as const;

export type PluginRowStatus = { label: string; tone: keyof typeof STATUS_CLASS_NAMES };

export type PluginRowAddAction = { accessibilityLabel: string; onPress: () => void };

/**
 * A navigable entry shared by every group on the plugins page. Text is clamped to one line each so
 * rows keep one height. The trailing column holds either the entry's status or, for something not
 * yet added, a round add button that starts adding it directly. An entry the enterprise server
 * delivers carries the managed badge beside its title.
 */
export function PluginRow({
  addAction,
  description,
  icon,
  isManaged = false,
  onPress,
  status,
  testID,
  title,
}: {
  addAction?: PluginRowAddAction;
  description?: string;
  icon: ReactNode;
  isManaged?: boolean;
  onPress: () => void;
  status?: PluginRowStatus;
  testID?: string;
  title: string;
}) {
  const { t } = useTranslation();
  return (
    <Section.Item
      accessibilityLabel={[
        title,
        isManaged ? t('enterprise.managed.badge') : undefined,
        status?.label,
        description,
      ]
        .filter(Boolean)
        .join(', ')}
      description={
        description ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {description}
          </Text>
        ) : undefined
      }
      label={
        <View className="min-w-0 flex-row items-center gap-2">
          <Text className="shrink text-base font-medium text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {isManaged ? <ManagedBadge /> : null}
        </View>
      }
      leading={icon}
      onPress={onPress}
      showChevron={false}
      testID={testID}
      trailing={
        status ? (
          <Text className={STATUS_CLASS_NAMES[status.tone]} numberOfLines={1}>
            {status.label}
          </Text>
        ) : addAction ? (
          <Button
            accessibilityLabel={addAction.accessibilityLabel}
            icon={<PlusIcon />}
            onPress={addAction.onPress}
            shape="pill"
            size="xs"
            testID={testID ? `${testID}-add` : undefined}
            variant="secondary"
          />
        ) : undefined
      }
    />
  );
}
