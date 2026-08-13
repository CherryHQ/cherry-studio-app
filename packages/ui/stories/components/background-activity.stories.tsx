import type { Meta, StoryObj } from '@storybook/react-native';

import { BackgroundActivityPreview } from '../../src/background-activity/background-activity.preview';
import type { BackgroundActivityIcon } from '../../src/background-activity/background-activity.types';

const icons: BackgroundActivityIcon[] = [
  'brain',
  'bubble-ellipsis',
  'bubble-exclamation',
  'check-circle',
  'hourglass',
  'paintbrush',
  'warning-triangle',
  'wrench',
  'x-circle',
];

const meta = {
  title: 'Components/Background Activity',
  component: BackgroundActivityPreview,
  args: {
    compactLabel: '回复中',
    detail: '回复中',
    icon: 'bubble-ellipsis',
    preview: '第一章：记忆的碎片',
    showLogo: true,
    theme: 'dark',
    title: 'Qwen',
  },
  argTypes: {
    compactLabel: { control: 'text' },
    detail: { control: 'text' },
    icon: { control: 'select', options: icons },
    preview: { control: 'text' },
    showLogo: { control: 'boolean' },
    theme: { control: 'select', options: ['dark', 'light'] },
    title: { control: 'text' },
  },
} satisfies Meta<typeof BackgroundActivityPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Completed: Story = {
  args: {
    compactLabel: '已完成',
    detail: '回复完成',
    icon: 'check-circle',
  },
};

export const Painting: Story = {
  args: {
    compactLabel: '绘图中',
    detail: '正在生成图片',
    icon: 'paintbrush',
    preview: 'Cherry Studio floating above a quiet neon city',
    title: 'AI 绘画',
  },
};
