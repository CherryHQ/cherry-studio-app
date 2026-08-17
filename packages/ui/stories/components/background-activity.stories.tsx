import type { Meta, StoryObj } from '@storybook/react-native';

import {
  BackgroundActivityPreview,
  type BackgroundActivityPreviewProps,
} from '../../src/background-activity/background-activity.preview';
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
    attribution: 'Qwen',
    compactIcon: 'bubble-ellipsis',
    compactLabel: undefined,
    detail: '回复中',
    elapsedSeconds: 37,
    icon: 'bubble-ellipsis',
    levelOfDetail: 'default',
    liveTimer: false,
    preview: '第一章：记忆的碎片',
    showLogo: true,
    theme: 'dark',
    title: '记忆与身份的关系',
  },
  argTypes: {
    attribution: { control: 'text' },
    compactIcon: { control: 'select', options: icons },
    compactLabel: { control: 'text' },
    detail: { control: 'text' },
    elapsedSeconds: { control: { max: 7200, min: 0, step: 1, type: 'range' } },
    icon: { control: 'select', options: icons },
    levelOfDetail: { control: 'select', options: ['default', 'simplified'] },
    liveTimer: { control: 'boolean' },
    preview: { control: 'text' },
    showLogo: { control: 'boolean' },
    theme: { control: 'select', options: ['dark', 'light'] },
    title: { control: 'text' },
  },
} satisfies Meta<typeof BackgroundActivityPreview>;

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
    icon: 'check-circle',
  },
  render: (args) => <ControlledPreview {...args} />,
};

export const Painting: Story = {
  args: {
    attribution: 'GPT Image 2',
    compactIcon: 'paintbrush',
    compactLabel: undefined,
    detail: '正在生成图片',
    elapsedSeconds: 24,
    icon: 'paintbrush',
    preview: 'Cherry Studio floating above a quiet neon city',
    title: '绘图',
  },
  render: (args) => <ControlledPreview {...args} />,
};

export const AwaitingApproval: Story = {
  args: {
    compactLabel: '等待审批',
    detail: '等待审批',
    icon: 'bubble-exclamation',
  },
  render: (args) => <ControlledPreview {...args} />,
};

export const ExpandedLongContent: Story = {
  args: {
    elapsedSeconds: 128,
    preview:
      '第一行展示最新回复的主要结论。\n第二行补充必要的背景和关键细节。\n更多内容会在第二行末尾省略。',
    title: '长内容预览',
  },
  render: (args) => <ControlledPreview {...args} />,
};

function ControlledPreview(args: BackgroundActivityPreviewProps) {
  const resetKey = `${args.elapsedSeconds}:${args.compactLabel ?? ''}:${args.liveTimer}`;
  return <BackgroundActivityPreview {...args} key={resetKey} />;
}
