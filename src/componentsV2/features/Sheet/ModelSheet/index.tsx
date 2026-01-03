import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import React, { useEffect } from 'react'
import { BackHandler, Platform, SectionList, useWindowDimensions, View } from 'react-native'

import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import { useTheme } from '@/hooks/useTheme'
import type { Provider } from '@/types/assistant'
import type { HomeNavigationProps } from '@/types/naviagate'

import { EmptyModelView } from '../../SettingsScreen/providers/EmptyModelView'
import { ModelListHeader, ModelListItem, ModelProviderTabBar, ModelSectionHeader } from './components'
import { getSheetPlatformConfig, LAYOUT } from './constants'
import {
  dismissModelSheet,
  presentModelSheet,
  SHEET_NAME,
  useModelOptions,
  useModelSelection,
  useModelSheet,
  useModelTabScrolling
} from './hooks'
import { defaultModelFilter } from './services/ModelFilterService'

export { dismissModelSheet, presentModelSheet }

/**
 * ModelSheet - A bottom sheet for selecting AI models
 */
const ModelSheet: React.FC = () => {
  const bottom = useBottom()
  const { isDark } = useTheme()
  const navigation = useNavigation<HomeNavigationProps>()
  const { height: windowHeight } = useWindowDimensions()
  const sheetContentHeight = windowHeight * LAYOUT.SHEET_DETENT

  // Sheet state management
  const { config, isVisible, searchQuery, setSearchQuery, handleDidDismiss, handleDidPresent } = useModelSheet()

  // Extract config values with defaults
  const mentions = config?.mentions ?? []
  const setMentions = config?.setMentions ?? (async () => {})
  const multiple = config?.multiple ?? false
  const filterFn = config?.filterFn ?? defaultModelFilter

  // Data transformation
  const { selectOptions, allModelOptions, sections } = useModelOptions({
    searchQuery,
    filterFn
  })

  // Selection logic
  const { selectedModels, isMultiSelectActive, handleModelToggle, handleClearAll, toggleMultiSelectMode } =
    useModelSelection({
      mentions,
      allModelOptions,
      setMentions,
      onDismiss: dismissModelSheet
    })

  // Tab scrolling synchronization
  const { activeProvider, listRef, viewabilityConfig, onViewableItemsChanged, handleProviderChange } =
    useModelTabScrolling({
      sections,
      isVisible
    })

  // Handle Android back button
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

  // Platform-specific sheet config
  const sheetPlatformConfig = getSheetPlatformConfig(isDark)

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[LAYOUT.SHEET_DETENT]}
      cornerRadius={LAYOUT.CORNER_RADIUS}
      {...sheetPlatformConfig}
      dismissible
      dimmed
      scrollable
      header={
        <View>
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
          />
        </View>
      }
      onDidDismiss={handleDidDismiss}
      onDidPresent={handleDidPresent}>
      <SectionList
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
          paddingHorizontal: LAYOUT.HORIZONTAL_PADDING,
          paddingBottom: Math.max(bottom, sheetContentHeight - 150)
        }}
      />
    </TrueSheet>
  )
}

ModelSheet.displayName = 'ModelSheet'

export default ModelSheet
