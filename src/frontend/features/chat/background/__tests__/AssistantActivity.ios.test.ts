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
  test('uses a pausable timer interval for running and terminal content', () => {
    const layout = (activity as unknown as { layout: string }).layout;

    expect(layout).toContain('timerInterval');
    expect(layout).toContain('countsDown:false');
    expect(layout).toContain('pauseTime');
    expect(layout).not.toContain('dateStyle:"timer"');
  });
});
