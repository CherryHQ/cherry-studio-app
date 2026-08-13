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
  test('lets a compact status replace the running timer', () => {
    const layout = (activity as unknown as { layout: string }).layout;

    expect(layout).toContain('timerInterval');
    expect(layout.match(/countsDown:false/g)).toHaveLength(1);
    expect(layout).toContain('compactLabel');
    expect(layout).toContain('compactLabel!==undefined');
    expect(layout).toContain('expandedTrailing:null');
    expect(layout).not.toContain('pauseTime');
    expect(layout).not.toContain('dateStyle:"timer"');
  });
});
