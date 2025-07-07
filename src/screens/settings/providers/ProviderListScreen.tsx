import BottomSheet from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import { Plus } from '@tamagui/lucide-icons'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { ScrollView, Text, YStack } from 'tamagui'

import { SettingContainer, SettingGroup } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { AddProviderSheet } from '@/components/settings/providers/AddProviderSheet'
import { ProviderItem } from '@/components/settings/providers/ProviderItem'
import CustomRadialGradientBackground from '@/components/ui/CustomRadialGradientBackground'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { SearchInput } from '@/components/ui/SearchInput'
import { useAllProviders } from '@/hooks/useProviders'

export default function ProviderListScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation()

  const bottomSheetRef = useRef<BottomSheet>(null)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)
  const { providers, isLoading } = useAllProviders()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProviderType, setSelectedProviderType] = useState<string | undefined>(undefined)
  const [providerName, setProviderName] = useState('')

  const handleProviderTypeChange = (value: string) => {
    setSelectedProviderType(value)
  }

  const handleProviderNameChange = (name: string) => {
    setProviderName(name)
  }

  const handleOpenBottomSheet = () => {
    bottomSheetRef.current?.expand()
    setIsBottomSheetOpen(true)
  }

  const handleBottomSheetClose = () => {
    setIsBottomSheetOpen(false)
  }

  const onAddProvider = () => {
    handleOpenBottomSheet()
  }

  const handleAddProvider = () => {
    console.log('Provider Name:', providerName)
    console.log('Provider Type:', selectedProviderType)
  }

  if (isLoading) {
    return (
      <SafeAreaContainer>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer>
      <HeaderBar
        title={t('settings.provider.list.title')}
        onBackPress={() => navigation.goBack()}
        rightButton={{
          icon: <Plus size={24} />,
          onPress: onAddProvider
        }}
      />
      <SettingContainer>
        <SearchInput placeholder={t('settings.provider.search')} value={searchQuery} onChangeText={setSearchQuery} />

        <YStack flex={1} gap={8}>
          <Text>{t('settings.provider.title')}</Text>
          <CustomRadialGradientBackground style={{ radius: 2 }}>
            <ScrollView backgroundColor="$colorTransparent">
              <SettingGroup>
                {providers.map(p => (
                  <ProviderItem key={p.id} provider={p} mode="checked" />
                ))}
              </SettingGroup>
            </ScrollView>
          </CustomRadialGradientBackground>
        </YStack>
      </SettingContainer>

      <AddProviderSheet
        bottomSheetRef={bottomSheetRef}
        isOpen={isBottomSheetOpen}
        onClose={handleBottomSheetClose}
        providerName={providerName}
        onProviderNameChange={handleProviderNameChange}
        selectedProviderType={selectedProviderType}
        onProviderTypeChange={handleProviderTypeChange}
        onAddProvider={handleAddProvider}
      />
    </SafeAreaContainer>
  )
}
