import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { McpServerTabs } from '../McpServerTabs';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  return {
    Tabs: (props: object) => React.createElement('Tabs', props),
  };
});

describe('McpServerTabs', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('maps both localized tabs into the shared fixed-width control', () => {
    const onTabChange = jest.fn();

    act(() => {
      renderer = create(<McpServerTabs onTabChange={onTabChange} tab="configuration" />);
    });

    const tabs = renderer!.root.findByType('Tabs');

    expect(tabs.props).toMatchObject({
      items: [
        {
          label: 'settings.mcp.tabs.configuration',
          testID: 'mcp-server-tab-configuration',
          value: 'configuration',
        },
        {
          label: 'settings.mcp.tools.title',
          testID: 'mcp-server-tab-tools',
          value: 'tools',
        },
      ],
      style: { width: 144 },
      value: 'configuration',
    });

    act(() => tabs.props.onValueChange('tools'));
    expect(onTabChange).toHaveBeenCalledWith('tools');
  });
});
