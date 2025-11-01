import { withAndroidManifest } from '@expo/config-plugins'
export default function androiManifestPlugin(config) {
  return withAndroidManifest(config, async config => {
    let androidManifest = config.modResults.manifest
    if (androidManifest && androidManifest.application && androidManifest.application.length > 0) {
      androidManifest.application[0].$['android:largeHeap'] = 'true'
    }
    return config
  })
}
