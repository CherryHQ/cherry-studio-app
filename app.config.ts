import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const providerName = process.env.EXPO_PROVIDER_NAME?.trim();
const providerUrl = process.env.EXPO_PROVIDER_URL?.trim();
const providerKey = process.env.EXPO_PROVIDER_KEY?.trim();
const staticConfig = appJson.expo as ExpoConfig;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ...staticConfig,
  extra: {
    ...staticConfig.extra,
    ...(providerName && providerUrl && providerKey
      ? {
          piAgentExperiment: {
            apiKey: providerKey,
            baseUrl: providerUrl,
            modelId: 'gpt-5.6-luna',
            providerName,
          },
        }
      : {}),
  },
});
