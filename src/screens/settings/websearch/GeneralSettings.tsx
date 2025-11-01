import React from 'react'
import { useTranslation } from 'react-i18next'

import { Group, GroupTitle, Row, TextField, Text, YStack } from '@/componentsV2'
import { useWebsearchSettings } from '@/hooks/useWebsearchProviders'
import { Switch } from 'heroui-native'

export default function GeneralSettings() {
  const { t } = useTranslation()

  const {
    searchWithDates,
    overrideSearchService,
    searchCount,
    contentLimit,
    setSearchWithDates,
    setOverrideSearchService,
    setSearchCount,
    setContentLimit
  } = useWebsearchSettings()

  // Handler for search count change
  const handleSearchCountChange = (value: string) => {
    const numValue = parseInt(value, 10)
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 20) {
      setSearchCount(numValue).catch(console.error)
    } else if (value === '') {
      setSearchCount(1).catch(console.error)
    }
  }

  // Handler for content limit change
  const handleContentLimitChange = (value: string) => {
    const numValue = parseInt(value, 10)

    if (!isNaN(numValue)) {
      setContentLimit(numValue).catch(console.error)
    } else if (value === '') {
      setContentLimit(undefined).catch(console.error)
    }
  }

  return (
    <YStack className="gap-2 py-2">
      <GroupTitle>{t('settings.general.title')}</GroupTitle>
      <Group>
        <Row>
          <Text>{t('settings.websearch.contentLengthLimit')}</Text>
          <TextField className="max-w-20 flex-1">
            <TextField.Input value={contentLimit?.toString() || ''} onChangeText={handleContentLimitChange} />
          </TextField>
        </Row>
        <Row>
          <Text>{t('settings.websearch.searchCount')}</Text>
          <TextField className="max-w-20 flex-1">
            <TextField.Input value={searchCount.toString()} onChangeText={handleSearchCountChange} />
          </TextField>
        </Row>

        <Row>
          <Text>{t('settings.websearch.searchWithDates')}</Text>
          <Switch color="success" isSelected={searchWithDates} onSelectedChange={setSearchWithDates}>
            <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
          </Switch>
        </Row>
        <Row>
          <Text>{t('settings.websearch.overrideSearchService')}</Text>
          <Switch color="success" isSelected={overrideSearchService} onSelectedChange={setOverrideSearchService}>
            <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
          </Switch>
        </Row>
      </Group>
    </YStack>
  )
}
