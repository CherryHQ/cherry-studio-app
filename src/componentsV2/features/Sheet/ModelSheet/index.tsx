import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, SectionList, View } from 'react-native'

import YStack from '@/componentsV2/layout/YStack'
import { useBottom } from '@/hooks/useBottom'
import { useAllProviders } from '@/hooks/useProviders'
import { useTheme } from '@/hooks/useTheme'
import type { Provider } from '@/types/assistant'
import type { HomeNavigationProps } from '@/types/naviagate'
import { isIOS26 } from '@/utils/device'

import { EmptyModelView } from '../../SettingsScreen/providers/EmptyModelView'
import { useModelSheetController } from './hooks/useModelSheetController'
import { dismissModelSheet, SHEET_NAME } from './hooks/useModelSheetData'
import { ModelListItem } from './ModelListItem'
import { ModelSectionHeader } from './ModelSectionHeader'
import { ModelSheetHeader } from './ModelSheetHeader'
import type { ProviderSection } from './types'

export { dismissModelSheet, presentModelSheet } from './hooks/useModelSheetData'

const ModelSheet: React.FC = () => {
  const { t } = useTranslation()
  const bottom = useBottom()
  const { isDark } = useTheme()
  const navigation = useNavigation<HomeNavigationProps>()

  // Get providers
  const { providers } = useAllProviders()

  // Controller orchestrates all state
  const {
    sections,
    selectOptions,
    sheetData,
    isVisible,
    searchQuery,
    setSearchQuery,
    selectedModels,
    isMultiSelectActive,
    handleModelToggle,
    handleClearAll,
    toggleMultiSelectMode,
    activeProvider,
    listRef,
    viewabilityConfig,
    onViewableItemsChanged,
    handleProviderChangeWithBlank,
    blankSize,
    onContainerLayout,
    handleDidDismiss,
    handleDidPresent
  } = useModelSheetController({ providers, bottom, t })

  const { multiple = false } = sheetData

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
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={
        <ModelSheetHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          multiple={multiple}
          isMultiSelectActive={isMultiSelectActive}
          onToggleMultiSelect={toggleMultiSelectMode}
          onClearAll={handleClearAll}
          selectOptions={selectOptions}
          activeProvider={activeProvider}
          onProviderChange={handleProviderChangeWithBlank}
          bottom={bottom}
        />
      }
      onDidDismiss={handleDidDismiss}
      onDidPresent={handleDidPresent}>
      <SectionList
        ref={listRef}
        sections={sections}
        extraData={{ selectedModels, isMultiSelectActive, searchQuery, activeProvider, blankSize }}
        nestedScrollEnabled={Platform.OS === 'android'}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onLayout={e => onContainerLayout(e.nativeEvent.layout.height)}
        keyExtractor={item => item.value}
        SectionSeparatorComponent={() => <YStack className="h-2" />}
        renderSectionHeader={({ section }) => (
          <ModelSectionHeader
            section={section as ProviderSection}
            isFirstSection={sections.indexOf(section as ProviderSection) === 0}
            onSettingsPress={navigateToProviderSettings}
          />
        )}
        renderItem={({ item }) => (
          <ModelListItem item={item} isSelected={selectedModels.includes(item.value)} onToggle={handleModelToggle} />
        )}
        ItemSeparatorComponent={() => <YStack className="h-2" />}
        ListEmptyComponent={<EmptyModelView />}
        ListFooterComponent={Platform.OS === 'android' && blankSize > 0 ? <View style={{ height: blankSize }} /> : null}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentInset={Platform.OS === 'ios' ? { bottom: blankSize } : undefined}
        contentContainerStyle={{
          paddingBottom: bottom
        }}
      />
    </TrueSheet>
  )
}

ModelSheet.displayName = 'ModelSheet'

export default ModelSheet
