import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingViewerChrome } from '../PaintingViewerChrome.ios';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Passthrough = ({ children }: { children: React.ReactNode }) => children;
  const MenuAction = (props: { children: React.ReactNode; onPress: () => void }) =>
    React.createElement('MenuAction', props, props.children);
  const Toolbar = Object.assign(Passthrough, {
    Button: () => null,
    Menu: Passthrough,
    MenuAction,
    Spacer: () => null,
  });

  return { Stack: { Toolbar } };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('PaintingViewerChrome.ios', () => {
  let renderer: ReactTestRenderer | undefined;
  const onDelete = jest.fn();
  const onViewConversation = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      renderer = create(
        <PaintingViewerChrome
          aspectRatios={['1:1', '16:9']}
          onClose={jest.fn()}
          onDelete={onDelete}
          onDownload={jest.fn()}
          onEdit={jest.fn()}
          onResizeSelect={jest.fn()}
          onViewConversation={onViewConversation}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('places view conversation before delete and wires both menu actions', () => {
    if (!renderer) {
      throw new Error('PaintingViewerChrome test renderer was not created.');
    }
    const actions = renderer.root.findAllByType('MenuAction');

    expect(actions.slice(0, 2).map((action) => action.props.children)).toEqual([
      'painting.viewer.viewConversation',
      'painting.viewer.delete',
    ]);

    actions[0].props.onPress();
    actions[1].props.onPress();

    expect(onViewConversation).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
