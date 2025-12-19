import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import { sortBy } from 'lodash'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, SectionList, useWindowDimensions, View } from 'react-native'

import YStack from '@/componentsV2/layout/YStack'
import { isEmbeddingModel, isRerankModel } from '@/config/models'
import { useBottom } from '@/hooks/useBottom'
import { useAllProviders } from '@/hooks/useProviders'
import { useTheme } from '@/hooks/useTheme'
import type { Provider } from '@/types/assistant'
import type { HomeNavigationProps } from '@/types/naviagate'
import { isIOS26 } from '@/utils/device'
import { getModelUniqId } from '@/utils/model'

import { EmptyModelView } from '../../SettingsScreen/providers/EmptyModelView'
import { useModelSelection } from './hooks/useModelSelection'
import { dismissModelSheet, SHEET_NAME, useModelSheetData } from './hooks/useModelSheetData'
import { useModelTabScrolling } from './hooks/useModelTabScrolling'
import { HEADER_HEIGHT, ModelListHeader } from './ModelListHeader'
import { ModelListItem } from './ModelListItem'
import { ModelProviderTabBar } from './ModelProviderTabBar'
import { ModelSectionHeader } from './ModelSectionHeader'
import type { ProviderSection, SelectOption } from './types'

export { dismissModelSheet, presentModelSheet } from './hooks/useModelSheetData'

const TAB_BAR_HEIGHT = 56

const ModelSheet: React.FC = () => {
  const { t } = useTranslation()
  const bottom = useBottom()
  const { isDark } = useTheme()
  const navigation = useNavigation<HomeNavigationProps>()
  const { height: windowHeight } = useWindowDimensions()
  const sheetContentHeight = windowHeight * 0.85

  // Sheet data management
  const { sheetData, isVisible, searchQuery, setSearchQuery, handleDidDismiss, handleDidPresent } = useModelSheetData()
  const { mentions, setMentions, multiple = false } = sheetData

  // Build model options from providers
  const { providers } = useAllProviders()
  const selectOptions: SelectOption[] = providers
    .filter(p => p.id === 'cherryai' || (p.models && p.models.length > 0 && p.enabled))
    .map(p => ({
      label: p.isSystem ? t(`provider.${p.id}`) : p.name,
      title: p.name,
      provider: p,
      options: sortBy(p.models, 'name')
        .filter(m => !isEmbeddingModel(m) && !isRerankModel(m))
        .filter(m => {
          if (!searchQuery) return true
          const query = searchQuery.toLowerCase()
          const modelId = getModelUniqId(m).toLowerCase()
          const modelName = m.name.toLowerCase()
          return modelId.includes(query) || modelName.includes(query)
        })
        .map(m => ({
          label: m.name,
          value: getModelUniqId(m),
          model: m
        }))
    }))
    .filter(group => group.options.length > 0)

  const allModelOptions = selectOptions.flatMap(group => group.options)

  // SectionList data structure
  const sections: ProviderSection[] = useMemo(
    () =>
      selectOptions.map(group => ({
        title: group.label,
        provider: group.provider,
        data: group.options
      })),
    [selectOptions]
  )

  // Model selection hook
  const { selectedModels, isMultiSelectActive, handleModelToggle, handleClearAll, toggleMultiSelectMode } =
    useModelSelection({
      mentions,
      allModelOptions,
      setMentions
    })

  // Tab scrolling hook
  const { activeProvider, listRef, viewabilityConfig, onViewableItemsChanged, handleProviderChange } =
    useModelTabScrolling({
      sections,
      isVisible
    })

  // Handle back button
  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissModelSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const navigateToProviderSettings = (provider: Provider) => {
    dismissModelSheet()
    navigation.navigate('ProvidersSettings', { screen: 'ProviderSettingsScreen', params: { providerId: provider.id } })
  }

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.85]}
      cornerRadius={30}
      grabber={Platform.OS === 'ios' ? true : false}
      dismissible
      dimmed
      keyboardMode="pan"
      scrollable
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      onDidDismiss={handleDidDismiss}
      onDidPresent={handleDidPresent}>
      <View style={{ height: sheetContentHeight, position: 'relative' }}>
        <SectionList
          style={{ flex: 1, paddingTop: HEADER_HEIGHT * 2 }}
          ref={listRef}
          sections={sections}
          extraData={{ selectedModels, isMultiSelectActive, searchQuery, activeProvider }}
          nestedScrollEnabled={Platform.OS === 'android'}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          keyExtractor={item => item.value}
          SectionSeparatorComponent={() => <YStack className="h-2" />}
          renderSectionHeader={({ section }) => (
            <ModelSectionHeader
              section={section}
              isFirstSection={sections.indexOf(section) === 0}
              onSettingsPress={navigateToProviderSettings}
            />
          )}
          renderItem={({ item }) => (
            <ModelListItem item={item} isSelected={selectedModels.includes(item.value)} onToggle={handleModelToggle} />
          )}
          ItemSeparatorComponent={() => <YStack className="h-2" />}
          ListEmptyComponent={<EmptyModelView />}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: bottom + TAB_BAR_HEIGHT + 20
          }}
        />
        <ModelListHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          multiple={multiple}
          isMultiSelectActive={isMultiSelectActive}
          onToggleMultiSelect={toggleMultiSelectMode}
          onClearAll={handleClearAll}
        />
        <ModelProviderTabBar
          selectOptions={selectOptions}
          activeProvider={activeProvider}
          onProviderChange={handleProviderChange}
          bottom={bottom}
        />
      </View>
    </TrueSheet>
  )
}

ModelSheet.displayName = 'ModelSheet'

export default ModelSheet
