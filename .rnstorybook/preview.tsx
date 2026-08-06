import '../src/frontend/styles/global.css';
import type { Preview } from '@storybook/react-native';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { View } from 'react-native';

const preview: Preview = {
  decorators: [
    (Story) => (
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <View className="flex-1 bg-background">
          <Story />
        </View>
      </HeroUINativeProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
