import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackgroundPressArea, BackgroundPressExclusion } from '../background-press';

jest.mock('../background-press-adapter', () => ({
  BackgroundPressAdapter: ({ children, ...props }: { children?: React.ReactNode }) =>
    jest.requireActual('react').createElement('NativeBackgroundPress', props, children),
}));

describe('background press boundary', () => {
  let renderer: ReactTestRenderer | undefined;
  const onPress = jest.fn();

  function Harness({ disabled = false }: { disabled?: boolean }) {
    return (
      <BackgroundPressArea disabled={disabled} onPress={onPress}>
        <BackgroundPressExclusion />
      </BackgroundPressArea>
    );
  }

  const area = () => renderer!.root.findAllByType('NativeBackgroundPress')[0];
  const excluded = () => renderer!.root.findAllByType('NativeBackgroundPress')[1];

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<Harness />);
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('native recognition owns the press decision', () => {
    expect(area().props).toMatchObject({ enabled: true, mode: 'background' });
    act(() => area().props.onBackgroundPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('exclusions never recognize presses themselves', () => {
    expect(excluded().props).toMatchObject({ enabled: false, mode: 'exclusion' });
    act(() => excluded().props.onBackgroundPress());
    expect(onPress).not.toHaveBeenCalled();
  });

  test('disables recognition and ignores a completion delivered after disabling', () => {
    act(() => renderer!.update(<Harness disabled />));
    expect(area().props.enabled).toBe(false);
    act(() => area().props.onBackgroundPress());
    expect(onPress).not.toHaveBeenCalled();
  });
});
