import type { StorybookConfig } from '@storybook/react-native';

const main: StorybookConfig = {
  stories: ['../packages/ui/stories/components/**/*.stories.?(ts|tsx|js|jsx)'],
  deviceAddons: ['@storybook/addon-ondevice-controls', '@storybook/addon-ondevice-actions'],
};

export default main;
