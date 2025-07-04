import React from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Slider, XStack, YStack } from 'tamagui'

import { SettingGroup, SettingGroupTitle, SettingRow, SettingRowTitle } from '@/components/settings'
import { CustomSwitch } from '@/components/ui/Switch'

interface GeneralSettingsProps {
  searchWithDates: boolean
  onSearchWithDatesChange: (value: boolean) => void
  overrideSearchService: boolean
  onOverrideSearchServiceChange: (value: boolean) => void
  searchCount: number
  onSearchCountChange: (value: number[]) => void
  contentLimit: string
  onContentLimitChange: (value: string) => void
}

export default function GeneralSettings({
  searchWithDates,
  onSearchWithDatesChange,
  overrideSearchService,
  onOverrideSearchServiceChange,
  searchCount,
  onSearchCountChange,
  contentLimit,
  onContentLimitChange
}: GeneralSettingsProps) {
  const { t } = useTranslation()

  return (
    <YStack gap={8} paddingVertical={8}>
      <SettingGroupTitle>{t('settings.general.title')}</SettingGroupTitle>
      <SettingGroup>
        <SettingRow>
          <SettingRowTitle>{t('settings.websearch.searchWithDates')}</SettingRowTitle>
          <CustomSwitch checked={searchWithDates} onCheckedChange={onSearchWithDatesChange} />
        </SettingRow>
        <SettingRow>
          <SettingRowTitle>{t('settings.websearch.overrideSearchService')}</SettingRowTitle>
          <CustomSwitch checked={overrideSearchService} onCheckedChange={onOverrideSearchServiceChange} />
        </SettingRow>
        <SettingRow>
          <YStack gap={10} flex={1}>
            <XStack justifyContent="space-between">
              <SettingRowTitle>{t('settings.websearch.searchCount')}</SettingRowTitle>
              <SettingRowTitle>{searchCount}</SettingRowTitle>
            </XStack>
            <Slider defaultValue={[searchCount]} min={1} max={20} step={1} onValueChange={onSearchCountChange}>
              <Slider.Track backgroundColor="rgba(0, 185, 107, 0.2)">
                <Slider.TrackActive backgroundColor="rgba(0, 185, 107, 1)" />
              </Slider.Track>
              <Slider.Thumb backgroundColor="rgba(0, 185, 107, 1)" borderWidth={0} size={16} index={0} circular />
            </Slider>
          </YStack>
        </SettingRow>
        <SettingRow>
          <SettingRowTitle>{t('settings.websearch.contentLengthLimit')}</SettingRowTitle>
          <Input
            height={21}
            minWidth={52}
            paddingVertical={2}
            value={contentLimit}
            onChangeText={onContentLimitChange}
          />
        </SettingRow>
      </SettingGroup>
    </YStack>
  )
}
