import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelPullChrome } from '../ProviderModelPullChrome.ios';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const ToolbarRoot = (props: { children?: React.ReactNode; placement?: string }) =>
    React.createElement('Toolbar', props, props.children);
  const Toolbar = Object.assign(ToolbarRoot, {
    Button: (props: { children?: React.ReactNode }) =>
      React.createElement('ToolbarButton', props, props.children),
    Spacer: () => React.createElement('ToolbarSpacer'),
  });

  return { Stack: { Toolbar } };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

describe('ProviderModelPullChrome.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function render(props: Partial<Parameters<typeof ProviderModelPullChrome>[0]> = {}) {
    act(() => {
      renderer = create(
        <ProviderModelPullChrome
          isAllSelected={false}
          isApplying={false}
          selectedCount={0}
          onApply={jest.fn()}
          onToggleAll={jest.fn()}
          {...props}
        />,
      );
    });

    return renderer!;
  }

  // Select-all at the leading edge, apply at the trailing one, with the spacer
  // between them doing the pushing.
  it('puts select-all and apply at opposite ends of the bar', () => {
    const tree = render();
    const bar = tree.root.findByType('Toolbar');

    expect(bar.props.placement).toBe('bottom');
    expect(
      bar
        .findAll((node) => node.type === 'ToolbarButton' || node.type === 'ToolbarSpacer')
        .map((node) => node.props.children ?? node.type),
    ).toEqual([
      'settings.provider.models.selection.selectAll',
      'ToolbarSpacer',
      'settings.provider.models.pullApply',
    ]);
  });

  it('offers to undo a full selection', () => {
    expect(
      render({ isAllSelected: true }).root.findAllByType('ToolbarButton')[0].props.children,
    ).toBe('settings.provider.models.selection.deselectAll');
  });

  // Nothing ticked means nothing to reconcile, so there is nothing to confirm.
  it('leaves apply disabled until something is selected', () => {
    expect(render().root.findAllByType('ToolbarButton')[1].props.disabled).toBe(true);
  });

  it('counts the selection on the apply button', () => {
    const apply = render({ selectedCount: 4 }).root.findAllByType('ToolbarButton')[1];

    expect(apply.props.disabled).toBe(false);
    expect(apply.props.children).toBe('settings.provider.models.pullApplySelected:4');
  });

  it('freezes both ends while the reconcile runs', () => {
    const [selectAll, apply] = render({
      isApplying: true,
      selectedCount: 2,
    }).root.findAllByType('ToolbarButton');

    expect(selectAll.props.disabled).toBe(true);
    expect(apply.props.disabled).toBe(true);
  });

  it('hands each tap straight to the caller', () => {
    const onApply = jest.fn();
    const onToggleAll = jest.fn();
    const [selectAll, apply] = render({
      onApply,
      onToggleAll,
      selectedCount: 1,
    }).root.findAllByType('ToolbarButton');

    act(() => selectAll.props.onPress());
    act(() => apply.props.onPress());

    expect(onToggleAll).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
