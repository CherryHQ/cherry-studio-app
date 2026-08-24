import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  Button,
  DynamicToast,
  type DynamicToastViewportProps,
  useDynamicToast,
} from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

type DynamicToastPreviewProps = Pick<DynamicToastViewportProps, 'offset' | 'placement'>;

function DynamicToastPreview({ offset, placement }: DynamicToastPreviewProps) {
  const {
    actions: { collapse, expand, hide, show },
  } = useDynamicToast();

  useEffect(() => {
    show();
    return hide;
  }, [hide, show]);

  return (
    <>
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <View className="flex-row gap-2">
          <Button onPress={show} size="sm">
            Show
          </Button>
          <Button onPress={hide} size="sm" variant="outline">
            Hide
          </Button>
        </View>
        <View className="flex-row gap-2">
          <Button
            onPress={() => {
              show();
              expand();
            }}
            size="sm"
            variant="secondary"
          >
            Expand
          </Button>
          <Button onPress={collapse} size="sm" variant="ghost">
            Collapse
          </Button>
        </View>
      </View>

      <DynamicToast.Backdrop />
      <DynamicToast.Viewport offset={offset} placement={placement}>
        <DynamicToast.Collapsed>
          <Text className="z-10 text-sm font-semibold text-white">Syncing</Text>
          <Text className="z-10 text-sm tabular-nums text-white">42%</Text>
        </DynamicToast.Collapsed>
        <DynamicToast.Expanded>
          <Text className="z-10 text-lg font-semibold text-white">Sync in progress</Text>
          <View className="z-10">
            <DynamicToast.Close accessibilityLabel="Hide toast">
              <XIcon color="#ffffff" size={24} />
            </DynamicToast.Close>
          </View>
        </DynamicToast.Expanded>
      </DynamicToast.Viewport>
    </>
  );
}

const meta = {
  title: 'Components/Primitives/Dynamic Toast',
  component: DynamicToast.Viewport,
  args: {
    offset: 12,
    placement: 'top',
  },
  argTypes: {
    children: { control: false },
    offset: {
      control: { max: 64, min: 0, step: 4, type: 'number' },
    },
    placement: {
      control: 'inline-radio',
      options: ['top', 'bottom'],
    },
  },
  decorators: [
    (Story) => (
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={{ flex: 1 }}>
        <Story />
      </SafeAreaProvider>
    ),
  ],
} satisfies Meta<typeof DynamicToast.Viewport>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <DynamicToast.Provider>
      <DynamicToastPreview offset={args.offset} placement={args.placement} />
    </DynamicToast.Provider>
  ),
};
