import type { Meta, StoryObj } from '@storybook/react-native';

import {
  LiveActivityPreview,
  type LiveActivityPreviewPhase,
  type LiveActivityPreviewProps,
} from './LiveActivityPreview';

const phases: LiveActivityPreviewPhase[] = [
  'preparing',
  'thinking',
  'responding',
  'using-tool',
  'awaiting-approval',
  'generating',
  'completed',
  'failed',
  'cancelled',
];

const meta = {
  title: 'Features/Background Activities/Live Activity',
  component: LiveActivityPreview,
  args: {
    compactLabel: '回复中',
    detail: '回复中',
    elapsedSeconds: 37,
    liveTimer: false,
    phase: 'responding',
    preview: '第一章：记忆的碎片',
    showLogo: true,
    theme: 'dark',
    title: 'Qwen',
  },
  argTypes: {
    compactLabel: { control: 'text' },
    detail: { control: 'text' },
    elapsedSeconds: { control: { max: 7200, min: 0, step: 1, type: 'range' } },
    liveTimer: { control: 'boolean' },
    phase: { control: 'select', options: phases },
    preview: { control: 'text' },
    showLogo: { control: 'boolean' },
    theme: { control: 'select', options: ['dark', 'light'] },
    title: { control: 'text' },
  },
} satisfies Meta<typeof LiveActivityPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <ControlledPreview {...args} />,
};

export const Completed: Story = {
  args: {
    compactLabel: '已完成',
    detail: '回复完成',
    elapsedSeconds: 96,
    phase: 'completed',
  },
  render: (args) => <ControlledPreview {...args} />,
};

export const Painting: Story = {
  args: {
    compactLabel: '绘图中',
    detail: '正在生成图片',
    elapsedSeconds: 24,
    phase: 'generating',
    preview: 'Cherry Studio floating above a quiet neon city',
    title: 'AI 绘画',
  },
  render: (args) => <ControlledPreview {...args} />,
};

function ControlledPreview(args: LiveActivityPreviewProps) {
  const resetKey = `${args.elapsedSeconds}:${args.liveTimer}:${args.phase}`;
  return <LiveActivityPreview {...args} key={resetKey} />;
}
