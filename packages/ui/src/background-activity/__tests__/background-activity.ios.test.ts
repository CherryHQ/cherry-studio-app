jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));
jest.mock('expo-widgets', () => ({
  createLiveActivity: jest.fn((name: string, layout: string) => ({ layout, name })),
}));

import { createLiveActivity } from 'expo-widgets';

import { renderBackgroundActivity } from '../background-activity.ios';

describe('background activity iOS layout', () => {
  test('serializes compact status and elapsed-time variants into the native layout', () => {
    const activity = createLiveActivity('BackgroundActivityTest', renderBackgroundActivity);
    const layout = (activity as unknown as { layout: string }).layout;

    expect(layout).toContain('timerInterval');
    expect(layout.match(/countsDown:false/g)).toHaveLength(3);
    expect(layout).toContain('compactLabel');
    expect(layout).toContain('compactLabel!==undefined');
    expect(layout).toContain('props.preview');
    expect(layout).toContain('lineLimit(3)');
    expect(layout).toContain('expandedCenter:null');
    expect(layout).not.toContain('pauseTime');
    expect(layout).not.toContain('dateStyle:"timer"');
  });
});
