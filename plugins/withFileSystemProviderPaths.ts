import { withDangerousMod } from '@expo/config-plugins';
import * as path from 'path';
import * as fs from 'fs';

const PROVIDER_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <files-path name="expo_files" path="." />
    <cache-path name="cached_expo_files" path="." />
    <external-path name="external" path="." />
    <external-files-path name="external_files" path="." />
</paths>
`;

/**
 * Ensures android/app/src/main/res/xml/file_system_provider_paths.xml
 * includes <external-path> and <external-files-path>.
 *
 * Without these, @magrinj/expo-quick-look's FileProvider can't serve files from
 * /storage/emulated/0/Pictures/ (e.g. screenshot previews), because
 * expo-file-system's version of the same-named resource wins during Android
 * resource merging and is missing those two entries.
 */
export default function withFileSystemProviderPaths(
  config: import('@expo/config-plugins').ExpoConfig,
): import('@expo/config-plugins').ExpoConfig {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const resXmlDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(resXmlDir, { recursive: true });
      fs.writeFileSync(path.join(resXmlDir, 'file_system_provider_paths.xml'), PROVIDER_PATHS_XML);
      return config;
    },
  ]);
}
