jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));
jest.mock('expo-widgets', () => ({
  createLiveActivity: jest.fn((name: string, layout: string) => ({ layout, name })),
}));

import PaintingActivity from '../../../paintings/background/PaintingActivity.ios';
import AssistantActivity from '../AssistantActivity.ios';

describe.each([
  ['assistant', AssistantActivity],
  ['painting', PaintingActivity],
] as const)('%s iOS activity layout', (_name, activity) => {
  test('does not render elapsed time', () => {
    const layout = (activity as unknown as { layout: string }).layout;

    expect(layout).not.toContain('timerInterval');
    expect(layout).not.toContain('countsDown');
    expect(layout).not.toContain('pauseTime');
    expect(layout).not.toContain('dateStyle:"timer"');
  });
});
