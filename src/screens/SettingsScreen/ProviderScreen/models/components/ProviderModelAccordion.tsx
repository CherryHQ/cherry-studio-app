import { Accordion } from 'heroui-native/accordion';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Model } from '@/data/types/model';

import { getModelGroupLabel, type ProviderModelGroup } from '../utils/providerModelGroups';

export function ProviderModelAccordion({
  displayedExpandedValues,
  groups,
  onExpandedValuesChange,
}: {
  displayedExpandedValues: string[];
  groups: ProviderModelGroup[];
  onExpandedValuesChange: (values: string[]) => void;
}) {
  const { t } = useTranslation();

  return (
    <Accordion
      className="bg-surface-secondary"
      hideSeparator
      isCollapsible
      onValueChange={onExpandedValuesChange}
      selectionMode="multiple"
      value={displayedExpandedValues}
    >
      {groups.map((group) => (
        <Accordion.Item key={group.groupName} value={group.groupName}>
          <Accordion.Trigger className="min-h-11 px-3 py-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Text className="font-medium text-default-foreground text-sm">
                {getModelGroupLabel(group.groupName, t)}
              </Text>
              <Text className="text-default-foreground text-sm">{group.models.length}</Text>
            </View>
            <Accordion.Indicator iconProps={{ size: 18 }} />
          </Accordion.Trigger>
          <Accordion.Content className="px-0 pb-0">
            {group.models.map((model) => (
              <ModelRow key={model.id} model={model} />
            ))}
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function ModelRow({ model }: { model: Model }) {
  return (
    <View className="min-h-12 justify-center bg-surface-secondary px-4 py-3">
      <Text className="text-base text-foreground" numberOfLines={1}>
        {model.name}
      </Text>
    </View>
  );
}
