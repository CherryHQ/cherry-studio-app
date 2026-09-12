import {
  Button,
  type ToastShowOptions,
  type ToastVariant,
  useToast,
} from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

const variants: ToastVariant[] = ['default', 'success', 'warning', 'danger'];

function ToastPreview({ duration, label, variant }: ToastShowOptions) {
  const { toast } = useToast();

  return (
    <View className="flex-1 items-center justify-center px-6">
      <Button onPress={() => toast.show({ duration, label, variant })}>Show toast</Button>
    </View>
  );
}

const meta = {
  title: 'Components/Primitives/Toast',
  component: ToastPreview,
  args: {
    duration: 4000,
    label: 'Changes saved',
    variant: 'success',
  },
  argTypes: {
    duration: { control: { min: 500, step: 500, type: 'number' } },
    label: { control: 'text' },
    variant: { control: 'inline-radio', options: variants },
  },
} satisfies Meta<typeof ToastPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
