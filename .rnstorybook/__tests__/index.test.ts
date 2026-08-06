import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerRootComponent } from 'expo';

import StorybookUIRoot from '../index';
import { view } from '../storybook.requires';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('expo', () => ({
  registerRootComponent: jest.fn(),
}));

jest.mock('../storybook.requires', () => {
  const MockStorybookUIRoot = () => null;

  return {
    view: {
      getStorybookUI: jest.fn(() => MockStorybookUIRoot),
    },
  };
});

describe('Storybook entry', () => {
  test('registers the Storybook UI as the Expo root component', () => {
    expect(view.getStorybookUI).toHaveBeenCalledWith({
      storage: {
        getItem: AsyncStorage.getItem,
        setItem: AsyncStorage.setItem,
      },
    });
    expect(registerRootComponent).toHaveBeenCalledWith(StorybookUIRoot);
  });
});
