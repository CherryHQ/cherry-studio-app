import '../src/frontend/styles/global.css';
import { Toast } from '@cherrystudio/ui/components';
import type { Preview } from '@storybook/react-native';
import { BottomSheetProvider } from '@swmansion/react-native-bottom-sheet';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { View } from 'react-native';

const preview: Preview = {
  decorators: [
    (Story) => (
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false }, toast: 'disabled' }}>
        <Toast.Provider>
          <BottomSheetProvider>
            <View className="flex-1 bg-background">
              <Story />
            </View>
          </BottomSheetProvider>
        </Toast.Provider>
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
