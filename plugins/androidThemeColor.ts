import { withAndroidStyles } from '@expo/config-plugins'

export default function androidThemeColorPlugin(config) {
  return withAndroidStyles(config, async config => {
    const styles = config.modResults
    const appTheme = styles.resources?.style?.find(
      (s: any) => s.$.name === 'AppTheme'
    )
    if (appTheme && appTheme.item) {
      const hasColorControlActivated = appTheme.item.some(
        (item: any) => item.$.name === 'colorControlActivated'
      )
      if (!hasColorControlActivated) {
        appTheme.item.push({
          _: '#02b86b',
          $: { name: 'colorControlActivated' }
        })
      }
    }
    
    return config
  })
}
