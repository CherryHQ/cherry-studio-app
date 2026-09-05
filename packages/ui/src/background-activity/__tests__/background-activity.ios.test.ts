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
    expect(layout.match(/countsDown:false/g)).toHaveLength(4);
    expect(layout).toMatch(/width:40,alignment:['"]trailing['"]/);
    expect(layout).toMatch(/offset\(\{x:3\.5\}\)/);
    expect(layout).toContain('compactLabel');
    expect(layout).toContain('compactLabel!==undefined');
    expect(layout).toContain('props.detail');
    expect(layout).toContain('props.preview');
    expect(layout).toContain('bannerSmall');
    expect(layout.match(/activityBackgroundTint\(null\)/g)).toHaveLength(2);
    expect(layout.match(/style:['"]primary['"]/g)).toHaveLength(2);
    expect(layout.match(/style:['"]secondary['"]/g)).toHaveLength(5);
    expect(layout).toContain('environment.levelOfDetail');
    expect(layout).toContain('lineLimit(isSimplified?1:2)');
    expect(layout).toContain('expandedLeading:null');
    expect(layout).toContain('expandedTrailing:null');
    expect(layout).toContain('expandedCenter:null');

    const expandedBottom = layout.slice(layout.indexOf('expandedBottom:'));
    expect(expandedBottom).toContain('props.title');
    expect(expandedBottom).toContain('expandedContent');
    expect(expandedBottom).toContain('layoutPriority(1)');
    expect(expandedBottom.indexOf('props.title')).toBeLessThan(
      expandedBottom.indexOf('expandedContent'),
    );

    expect(layout).not.toContain('truncationMode("head")');
    expect(layout).not.toContain('pauseTime');
    expect(layout).not.toContain('dateStyle:"timer"');
    expect(layout).not.toContain('systemName');
  });
});
