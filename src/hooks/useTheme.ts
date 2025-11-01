import { useColorScheme } from 'react-native'

import { ThemeMode } from '@/types'

import { usePreference } from './usePreference'

export function useTheme() {
  const systemColorScheme = useColorScheme()
  const [themeSetting] = usePreference('ui.theme_mode')

  const settedTheme = themeSetting === ThemeMode.system ? systemColorScheme : themeSetting
  const activeTheme = settedTheme === ThemeMode.dark ? 'dark' : 'light'

  return { themeSetting, settedTheme, activeTheme }
}
