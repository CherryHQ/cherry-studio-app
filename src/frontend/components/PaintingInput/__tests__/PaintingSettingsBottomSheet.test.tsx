import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingSettingsBottomSheet } from '../PaintingSettingsBottomSheet';

jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => () => null);
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const children = ({ children }: { children?: ReactNode }) => children;
  return {
    BottomSheet: children,
    Input: () => null,
    Section: Object.assign(children, { RadioItem: () => null }),
    Slider: () => null,
    Switch: () => null,
    Tabs: (props: Record<string, unknown>) => React.createElement('tabs', props),
    TextField: Object.assign(children, { Label: children }),
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function renderSheet(
  spec: { default?: string },
  values: Record<string, unknown> = {},
  onValueChange = jest.fn(),
) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <PaintingSettingsBottomSheet
        onDismiss={jest.fn()}
        onValueChange={onValueChange}
        resolvedMode={{
          mode: 'generate',
          definition: {
            supports: {
              personGeneration: {
                type: 'enum',
                options: ['DONT_ALLOW', 'ALLOW_ADULT', 'ALLOW_ALL'],
                ...spec,
              },
            },
          },
        }}
        values={values}
      />,
    );
  });
  return renderer;
}

describe('PaintingSettingsBottomSheet', () => {
  it('does not show an unset enum without a default as its first option', () => {
    const renderer = renderSheet({});

    expect(renderer.root.findAllByType('tabs' as never)).toHaveLength(0);
    expect(
      renderer.root.findByProps({ testID: 'painting-setting-personGeneration' }).props.value,
    ).toBe('painting.settings.option.auto');
  });

  it('keeps short enums with a default as segments', () => {
    const renderer = renderSheet({ default: 'ALLOW_ADULT' });

    expect(renderer.root.findByType('tabs' as never).props.value).toBe('ALLOW_ADULT');
  });

  it('lets an optional enum return to the provider default', () => {
    const onValueChange = jest.fn();
    const renderer = renderSheet({}, { personGeneration: 'ALLOW_ALL' }, onValueChange);

    act(() => {
      renderer.root.findByProps({ testID: 'painting-setting-personGeneration' }).props.onPress();
    });
    const automatic = renderer.root.findByProps({
      testID: 'painting-setting-option-personGeneration-auto',
    });
    expect(automatic.props.selected).toBe(false);

    act(() => automatic.props.onPress());

    expect(onValueChange).toHaveBeenCalledWith('personGeneration', undefined);
  });
});
