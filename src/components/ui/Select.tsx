import { ChevronRight } from '@tamagui/lucide-icons'
import React from 'react'
import { Text, XStack } from 'tamagui'
import * as DropdownMenu from 'zeego/dropdown-menu'

interface SelectOptionItem<T = any> {
  label: string
  value: string
  data?: T
}

interface SelectOptionGroup<T = any> {
  label: string
  title?: string
  options: SelectOptionItem<T>[]
}

interface ISelectProps<T = any> {
  value: string | undefined
  onValueChange: (value: string, item?: SelectOptionItem<T>) => void
  selectOptions: SelectOptionGroup<T>[]
  placeholder: string
  width?: string | number
}

export function ISelect<T = any>({
  value,
  onValueChange,
  selectOptions,
  placeholder,
  width = '100%'
}: ISelectProps<T>) {
  const findSelectedItem = (selectedValue: string): SelectOptionItem<T> | undefined => {
    for (const group of selectOptions) {
      const item = group.options.find(option => option.value === selectedValue)
      if (item) return item
    }

    return undefined
  }

  const handleValueChange = (newValue: string) => {
    const selectedItem = findSelectedItem(newValue)
    onValueChange(newValue, selectedItem)
  }

  const [selectedDisplayInfo, setSelectedDisplayInfo] = React.useState<{
    groupLabel: string
    itemLabel: string
  } | null>(null)

  React.useEffect(() => {
    if (value) {
      for (const group of selectOptions) {
        const item = group.options.find(option => option.value === value)

        if (item) {
          setSelectedDisplayInfo({ groupLabel: group.label, itemLabel: item.label })
          return
        }
      }
    }

    setSelectedDisplayInfo(null)
  }, [value, selectOptions])

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <XStack
          width={width}
          borderWidth={0}
          paddingVertical={8}
          alignItems="center"
          justifyContent="space-between"
          gap={10}>
          <XStack flex={1} alignItems="center" overflow="hidden" justifyContent="space-between">
            {selectedDisplayInfo ? (
              <>
                <Text flexShrink={1} numberOfLines={1} ellipsizeMode="tail">
                  {selectedDisplayInfo.groupLabel}
                </Text>
                <Text flexShrink={0} numberOfLines={1} maxWidth="60%" ellipsizeMode="tail">
                  {selectedDisplayInfo.itemLabel}
                </Text>
              </>
            ) : (
              <Text flex={1} numberOfLines={1} ellipsizeMode="tail">
                {placeholder}
              </Text>
            )}
          </XStack>
          <ChevronRight size={16} />
        </XStack>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        {selectOptions.map((group, groupIndex) => (
          <DropdownMenu.Group key={group.title || group.label || groupIndex}>
            {group.label && group.label.trim() !== '' && <DropdownMenu.Label>{group.label}</DropdownMenu.Label>}
            {group.options.map(item => (
              <DropdownMenu.Item key={item.value} onSelect={() => handleValueChange(item.value)}>
                <DropdownMenu.ItemTitle>{item.label}</DropdownMenu.ItemTitle>
                {value === item.value && (
                  // todo
                  <DropdownMenu.ItemIcon
                    ios={{
                      name: 'checkmark',
                      pointSize: 16
                    }}></DropdownMenu.ItemIcon>
                )}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Group>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
